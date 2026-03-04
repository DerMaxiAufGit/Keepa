const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { setGuildConfig, query } = require('../../utils/db');
const { invalidateAutomodCache } = require('../../handlers/automodHandler');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automod features')
    .addSubcommand(s => s.setName('invites').setDescription('Toggle invite filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })))
    .addSubcommand(s => s.setName('phishing').setDescription('Toggle phishing filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })))
    .addSubcommand(s => s.setName('spam').setDescription('Toggle spam detection')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Messages per 3 seconds').setMinValue(2).setMaxValue(100)))
    .addSubcommand(s => s.setName('mentions').setDescription('Toggle mention spam')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Max mentions per message').setMinValue(2).setMaxValue(100)))
    .addSubcommand(s => s.setName('caps').setDescription('Toggle caps filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Caps percentage (0-100)').setMinValue(2).setMaxValue(100)))
    .addSubcommand(s => s.setName('whitelist-add').setDescription('Whitelist a channel or role from automod')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to whitelist'))
      .addRoleOption(o => o.setName('role').setDescription('Role to whitelist')))
    .addSubcommand(s => s.setName('whitelist-remove').setDescription('Remove a channel or role from the whitelist')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to remove'))
      .addRoleOption(o => o.setName('role').setDescription('Role to remove')))
    .addSubcommand(s => s.setName('whitelist-list').setDescription('List all whitelisted channels and roles')),
  permissions: ['ManageGuild'],
  botPermissions: ['ManageMessages'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'whitelist-add') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      if (!channel && !role) {
        return interaction.reply({ embeds: [errorEmbed('Missing Option', 'Provide a channel or role to whitelist.')], ephemeral: true });
      }

      const added = [];
      if (channel) {
        try {
          await query('INSERT INTO automod_whitelist (guild_id, type, target_id) VALUES ($1, $2, $3)', [interaction.guildId, 'channel', channel.id]);
          added.push(`${channel}`);
        } catch (err) {
          if (err.code === '23505') {
            added.push(`${channel} (already whitelisted)`);
          } else {
            logger.error(`Whitelist insert error: ${err.message}`);
            added.push(`${channel} (error — could not add)`);
          }
        }
      }
      if (role) {
        try {
          await query('INSERT INTO automod_whitelist (guild_id, type, target_id) VALUES ($1, $2, $3)', [interaction.guildId, 'role', role.id]);
          added.push(`${role}`);
        } catch (err) {
          if (err.code === '23505') {
            added.push(`${role} (already whitelisted)`);
          } else {
            logger.error(`Whitelist insert error: ${err.message}`);
            added.push(`${role} (error — could not add)`);
          }
        }
      }

      invalidateAutomodCache(interaction.guildId, 'whitelist');
      return interaction.reply({ embeds: [successEmbed('Whitelist Updated', added.join('\n'))], ephemeral: true });
    }

    if (sub === 'whitelist-remove') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      if (!channel && !role) {
        return interaction.reply({ embeds: [errorEmbed('Missing Option', 'Provide a channel or role to remove.')], ephemeral: true });
      }

      const removed = [];
      if (channel) {
        const result = await query('DELETE FROM automod_whitelist WHERE guild_id = $1 AND type = $2 AND target_id = $3', [interaction.guildId, 'channel', channel.id]);
        removed.push(result.rowCount > 0 ? `${channel} removed` : `${channel} was not whitelisted`);
      }
      if (role) {
        const result = await query('DELETE FROM automod_whitelist WHERE guild_id = $1 AND type = $2 AND target_id = $3', [interaction.guildId, 'role', role.id]);
        removed.push(result.rowCount > 0 ? `${role} removed` : `${role} was not whitelisted`);
      }

      invalidateAutomodCache(interaction.guildId, 'whitelist');
      return interaction.reply({ embeds: [successEmbed('Whitelist Updated', removed.join('\n'))], ephemeral: true });
    }

    if (sub === 'whitelist-list') {
      const { rows } = await query('SELECT type, target_id FROM automod_whitelist WHERE guild_id = $1', [interaction.guildId]);

      if (rows.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('Empty Whitelist', 'No channels or roles are whitelisted.')], ephemeral: true });
      }

      const lines = rows.map(r => {
        if (r.type === 'channel') return `Channel: <#${r.target_id}>`;
        return `Role: <@&${r.target_id}>`;
      });

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('AutoMod Whitelist').setDescription(lines.join('\n')).setFooter({ text: 'Keepa' })],
        ephemeral: true,
      });
    }

    // Toggle subcommands — "enable"/"disable" maps to 1/0 (integer boolean convention)
    const toggle = interaction.options.getString('toggle');
    const enabled = toggle === 'enable' ? 1 : 0;

    const map = {
      invites: { key: 'invite_filter' },
      phishing: { key: 'phishing_filter' },
      spam: { key: 'spam_enabled', thresholdKey: 'spam_threshold' },
      mentions: { key: 'mention_enabled', thresholdKey: 'mention_threshold' },
      caps: { key: 'caps_enabled', thresholdKey: 'caps_threshold' },
    };

    const entry = map[sub];
    if (!entry) return interaction.reply({ embeds: [errorEmbed('Error', 'Unknown automod setting.')], ephemeral: true });

    await setGuildConfig(interaction.guildId, entry.key, enabled);
    invalidateAutomodCache(interaction.guildId);

    const threshold = interaction.options.getInteger('threshold');
    let extra = '';
    if (threshold && entry.thresholdKey) {
      await setGuildConfig(interaction.guildId, entry.thresholdKey, threshold);
      extra = ` Threshold: ${threshold}`;
    }

    await interaction.reply({
      embeds: [successEmbed('AutoMod Updated', `**${sub}** filter **${toggle}d**.${extra}`)],
      ephemeral: true,
    });
  },
};
