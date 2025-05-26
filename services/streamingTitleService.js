const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const domainHandlers = require('./streamingDomains');

function inferPlatformFromImage(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  if (thumbnailUrl.includes('nflxso.net')) return 'Netflix';
  if (thumbnailUrl.includes('hulu.com')) return 'Hulu';
  if (thumbnailUrl.includes('disneyplus.com')) return 'Disney+';
  if (thumbnailUrl.includes('primevideo.com')) return 'Prime Video';
  if (thumbnailUrl.includes('crunchyroll.com')) return 'Crunchyroll';
  return null;
}

async function getStreamingInfo(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const rawTitle = $('title').text().trim();
  const hostname = new URL(url).hostname;

  const domainKey = Object.keys(domainHandlers).find(domain =>
    hostname.includes(domain)
  );

  const handler = domainHandlers[domainKey] || {};

  // ✅ Clean title using HTML content when appropriate
  let title;
  if (typeof handler.cleanTitle === 'function') {
    if (handler.cleanTitle.length === 2) {
      // handler wants ($, rawTitle)
      title = await handler.cleanTitle($, rawTitle);
    } else {
      // handler wants just (url)
      title = await handler.cleanTitle(url);
    }
  } else {
    title = handler.cleanTitle || rawTitle;
  }

  // ✅ Extract thumbnail
  let thumbnail;
  if (typeof handler.extractThumbnail === 'function') {
    if (handler.extractThumbnail.length === 1) {
      thumbnail = await handler.extractThumbnail($);
    } else {
      thumbnail = await handler.extractThumbnail(url);
    }
  } else {
    thumbnail = handler.extractThumbnail;
  }

  // ✅ Platform name logic
  const inferredPlatform = inferPlatformFromImage(thumbnail);
  const platform = handler.platformName || inferredPlatform || 'Unknown';

  const displayTitle = title;

  return {
    title: displayTitle,
    thumbnail,
    platform,
    footerNote: handler.footerNote || null,
  };
}

module.exports = {
  getStreamingInfo,
};
