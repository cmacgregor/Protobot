// utils/safeFetch.js
// Fetch a page from a URL someone posted, without letting it reach the bot's own
// network: private, loopback and link-local addresses are refused, redirects are
// checked hop by hop, and the response is capped in size.
//
// Remaining gap: the address is checked before connecting, so a DNS server that
// answers differently on a second lookup could still slip through. Running the
// container on an isolated network (e.g. the app-server VLAN) covers that.

const dns = require('node:dns/promises');
const net = require('node:net');

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 1024 * 1024;

const blockList = new net.BlockList();
for (const [addr, prefix] of [
	['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
	['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
	['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockList.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
	['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blockList.addSubnet(addr, prefix, 'ipv6');

/** @param {string} address - an IP address */
function isBlockedAddress(address) {
	const family = net.isIP(address);
	if (family === 0) return true;
	// IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as IPv4
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
	if (mapped) return blockList.check(mapped[1], 'ipv4');
	return blockList.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Is it OK to fetch this URL? http(s) only, and every address it resolves to must be public.
 * @param {URL} url
 * @param {(host: string) => Promise<{address: string}[]>} [lookup] - overridable for tests
 */
async function isPublicUrl(url, lookup = host => dns.lookup(host, { all: true })) {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) return false;
	if (net.isIP(host)) return !isBlockedAddress(host);
	try {
		const addresses = await lookup(host);
		return addresses.length > 0 && addresses.every(a => !isBlockedAddress(a.address));
	}
	catch {
		return false;
	}
}

async function readCapped(res, maxBytes) {
	if (!res.body) return '';
	const reader = res.body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			// Titles are near the top; keep what fits and stop downloading
			chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
			await reader.cancel();
			break;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf-8');
}

/**
 * GET a public web page as text.
 * @param {string} input
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @param {Object} [options.headers]
 * @param {Function} [options.lookup] - DNS lookup, overridable for tests
 * @param {typeof fetch} [options.fetchImpl] - overridable for tests
 * @returns {Promise<string|null>} null if blocked, failed or not OK
 */
async function fetchPublicText(input, {
	timeoutMs = 6000, maxBytes = DEFAULT_MAX_BYTES, headers = {}, lookup, fetchImpl = fetch,
} = {}) {
	const signal = AbortSignal.timeout(timeoutMs);
	let url;
	try {
		url = new URL(input);
	}
	catch {
		return null;
	}

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!(await isPublicUrl(url, lookup))) {
			console.warn(`[FETCH] Refused non-public address: ${url.host}`);
			return null;
		}
		const res = await fetchImpl(url, { signal, headers, redirect: 'manual' });
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (!location) return null;
			url = new URL(location, url);
			continue;
		}
		if (!res.ok) return null;
		return readCapped(res, maxBytes);
	}
	return null;
}

module.exports = { fetchPublicText, isPublicUrl, isBlockedAddress };
