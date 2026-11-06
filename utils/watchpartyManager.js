// utils/watchpartyManager.js
// Runs live watchparties: records voice joins/leaves, ends parties when the
// movie's runtime is up or the voice channel empties, and survives restarts
// because all state is in the database.
//
// It deals in plain ids and tags rather than discord.js objects; the bot wires
// in Discord through setHooks (see events/ready.js), and tests use fakes.

const store = require('./watchpartyStore');
const { computeAttendance } = require('./attendance');

const MINUTE = 60 * 1000;
// setTimeout can't schedule further out than ~24.8 days
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const DEFAULTS = {
	// Credits, a pause, a late start
	runtimeBufferMinutes: 15,
	// How long the voice channel must stay empty before the party ends
	emptyGraceMinutes: 10,
	// Hard stop for anything left running (shows, forgotten parties)
	maxHours: 8,
};

class WatchpartyManager {
	/**
	 * @param {Object} options
	 * @param {import('node:sqlite').DatabaseSync} options.db
	 * @param {() => number} [options.now]
	 * @param {Partial<typeof DEFAULTS>} [options.settings]
	 */
	constructor({ db, now = Date.now, settings = {} }) {
		this.db = db;
		this.now = now;
		this.settings = { ...DEFAULTS, ...settings };
		/** @type {Map<number, NodeJS.Timeout>} */
		this.endTimers = new Map();
		/** @type {Map<number, {timer: NodeJS.Timeout, since: number}>} */
		this.emptyTimers = new Map();
		this.hooks = {
			/** @type {(voiceChannelId: string) => {id: string, tag: string}[]|null} humans in a voice channel */
			getVoiceMembers: () => null,
			/** @type {(summary: Object) => Promise<void>|void} */
			onEnd: null,
		};
	}

	setHooks(hooks) {
		Object.assign(this.hooks, hooks);
	}

	/**
	 * Start a party. Anything already running in the same text channel is ended first.
	 * @param {Object} p
	 * @param {string} p.guildId
	 * @param {string} p.channelId - text channel
	 * @param {string} p.voiceChannelId
	 * @param {string} p.hostId
	 * @param {string} p.hostTag
	 * @param {string} p.displayName
	 * @param {string} p.url
	 * @param {string} p.service
	 * @param {Object} p.title - TMDB details (or just {name}) for upsertTitle
	 * @param {string|null} [p.weeklyEventId]
	 * @param {{id: string, tag: string}[]} p.members - humans in voice right now
	 * @returns {Promise<{party: Object, replaced: Object|null}>} replaced is the end summary of the previous party
	 */
	async start(p) {
		const previous = store.getActivePartyInChannel(this.db, p.channelId);
		const replaced = previous ? await this.end(previous.id, 'replaced') : null;

		const nowIso = new Date(this.now()).toISOString();
		const titleId = store.upsertTitle(this.db, p.title);
		const partyId = store.insertParty(this.db, {
			guildId: p.guildId,
			channelId: p.channelId,
			voiceChannelId: p.voiceChannelId,
			titleId,
			displayName: p.displayName,
			url: p.url,
			service: p.service,
			hostId: p.hostId,
			hostTag: p.hostTag,
			startedAt: nowIso,
			weeklyEventId: p.weeklyEventId ?? null,
		});
		for (const m of p.members) store.openSession(this.db, partyId, m.id, m.tag, nowIso);

		this._scheduleEnd(partyId);
		this._checkEmpty(partyId);
		return { party: store.getParty(this.db, partyId), replaced };
	}

	/** @returns {Object|null} the active party in a text channel */
	getActive(channelId) {
		return store.getActivePartyInChannel(this.db, channelId);
	}

	setSheetRow(partyId, sheetRow, postedText) {
		store.setPartySheetRow(this.db, partyId, sheetRow, postedText);
	}

	/**
	 * Feed every voice state change in here.
	 * @param {{userId: string, userTag: string, isBot?: boolean, oldChannelId: string|null, newChannelId: string|null}} change
	 */
	handleVoiceChange({ userId, userTag, isBot, oldChannelId, newChannelId }) {
		if (oldChannelId === newChannelId) return;
		const nowIso = new Date(this.now()).toISOString();

		for (const party of store.listActiveParties(this.db)) {
			const vc = party.voice_channel_id;
			if (vc !== oldChannelId && vc !== newChannelId) continue;
			if (!isBot) {
				if (vc === oldChannelId) store.closeSession(this.db, party.id, userId, nowIso);
				if (vc === newChannelId) store.openSession(this.db, party.id, userId, userTag, nowIso);
			}
			this._checkEmpty(party.id);
		}
	}

