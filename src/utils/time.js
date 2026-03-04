const units = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

function parseDuration(str) {
  if (!str) return null;
  if (str.toLowerCase() === 'perm' || str.toLowerCase() === 'permanent') return null;

  const match = str.match(/^(\d+)\s*([smhdw])$/i);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return amount * (units[unit] || 0);
}

function formatDuration(seconds) {
  if (!seconds) return 'Permanent';
  const parts = [];
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

module.exports = { parseDuration, formatDuration };
