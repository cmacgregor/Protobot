// utils/attendance.js
// Turns raw voice join/leave spans into per-person attendance for a party.

// Slack for "was there at the start/end", so someone a few seconds late still counts
const EDGE_GRACE_MS = 2 * 60 * 1000;

/**
 * @param {{userId: string, userTag?: string, joinedMs: number, leftMs: number|null}[]} sessions
 * @param {number} startMs - party start
 * @param {number} endMs - party end
 * @param {Object} [options]
 * @param {number} [options.watchedFraction] - share of the party someone must be present for
 * @returns {{userId: string, userTag: string|null, minutes: number,
 *   presentAtStart: boolean, presentAtEnd: boolean, watched: boolean}[]} sorted by minutes, longest first
 */
function computeAttendance(sessions, startMs, endMs, { watchedFraction = 0.5 } = {}) {
	const durationMs = Math.max(endMs - startMs, 0);
	const byUser = new Map();

	for (const s of sessions) {
		// Clip each span to the party window
		const from = Math.max(s.joinedMs, startMs);
		const to = Math.min(s.leftMs ?? endMs, endMs);
		const entry = byUser.get(s.userId) || { userId: s.userId, userTag: s.userTag ?? null, spans: [] };
		if (s.userTag) entry.userTag = s.userTag;
		if (to > from) entry.spans.push([from, to]);
		else if (to === from && from === startMs) entry.spans.push([from, from]);
		byUser.set(s.userId, entry);
	}

	const results = [];
	for (const { userId, userTag, spans } of byUser.values()) {
		if (spans.length === 0) continue;
		spans.sort((a, b) => a[0] - b[0]);

		// Merge overlapping spans (e.g. a quick disconnect/reconnect)
		let totalMs = 0;
		let [curFrom, curTo] = spans[0];
		for (const [from, to] of spans.slice(1)) {
			if (from <= curTo) {
				curTo = Math.max(curTo, to);
			}
			else {
				totalMs += curTo - curFrom;
				[curFrom, curTo] = [from, to];
			}
		}
		totalMs += curTo - curFrom;

		const presentAtStart = spans.some(([from]) => from <= startMs + EDGE_GRACE_MS);
		const presentAtEnd = spans.some(([, to]) => to >= endMs - EDGE_GRACE_MS);
		// Very short parties (ended right away) count whoever was there
		const watched = durationMs < EDGE_GRACE_MS
			? presentAtStart
			: totalMs >= durationMs * watchedFraction;

		results.push({
			userId,
			userTag,
			minutes: Math.round(totalMs / 60000),
			presentAtStart,
			presentAtEnd,
			watched,
		});
	}

	return results.sort((a, b) => b.minutes - a.minutes);
}

module.exports = { computeAttendance };
