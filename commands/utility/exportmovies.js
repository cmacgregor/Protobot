// commands/utility/exportmovies.js
const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const { PermissionLevel } = require('../../utils/permissions');
const { extractMovieFromUrl } = require('../../utils/movieExtractor');
const StateManager = require('../../utils/stateManager');
const { fetchTMDBInfo } = require('../../utils/tmdb');
const { isSheetsConfigured, exportMoviesToSheet } = require('../../utils/sheetsExporter');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('exportmovies')
		.setDescription('Export movie links from this channel to Google Sheets')
		.addBooleanOption(option =>
			option.setName('rescan')
				.setDescription('Force rescan all messages (ignores last export time)')
				.setRequired(false))
		.setContexts(InteractionContextType.Guild),

	category: 'utility',
	permissions: PermissionLevel.SERVER_OWNER,

	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			// Validate credentials
			if (!isSheetsConfigured()) {
				return interaction.editReply('❌ Google Sheets is not configured. Add credentials to .env file.');
			}

			// Load state
			const stateManager = new StateManager();
			const forceRescan = interaction.options.getBoolean('rescan') || false;
			const lastExportTime = forceRescan ? null : stateManager.getLastExportTime(interaction.channelId);
			const scanAfter = lastExportTime || new Date(0);

			// Fetch messages
			const scanMessage = forceRescan
				? '🔍 Force rescanning ALL messages...'
				: `🔍 Scanning messages since ${scanAfter.toLocaleString()}...`;
			await interaction.editReply(scanMessage);
			const messages = await fetchMessagesSince(interaction.channel, scanAfter);

			// Extract movies
			await interaction.editReply(`🎬 Extracting movie data from ${messages.length} messages...`);
			const movies = await extractMoviesFromMessages(messages);

			if (movies.length === 0) {
				return interaction.editReply('✅ No new movie links found since last export.');
			}

			// Export to Sheets
			await interaction.editReply(`📊 Exporting ${movies.length} movie(s) to Google Sheets...`);
			await exportMoviesToSheet(movies);

			// Update state
			stateManager.updateLastExportTime(interaction.channelId);

			const successMessage = forceRescan
				? `✅ Successfully exported ${movies.length} movie(s) to Google Sheets!\n` +
					`Full rescan completed - processed ${messages.length} total messages.`
				: `✅ Successfully exported ${movies.length} movie(s) to Google Sheets!\n` +
					`Scanned ${messages.length} messages since ${scanAfter.toLocaleString()}`;

			await interaction.editReply(successMessage);

		}
		catch (error) {
			console.error('Export failed:', error);
			await interaction.editReply(`❌ Export failed: ${error.message}`);
		}
	},
};

async function fetchMessagesSince(channel, afterDate) {
	const messages = [];
	let lastId;
	const cutoffTimestamp = afterDate.getTime();

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const fetchOptions = { limit: 100 };
		if (lastId) fetchOptions.before = lastId;

		const batch = await channel.messages.fetch(fetchOptions);
		if (batch.size === 0) break;

		for (const msg of batch.values()) {
			if (msg.createdTimestamp < cutoffTimestamp) {
				return messages;
			}
			messages.push(msg);
		}

		lastId = batch.last().id;
		// Rate limit protection
		await new Promise(r => setTimeout(r, 100));
	}

	return messages;
}

async function extractMoviesFromMessages(messages) {
	const movies = [];
	const urlRegex = /https?:\/\/[^\s]+/g;
	// Track rewatch count
	const titleCounts = {};

	for (const msg of messages) {
		// Extract URLs from message content
		const urls = msg.content.match(urlRegex) || [];

		// Also extract URLs from embed fields (for watchparty command)
		if (msg.embeds?.length > 0) {
			for (const embed of msg.embeds) {
				// Check embed URL field
				if (embed.url) {
					urls.push(embed.url);
				}
				// Check Link field in watchparty embeds
				const linkField = embed.fields?.find(f => f.name === 'Link');
				if (linkField?.value) {
					const embedUrls = linkField.value.match(urlRegex) || [];
					urls.push(...embedUrls);
				}
			}
		}

		// Remove duplicates
		const uniqueUrls = [...new Set(urls)];

		let attendees = '';
		let host = msg.author.tag;

		// Watchparty posts are bot messages from a slash command with a "Link" embed field;
		// for those, the host is whoever ran the command
		const meta = msg.interactionMetadata;
		const watchpartyEmbed = msg.author.id === msg.client.user.id && meta
			? msg.embeds?.find(e => e.fields?.some(f => f.name === 'Link'))
			: null;
		if (watchpartyEmbed) {
			const attendeesField = watchpartyEmbed.fields.find(f => f.name?.startsWith('Attendees'));
			if (attendeesField) attendees = attendeesField.value;
			host = meta.user.tag;
		}

		for (const url of uniqueUrls) {
			// Find the Discord embed that matches this URL (if any)
			const matchingEmbed = msg.embeds?.find(e => e.url === url || e.data?.url === url);

			// Pass the full message text and Discord embed to help extract title
			const movieData = await extractMovieFromUrl(url, msg.content, matchingEmbed);
			// Skip if extraction failed
			if (movieData && movieData.title !== url && movieData.title) {
				// Track rewatch count
				const normalizedTitle = movieData.title.toLowerCase().trim();
				titleCounts[normalizedTitle] = (titleCounts[normalizedTitle] || 0) + 1;

				// Fetch genre and runtime from TMDB
				const { genre } = await fetchTMDBInfo(movieData.title);

				movies.push({
					title: movieData.title,
					url: movieData.sourceUrl,
					postedDate: msg.createdAt,
					host: host,
					service: movieData.service,
					attendees: attendees,
					genre: genre || '',
					rewatchCount: titleCounts[normalizedTitle],
					// Runtime not available for historical data
					runtime: null,
				});
			}
			// Rate limit protection for TMDB and web requests
			await new Promise(r => setTimeout(r, 250));
		}
	}

	return movies;
}
