// commands/utility/exportmovies.js
const { SlashCommandBuilder } = require('discord.js');
const { PermissionLevel } = require('../../utils/permissions');
const { extractMovieFromUrl } = require('../../utils/movieExtractor');
const StateManager = require('../../utils/stateManager');
const { fetchGenreFromTMDB } = require('../../utils/sheetsExporter');
const { auth, sheets } = require('@googleapis/sheets');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('exportmovies')
		.setDescription('Export movie links from this channel to Google Sheets')
		.addBooleanOption(option =>
			option.setName('rescan')
				.setDescription('Force rescan all messages (ignores last export time)')
				.setRequired(false))
		.setDMPermission(false),

	category: 'utility',
	permissions: PermissionLevel.SERVER_OWNER,

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });

		try {
			// Validate credentials
			if (!process.env.GOOGLE_SHEETS_CREDENTIALS || !process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
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
			await exportToGoogleSheets(movies);

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

		// Check if this is a watchparty command (has interaction)
		let attendees = '';
		let host = msg.author.tag;

		// Extract attendees from embed if present (from watchparty command)
		if (msg.interaction?.commandName === 'watchparty' && msg.embeds?.length > 0) {
			const embed = msg.embeds[0];
			const attendeesField = embed.fields?.find(f => f.name?.startsWith('Attendees'));
			if (attendeesField) {
				attendees = attendeesField.value;
			}
			// Host is command caller
			host = msg.interaction.user.tag;
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
				const tmdbInfo = await fetchGenreFromTMDB(movieData.title);

				movies.push({
					title: movieData.title,
					url: movieData.sourceUrl,
					postedDate: msg.createdAt,
					host: host,
					service: movieData.service,
					attendees: attendees,
					genre: tmdbInfo || '',
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

async function exportToGoogleSheets(movies) {
	const googleAuth = new auth.GoogleAuth({
		credentials: JSON.parse(
			Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS, 'base64').toString(),
		),
		scopes: ['https://www.googleapis.com/auth/spreadsheets'],
	});

	const sheetsClient = sheets({ version: 'v4', auth: googleAuth });

	// Columns: Title (with IMDB link), URL, Posted Date, Service, Genre, Rewatch Count, Runtime, Host, Start Attendees, End Attendees
	const rows = movies.map(m => [
		// No IMDB link for historical data (would be too slow to fetch for all)
		m.title,
		m.url,
		m.postedDate.toLocaleString(),
		m.service,
		m.genre,
		m.rewatchCount,
		m.runtime || '',
		m.host,
		m.attendees,
		// End attendees - blank for historical data
		'',
	]);

	await sheetsClient.spreadsheets.values.append({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		// Updated range to include all 10 columns
		range: 'Sheet1!A2:J2',
		valueInputOption: 'RAW',
		insertDataOption: 'INSERT_ROWS',
		resource: { values: rows },
	});
}
