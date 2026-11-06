// commands/utility/importsheet.js
// One-time (safe to re-run) import of the Google Sheet movie log into the database.
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { PermissionLevel } = require('../../utils/permissions');
const { isSheetsConfigured, readSheetRows } = require('../../utils/sheetsExporter');
const { findTitle } = require('../../utils/tmdb');
const { getDb } = require('../../utils/db');
const store = require('../../utils/watchpartyStore');

const PROGRESS_EVERY = 25;

function splitTags(cell) {
	return (cell || '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Turn one sheet row (columns A–J) into an imported party. Pure apart from the TMDB lookup.
 * @returns {Promise<Object|null>} null for blank rows
 */
async function rowToParty(row, rowNumber, lookup) {
	const [name, url, posted, service, , , , host, startCell, endCell] = row;
	if (!name?.trim()) return null;

	const startedMs = Date.parse(posted);
	const startTags = splitTags(startCell);
	const endTags = splitTags(endCell);
	const hasEndData = endTags.length > 0;

	const everyone = [...new Set([...startTags, ...endTags])];
	const attendees = everyone.map(tag => ({
		userId: null,
		userTag: tag,
		minutes: null,
		presentAtStart: startTags.includes(tag),
		presentAtEnd: endTags.includes(tag),
		// Without end data, assume the people who were there at the start watched it
		watched: hasEndData ? endTags.includes(tag) : true,
	}));

	return {
		party: {
			displayName: name.trim(),
			url: url || null,
			service: service || null,
			hostTag: host || null,
			startedAt: Number.isFinite(startedMs) ? new Date(startedMs).toISOString() : null,
			endedAt: Number.isFinite(startedMs) ? new Date(startedMs).toISOString() : null,
			endReason: 'import',
			source: 'import',
			sheetRow: rowNumber,
			postedText: posted || null,
		},
		title: (await lookup(name.trim())) ?? { name: name.trim() },
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
		// Same title often appears many times (rewatches); look each up once
		const lookups = new Map();
		const lookup = name => {
			const key = name.toLowerCase();
			if (!lookups.has(key)) lookups.set(key, findTitle(name));
			return lookups.get(key);
		};

		let imported = 0;
		let skipped = 0;
		for (let i = 1; i < rows.length; i++) {
			const row = rows[i] || [];
			if (row[0] && store.partyExistsForSheetEntry(db, row[0].trim(), row[2] || null, i + 1)) {
				skipped++;
				continue;
			}
			const entry = await rowToParty(row, i + 1, lookup);
			if (!entry) continue;

			const titleId = store.upsertTitle(db, entry.title);
			const partyId = store.insertParty(db, { ...entry.party, titleId, guildId: interaction.guildId });
			store.insertAttendees(db, partyId, entry.attendees);
			imported++;

			if (imported % PROGRESS_EVERY === 0) {
				await interaction.editReply(`📥 Imported ${imported} so far (row ${i + 1} of ${rows.length})…`);
			}
		}

		await interaction.editReply(`✅ Imported ${imported} watchparty record(s); skipped ${skipped} already in the database.`);
	},

	// Exported for tests
	rowToParty,
};
