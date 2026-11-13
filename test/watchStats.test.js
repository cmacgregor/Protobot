const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../utils/db');
const store = require('../utils/watchpartyStore');
const stats = require('../utils/watchStats');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const T = Date.parse('2026-10-01T01:00:00Z');
const iso = ms => new Date(ms).toISOString();

let db;
let ids;

function party(p, attendees = [], sessions = []) {
	const id = store.insertParty(db, { guildId: 'g', source: 'live', ...p });
	store.insertAttendees(db, id, attendees);
	for (const s of sessions) {
		store.openSession(db, id, s.userId, s.userTag, iso(s.joined));
		if (s.left !== undefined) store.closeSession(db, id, s.userId, iso(s.left));
	}
	return id;
}

const att = (userId, userTag, watched, { start = true, end = true } = {}) =>
	({ userId, userTag, watched, presentAtStart: start, presentAtEnd: end, minutes: 0 });

before(() => {
	db = openDb(':memory:');
	const alien = store.upsertTitle(db, { tmdbId: 348, mediaType: 'movie', name: 'Alien', year: 1979, runtime: 117, genres: 'Horror, Sci-Fi' });
	const heat = store.upsertTitle(db, { tmdbId: 949, mediaType: 'movie', name: 'Heat', year: 1995, runtime: 170, genres: 'Crime, Thriller' });

	ids = {};
	// Weekly movie night: bob 20 min late, carol leaves after 30
	ids.p1 = party(
		{ titleId: alien, displayName: 'alien', hostId: 'A', hostTag: 'alice', startedAt: iso(T), endedAt: iso(T + 130 * MIN), weeklyEventId: 'ev1' },
		[att('A', 'alice', true), att('B', 'bob', true, { start: false }), att('C', 'carol', false, { end: false })],
		[
			{ userId: 'A', userTag: 'alice', joined: T, left: T + 130 * MIN },
			// Bob reconnects partway through; his first join is what counts
			{ userId: 'B', userTag: 'bob', joined: T + 20 * MIN, left: T + 60 * MIN },
			{ userId: 'B', userTag: 'bob', joined: T + 62 * MIN, left: T + 130 * MIN },
			{ userId: 'C', userTag: 'carol', joined: T, left: T + 30 * MIN },
		],
	);
	// Imported from the sheet: no duration (uses runtime 170), host without an id
	ids.p2 = party(
		{ titleId: heat, displayName: 'Heat', hostTag: 'dave', startedAt: iso(T + DAY), endedAt: iso(T + DAY), source: 'import' },
		[att('A', 'alice', true), att(null, 'zed', true)],
	);
	// Rewatch of Alien on a normal night; bob is 10 min late to his own party
	ids.p3 = party(
		{ titleId: alien, displayName: 'Alien', hostId: 'B', hostTag: 'bob', startedAt: iso(T + 2 * DAY), endedAt: iso(T + 2 * DAY + 125 * MIN) },
		[att('A', 'alice', true), att('B', 'bob', true, { start: false })],
		[
			{ userId: 'A', userTag: 'alice', joined: T + 2 * DAY, left: T + 2 * DAY + 125 * MIN },
			{ userId: 'B', userTag: 'bob', joined: T + 2 * DAY + 10 * MIN, left: T + 2 * DAY + 125 * MIN },
		],
	);
	// Still running, and another server's party: both must be ignored
	party({ titleId: heat, displayName: 'Heat', hostId: 'A', startedAt: iso(T + 3 * DAY) }, [att('A', 'alice', false)]);
	party({ guildId: 'other', titleId: heat, displayName: 'Heat', hostId: 'X', startedAt: iso(T), endedAt: iso(T + MIN) }, [att('A', 'alice', true)]);
});

test('history is newest first, numbers rewatches, and skips running/other-server parties', () => {
	const h = stats.listHistory(db, 'g', { perPage: 10 });
	assert.equal(h.total, 3);
	assert.deepEqual(h.items.map(i => i.id), [ids.p3, ids.p2, ids.p1]);
	const byId = Object.fromEntries(h.items.map(i => [i.id, i]));
	assert.equal(byId[ids.p3].watch_number, 2);
	assert.equal(byId[ids.p1].watch_number, 1);
	assert.equal(byId[ids.p2].watch_number, 1);
	assert.equal(byId[ids.p1].watchers, 2);
	assert.equal(byId[ids.p1].title_name, 'Alien');
});

