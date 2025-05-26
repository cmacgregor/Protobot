const { extractTelepartyTitle } = require('./telepartyUrlResolver');

module.exports = {
    'netflix.com': {
        cleanTitle: ($, rawTitle) =>
          rawTitle.replace(/^Watch\s+/, '').replace(/\s*\|.*/, '').trim(),
    
        extractThumbnail: $ =>
          $('meta[property="og:image"]').attr('content') || null,
    
        platformName: 'Netflix'
      },

    'teleparty.com': {
        cleanTitle: url => extractTelepartyTitle(url),
        extractThumbnail: $ => $('meta[property="og:image"]').attr('content') || 'https://www.teleparty.com/images/tp-logo-red.png',
        platformName: 'Teleparty',
        footerNote: 'Content inferred from URL slug. Thumbnail provided by the linked media.'
    }

};