	/**
	 * End a party, store final attendance, and run the onEnd hook.
	 * @param {number} partyId
	 * @param {'manual'|'runtime'|'empty'|'max'|'replaced'} reason
	 * @param {Object} [options]
	 * @param {number} [options.atMs] - when it ended, if not now (e.g. when the channel emptied)
	 * @returns {Promise<Object|null>} summary, or null if it wasn't active
	 */
	async end(partyId, reason, { atMs } = {}) {
		const party = store.getParty(this.db, partyId);
		if (!party || party.ended_at) return null;
		this._clearTimers(partyId);

		const startMs = Date.parse(party.started_at);
		const endMs = Math.max(atMs ?? this.now(), startMs);
		const endedAt = new Date(endMs).toISOString();

		const sessions = store.listSessions(this.db, partyId).map(s => ({
			userId: s.user_id,
			userTag: s.user_tag,
			joinedMs: Date.parse(s.joined_at),
			leftMs: s.left_at ? Date.parse(s.left_at) : null,
		}));
		const attendees = computeAttendance(sessions, startMs, endMs);
		store.finishParty(this.db, partyId, { endedAt, endReason: reason, attendees });

		const summary = {
			party: store.getParty(this.db, partyId),
			title: store.getTitle(this.db, party.title_id),
			attendees,
			reason,
		};
		console.log(`[WATCHPARTY] Ended "${party.display_name}" (${reason}): ${attendees.filter(a => a.watched).length} watched`);

		try {
			await this.hooks.onEnd?.(summary);
		}
		catch (err) {
			console.error(`[WATCHPARTY] onEnd hook failed for "${party.display_name}":`, err);
		}
		return summary;
	}

	/**
	 * After a restart: end parties that ran out while offline, line attendance up
	 * with who is in voice now, and reschedule timers.
	 * @returns {Promise<number>} parties still running
	 */
	async restore() {
		const active = store.listActiveParties(this.db);
		const nowMs = this.now();
		const nowIso = new Date(nowMs).toISOString();
		let running = 0;

		for (const party of active) {
			const { endsAt, reason } = this._endTimeFor(party);
			if (endsAt <= nowMs) {
				await this.end(party.id, reason, { atMs: endsAt });
				continue;
			}

			const members = this.hooks.getVoiceMembers(party.voice_channel_id);
			if (members) {
				const here = new Set(members.map(m => m.id));
				for (const userId of store.listOpenSessionUsers(this.db, party.id)) {
					if (!here.has(userId)) store.closeSession(this.db, party.id, userId, nowIso);
				}
				for (const m of members) store.openSession(this.db, party.id, m.id, m.tag, nowIso);
			}

			this._scheduleEnd(party.id);
			this._checkEmpty(party.id);
			running++;
		}
		if (active.length > 0) console.log(`[WATCHPARTY] Restored ${running} active watchparty(s)`);
		return running;
	}

	/** Clear all timers (shutdown and tests). */
	stopAll() {
		for (const id of [...this.endTimers.keys(), ...this.emptyTimers.keys()]) this._clearTimers(id);
	}

	_endTimeFor(party) {
		const startMs = Date.parse(party.started_at);
		const maxEnd = startMs + this.settings.maxHours * 60 * MINUTE;
		const title = store.getTitle(this.db, party.title_id);
		// Only movies have a meaningful single runtime; shows end when the channel empties
		if (title?.media_type === 'movie' && title.runtime) {
			const runtimeEnd = startMs + (title.runtime + this.settings.runtimeBufferMinutes) * MINUTE;
			if (runtimeEnd < maxEnd) return { endsAt: runtimeEnd, reason: 'runtime' };
		}
		return { endsAt: maxEnd, reason: 'max' };
	}

	_scheduleEnd(partyId) {
		const party = store.getParty(this.db, partyId);
		if (!party || party.ended_at) return;
		const { endsAt, reason } = this._endTimeFor(party);
		this._setTimer(this.endTimers, partyId, endsAt, () => this.end(partyId, reason));
	}

	_checkEmpty(partyId) {
		const party = store.getParty(this.db, partyId);
		if (!party || party.ended_at) return;

		const members = this.hooks.getVoiceMembers(party.voice_channel_id);
		// Unknown (channel gone or not cached): leave it to the other timers
		const isEmpty = Array.isArray(members) && members.length === 0;
		const pending = this.emptyTimers.get(partyId);

		if (!isEmpty) {
			if (pending) {
				clearTimeout(pending.timer);
				this.emptyTimers.delete(partyId);
			}
			return;
		}
		if (pending) return;

		const since = this.now();
		const fireAt = since + this.settings.emptyGraceMinutes * MINUTE;
		const timer = setTimeout(() => {
			this.emptyTimers.delete(partyId);
			// Record the end as when everyone left, not when the grace period ran out
			this.end(partyId, 'empty', { atMs: since });
		}, Math.max(fireAt - this.now(), 0));
		timer.unref?.();
		this.emptyTimers.set(partyId, { timer, since });
	}

	_setTimer(map, partyId, atMs, fn) {
		const existing = map.get(partyId);
		if (existing) clearTimeout(existing);
		const delay = Math.max(atMs - this.now(), 0);
		const timer = setTimeout(() => {
			map.delete(partyId);
			if (delay > MAX_TIMEOUT_MS) this._setTimer(map, partyId, atMs, fn);
			else fn();
		}, Math.min(delay, MAX_TIMEOUT_MS));
		timer.unref?.();
		map.set(partyId, timer);
	}

	_clearTimers(partyId) {
		const end = this.endTimers.get(partyId);
		if (end) clearTimeout(end);
		this.endTimers.delete(partyId);
		const empty = this.emptyTimers.get(partyId);
		if (empty) clearTimeout(empty.timer);
		this.emptyTimers.delete(partyId);
	}
}

let shared = null;

/** The bot's manager, backed by the shared database. */
function getManager() {
	if (!shared) {
		const { getDb } = require('./db');
		shared = new WatchpartyManager({ db: getDb() });
	}
	return shared;
}

module.exports = { WatchpartyManager, getManager, DEFAULTS };
