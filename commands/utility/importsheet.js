// commands/utility/importsheet.js
// Import the Google Sheet movie log into the database. Safe to re-run: entries
// already in the database (imported, or mirrored from a live party) are skipped.
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { PermissionLevel } = require('../../utils/permissions');
const { isSheetsConfigured, readSheetRows } = require('../../utils/sheetsExporter');
const { findTitle } = require('../../utils/tmdb');
const { getDb } = require('../../utils/db');
const store = require('../../utils/watchpartyStore');

const PROGRESS_EVERY = 25;
const MAX_UNMATCHED_LISTED = 20;

function splitTags(cell) {
	return (cell || '').split(',').map(s => s.trim()).filter(Boolean);
}

function parseStartedAt(posted) {
	const ms = Date.parse(posted);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Find the Discord user for an old sheet username among current server members.
 * Exact username first, then a unique display-name match. Old "name#1234" tags
 * are matched on the name part.
 * @param {import('discord.js').Guild} guild
 * @returns {(tag: string) => Promise<string|null>} user id, or null if no confident match
 */
function makeUserResolver(guild) {
	const cache = new Map();
	const normalize = tag => tag.replace(/#\d{4}$/, '').trim().toLowerCase();
	const resolve = async name => {
		if (!name) return null;
		try {
			const found = await guild.members.search({ query: name, limit: 10, cache: false });
			const byUsername = found.find(m => m.user.username.toLowerCase() === name);
			if (byUsername) return byUsername.id;
			const byDisplay = found.filter(m =>
				[m.displayName, m.user.globalName].some(n => n?.toLowerCase() === name));
			return byDisplay.size === 1 ? byDisplay.first().id : null;
		}
		catch (err) {
			console.warn(`[IMPORT] Member search failed for "${name}": ${err.message}`);
			return null;
		}
	};
	return tag => {
		const name = normalize(tag);
		if (!cache.has(name)) cache.set(name, resolve(name));
		return cache.get(name);
	};
}

/**
 * Turn one sheet row (columns A–K) into an imported party.
 * @param {string[]} row
 * @param {(name: string) => Promise<Object|null>} lookup - TMDB title lookup
 * @param {(tag: string) => Promise<string|null>} resolveUser - username → Discord id
 * @returns {Promise<Object|null>} null for blank rows
 */
async function rowToParty(row, lookup, resolveUser = async () => null) {
	const [name, url, posted, , , , , host, startCell, endCell, typeCell] = row;
	if (!name?.trim()) return null;

	const startTags = splitTags(startCell);
	const endTags = splitTags(endCell);
	const hasEndData = endTags.length > 0;

	const attendees = [];
	for (const tag of [...new Set([...startTags, ...endTags])]) {
		attendees.push({
			userId: await resolveUser(tag),
			userTag: tag,
			minutes: null,
			presentAtStart: startTags.includes(tag),
			presentAtEnd: endTags.includes(tag),
			// Without end data, assume the people who were there at the start watched it
			watched: hasEndData ? endTags.includes(tag) : true,
		});
	}

	const startedAt = parseStartedAt(posted);
	const mediaType = { movie: 'movie', show: 'tv' }[typeCell?.trim().toLowerCase()] ?? null;

	return {
		party: {
			displayName: name.trim(),
			url: url || null,
			hostId: host ? await resolveUser(host) : null,
			hostTag: host || null,
			startedAt,
			endedAt: startedAt,
			endReason: 'import',
			source: 'import',
		},
		title: (await lookup(name.trim())) ?? { name: name.trim(), mediaType },
		attendees,
	};
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('importsheet')
		.setDescription('Import the Google Sheets movie log into the bot\'s records (skips rows already imported)')
		.setContexts(InteractionContextType.Guild),

	category: 'utility',
	permissions: PermissionLevel.SERVER_OWNER,

	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!isSheetsConfigured()) {
			return interaction.editReply('❌ Google Sheets is not configured.');
		}

		const db = getDb();
		const rows = await readSheetRows();
		const resolveUser = makeUserResolver(interaction.guild);
		// Same title often appears many times (rewatches); look each up once
		const lookups = new Map();
		const lookup = name => {
			const key = name.toLowerCase();
			if (!lookups.has(key)) lookups.set(key, findTitle(name));
			return lookups.get(key);
		};

		let imported = 0;
		let skipped = 0;
		const unmatched = new Set();
		for (let i = 1; i < rows.length; i++) {
			const row = rows[i] || [];
			if (row[0]?.trim() && store.partyExistsForSheetEntry(db, row[0].trim(), parseStartedAt(row[2]))) {
				skipped++;
				continue;
			}
			const entry = await rowToParty(row, lookup, resolveUser);
			if (!entry) continue;

			const titleId = store.upsertTitle(db, entry.title);
			const partyId = store.insertParty(db, { ...entry.party, titleId, guildId: interaction.guildId });
			store.insertAttendees(db, partyId, entry.attendees);
			for (const a of entry.attendees) if (!a.userId) unmatched.add(a.userTag);
			imported++;

			if (imported % PROGRESS_EVERY === 0) {
				await interaction.editReply(`📥 Imported ${imported} so far (row ${i + 1} of ${rows.length})…`);
			}
		}

		let message = `✅ Imported ${imported} watchparty record(s); skipped ${skipped} already in the database.`;
		if (unmatched.size > 0) {
			const listed = [...unmatched].slice(0, MAX_UNMATCHED_LISTED).join(', ');
			const more = unmatched.size > MAX_UNMATCHED_LISTED ? ` and ${unmatched.size - MAX_UNMATCHED_LISTED} more` : '';
			message += `\n⚠️ ${unmatched.size} username(s) didn't match a current member and are kept by name only: ${listed}${more}`;
		}
		await interaction.editReply(message);
	},

	// Exported for tests
	rowToParty,
	makeUserResolver,
};
