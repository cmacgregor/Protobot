const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRowNumber, findWatchpartyRow } = require('../utils/sheetsExporter');

test('parseRowNumber reads the first row of an A1 range', () => {
	assert.equal(parseRowNumber('Sheet1!A57:J57'), 57);
	assert.equal(parseRowNumber('\'Movie Log\'!A3'), 3);
	assert.equal(parseRowNumber(undefined), null);
	assert.equal(parseRowNumber('garbage'), null);
});

const header = ['Title', 'URL', 'Posted Date', 'Service', 'Genre', 'Rewatch', 'Runtime', 'Host', 'Start', 'End'];

test('findWatchpartyRow prefers the exact posted date', () => {
	const rows = [
		header,
		['Alien', 'u', '1/1/2026, 8:00:00 PM', '', '', '', '', '', 'a', ''],
		['Alien', 'u', '2/1/2026, 8:00:00 PM', '', '', '', '', '', 'a', ''],
	];
	assert.equal(findWatchpartyRow(rows, { title: 'Alien', postedText: '1/1/2026, 8:00:00 PM' }), 2);
});

test('findWatchpartyRow falls back to the newest unfinished row with that title', () => {
	const rows = [
		header,
		['Alien', 'u', 'reformatted', '', '', '', '', '', 'a', ''],
		['Alien', 'u', 'reformatted', '', '', '', '', '', 'a', 'done'],
		['Heat', 'u', 'x', '', '', '', '', '', 'a', ''],
		['Alien', 'u', 'reformatted too'],
	];
	assert.equal(findWatchpartyRow(rows, { title: 'Alien', postedText: '1/1/2026, 8:00:00 PM' }), 5);
	assert.equal(findWatchpartyRow(rows, { title: 'Nope' }), null);
});
