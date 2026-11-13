const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuildScheduledEventStatus: S, GuildScheduledEventEntityType: E } = require('discord.js');
const { decide, EventAutoStarter, DEFAULTS } = require('../utils/eventAutoStart');

const MIN = 60 * 1000;
const T = Date.parse('2026-11-14T01:00:00Z');
const voiceEvent = (status, extra = {}) => ({ status, entityType: E.Voice, startMs: T, endMs: null, ...extra });

test('scheduled events start at their start time, not before, and not if long missed', () => {
	const ev = voiceEvent(S.Scheduled);
	assert.equal(decide(ev, { nowMs: T - MIN, memberCount: 0, emptySinceMs: null }).action, null);
	assert.equal(decide(ev, { nowMs: T, memberCount: 0, emptySinceMs: null }).action, 'start');
	assert.equal(decide(ev, { nowMs: T + 5 * MIN, memberCount: 0, emptySinceMs: null }).action, 'start');
	assert.equal(decide(ev, { nowMs: T + (DEFAULTS.maxStartLateMinutes + 1) * MIN, memberCount: 0, emptySinceMs: null }).action, null);
});

test('active voice events end after the channel has been empty for the grace period', () => {
	const ev = voiceEvent(S.Active);
	let r = decide(ev, { nowMs: T + MIN, memberCount: 0, emptySinceMs: null });
	assert.deepEqual(r, { action: null, emptySinceMs: T + MIN });
	r = decide(ev, { nowMs: T + 30 * MIN, memberCount: 0, emptySinceMs: r.emptySinceMs });
	assert.equal(r.action, null, '29 minutes is not enough');
	r = decide(ev, { nowMs: T + 31 * MIN, memberCount: 0, emptySinceMs: r.emptySinceMs });
	assert.equal(r.action, 'end');
});

test('someone joining resets the empty countdown', () => {
	const ev = voiceEvent(S.Active);
	const r = decide(ev, { nowMs: T + 25 * MIN, memberCount: 3, emptySinceMs: T });
	assert.deepEqual(r, { action: null, emptySinceMs: null });
});

test('an unseen channel never ends the event and keeps the countdown', () => {
	const r = decide(voiceEvent(S.Active), { nowMs: T + 90 * MIN, memberCount: null, emptySinceMs: T });
	assert.deepEqual(r, { action: null, emptySinceMs: T });
});

test('external events end at their scheduled end time', () => {
	const ev = { status: S.Active, entityType: E.External, startMs: T, endMs: T + 120 * MIN };
	assert.equal(decide(ev, { nowMs: T + 119 * MIN, memberCount: null, emptySinceMs: null }).action, null);
	assert.equal(decide(ev, { nowMs: T + 120 * MIN, memberCount: null, emptySinceMs: null }).action, 'end');
});

test('completed and canceled events are left alone', () => {
	for (const status of [S.Completed, S.Canceled]) {
		assert.equal(decide(voiceEvent(status), { nowMs: T + 999 * MIN, memberCount: 0, emptySinceMs: T }).action, null);
	}
});

function fakeGuild({ events, voice }) {
	// Reads voice[id] on every access so tests can change who's in the channel
	const channels = new Map(Object.keys(voice).map(id => [id, {
		isVoiceBased: () => true,
		get members() {
			return { filter: fn => ({ size: voice[id].filter(fn).length }) };
		},
	}]));
	return {
		id: 'g',
		name: 'Guild',
		channels: { cache: channels },
		scheduledEvents: { fetch: async () => new Map(events.map(e => [e.id, e])) },
	};
}

function fakeEvent(id, status, { channelId = 'vc', startMs = T, failWith } = {}) {
	return {
		id, name: `Movie night ${id}`, status, channelId,
		entityType: E.Voice, scheduledStartTimestamp: startMs, scheduledEndTimestamp: null,
		calls: [],
		async setStatus(s) {
			this.calls.push(s);
			if (failWith) throw Object.assign(new Error('Missing Permissions'), { code: failWith });
			this.status = s;
		},
	};
}

test('auto-starter starts, waits out a full room, then ends once empty', async () => {
	let now = T - MIN;
	const voice = { vc: [] };
	const ev = fakeEvent('1', S.Scheduled);
	const guild = fakeGuild({ events: [ev], voice });
	const starter = new EventAutoStarter({ guilds: { cache: new Map([['g', guild]]) } }, { now: () => now });

	await starter.checkAll();
	assert.equal(ev.status, S.Scheduled);

	now = T;
	await starter.checkAll();
	assert.equal(ev.status, S.Active);

	// People arrive and watch for two hours
	voice.vc = [{ user: { bot: false } }, { user: { bot: true } }];
	for (now = T + 5 * MIN; now <= T + 125 * MIN; now += 10 * MIN) await starter.checkAll();
	assert.equal(ev.status, S.Active);

	// Only the bot is left
	voice.vc = [{ user: { bot: true } }];
	now = T + 130 * MIN;
	await starter.checkAll();
	now = T + 159 * MIN;
	await starter.checkAll();
	assert.equal(ev.status, S.Active);
	now = T + 160 * MIN;
	await starter.checkAll();
	assert.equal(ev.status, S.Completed);
	assert.deepEqual(ev.calls, [S.Active, S.Completed]);
});

test('missing permission is logged once and does not throw', async () => {
	const ev = fakeEvent('2', S.Scheduled, { failWith: 50013 });
	const guild = fakeGuild({ events: [ev], voice: { vc: [] } });
	const starter = new EventAutoStarter({ guilds: { cache: new Map([['g', guild]]) } }, { now: () => T });
	const warnings = [];
	const original = console.warn;
	console.warn = msg => warnings.push(msg);
	try {
		await starter.checkAll();
		await starter.checkAll();
	}
	finally {
		console.warn = original;
	}
	assert.equal(ev.calls.length, 2, 'keeps trying in case the permission is granted');
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /Manage Events/);
});
