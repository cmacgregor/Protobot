const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toRow, titleCell } = require('../utils/sheetsExporter');

test('toRow fills columns A–K in order, with the type label last', () => {
	const row = toRow({
		title: 'Alien', url: 'https://x', postedDate: new Date('2026-11-05T02:00:00Z'), service: 'Netflix',
		genre: 'Horror', rewatchCount: 2, runtime: 117, host: 'alice',
		attendees: 'alice, bob', endAttendees: 'alice', mediaType: 'movie',
	});
	assert.equal(row.length, 11);
	assert.deepEqual([row[0], row[1], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]],
		['Alien', 'https://x', 'Netflix', 'Horror', 2, 117, 'alice', 'alice, bob', 'alice', 'Movie']);
	assert.equal(toRow({ title: 'x', postedDate: new Date(), mediaType: 'tv' })[10], 'Show');
	assert.equal(toRow({ title: 'x', postedDate: new Date() })[10], '');
});

test('titleCell links to IMDb and escapes quotes', () => {
	assert.equal(titleCell('Alien', null), 'Alien');
	assert.equal(
		titleCell('Say "Hi"', 'tt123'),
		'=HYPERLINK("https://www.imdb.com/title/tt123/", "Say ""Hi""")',
	);
});
