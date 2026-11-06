const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../utils/db');
const store = require('../utils/watchpartyStore');
const { WatchpartyManager } = require('../utils/watchpartyManager');

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-05T02:00:00Z');
const flush = () => new Promise(resolve => setImmediate(resolve));

let db;
let voice;
let ended;

function makeManager() {
	const manager = new WatchpartyManager({ db, now: () => Date.now() });
	manager.setHooks({
		getVoiceMembers: id => voice.get(id) ?? null,
		onEnd: summary => ended.push(summary),
	});
	return manager;
}

function join(manager, channelId, user) {
	const before = [...voice.entries()].find(([, ms]) => ms.some(m => m.id === user.id))?.[0] ?? null;
	if (before) voice.set(before, voice.get(before).filter(m => m.id !== user.id));
	voice.set(channelId, [...(voice.get(channelId) ?? []), user]);
	manager.handleVoiceChange({ userId: user.id, userTag: user.tag, oldChannelId: before, newChannelId: channelId });
}

function leave(manager, user) {
	const before = [...voice.entries()].find(([, ms]) => ms.some(m => m.id === user.id))?.[0];
	voice.set(before, voice.get(before).filter(m => m.id !== user.id));
	manager.handleVoiceChange({ userId: user.id, userTag: user.tag, oldChannelId: before, newChannelId: null });
}

const alice = { id: '1', tag: 'alice' };
const bob = { id: '2', tag: 'bob' };
const carol = { id: '3', tag: 'carol' };

const movie = { tmdbId: 348, mediaType: 'movie', name: 'Alien', year: 1979, runtime: 117, genres: 'Horror' };
const show = { tmdbId: 1396, mediaType: 'tv', name: 'Breaking Bad', runtime: 45 };

function startParams(overrides = {}) {
	return {
		guildId: 'g', channelId: 'text', voiceChannelId: 'vc', hostId: alice.id, hostTag: alice.tag,
		displayName: 'Alien', url: 'https://example.com', service: 'Netflix', title: movie,
		members: voice.get('vc') ?? [], ...overrides,
	};
}

beforeEach(() => {
	mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
	db = openDb(':memory:');
	voice = new Map([['vc', [alice, bob]]]);
	ended = [];
});

afterEach(() => {
	mock.timers.reset();
	db.close();
});

test('a movie ends at runtime + buffer and records who watched', async () => {
	const manager = makeManager();
	const { party } = await manager.start(startParams());
	assert.equal(manager.getActive('text').id, party.id);

	mock.timers.tick(20 * MIN);
	leave(manager, bob);
	join(manager, 'vc', carol);

	// 117 min runtime + 15 min buffer
	mock.timers.tick(111 * MIN);
	await flush();
	assert.equal(ended.length, 0);
	mock.timers.tick(1 * MIN);
	await flush();

	assert.equal(ended.length, 1);
	const { reason, attendees, party: done } = ended[0];
	assert.equal(reason, 'runtime');
	assert.equal(done.ended_at, new Date(T0 + 132 * MIN).toISOString());
	const by = Object.fromEntries(attendees.map(a => [a.userTag, a]));
	assert.equal(by.alice.watched, true);
	assert.equal(by.bob.watched, false);
	assert.equal(by.bob.minutes, 20);
	assert.equal(by.carol.watched, true);
	assert.equal(manager.getActive('text'), null);
	assert.equal(store.listAttendees(db, party.id).length, 3);
});

test('a show has no runtime timer and ends when the channel stays empty', async () => {
	const manager = makeManager();
	await manager.start(startParams({ title: show, displayName: 'Breaking Bad' }));

	mock.timers.tick(150 * MIN);
	await flush();
	assert.equal(ended.length, 0, 'still running past one episode');

	leave(manager, alice);
	leave(manager, bob);
	// A brief rejoin cancels the countdown
	mock.timers.tick(5 * MIN);
	join(manager, 'vc', bob);
	mock.timers.tick(20 * MIN);
	await flush();
	assert.equal(ended.length, 0);

	leave(manager, bob);
	const emptiedAt = Date.now();
	mock.timers.tick(10 * MIN);
	await flush();
	assert.equal(ended.length, 1);
	assert.equal(ended[0].reason, 'empty');
	// End is recorded as when everyone left, not when the countdown ran out
	assert.equal(ended[0].party.ended_at, new Date(emptiedAt).toISOString());
});

test('manual end, and starting a new party replaces the old one', async () => {
	const manager = makeManager();
	const { party: first } = await manager.start(startParams());
	mock.timers.tick(30 * MIN);

	const { party: second, replaced } = await manager.start(startParams({ displayName: 'Heat', title: { name: 'Heat' } }));
	assert.equal(replaced.party.id, first.id);
	assert.equal(replaced.reason, 'replaced');
	assert.equal(manager.getActive('text').id, second.id);

	const summary = await manager.end(second.id, 'manual');
	assert.equal(summary.reason, 'manual');
	assert.equal(await manager.end(second.id, 'manual'), null, 'ending twice is a no-op');
	assert.equal(ended.length, 2);
});

test('bots and other channels are ignored', async () => {
	const manager = makeManager();
	const { party } = await manager.start(startParams());
	manager.handleVoiceChange({ userId: 'bot', userTag: 'bot', isBot: true, oldChannelId: null, newChannelId: 'vc' });
	join(manager, 'other-vc', carol);
	const summary = await manager.end(party.id, 'manual');
	assert.deepEqual(summary.attendees.map(a => a.userTag).sort(), ['alice', 'bob']);
});

test('restore picks up a running party after a restart', async () => {
	const first = makeManager();
	const { party } = await first.start(startParams());
	mock.timers.tick(30 * MIN);
	first.stopAll();

	// While the bot was down, bob left and carol arrived
	voice.set('vc', [alice, carol]);
	mock.timers.tick(10 * MIN);

	const second = makeManager();
	assert.equal(await second.restore(), 1);
	mock.timers.tick(92 * MIN);
	await flush();

	assert.equal(ended.length, 1);
	assert.equal(ended[0].party.id, party.id);
	const tags = ended[0].attendees.map(a => a.userTag).sort();
	assert.deepEqual(tags, ['alice', 'bob', 'carol']);
	const bobResult = ended[0].attendees.find(a => a.userTag === 'bob');
	assert.equal(bobResult.presentAtEnd, false);
});

test('restore ends parties whose runtime finished while offline, at the scheduled time', async () => {
	const first = makeManager();
	await first.start(startParams());
	first.stopAll();
	mock.timers.tick(5 * 60 * MIN);

	const second = makeManager();
	assert.equal(await second.restore(), 0);
	assert.equal(ended.length, 1);
	assert.equal(ended[0].reason, 'runtime');
	assert.equal(ended[0].party.ended_at, new Date(T0 + 132 * MIN).toISOString());
});

test('free-text titles without TMDB are deduplicated by name', () => {
	const a = store.upsertTitle(db, { name: 'Teleparty Session' });
	const b = store.upsertTitle(db, { name: 'teleparty session' });
	const c = store.upsertTitle(db, movie);
	const d = store.upsertTitle(db, { ...movie, poster: undefined, runtime: null });
	assert.equal(a, b);
	assert.equal(c, d);
	assert.equal(store.getTitle(db, c).runtime, 117, 'missing fields do not wipe stored ones');
});
