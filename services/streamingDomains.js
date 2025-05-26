module.exports = {
    'netflix.com': {
      cleanTitle: rawTitle =>
        rawTitle.replace(/^Watch\s+/, '').replace(/\s*\|.*$/, '').trim(),
  
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
  
      platformName: 'Netflix',
    },
  
    'disneyplus.com': {
      cleanTitle: rawTitle =>
        rawTitle.replace(/\s*\|.*$/, '').trim(),
  
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
  
      platformName: 'Disney+',
    },
  
    'hulu.com': {
      cleanTitle: rawTitle =>
        rawTitle.replace(/^Watch\s+/, '').replace(/\s*\|.*$/, '').trim(),
  
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
  
      platformName: 'Hulu',
    },
  
    //havent tried
    'crunchyroll.com': {
      cleanTitle: rawTitle =>
        rawTitle.replace(/\s*-\s*Watch on.*$/, '').trim(),
  
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
  
      platformName: 'Crunchyroll',
    },
  
    //doesn't work because amazon uses amazon.com to serve prime videos now
    'primevideo.com': { 
      cleanTitle: rawTitle =>
        rawTitle.replace(/\s*-\s*Amazon.*$/, '').trim(),
  
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
  
      platformName: 'Prime Video',
    },
  
    //doesn't display content name
    'teleparty.com': {
      cleanTitle: _ => 'Teleparty Session',
      extractThumbnail: _ => null,
      platformName: 'Teleparty',
    },
  
    'animekai.to': {
      cleanTitle: ($, rawTitle) => {
        const header = $('h1, h2').first().text().trim();
        return header || rawTitle;
      },
      extractThumbnail: $ =>
        $('meta[property="og:image"]').attr('content') || null,
      platformName: 'animeKai',
    },
  };
  