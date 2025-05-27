const fs = require('fs');
const path = require('path');

const platformHandlers = fs.readdirSync(path.join(__dirname, 'platforms'))
	.filter(file => file.endsWith('Service.js'))
	.map(file => require(path.join(__dirname, 'platforms', file)));

async function getStreamingInfo(url) {
	const handler = platformHandlers.find(h => h.match(url));
	if (!handler) return null;
	return await handler.getInfo(url);
}

module.exports = {
	getStreamingInfo,
};
