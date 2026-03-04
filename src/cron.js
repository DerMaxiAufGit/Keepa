const cron = require('node-cron');
const axios = require('axios');
const { getDb } = require('./utils/db');
const logger = require('./utils/logger');

function startCronJobs(client) {
  // Every 60 seconds: check expired bans
  cron.schedule('* * * * *', () => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const expired = db.prepare(
      "SELECT * FROM infractions WHERE type = 'ban' AND active = 1 AND expires_at IS NOT NULL AND expires_at <= ?"
    ).all(now);

    for (const inf of expired) {
      const guild = client.guilds.cache.get(inf.guild_id);
      if (!guild) continue;
      guild.members.unban(inf.user_id, 'Temp ban expired').catch(() => {});
      db.prepare('UPDATE infractions SET active = 0 WHERE id = ?').run(inf.id);
      logger.info(`Auto-unbanned ${inf.user_id} in ${inf.guild_id}`);
    }
  });

  // Every 60 seconds: check expired temp roles
  cron.schedule('* * * * *', () => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const expired = db.prepare('SELECT * FROM temp_roles WHERE expires_at <= ?').all(now);

    for (const tr of expired) {
      const guild = client.guilds.cache.get(tr.guild_id);
      if (!guild) continue;
      const member = guild.members.cache.get(tr.user_id);
      if (member) member.roles.remove(tr.role_id).catch(() => {});
      db.prepare('DELETE FROM temp_roles WHERE id = ?').run(tr.id);
      logger.info(`Removed temp role ${tr.role_id} from ${tr.user_id} in ${tr.guild_id}`);
    }
  });

  // Every 10 minutes: update stats channels
  cron.schedule('*/10 * * * *', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM stats_channels').all();

    for (const row of rows) {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;
      const channel = guild.channels.cache.get(row.channel_id);
      if (!channel) {
        db.prepare('DELETE FROM stats_channels WHERE id = ?').run(row.id);
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
  });

  // Every 12 hours: refresh phishing domain list
  const refreshPhishing = async () => {
    const url = process.env.PHISHING_LIST_URL;
    if (!url) return;
    try {
      const { data } = await axios.get(url);
      const domains = Array.isArray(data) ? data : data.domains || [];
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
