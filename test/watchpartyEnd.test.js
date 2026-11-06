const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handleWatchpartyEnd } = require('../utils/watchpartyEnd');

test('posts a summary that names who watched without pinging', async () => {
	const sent = [];
	const client = { channels: { fetch: async () => ({ send: async msg => sent.push(msg) }) } };
	await handleWatchpartyEnd(client, {
		party: {
			display_name: 'alien', channel_id: 'text', host_id: '1', host_tag: 'alice', url: 'https://netflix.com/x',
			started_at: '2026-11-05T02:00:00.000Z', ended_at: '2026-11-05T04:12:00.000Z',
		},
		title: { name: 'Alien', year: 1979, poster_url: 'https://img', media_type: 'movie' },
		attendees: [
			{ userId: '1', userTag: 'alice', watched: true, presentAtStart: true, presentAtEnd: true },
			{ userId: '2', userTag: 'bob', watched: false, presentAtStart: true, presentAtEnd: false },
		],
		reason: 'runtime',
		watchCount: 1,
	});

	assert.equal(sent.length, 1);
	const { embeds: [embed], allowedMentions } = sent[0];
	const data = embed.toJSON();
	assert.deepEqual(allowedMentions, { parse: [] });
	assert.match(data.title, /alien \(1979\)/);
	const fields = Object.fromEntries(data.fields.map(f => [f.name, f.value]));
	assert.equal(fields.Length, '2h 12m');
	assert.equal(fields['Watched (1)'], '<@1>');
	assert.equal(data.footer.text, 'Runtime finished');
});

test('a missing channel does not throw', async () => {
	const client = { channels: { fetch: async () => { throw new Error('Unknown Channel'); } } };
	await handleWatchpartyEnd(client, {
		party: { display_name: 'x', channel_id: 'gone', started_at: '2026-11-05T02:00:00Z', ended_at: '2026-11-05T02:00:00Z' },
		title: null, attendees: [], reason: 'manual', watchCount: 1,
	});
});
