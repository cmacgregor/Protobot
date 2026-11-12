const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchPublicText, isPublicUrl, isBlockedAddress } = require('../utils/safeFetch');

test('private, loopback and link-local addresses are blocked', () => {
	for (const a of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.1.1',
		'0.0.0.0', '::1', 'fd12::1', 'fe80::1', '::ffff:192.168.1.1', 'not-an-ip']) {
		assert.equal(isBlockedAddress(a), true, a);
	}
	for (const a of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) {
		assert.equal(isBlockedAddress(a), false, a);
	}
});

const dnsTo = map => async host => {
	if (!(host in map)) throw new Error('ENOTFOUND');
	return map[host].map(address => ({ address }));
};

test('isPublicUrl checks scheme, literal IPs and every DNS answer', async () => {
	const lookup = dnsTo({ 'public.example': ['93.184.216.34'], 'mixed.example': ['93.184.216.34', '10.0.0.1'] });
	assert.equal(await isPublicUrl(new URL('https://public.example/x'), lookup), true);
	assert.equal(await isPublicUrl(new URL('https://mixed.example/x'), lookup), false);
	assert.equal(await isPublicUrl(new URL('http://192.168.1.1/'), lookup), false);
	assert.equal(await isPublicUrl(new URL('http://[::1]:8080/'), lookup), false);
	assert.equal(await isPublicUrl(new URL('http://localhost/'), lookup), false);
	assert.equal(await isPublicUrl(new URL('http://unknown.example/'), lookup), false);
	assert.equal(await isPublicUrl(new URL('file:///etc/passwd'), lookup), false);
});

function fakeResponse(status, { body = '', location } = {}) {
	return new Response(status >= 300 && status < 400 ? null : body, {
		status,
		headers: location ? { location } : {},
	});
}

test('redirects into the local network are refused', async () => {
	const lookup = dnsTo({ 'public.example': ['93.184.216.34'], 'nas.home': ['192.168.1.20'] });
	const fetched = [];
	const fetchImpl = async url => {
		fetched.push(url.href);
		return url.hostname === 'public.example'
			? fakeResponse(302, { location: 'http://nas.home/admin' })
			: fakeResponse(200, { body: '<title>NAS admin</title>' });
	};
	assert.equal(await fetchPublicText('https://public.example/', { lookup, fetchImpl }), null);
	assert.deepEqual(fetched, ['https://public.example/'], 'the internal address is never requested');
});

test('public pages are returned, following safe redirects, capped in size', async () => {
	const lookup = dnsTo({ 'a.example': ['93.184.216.34'], 'b.example': ['93.184.216.35'] });
	const fetchImpl = async url => (url.hostname === 'a.example'
		? fakeResponse(301, { location: 'https://b.example/page' })
		: fakeResponse(200, { body: '<title>Alien</title>' + 'x'.repeat(5000) }));
	const text = await fetchPublicText('https://a.example/', { lookup, fetchImpl, maxBytes: 100 });
	assert.ok(text.startsWith('<title>Alien</title>'));
	assert.equal(Buffer.byteLength(text), 100);
});

test('too many redirects gives up', async () => {
	const lookup = dnsTo({ 'loop.example': ['93.184.216.34'] });
	let calls = 0;
	const fetchImpl = async () => {
		calls++;
		return fakeResponse(302, { location: 'https://loop.example/again' });
	};
	assert.equal(await fetchPublicText('https://loop.example/', { lookup, fetchImpl }), null);
	assert.equal(calls, 4);
});
