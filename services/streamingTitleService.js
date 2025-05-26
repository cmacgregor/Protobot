const cheerio = require('cheerio');
const fetch = async (...args) => {
  const mod = await import('node-fetch');
  return mod.default(...args);
};

const domainHandlers = require('./streamingDomains');

async function getStreamingInfo(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const rawTitle = $('title').text().trim();
  const hostname = new URL(url).hostname;

  const domainKey = Object.keys(domainHandlers).find(domain =>
    hostname.includes(domain)
  );

  if (!domainKey) {
    return {
      title: rawTitle.replace(/\|.*$/, '').replace(/-.*$/, '').trim(),
      thumbnail: null,
      platform: 'Unknown',
    };
  }

  const handler = domainHandlers[domainKey];

  const title =
    handler.cleanTitle.length === 2
      ? handler.cleanTitle($, rawTitle)
      : handler.cleanTitle(rawTitle);

  const thumbnail = handler.extractThumbnail($);
  const platform = handler.platformName;

  return { title, thumbnail, platform };
}

module.exports = {
  getStreamingInfo,
};
