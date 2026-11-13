// utils/format.js
// Small display helpers shared by the stats commands.

/** Discord timestamp markup, shown in each viewer's own timezone. Style d = date, f = date + time, R = relative. */
function discordTime(iso, style = 'd') {
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? `<t:${Math.floor(ms / 1000)}:${style}>` : 'unknown date';
}

/** A mention when we have the Discord id (renders as their current name), else the stored tag. */
function userLabel(userId, userTag) {
	return userId ? `<@${userId}>` : (userTag || 'unknown');
}

function titleLabel(name, year) {
	return year ? `${name} (${year})` : name;
}

function ordinal(n) {
	const rem100 = n % 100;
	if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
	return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

function plural(n, word, pluralWord = `${word}s`) {
	return `${n} ${n === 1 ? word : pluralWord}`;
}

/** Join lines, stopping before Discord's field/description limit. */
function clampLines(lines, max = 1024) {
	let out = '';
	for (const line of lines) {
		const next = out ? `${out}\n${line}` : line;
		if (next.length > max) return out ? `${out}\n…` : line.slice(0, max - 1) + '…';
		out = next;
	}
	return out;
}

module.exports = { discordTime, userLabel, titleLabel, ordinal, plural, clampLines };
