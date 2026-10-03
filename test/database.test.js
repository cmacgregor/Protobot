// test/database.test.js
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { WatchpartyDatabase } = require('../utils/database');

let db;

const alice = { id: '1', tag: 'alice' };
const bob = { id: '2', tag: 'bob' };
const carol = { id: '3', tag: 'carol' };

function createParty(overrides = {}) {
	return db.createWatchparty({
		guildId: 'g',
		channelId: 'c',
		voiceChannelId: 'v',
		title: 'Alien',
		url: 'https://example.com',
		service: 'Hulu',
		genre: 'Horror, Sci-Fi',
		runtime: 117,
		hostId: alice.id,
		hostTag: alice.tag,
		startedAt: new Date('2026-01-01T20:00:00Z'),
		attendees: [alice, bob, carol],
		...overrides,
	});
}

beforeEach(() => {
	db = new WatchpartyDatabase(':memory:');
});

afterEach(() => {
	db.close();
});

test('setRating inserts, updates, and returns the previous score', () => {
	const id = createParty();
	assert.equal(db.setRating(id, alice, 8), null);
	assert.equal(db.setRating(id, alice, 6), 8);
	assert.deepEqual(db.getWatchpartyRatingSummary(id), { count: 1, average: 6 });
});

test('setRating rejects scores outside 1-10', () => {
	const id = createParty();
	assert.throws(() => db.setRating(id, alice, 0), RangeError);
	assert.throws(() => db.setRating(id, alice, 11), RangeError);
	assert.throws(() => db.setRating(id, alice, 7.5), RangeError);
});

test('movie stats group rewatches by title, case-insensitively', () => {
	const first = createParty();
	const second = createParty({ title: 'alien ', startedAt: new Date('2026-02-01T20:00:00Z') });
	db.setRating(first, alice, 8);
	db.setRating(first, bob, 6);
	db.setRating(second, alice, 10);

	const stats = db.getMovieStats('ALIEN');
	assert.equal(stats.count, 3);
	assert.equal(stats.average, 8);
	assert.equal(stats.watchparties.length, 2);
	assert.deepEqual(stats.distribution, { 6: 1, 8: 1, 10: 1 });
	assert.ok(Math.abs(stats.stddev - Math.sqrt(8 / 3)) < 1e-9);
});

test('top movies respect order and minimum rating count', () => {
	const alien = createParty();
	const cats = createParty({ title: 'Cats', genre: 'Musical' });
	const solo = createParty({ title: 'Solo' });
	db.setRating(alien, alice, 9);
	db.setRating(alien, bob, 7);
	db.setRating(cats, alice, 2);
	db.setRating(cats, bob, 3);
	db.setRating(solo, alice, 10);

	assert.deepEqual(db.getTopMovies({ minRatings: 2 }).map(m => m.title), ['Alien', 'Cats']);
	assert.deepEqual(db.getTopMovies({ order: 'worst', minRatings: 2 }).map(m => m.title), ['Cats', 'Alien']);
	assert.equal(db.getTopMovies({ minRatings: 1 })[0].title, 'Solo');
});

test('controversial movies rank by spread', () => {
	const split = createParty({ title: 'Split' });
	const agreed = createParty({ title: 'Agreed' });
	for (const [user, score] of [[alice, 1], [bob, 10], [carol, 5]]) db.setRating(split, user, score);
	for (const user of [alice, bob, carol]) db.setRating(agreed, user, 7);

	const rows = db.getControversialMovies({ minRatings: 3 });
	assert.deepEqual(rows.map(r => r.title), ['Split', 'Agreed']);
	assert.equal(rows[1].stddev, 0);
	assert.equal(rows[0].low, 1);
	assert.equal(rows[0].high, 10);
});

test('breakdown splits comma-separated genres and groups by service and host', () => {
	const alien = createParty();
	const up = createParty({ title: 'Up', genre: 'Animation', service: 'Disney+', hostId: bob.id });
	db.setRating(alien, alice, 8);
	db.setRating(up, alice, 6);

	const genres = db.getBreakdown('genre');
	assert.deepEqual(genres.map(g => g.key), ['Horror', 'Sci-Fi', 'Animation']);
	assert.equal(genres[0].watchparties, 1);

	assert.deepEqual(db.getBreakdown('service').map(s => [s.key, s.average]), [['Hulu', 8], ['Disney+', 6]]);
	assert.deepEqual(db.getBreakdown('host').map(h => h.key), [alice.id, bob.id]);
	assert.throws(() => db.getBreakdown('nope'));
});

test('user stats compute generosity against the group and attendance', () => {
	const alien = createParty();
	const up = createParty({ title: 'Up', genre: 'Animation' });
	db.setRating(alien, alice, 9);
	db.setRating(alien, bob, 5);
	db.setRating(up, alice, 8);
	db.endWatchparty(alien, [alice, carol]);

	const stats = db.getUserStats(alice.id);
	assert.equal(stats.ratingCount, 2);
	assert.equal(stats.averageScore, 8.5);
	// Only Alien has another rater: alice 9 vs group average 7
	assert.equal(stats.generosity, 2);
	assert.equal(stats.favorites[0].title, 'Alien');
	// Up hasn't ended, so it doesn't count toward the stayed-to-the-end ratio
	assert.deepEqual(stats.attendance, { attended: 2, started: 1, finished: 1, stayed: 1, hosted: 2 });
	assert.deepEqual(db.getUserStats(bob.id).attendance, { attended: 2, started: 1, finished: 0, stayed: 0, hosted: 0 });

	assert.equal(db.getUserStats(bob.id).generosity, -2);
	assert.equal(db.getUserStats('nobody').generosity, null);
});

test('attendance stats compute retention from ended watchparties only', () => {
	const ended = createParty();
	createParty({ title: 'Ongoing' });
	// carol left, dave joined late (late joiners don't count as retained)
	db.endWatchparty(ended, [alice, bob, { id: '4', tag: 'dave' }]);

	const stats = db.getAttendanceStats();
	assert.equal(stats.totalWatchparties, 2);
	assert.equal(stats.endedWatchparties, 1);
	assert.equal(stats.uniqueAttendees, 4);
	assert.equal(stats.retentionRate, 2 / 3);
	assert.equal(stats.averageStart, 3);
	assert.equal(stats.averageEnd, 3);
	assert.equal(stats.leaderboard[0].attended, 2);
});

test('endWatchparty replaces end attendees when called again', () => {
	const id = createParty();
	db.endWatchparty(id, [alice, bob]);
	db.endWatchparty(id, [alice]);
	assert.equal(db.getMovieStats('Alien').watchparties[0].end_count, 1);
});

test('search and title lookup are case-insensitive and escape LIKE wildcards', () => {
	createParty({ title: '100% Wolf' });
	createParty({ title: '100 Wolves' });
	createParty({ title: 'Alien', startedAt: new Date('2026-03-01T20:00:00Z') });

	assert.deepEqual(db.searchWatchparties('100%').map(w => w.title), ['100% Wolf']);
	assert.equal(db.searchWatchparties('').length, 3);
	assert.equal(db.searchWatchparties('')[0].title, 'Alien');
	assert.equal(db.findLatestByTitle('  ALIEN').title, 'Alien');
	assert.equal(db.findLatestByTitle('Missing'), null);
});
