const fs = require('fs');
const path = require('path');

const platformHandlers = fs.readdirSync(path.join(__dirname, 'platforms'))
	.filter(file => file.endsWith('Service.js'))
	.map(file => require(path.join(__dirname, 'platforms', file)))
	.filter(handler => handler && typeof handler.match === 'function');

async function getStreamingInfo(url, message) {
	const handler = platformHandlers.find(h => h.match(url));
	if (!handler) {
		console.warn(`⚠️ No matching platform handler for URL: ${url}`);
		return null;
	}

	console.log(`🔍 Matched platform: ${handler.platform}`);

	if (typeof handler.getInfo !== 'function') {
		console.warn(`⚠️ Handler for ${handler.platform} is missing getInfo()`);
		return null;
	}

	return await handler.getInfo(url, message);
}

module.exports = {
	getStreamingInfo,
};
