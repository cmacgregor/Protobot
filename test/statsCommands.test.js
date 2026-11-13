const { test } = require('node:test');
const assert = require('node:assert/strict');
const { historyLine } = require('../commands/utility/history');
const { serverEmbed, memberEmbed } = require('../commands/utility/stats');
const { viewingsEmbed } = require('../commands/utility/watched');
const { ordinal, clampLines, userLabel } = require('../utils/format');

// Discord rejects embeds with empty field values or values over 1024 characters
function assertValidEmbed(embed) {
	const data = embed.toJSON();
	for (const f of data.fields ?? []) {
		assert.ok(f.value && f.value.length <= 1024, `field "${f.name}" has invalid value: ${JSON.stringify(f.value)}`);
	}
	assert.ok(!data.description || data.description.length <= 4096);
	return data;
}

test('format helpers', () => {
	assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal),
		['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
	assert.equal(userLabel('1', 'alice'), '<@1>');
	assert.equal(userLabel(null, 'zed'), 'zed');
	const long = clampLines(Array.from({ length: 200 }, (_, i) => `line ${i}`), 100);
	assert.ok(long.length <= 102 && long.endsWith('…'));
});

test('history line marks rewatches and movie nights', () => {
	const line = historyLine({
		title_name: 'Alien', year: 1979, started_at: '2026-10-01T01:00:00Z', watchers: 1,
		host_id: '1', host_tag: 'alice', watch_number: 2, weekly_event_id: 'ev',
	});
	assert.match(line, /\*\*Alien \(1979\)\*\*/);
	assert.match(line, /<t:\d+:d>/);
	assert.match(line, /1 watcher /);
	assert.match(line, /🔁 2nd watch/);
	assert.match(line, /📅 movie night/);
	assert.doesNotMatch(historyLine({ display_name: 'x', watchers: 0, watch_number: 1 }), /🔁|📅/);
});

test('server embed is valid even with sparse data', () => {
	const data = assertValidEmbed(serverEmbed('Guild', {
		parties: 1, titles: 1, hours: 2, weeklyParties: 0, avgWatchersWeekly: null, avgWatchersOther: 1,
		topGenres: [], rewatched: [], topHosts: [], topViewers: [],
	}));
	assert.ok(!data.fields.some(f => f.name === 'Movie nights'), 'no movie-night line without weekly parties');
	assert.equal(data.fields.find(f => f.name === 'Most rewatched').value, 'None yet');
});

const fakeUser = { username: 'bob', displayName: 'Bob', displayAvatarURL: () => 'https://cdn/avatar.png' };

test('member embed shows late/early only when there is live data', () => {
	const base = {
		attended: 2, watched: 2, hosted: 0, attendanceRate: 0.5, liveParties: 2, lateCount: 1, avgLateMinutes: 20.4,
		leftEarlyCount: 0, topGenres: [{ genre: 'Horror' }], recent: [{ name: 'Alien', year: 1979, startedAt: '2026-10-01T01:00:00Z' }],
	};
	const data = assertValidEmbed(memberEmbed(fakeUser, base));
	const fields = Object.fromEntries(data.fields.map(f => [f.name, f.value]));
	assert.equal(fields.Attendance, '50%');
	assert.equal(fields['Arrived late'], '1 of 2 · avg 20 min late');
	assert.equal(fields['Left early'], '0 of 2');

	const imported = assertValidEmbed(memberEmbed(fakeUser, { ...base, liveParties: 0, recent: [], topGenres: [] }));
	assert.ok(!imported.fields.some(f => f.name === 'Arrived late'));
});

test('watched embed lists viewings and caps long lists', () => {
	const viewings = Array.from({ length: 12 }, (_, i) => ({
		started_at: `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z`,
		weekly_event_id: i === 0 ? 'ev' : null,
		watchers: i === 1 ? [] : [{ userId: '1', userTag: 'alice' }],
	}));
	const data = assertValidEmbed(viewingsEmbed({ title: { name: 'Alien', year: 1979, poster_url: null }, viewings }));
	assert.equal(data.description, 'Watched 12 times.');
	const value = data.fields[0].value;
	assert.match(value, /…and 2 earlier/);
	assert.match(value, /📅/);
	assert.match(value, /nobody stayed/);
});
