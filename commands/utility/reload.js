// commands/utility/reload.js
const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function walk(dir, acc = []) {
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, ent.name);
		if (ent.isDirectory()) walk(p, acc);
		else if (/\.(c|m)?js$/i.test(ent.name)) acc.push(p);
	}
	return acc;
}

async function loadFreshModule(absPath) {
	// Try CommonJS first
	try {
		// Purge from CJS cache and require again
		delete require.cache[require.resolve(absPath)];
		return require(absPath);
	}
	catch (e) {
		// If it's an ESM module, fall back to dynamic import with cache buster
		if (String(e.code) === 'ERR_REQUIRE_ESM') {
			const base = pathToFileURL(absPath).href;
			const bust = `${base}?t=${Date.now()}`;
			const mod = await import(bust);
			return mod.default ?? mod;
		}
		throw e;
	}
}

async function findCommandModuleByName(commandsRoot, targetName) {
	const files = walk(commandsRoot);
	// Load each file just enough to check its exported name
	for (const abs of files) {
		try {
			const mod = await loadFreshModule(abs);
			const exportedName = mod?.data?.name ?? mod?.data?.toJSON?.()?.name;
			if (typeof exportedName === 'string' && exportedName.toLowerCase() === targetName) {
				return { absPath: abs, module: mod };
			}
		}
		catch {
			// Ignore load errors while scanning; we'll report if nothing matched
		}
	}
	return null;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload')
		.setDescription('Reload a command from disk (supports nested folders, CJS/ESM).')
		.addStringOption(o =>
			o.setName('command')
				.setDescription('The slash command name to reload (e.g., watchparty)')
				.setRequired(true),
		),

	category: 'utility',

	async execute(interaction) {
		const input = interaction.options.getString('command', true).trim().toLowerCase();

		// Give ourselves a bit more time and avoid the 3s window
		try { await interaction.deferReply({ ephemeral: true }); }
		catch {}

		// Root of commands is the parent of this file’s directory
		// e.g. .../commands/utility/reload.js -> .../commands
		const commandsRoot = path.join(__dirname, '..');

		// Try to find by scanning the filesystem (robust, ignores "category" structure)
		const found = await findCommandModuleByName(commandsRoot, input);
		if (!found) {
			// As a fallback, check what the bot has currently loaded
			const existing = interaction.client.commands.get(input);
			if (!existing) {
				return interaction.editReply(`❌ I couldn't find a command named \`${input}\` on disk or in memory.`);
			}
			return interaction.editReply(
				`❌ Found \`${input}\` in memory but not on disk. Is the file missing or named differently?`,
			);
		}

		const { absPath } = found;

		try {
			// Load a fresh copy and validate shape
			const fresh = await loadFreshModule(absPath);
			if (!(fresh?.data?.name) || typeof fresh.execute !== 'function') {
				return interaction.editReply(
					`❌ The module at \`${path.relative(process.cwd(), absPath)}\` does not export { data, execute }.`,
				);
			}

			// Replace in the client's command collection
			const name = fresh.data.name;
			interaction.client.commands.set(name, fresh);

			return interaction.editReply(
				`✅ Reloaded \`${name}\` from \`${path.relative(process.cwd(), absPath)}\`.`,
			);
		}
		catch (err) {
			console.error(`Reload failed for ${absPath}:`, err);
			return interaction.editReply(
				`❌ Error reloading \`${input}\`:\n\`\`\`${err?.message || err}\`\`\``,
			);
		}
	},
};
