// utils/stateManager.js
const fs = require('node:fs');
const path = require('node:path');

class StateManager {
	constructor(filePath = './data/exportState.json') {
		this.filePath = filePath;
		this._ensureDir();
	}

	_ensureDir() {
		const dir = path.dirname(this.filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	_load() {
		try {
			if (!fs.existsSync(this.filePath)) {
				return { lastExportTimes: {} };
			}
			const raw = fs.readFileSync(this.filePath, 'utf-8');
			return JSON.parse(raw);
		}
		catch (err) {
			console.error('Failed to load state:', err);
			return { lastExportTimes: {} };
		}
	}

	_save(data) {
		try {
			const tmpPath = this.filePath + '.tmp';
			fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
			fs.renameSync(tmpPath, this.filePath);
		}
		catch (err) {
			console.error('Failed to save state:', err);
		}
	}

	getLastExportTime(channelId) {
		const data = this._load();
		const timestamp = data.lastExportTimes[channelId];
		return timestamp ? new Date(timestamp) : null;
	}

	updateLastExportTime(channelId) {
		const data = this._load();
		data.lastExportTimes[channelId] = new Date().toISOString();
		this._save(data);
	}
}

module.exports = StateManager;