test('history pages', () => {
	const p2 = stats.listHistory(db, 'g', { page: 2, perPage: 2 });
	assert.equal(p2.pages, 2);
	assert.deepEqual(p2.items.map(i => i.id), [ids.p1]);
	assert.equal(stats.listHistory(db, 'g', { page: 99, perPage: 2 }).page, 2, 'out-of-range page clamps');
	assert.equal(stats.listHistory(db, 'empty').total, 0);
});

test('server stats', () => {
	const s = stats.serverStats(db, 'g');
	assert.equal(s.parties, 3);
	assert.equal(s.titles, 2);
	// 130 + 170 (imported, runtime) + 125 minutes
	assert.equal(s.hours, 7.1);
	assert.equal(s.weeklyParties, 1);
	assert.equal(s.avgWatchersWeekly, 2);
	assert.equal(s.avgWatchersOther, 2);
	assert.deepEqual(s.topGenres.map(g => [g.genre, g.count]), [['Horror', 2], ['Sci-Fi', 2], ['Crime', 1], ['Thriller', 1]]);
	assert.deepEqual(s.rewatched.map(r => [r.name, r.times]), [['Alien', 2]]);
	assert.equal(s.topHosts.length, 3);
	assert.ok(s.topHosts.some(h => h.userId === null && h.userTag === 'dave'), 'hosts without an id still count');
	assert.deepEqual(s.topViewers.map(v => [v.userId, v.watched]), [['A', 3], ['B', 2]]);
});

test('member stats: regular viewer', () => {
	const m = stats.memberStats(db, 'g', 'A');
	assert.equal(m.attended, 3);
	assert.equal(m.watched, 3);
	assert.equal(m.hosted, 1);
	assert.equal(m.attendanceRate, 1);
	assert.equal(m.liveParties, 2);
	assert.equal(m.lateCount, 0);
	assert.equal(m.leftEarlyCount, 0);
	assert.deepEqual(m.topGenres.map(g => g.genre), ['Horror', 'Sci-Fi', 'Crime']);
	assert.equal(m.recent[0].name, 'Alien');
	assert.equal(m.recent.length, 3);
});

test('member stats: late arrivals and attendance rate from their first party', () => {
	const m = stats.memberStats(db, 'g', 'B');
	assert.equal(m.attended, 2);
	assert.equal(m.watched, 2);
	assert.equal(m.attendanceRate, 2 / 3);
	// 20 min late to the first, 10 to the second
	assert.equal(m.lateCount, 2);
	assert.equal(Math.round(m.avgLateMinutes), 15);
	assert.equal(m.leftEarlyCount, 0);
	assert.equal(m.hosted, 1);
});

test('member stats: left early and did not watch', () => {
	const m = stats.memberStats(db, 'g', 'C');
	assert.equal(m.attended, 1);
	assert.equal(m.watched, 0);
	assert.equal(m.leftEarlyCount, 1);
	assert.equal(m.attendanceRate, 0);
	assert.deepEqual(m.recent, []);
	assert.equal(stats.memberStats(db, 'g', 'nobody').attended, 0);
});

test('title search and viewings', () => {
	assert.deepEqual(stats.searchWatchedTitles(db, 'g', 'ali').map(t => [t.name, t.times]), [['Alien', 2]]);
	assert.equal(stats.searchWatchedTitles(db, 'g', '').length, 2);
	assert.equal(stats.searchWatchedTitles(db, 'g', '%').length, 0, 'LIKE wildcards are literal');
	assert.equal(stats.searchWatchedTitles(db, 'other', 'alien').length, 0);

	const alienId = stats.searchWatchedTitles(db, 'g', 'alien')[0].id;
	const v = stats.titleViewings(db, 'g', alienId);
	assert.deepEqual(v.viewings.map(x => x.id), [ids.p3, ids.p1]);
	assert.deepEqual(v.viewings[1].watchers.map(w => w.userTag).sort(), ['alice', 'bob']);
	assert.equal(stats.titleViewings(db, 'g', 99999), null);
});

test('countGenres splits, trims and ranks', () => {
	assert.deepEqual(stats.countGenres(['A, B', 'B', null, ' A ,C'], 2), [{ genre: 'A', count: 2 }, { genre: 'B', count: 2 }]);
});
