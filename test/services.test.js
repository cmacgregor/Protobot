const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, detectService, DEFAULT_COLOR } = require('../utils/services');

test('detectService matches known services and subdomains', () => {
	assert.deepEqual(detectService('www.netflix.com'), { name: 'Netflix', color: 0xE50914 });
	assert.equal(detectService('www.amazon.co.uk').name, 'Prime Video');
	assert.equal(detectService('tv.apple.com').name, 'Apple TV');
	assert.equal(detectService('youtu.be').name, 'YouTube');
});

test('detectService falls back to the hostname', () => {
	assert.deepEqual(detectService('Example.ORG'), { name: 'example.org', color: DEFAULT_COLOR });
});

test('normalizeUrl adds a scheme and rejects junk', () => {
	assert.equal(normalizeUrl('hulu.com/watch/1').href, 'https://hulu.com/watch/1');
	assert.equal(normalizeUrl('http://x.com').protocol, 'http:');
	assert.equal(normalizeUrl('not a url'), null);
});
