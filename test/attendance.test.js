const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeAttendance } = require('../utils/attendance');

const MIN = 60 * 1000;
const byId = list => Object.fromEntries(list.map(a => [a.userId, a]));

test('counts time present, merging reconnects, and applies the 50% rule', () => {
	const start = 0;
	const end = 120 * MIN;
	const result = byId(computeAttendance([
		// Whole movie, with a quick reconnect in the middle
		{ userId: 'a', userTag: 'A', joinedMs: 0, leftMs: 60 * MIN },
		{ userId: 'a', userTag: 'A', joinedMs: 59 * MIN, leftMs: null },
		// Left after 30 minutes
		{ userId: 'b', userTag: 'B', joinedMs: 0, leftMs: 30 * MIN },
		// Joined late but stayed to the end
		{ userId: 'c', userTag: 'C', joinedMs: 50 * MIN, leftMs: null },
		// Joined before the party and left before the end: clipped to the window
		{ userId: 'd', userTag: 'D', joinedMs: -30 * MIN, leftMs: 61 * MIN },
	], start, end));

	assert.equal(result.a.minutes, 120);
	assert.equal(result.a.watched, true);
	assert.equal(result.a.presentAtStart, true);
	assert.equal(result.a.presentAtEnd, true);

	assert.equal(result.b.minutes, 30);
	assert.equal(result.b.watched, false);
	assert.equal(result.b.presentAtEnd, false);

	assert.equal(result.c.minutes, 70);
	assert.equal(result.c.watched, true);
	assert.equal(result.c.presentAtStart, false);

	assert.equal(result.d.minutes, 61);
	assert.equal(result.d.watched, true);
});

test('a party ended immediately counts whoever was there', () => {
	const [a] = computeAttendance([{ userId: 'a', joinedMs: 0, leftMs: null }], 0, 30 * 1000);
	assert.equal(a.watched, true);
});

test('sorted longest first and ignores spans outside the party', () => {
	const result = computeAttendance([
		{ userId: 'x', joinedMs: -10 * MIN, leftMs: -5 * MIN },
		{ userId: 'short', joinedMs: 0, leftMs: 5 * MIN },
		{ userId: 'long', joinedMs: 0, leftMs: null },
	], 0, 60 * MIN);
	assert.deepEqual(result.map(a => a.userId), ['long', 'short']);
});
