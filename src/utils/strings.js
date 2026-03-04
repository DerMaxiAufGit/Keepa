function escapeMarkdown(text) {
  return text.replace(/([*_~|\\])/g, '\\$1');
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

module.exports = { escapeMarkdown, truncate };
