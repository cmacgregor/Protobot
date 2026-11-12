const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rowToParty, makeUserResolver } = require('../commands/utility/importsheet');

const noTmdb = async () => null;
const ids = { alice: '1', bob: '2' };
const resolveUser = async tag => ids[tag] ?? null;

test('maps sheet columns, links known users and works out who watched', async () => {
	const entry = await rowToParty(
		['Alien', 'https://x', '11/5/2026, 8:00:00 PM', 'Netflix', 'Horror', '1', '117', 'alice', 'alice, bob, zed', 'alice', 'Movie'],
		noTmdb, resolveUser,
	);
	assert.equal(entry.party.displayName, 'Alien');
	assert.equal(entry.party.source, 'import');
	assert.equal(entry.party.hostId, '1');
	assert.ok(entry.party.startedAt);
	const by = Object.fromEntries(entry.attendees.map(a => [a.userTag, a]));
	assert.equal(by.alice.userId, '1');
	assert.equal(by.alice.watched, true);
	assert.equal(by.bob.watched, false);
	assert.equal(by.zed.userId, null, 'unknown users are kept by name');
	assert.deepEqual(entry.title, { name: 'Alien', mediaType: 'movie' });
});

test('reads the Type column when TMDB has no match', async () => {
	const entry = await rowToParty(['Some Show', '', '', '', '', '', '', '', '', '', 'Show'], noTmdb);
	assert.equal(entry.title.mediaType, 'tv');
});

test('without end data, start attendees count as watched', async () => {
	const entry = await rowToParty(['Heat', '', 'not a date', '', '', '', '', '', 'carol', ''], noTmdb);
	assert.equal(entry.attendees[0].watched, true);
	assert.equal(entry.party.startedAt, null);
});

test('blank rows are skipped', async () => {
	assert.equal(await rowToParty(['', 'x'], noTmdb), null);
});

function fakeGuild(members) {
	const calls = [];
	const toCollection = list => {
		const arr = [...list];
		arr.find = Array.prototype.find.bind(arr);
		const coll = { find: fn => arr.find(fn), filter: fn => toCollection(arr.filter(fn)), get size() { return arr.length; }, first: () => arr[0] };
		return coll;
	};
	return {
		calls,
		members: {
			search: async ({ query }) => {
				calls.push(query);
				return toCollection(members.filter(m =>
					[m.user.username, m.displayName, m.user.globalName].some(n => n?.toLowerCase().startsWith(query))));
			},
		},
	};
}

test('user resolver: exact username, unique display name, old tags, and caching', async () => {
	const guild = fakeGuild([
		{ id: '1', displayName: 'Alice A', user: { username: 'alice', globalName: 'Alice A' } },
		{ id: '2', displayName: 'Bobby', user: { username: 'bob_99', globalName: null } },
		{ id: '3', displayName: 'Sam', user: { username: 'sam1', globalName: 'Sam' } },
		{ id: '4', displayName: 'Sam', user: { username: 'sam2', globalName: 'Sam' } },
	]);
	const resolve = makeUserResolver(guild);
	assert.equal(await resolve('alice'), '1');
	assert.equal(await resolve('Alice#1234'), '1', 'old discriminator tags match the name');
	assert.equal(await resolve('bobby'), '2', 'unique display name');
	assert.equal(await resolve('sam'), null, 'ambiguous display name is not guessed');
	assert.equal(await resolve('nobody'), null);
	await resolve('alice');
	assert.equal(guild.calls.filter(q => q === 'alice').length, 1, 'same tag only searched once');
});
