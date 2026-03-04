const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getDb } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(member, client) {
    const config = getGuildConfig(member.guild.id);
    const now = Math.floor(Date.now() / 1000);

    // 1. Min account age check
    if (config.min_account_age > 0) {
      const accountAge = now - Math.floor(member.user.createdTimestamp / 1000);
      if (accountAge < config.min_account_age) {
        try {
          await member.send(`Your account is too new to join **${member.guild.name}**. Please try again later.`);
        } catch {}
        await member.kick('Account too young').catch(() => {});
        return;
      }
    }

    // 2. Anti-raid check
    if (config.anti_raid_enabled) {
      if (!client.raidTracker.has(member.guild.id)) {
        client.raidTracker.set(member.guild.id, { joins: [] });
      }
      const tracker = client.raidTracker.get(member.guild.id);
      tracker.joins.push(now);
      // Clean old entries
      tracker.joins = tracker.joins.filter(t => now - t < config.anti_raid_window);

      if (tracker.joins.length >= config.anti_raid_threshold) {
        // Lockdown
        const channels = member.guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(member.guild.roles.everyone).has('SendMessages'));
        for (const [, ch] of channels) {
          await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false, Connect: false }).catch(() => {});
        }

        if (config.mod_log_channel) {
          const logCh = member.guild.channels.cache.get(config.mod_log_channel);
          if (logCh) {
            const recentJoins = tracker.joins.length;
            logCh.send({
              embeds: [new EmbedBuilder()
                .setColor(Colors.ERROR)
                .setTitle('Anti-Raid Triggered')
                .setDescription(`**${recentJoins}** joins in ${config.anti_raid_window}s. All channels locked. Auto-unlock in 10 minutes.`)
                .setTimestamp().setFooter({ text: 'Keepa' })],
            }).catch(() => {});
          }
        }

        // Auto-unlock after 10 minutes
        setTimeout(async () => {
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null, Connect: null }).catch(() => {});
          }
        }, 600000);

        tracker.joins = [];
      }
    }

    // 3. Autoroles
    const autoRoles = JSON.parse(config.auto_roles || '[]');
    for (const roleId of autoRoles) {
      const role = member.guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(() => {});
    }

    // 4. Welcome message
    if (config.welcome_enabled && config.welcome_channel && config.welcome_message) {
      const channel = member.guild.channels.cache.get(config.welcome_channel);
      if (channel) {
        const text = config.welcome_message
          .replace(/{user}/g, member.user.username)
          .replace(/{user\.mention}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name)
          .replace(/{membercount}/g, member.guild.memberCount);

        if (config.welcome_embed) {
          channel.send({ embeds: [new EmbedBuilder().setColor(Colors.SUCCESS).setDescription(text).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: 'Keepa' })] }).catch(() => {});
        } else {
          channel.send(text).catch(() => {});
        }
      }
    }

    // 5. Member log
    if (config.member_log_channel) {
      const logCh = member.guild.channels.cache.get(config.member_log_channel);
      if (logCh) {
        const embed = new EmbedBuilder()
          .setColor(Colors.SUCCESS)
          .setTitle('Member Joined')
          .addFields(
            { name: 'User', value: `${member.user.tag || member.user.username} (${member.id})` },
            { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp().setFooter({ text: `Members: ${member.guild.memberCount} | Keepa` });
        logCh.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // 6. Invite tracking
    try {
      const newInvites = await member.guild.invites.fetch();
      const oldInvites = client.inviteCache.get(member.guild.id) || new Map();

      const usedInvite = newInvites.find(inv => {
        const oldUses = oldInvites.get(inv.code) || 0;
        return inv.uses > oldUses;
      });

      // Update cache
      const cacheMap = new Map();
      newInvites.forEach(inv => cacheMap.set(inv.code, inv.uses));
      client.inviteCache.set(member.guild.id, cacheMap);

      if (usedInvite && usedInvite.inviter) {
        const db = getDb();
        db.prepare(
          'INSERT INTO invite_tracking (guild_id, inviter_id, invitee_id, invite_code) VALUES (?, ?, ?, ?)'
        ).run(member.guild.id, usedInvite.inviter.id, member.id, usedInvite.code);
      }
    } catch (err) {
      logger.debug(`Invite tracking error for ${member.guild.name}: ${err.message}`);
    }
  },
};
