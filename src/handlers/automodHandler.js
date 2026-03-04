const { getDb, getGuildConfig } = require('../utils/db');
const { warnEmbed, modLogEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

async function runAutomod(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has('ManageMessages')) return false;

  const config = getGuildConfig(message.guild.id);
  const db = getDb();

  // 1. Word filter
  const words = db.prepare('SELECT * FROM filter_words WHERE guild_id = ?').all(message.guild.id);
  for (const entry of words) {
    if (message.content.toLowerCase().includes(entry.word.toLowerCase())) {
      return await executeAction(message, entry.action, `Filtered word: ${entry.word}`, config, client);
    }
  }

  // 2. Link filter
  const urlRegex = /https?:\/\/([^\s/]+)/gi;
  const urls = [...message.content.matchAll(urlRegex)];
  if (urls.length > 0) {
    const blacklisted = db.prepare("SELECT domain FROM filter_links WHERE guild_id = ? AND mode = 'blacklist'").all(message.guild.id);
    const whitelisted = db.prepare("SELECT domain FROM filter_links WHERE guild_id = ? AND mode = 'whitelist'").all(message.guild.id);
    const blackSet = new Set(blacklisted.map(r => r.domain.toLowerCase()));
    const whiteSet = new Set(whitelisted.map(r => r.domain.toLowerCase()));

    for (const match of urls) {
      const domain = match[1].toLowerCase();
      if (blackSet.has(domain)) {
        return await executeAction(message, 'delete', `Blacklisted link: ${domain}`, config, client);
      }
      if (whiteSet.size > 0 && !whiteSet.has(domain)) {
        return await executeAction(message, 'delete', `Link not whitelisted: ${domain}`, config, client);
      }
    }
  }

  // 3. Invite filter
  if (config.invite_filter) {
    const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/\S+/i;
    if (inviteRegex.test(message.content)) {
      return await executeAction(message, config.invite_filter_action || 'delete', 'Discord invite link', config, client);
    }
  }

  // 4. Phishing filter
  if (config.phishing_filter && urls.length > 0) {
    for (const match of urls) {
      const domain = match[1].toLowerCase();
      if (client.phishingDomains.has(domain)) {
        return await executeAction(message, 'delete', `Phishing link: ${domain}`, config, client);
      }
    }
  }

  // 5. Spam detection
  if (config.spam_enabled) {
    const key = `${message.guild.id}:${message.author.id}`;
    if (!client.spamTracker.has(key)) client.spamTracker.set(key, []);
    const timestamps = client.spamTracker.get(key);
    const now = Date.now();
    timestamps.push(now);

    // Clean entries older than 3 seconds
    const recent = timestamps.filter(t => now - t < 3000);
    client.spamTracker.set(key, recent);

    if (recent.length >= (config.spam_threshold || 5)) {
      client.spamTracker.set(key, []);
      try { await message.member.timeout(300000, 'Spam detected'); } catch {}
      await message.delete().catch(() => {});
      logAutomod(message, 'Spam detected — auto-muted 5 minutes', config, client);
      return true;
    }
  }

  // 6. Mention spam
  if (config.mention_enabled) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount >= (config.mention_threshold || 5)) {
      return await executeAction(message, 'delete', `Mass mentions (${mentionCount})`, config, client);
    }
  }

  // 7. Caps filter
  if (config.caps_enabled && message.content.length >= 10) {
    const upper = message.content.replace(/[^a-zA-Z]/g, '').split('').filter(c => c === c.toUpperCase()).length;
    const total = message.content.replace(/[^a-zA-Z]/g, '').length;
    if (total > 0 && (upper / total) * 100 >= (config.caps_threshold || 70)) {
      return await executeAction(message, 'delete', 'Excessive caps', config, client);
    }
  }

  return false;
}

async function executeAction(message, action, reason, config, client) {
  try {
    await message.delete();
  } catch {}

  if (action === 'warn') {
    const db = getDb();
    db.prepare(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(message.guild.id, message.author.id, client.user.id, 'warn', `[AutoMod] ${reason}`);
    try { await message.author.send(`You were warned in **${message.guild.name}**: ${reason}`); } catch {}
  } else if (action === 'mute') {
    try { await message.member.timeout(300000, `[AutoMod] ${reason}`); } catch {}
  } else if (action === 'kick') {
    try { await message.member.kick(`[AutoMod] ${reason}`); } catch {}
  } else if (action === 'ban') {
    try { await message.member.ban({ reason: `[AutoMod] ${reason}` }); } catch {}
  }

  logAutomod(message, reason, config, client);
  return true;
}

function logAutomod(message, reason, config, client) {
  if (!config.mod_log_channel) return;
  const channel = message.guild.channels.cache.get(config.mod_log_channel);
  if (!channel) return;
  channel.send({
    embeds: [modLogEmbed('AutoMod', message.author, client.user, reason, null, '-')],
  }).catch(() => {});
}

module.exports = { runAutomod };
