// commands/utility/exportmovies.js
const { SlashCommandBuilder } = require('discord.js');
const { PermissionLevel } = require('../../utils/permissions');
const { extractMovieFromUrl } = require('../../utils/movieExtractor');
const StateManager = require('../../utils/stateManager');
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
		await new Promise(r => setTimeout(r, 100)); // Rate limit protection
	}

	return messages;
}

async function extractMoviesFromMessages(messages) {
	const movies = [];
	const urlRegex = /https?:\/\/[^\s]+/g;

	for (const msg of messages) {
		const urls = msg.content.match(urlRegex) || [];

		for (const url of urls) {
			// Find the Discord embed that matches this URL (if any)
			const matchingEmbed = msg.embeds?.find(e => e.url === url || e.data?.url === url);

			// Pass the full message text and Discord embed to help extract title
			const movieData = await extractMovieFromUrl(url, msg.content, matchingEmbed);
			if (movieData && movieData.title !== url && movieData.title) { // Skip if extraction failed
				movies.push({
					title: movieData.title,
					url: movieData.sourceUrl,
					postedDate: msg.createdAt,
					postedBy: msg.author.tag,
					service: movieData.service,
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

	const rows = movies.map(m => [
		m.title,
		m.url,
		m.postedDate.toLocaleString(),
		m.postedBy,
	]);

	await sheetsClient.spreadsheets.values.append({
		spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
		range: 'Sheet1!A2:D2',
		valueInputOption: 'RAW',
		insertDataOption: 'INSERT_ROWS',
		resource: { values: rows },
	});
}
