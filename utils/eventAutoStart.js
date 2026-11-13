// utils/eventAutoStart.js
// Starts the server's scheduled events at their start time and ends them when
// they're over. Discord doesn't start voice-channel events by itself, so without
// this someone has to press Start (and watchparties only get tagged as movie
// night while the event is live).
//
// Needs the Manage Events permission. Recurring events move on to their next
// occurrence by themselves when one is completed.

const { GuildScheduledEventStatus, GuildScheduledEventEntityType } = require('discord.js');

const MINUTE = 60 * 1000;
const DEFAULTS = {
	checkEveryMs: MINUTE,
	// End a voice event once its channel has been empty this long (also covers nobody turning up)
	emptyEndMinutes: 30,
	// Don't start events whose start time is this far in the past (e.g. the bot was offline all night)
	maxStartLateMinutes: 6 * 60,
};

/**
 * What to do with one event right now. Pure, for testing.
 * @param {{status: number, entityType: number, startMs: number, endMs: number|null}} event
 * @param {{nowMs: number, memberCount: number|null, emptySinceMs: number|null}} state
 *   memberCount is null when the channel can't be seen; emptySinceMs is when it was last seen go empty
 * @param {typeof DEFAULTS} settings
 * @returns {{action: 'start'|'end'|null, emptySinceMs: number|null}}
 */
function decide(event, { nowMs, memberCount, emptySinceMs }, settings = DEFAULTS) {
	const { Scheduled, Active } = GuildScheduledEventStatus;
	const isExternal = event.entityType === GuildScheduledEventEntityType.External;

	if (event.status === Scheduled) {
		const lateMs = nowMs - event.startMs;
		const due = lateMs >= 0 && lateMs <= settings.maxStartLateMinutes * MINUTE;
		return { action: due ? 'start' : null, emptySinceMs: null };
	}

	if (event.status !== Active) return { action: null, emptySinceMs: null };

	// External events have no channel to watch, but they always have an end time
	if (isExternal) {
		return { action: event.endMs && nowMs >= event.endMs ? 'end' : null, emptySinceMs: null };
	}

	if (memberCount === null) return { action: null, emptySinceMs };
	if (memberCount > 0) return { action: null, emptySinceMs: null };

	// Count emptiness from no earlier than the start, so a late crowd still gets the full grace
	const since = emptySinceMs ?? Math.max(nowMs, event.startMs);
	const done = nowMs - since >= settings.emptyEndMinutes * MINUTE;
	return { action: done ? 'end' : null, emptySinceMs: since };
}

class EventAutoStarter {
	/**
	 * @param {import('discord.js').Client} client
	 * @param {Object} [options]
	 * @param {() => number} [options.now]
	 * @param {Partial<typeof DEFAULTS>} [options.settings]
	 */
	constructor(client, { now = Date.now, settings = {} } = {}) {
		this.client = client;
		this.now = now;
		this.settings = { ...DEFAULTS, ...settings };
		/** @type {Map<string, number>} event id -> when its channel went empty */
		this.emptySince = new Map();
		/** Guilds already warned about missing permissions, so the log isn't spammed */
		this.warned = new Set();
		this.timer = null;
	}

	start() {
		this.stop();
		this.timer = setInterval(() => this.checkAll(), this.settings.checkEveryMs);
		this.timer.unref?.();
		return this.checkAll();
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	async checkAll() {
		for (const guild of this.client.guilds.cache.values()) {
			try {
				await this.checkGuild(guild);
			}
			catch (err) {
				console.error(`[EVENTS] Check failed for ${guild.name}:`, err.message);
			}
		}
	}

	async checkGuild(guild) {
		const events = await guild.scheduledEvents.fetch();
		const nowMs = this.now();
		const seen = new Set();

		for (const event of events.values()) {
			seen.add(event.id);
			const channel = event.channelId ? guild.channels.cache.get(event.channelId) : null;
			const memberCount = channel?.isVoiceBased?.()
				? channel.members.filter(m => !m.user.bot).size
				: null;

			const { action, emptySinceMs } = decide({
				status: event.status,
				entityType: event.entityType,
				startMs: event.scheduledStartTimestamp,
				endMs: event.scheduledEndTimestamp,
			}, { nowMs, memberCount, emptySinceMs: this.emptySince.get(event.id) ?? null }, this.settings);

			if (emptySinceMs === null) this.emptySince.delete(event.id);
			else this.emptySince.set(event.id, emptySinceMs);

			if (action) await this.apply(guild, event, action);
		}

		// Forget events that are gone
		for (const id of this.emptySince.keys()) if (!seen.has(id)) this.emptySince.delete(id);
	}

	async apply(guild, event, action) {
		const status = action === 'start' ? GuildScheduledEventStatus.Active : GuildScheduledEventStatus.Completed;
		try {
			await event.setStatus(status);
			this.emptySince.delete(event.id);
			console.log(`[EVENTS] ${action === 'start' ? 'Started' : 'Ended'} "${event.name}" in ${guild.name}`);
		}
		catch (err) {
			// 50013 = Missing Permissions
			if (err.code === 50013) {
				if (!this.warned.has(guild.id)) {
					console.warn(`[EVENTS] Can't ${action} "${event.name}" in ${guild.name}: the bot needs the Manage Events permission`);
					this.warned.add(guild.id);
				}
				return;
			}
			throw err;
		}
	}
}

module.exports = { EventAutoStarter, decide, DEFAULTS };
