function extractTelepartyTitle(url) {
    const match = url.match(/\/(?:tv|movie)\/\d+\/([\w-]+)/);
    if (!match) return 'Join the Watch Party!';
    const slug = match[1];
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  module.exports = {
    extractTelepartyTitle,
  };
  