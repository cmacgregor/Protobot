const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractMovieFromUrl } = require('../utils/movieExtractor');

test('TMDB links take the title from the URL slug', async () => {
	const m = await extractMovieFromUrl('https://www.themoviedb.org/movie/348-alien');
	assert.deepEqual(m, { title: 'alien', sourceUrl: 'https://www.themoviedb.org/movie/348-alien', service: 'TMDB' });
});

test('Twitch links are ignored', async () => {
	assert.equal(await extractMovieFromUrl('https://www.twitch.tv/bloodredsakura'), null);
});

test('Teleparty links use the title from the message text', async () => {
	const url = 'https://www.teleparty.com/join/abc123';
	const m = await extractMovieFromUrl(url, `"Spirited Away" ${url}`);
	assert.equal(m.title, 'Spirited Away');
	assert.equal(m.service, 'Teleparty');
});

test('Teleparty links without context fall back to a placeholder', async () => {
	const m = await extractMovieFromUrl('https://www.teleparty.com/join/abc123');
	assert.equal(m.title, 'Teleparty Session');
});
