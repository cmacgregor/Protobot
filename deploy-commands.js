// deploy-commands.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
let CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CLEAR_FIRST = /^1|true$/i.test(process.env.CLEAR_FIRST || '');

if (!TOKEN) throw new Error('Missing BOT_TOKEN in .env');

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function loadModule(absPath) {
	try { return require(absPath); }
	catch (e) {
		if (String(e.code) === 'ERR_REQUIRE_ESM') {
			const mod = await import(pathToFileURL(absPath).href);
			return mod.default ?? mod;
		}
		throw e;
	}
}

function walk(dir, acc = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(p, acc);
		else if (/\.(c|m)?js$/i.test(entry.name)) acc.push(p);
	}
	return acc;
}

(async () => {
	// Verify token ↔ app
	const app = await rest.get(Routes.oauth2CurrentApplication());
	if (!CLIENT_ID) CLIENT_ID = app.id;
	if (CLIENT_ID !== app.id) throw new Error(`CLIENT_ID ${CLIENT_ID} != token's app id ${app.id}`);
	console.log(`Using application ${app.name} (${app.id})`);

	// Recursively load commands
	const commandsDir = path.join(__dirname, 'commands');
	if (!fs.existsSync(commandsDir)) throw new Error(`Commands directory not found: ${commandsDir}`);

	const files = walk(commandsDir);
	console.log(`Discovered ${files.length} file(s):`);
	files.forEach(f => console.log(' -', path.relative(__dirname, f)));

	const built = [];
	for (const abs of files) {
		try {
			const cmd = await loadModule(abs);
			if (cmd?.data?.toJSON && typeof cmd.execute === 'function') {
				built.push(cmd.data.toJSON());
				console.log(`✓ loaded: ${cmd.data.name} (${path.relative(__dirname, abs)})`);
			}
			else {
				console.warn(`⚠️  skipped (missing {data, execute}): ${path.relative(__dirname, abs)}`);
			}
		}
		catch (e) {
			console.warn(`⚠️  failed to load ${path.relative(__dirname, abs)}: ${e.message}`);
		}
	}
	if (built.length === 0) throw new Error('No valid commands found.');

	const route = GUILD_ID
		? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
		: Routes.applicationCommands(CLIENT_ID);

	if (CLEAR_FIRST) {
		console.log('Clearing existing commands on target...');
		await rest.put(route, { body: [] });
	}

	console.log(`Registering ${built.length} ${GUILD_ID ? 'guild' : 'global'} command(s)...`);
	await rest.put(route, { body: built });
	console.log('✅ Commands registered.');

	const live = await rest.get(route);
	console.log(`Now ${live.length} command(s) live:`, live.map(c => c.name).join(', '));
})().catch(err => {
	console.error('❌ Failed to register commands');
	if (err?.rawError) console.error(JSON.stringify(err.rawError, null, 2));
	else console.error(err);
	process.exit(1);
});
