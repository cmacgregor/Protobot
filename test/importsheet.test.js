const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rowToParty } = require('../commands/utility/importsheet');

const lookup = async () => null;

test('maps sheet columns and works out who watched', async () => {
	const entry = await rowToParty(
		['Alien', 'https://x', '11/5/2026, 8:00:00 PM', 'Netflix', 'Horror', '1', '117', 'alice', 'alice, bob', 'alice'],
		7, lookup,
	);
	assert.equal(entry.party.displayName, 'Alien');
	assert.equal(entry.party.sheetRow, 7);
	assert.equal(entry.party.source, 'import');
	assert.ok(entry.party.startedAt);
	const by = Object.fromEntries(entry.attendees.map(a => [a.userTag, a]));
	assert.equal(by.alice.watched, true);
	assert.equal(by.bob.watched, false);
	assert.equal(by.bob.presentAtStart, true);
	assert.deepEqual(entry.title, { name: 'Alien' });
});

test('without end data, start attendees count as watched', async () => {
	const entry = await rowToParty(['Heat', '', 'not a date', '', '', '', '', '', 'carol', ''], 2, lookup);
	assert.equal(entry.attendees[0].watched, true);
	assert.equal(entry.party.startedAt, null);
});

test('blank rows are skipped', async () => {
	assert.equal(await rowToParty(['', 'x'], 3, lookup), null);
});
