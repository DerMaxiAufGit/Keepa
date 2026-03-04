const { query, getGuildConfig } = require('../utils/db');
const { modLogEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

const VALID_ACTIONS = new Set(['delete', 'warn', 'mute', 'kick', 'ban']);

// Per-guild in-memory cache with 60s TTL
const automodCache = new Map();
const CACHE_TTL = 60000;

function getCachedData(guildId, key) {
  const guildCache = automodCache.get(guildId);
  if (!guildCache) return null;
  const entry = guildCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    guildCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedData(guildId, key, data) {
  if (!automodCache.has(guildId)) automodCache.set(guildId, new Map());
  automodCache.get(guildId).set(key, { data, timestamp: Date.now() });
}

async function isWhitelisted(message) {
  const guildId = message.guild.id;
  let rows = getCachedData(guildId, 'whitelist');
  if (!rows) {
    const result = await query(
      'SELECT target_id, type FROM automod_whitelist WHERE guild_id = $1',
      [guildId]
    );
    rows = result.rows;
    setCachedData(guildId, 'whitelist', rows);
  }

  for (const entry of rows) {
    if (entry.type === 'channel' && entry.target_id === message.channel.id) return true;
    if (entry.type === 'role' && message.member?.roles.cache.has(entry.target_id)) return true;
  }

  return false;
}

async function runAutomod(message, client) {
  if (!message.guild || message.author.bot) return false;
  if (message.member?.permissions.has('ManageMessages')) return false;
  if (await isWhitelisted(message)) return false;

  const config = await getGuildConfig(message.guild.id);
  const guildId = message.guild.id;

  // 1. Word filter
  let words = getCachedData(guildId, 'filter_words');
  if (!words) {
    const result = await query('SELECT word, action FROM filter_words WHERE guild_id = $1', [guildId]);
    words = result.rows;
    setCachedData(guildId, 'filter_words', words);
  }
  for (const entry of words) {
    if (message.content.toLowerCase().includes(entry.word.toLowerCase())) {
      const action = VALID_ACTIONS.has(entry.action) ? entry.action : 'delete';
      if (action !== entry.action) logger.warn(`Unknown filter action "${entry.action}" for word "${entry.word}", defaulting to delete`);
      return await executeAction(message, action, `Filtered word: ${entry.word}`, config, client);
    }
  }

  // 2. Link filter
  const urlRegex = /https?:\/\/([^\s/]+)/gi;
  const urls = [...message.content.matchAll(urlRegex)];
  if (urls.length > 0) {
    let blacklisted = getCachedData(guildId, 'filter_links_black');
    let whitelisted = getCachedData(guildId, 'filter_links_white');
    if (!blacklisted) {
      const result = await query("SELECT domain FROM filter_links WHERE guild_id = $1 AND mode = 'blacklist'", [guildId]);
      blacklisted = result.rows;
      setCachedData(guildId, 'filter_links_black', blacklisted);
    }
    if (!whitelisted) {
      const result = await query("SELECT domain FROM filter_links WHERE guild_id = $1 AND mode = 'whitelist'", [guildId]);
      whitelisted = result.rows;
      setCachedData(guildId, 'filter_links_white', whitelisted);
    }
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
    const timestamps = client.spamTracker.get(key) || [];
    const now = Date.now();
    const recent = [...timestamps, now].filter(t => now - t < 3000);
    client.spamTracker.set(key, recent);

    if (recent.length >= (config.spam_threshold || 5)) {
      client.spamTracker.set(key, []);
      try { await message.member.timeout(300000, 'Spam detected'); } catch (err) { logger.warn(`Spam mute failed: ${err.message}`); }
      await message.delete().catch(err => logger.warn(`Message delete failed: ${err.message}`));
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
  if (!VALID_ACTIONS.has(action)) {
    logger.warn(`Unknown automod action "${action}", defaulting to delete`);
    action = 'delete';
  }

  try {
    await message.delete();
  } catch (err) {
    logger.warn(`Automod message delete failed: ${err.message}`);
  }

  if (action === 'warn') {
    await query(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES ($1, $2, $3, $4, $5)',
      [message.guild.id, message.author.id, client.user.id, 'warn', `[AutoMod] ${reason}`]
    );
    // DM may fail if user has DMs disabled
    try { await message.author.send(`You were warned in **${message.guild.name}**: ${reason}`); } catch {}
  } else if (action === 'mute') {
    try { await message.member.timeout(300000, `[AutoMod] ${reason}`); } catch (err) { logger.warn(`Automod mute failed: ${err.message}`); }
  } else if (action === 'kick') {
    try { await message.member.kick(`[AutoMod] ${reason}`); } catch (err) { logger.warn(`Automod kick failed: ${err.message}`); }
  } else if (action === 'ban') {
    try { await message.member.ban({ reason: `[AutoMod] ${reason}` }); } catch (err) { logger.warn(`Automod ban failed: ${err.message}`); }
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
  }).catch(err => logger.warn(`Log send failed: ${err.message}`));
}

module.exports = { runAutomod };
