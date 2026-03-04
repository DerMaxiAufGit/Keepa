const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, query } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const { nowUnixSeconds } = require('../utils/time');
const logger = require('../utils/logger');

function escapeMarkdown(text) {
  return text.replace(/([*_~|\\])/g, '\\$1');
}

module.exports = {
  async execute(member, client) {
    let config;
    try {
      config = await getGuildConfig(member.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config for ${member.guild.id}: ${err.message}`);
      return;
    }

    const now = nowUnixSeconds();

    // 1. Min account age check
    if (config.min_account_age > 0) {
      const accountAge = now - Math.floor(member.user.createdTimestamp / 1000);
      if (accountAge < config.min_account_age) {
        // DM may fail if user has DMs disabled
        try {
          await member.send(`Your account is too new to join **${member.guild.name}**. Please try again later.`);
        } catch {}
        await member.kick('Account too young').catch(err => logger.warn(`Kick failed: ${err.message}`));
        return;
      }
    }

    // 2. Anti-raid check
    if (config.anti_raid_enabled) {
      if (!client.raidTracker.has(member.guild.id)) {
        client.raidTracker.set(member.guild.id, { joins: [] });
      }
      const tracker = client.raidTracker.get(member.guild.id);
      const filtered = tracker.joins.filter(t => now - t < config.anti_raid_window);
      const updatedJoins = [...filtered, now];
      client.raidTracker.set(member.guild.id, { joins: updatedJoins });

      if (updatedJoins.length >= config.anti_raid_threshold) {
        const channels = member.guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(member.guild.roles.everyone).has('SendMessages'));
        for (const [, ch] of channels) {
          await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false, Connect: false })
            .catch(err => logger.warn(`Raid lockdown perm edit failed: ${err.message}`));
        }

        if (config.mod_log_channel) {
          const logCh = member.guild.channels.cache.get(config.mod_log_channel);
          if (logCh) {
            logCh.send({
              embeds: [new EmbedBuilder()
                .setColor(Colors.ERROR)
                .setTitle('Anti-Raid Triggered')
                .setDescription(`**${updatedJoins.length}** joins in ${config.anti_raid_window}s. All channels locked. Auto-unlock in 10 minutes.`)
                .setTimestamp().setFooter({ text: 'Keepa' })],
            }).catch(err => logger.warn(`Log send failed: ${err.message}`));
          }
        }

        // Auto-unlock after 10 minutes
        setTimeout(async () => {
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null, Connect: null })
              .catch(err => logger.warn(`Raid unlock perm edit failed: ${err.message}`));
          }
        }, 600000);

        client.raidTracker.set(member.guild.id, { joins: [] });
      }
    }

    // 3. Autoroles
    let autoRoles = [];
    try {
      autoRoles = JSON.parse(config.auto_roles || '[]');
    } catch {
      autoRoles = [];
    }
    for (const roleId of autoRoles) {
      const role = member.guild.roles.cache.get(roleId);
      if (role) await member.roles.add(role).catch(err => logger.warn(`Autorole add failed: ${err.message}`));
    }

    // 4. Welcome message
    if (config.welcome_enabled && config.welcome_channel && config.welcome_message) {
      const channel = member.guild.channels.cache.get(config.welcome_channel);
      if (channel) {
        const safeUsername = escapeMarkdown(member.user.username);
        const text = config.welcome_message
          .replace(/{user}/g, safeUsername)
          .replace(/{user\.mention}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name)
          .replace(/{membercount}/g, member.guild.memberCount);

        if (config.welcome_embed) {
          channel.send({ embeds: [new EmbedBuilder().setColor(Colors.SUCCESS).setDescription(text).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: 'Keepa' })] })
            .catch(err => logger.warn(`Welcome send failed: ${err.message}`));
        } else {
          channel.send(text).catch(err => logger.warn(`Welcome send failed: ${err.message}`));
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
        logCh.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
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
        await query(
          'INSERT INTO invite_tracking (guild_id, inviter_id, invitee_id, invite_code) VALUES ($1, $2, $3, $4)',
          [member.guild.id, usedInvite.inviter.id, member.id, usedInvite.code]
        );
      }
    } catch (err) {
      logger.debug(`Invite tracking error for ${member.guild.name}: ${err.message}`);
    }
  },
};
