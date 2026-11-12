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

test('user text that looks like a formula is written as plain text', () => {
	const { asText } = require('../utils/sheetsExporter');
	assert.equal(asText('=IMPORTXML("http://evil", "//a")'), '\'=IMPORTXML("http://evil", "//a")');
	assert.equal(asText('+1'), '\'+1');
	assert.equal(asText('-cmd'), '\'-cmd');
	assert.equal(asText('@SUM(A1)'), '\'@SUM(A1)');
	assert.equal(asText('Alien'), 'Alien');
	assert.equal(asText(117), 117);
	assert.equal(titleCell('=1+1', null), '\'=1+1', 'free-text titles are escaped too');
});

test('titleCell only builds a link from a real IMDb id', () => {
	assert.equal(titleCell('Alien', 'tt0078748'), '=HYPERLINK("https://www.imdb.com/title/tt0078748/", "Alien")');
	assert.equal(titleCell('Alien', '"), IMPORTDATA("x'), 'Alien');
});

test('watchpartyRow escapes every user-supplied cell, not just the title', () => {
	const { watchpartyRow } = require('../utils/sheetsExporter');
	const row = watchpartyRow({
		title: '=cmd()', url: '=IMAGE("http://evil")', postedDate: new Date(), service: '+svc',
		genre: '@g', runtime: 90, host: '-host', attendees: '=a', endAttendees: '=b', mediaType: 'movie',
	}, null);
	assert.equal(row.length, 11);
	for (const cell of row) {
		if (typeof cell === 'string') assert.ok(!/^[=+\-@]/.test(cell), `unescaped cell: ${cell}`);
	}
	assert.equal(row[6], 90, 'numbers stay numbers');
	assert.match(watchpartyRow({ title: 'Alien', postedDate: new Date() }, 'tt0078748')[0], /^=HYPERLINK/);
});
