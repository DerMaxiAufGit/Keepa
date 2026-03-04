const cron = require('node-cron');
const axios = require('axios');
const { query } = require('./utils/db');
const { nowUnixSeconds } = require('./utils/time');
const logger = require('./utils/logger');

function startCronJobs(client) {
  // Every 60 seconds: check expired bans and temp roles
  cron.schedule('* * * * *', async () => {
    const now = nowUnixSeconds();

    // Expired bans
    try {
      const { rows: expiredBans } = await query(
        "SELECT id, guild_id, user_id FROM infractions WHERE type = 'ban' AND active = 1 AND expires_at IS NOT NULL AND expires_at <= $1 LIMIT 1000",
        [now]
      );

      for (const inf of expiredBans) {
        const guild = client.guilds.cache.get(inf.guild_id);
        if (!guild) continue;
        try {
          await guild.members.unban(inf.user_id, 'Temp ban expired');
          await query('UPDATE infractions SET active = 0 WHERE id = $1', [inf.id]);
          logger.info(`Auto-unbanned ${inf.user_id} in ${inf.guild_id}`);
        } catch (err) {
          logger.warn(`Auto-unban failed for ${inf.user_id}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`Expired bans cron error: ${err.message}`);
    }

    // Expired temp roles
    try {
      const { rows: expiredRoles } = await query(
        'SELECT id, guild_id, user_id, role_id FROM temp_roles WHERE expires_at <= $1 LIMIT 1000',
        [now]
      );

      for (const tr of expiredRoles) {
        const guild = client.guilds.cache.get(tr.guild_id);
        if (!guild) continue;
        try {
          const member = guild.members.cache.get(tr.user_id);
          if (member) await member.roles.remove(tr.role_id);
          await query('DELETE FROM temp_roles WHERE id = $1', [tr.id]);
          logger.info(`Removed temp role ${tr.role_id} from ${tr.user_id} in ${tr.guild_id}`);
        } catch (err) {
          logger.warn(`Temp role removal failed for ${tr.user_id}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`Expired temp roles cron error: ${err.message}`);
    }
  });

  // Every 10 minutes: update stats channels
  cron.schedule('*/10 * * * *', async () => {
    try {
      const { rows } = await query('SELECT id, guild_id, channel_id, type, template FROM stats_channels');

      for (const row of rows) {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(row.channel_id);
        if (!channel) {
          await query('DELETE FROM stats_channels WHERE id = $1', [row.id]);
          continue;
        }

        let count = 0;
        if (row.type === 'members') count = guild.memberCount;
        else if (row.type === 'online') count = guild.members.cache.filter(m => m.presence?.status === 'online').size;
        else if (row.type === 'bots') count = guild.members.cache.filter(m => m.user.bot).size;
        else if (row.type === 'channels') count = guild.channels.cache.size;
        else if (row.type === 'roles') count = guild.roles.cache.size;

        const template = row.template || '{type}: {count}';
        const name = template.replace('{type}', row.type.charAt(0).toUpperCase() + row.type.slice(1)).replace('{count}', count.toLocaleString());

        await channel.setName(name).catch(err => {
          if (err.code === 50013) return; // Missing permissions
          logger.debug(`Stats channel update error: ${err.message}`);
        });
      }
    } catch (err) {
      logger.error(`Stats channels cron error: ${err.message}`);
    }
  });

  // Every 12 hours: refresh phishing domain list
  const refreshPhishing = async () => {
    const url = process.env.PHISHING_LIST_URL;
    if (!url) return;
    try {
      const { data } = await axios.get(url);
      const domains = Array.isArray(data) ? data : data.domains || [];
      // Guard against empty response
      if (domains.length === 0) {
        logger.warn('Phishing list response was empty, keeping existing list');
        return;
      }
      client.phishingDomains = new Set(domains.map(d => d.toLowerCase()));
      logger.info(`Loaded ${client.phishingDomains.size} phishing domains`);
    } catch (err) {
      logger.warn(`Failed to fetch phishing list: ${err.message}`);
    }
  };

  // Fetch on startup
  refreshPhishing();
  cron.schedule('0 */12 * * *', refreshPhishing);

  logger.info('Cron jobs started');
}

module.exports = { startCronJobs };
