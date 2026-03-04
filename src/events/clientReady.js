const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  once: true,
  async execute(client) {
    logger.info(`Keepa is online as ${client.user.tag} — ${client.guilds.cache.size} guilds`);

    const status = process.env.BOT_STATUS || 'online';
    const activity = process.env.BOT_ACTIVITY || 'Keeping the server safe';
    client.user.setPresence({
      status,
      activities: [{ name: activity, type: ActivityType.Watching }],
    });

    // Cache invites for all guilds
    for (const [, guild] of client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        const cacheMap = new Map();
        invites.forEach(inv => cacheMap.set(inv.code, inv.uses));
        client.inviteCache.set(guild.id, cacheMap);
      } catch (err) {
        logger.warn(`Could not cache invites for ${guild.name}: ${err.message}`);
      }
    }
  },
};
