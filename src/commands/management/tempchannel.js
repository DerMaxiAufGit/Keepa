const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const logger = require('../../utils/logger');

async function getUserTempChannel(interaction) {
  const { rows } = await query(
    'SELECT channel_id, guild_id, owner_id, parent_id, control_message_id FROM temp_channels WHERE guild_id = $1 AND owner_id = $2',
    [interaction.guildId, interaction.user.id]
  );
  return rows[0];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempchannel')
    .setDescription('Temp voice channel controls')
    .addSubcommand(s => s.setName('setup').setDescription('Set a hub channel')
      .addChannelOption(o => o.setName('channel').setDescription('Voice channel hub').setRequired(true).addChannelTypes(ChannelType.GuildVoice)))
    .addSubcommand(s => s.setName('name').setDescription('Rename your temp channel')
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand(s => s.setName('limit').setDescription('Set user limit')
      .addIntegerOption(o => o.setName('number').setDescription('Limit (0=unlimited)').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock your temp channel'))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock your temp channel'))
    .addSubcommand(s => s.setName('permit').setDescription('Allow a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('reject').setDescription('Deny a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))),
  permissions: [],
  botPermissions: ['ManageChannels', 'MoveMembers'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      if (!interaction.memberPermissions.has('ManageChannels')) {
        return interaction.reply({ embeds: [errorEmbed('Missing Permissions', 'You need `ManageChannels`.')], ephemeral: true });
      }
      const channel = interaction.options.getChannel('channel');
      try {
        await query(
          'INSERT INTO temp_channel_hubs (channel_id, guild_id, category_id) VALUES ($1, $2, $3) ON CONFLICT (channel_id) DO UPDATE SET guild_id = $2, category_id = $3',
          [channel.id, interaction.guildId, channel.parentId]
        );
        return interaction.reply({ embeds: [successEmbed('Hub Set', `${channel} is now a temp channel hub.`)], ephemeral: true });
      } catch (err) {
        logger.error(`Tempchannel setup error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not set up the hub channel.')], ephemeral: true });
      }
    }

    // All other subcommands require owning a temp channel
    const temp = await getUserTempChannel(interaction);
    if (!temp) return interaction.reply({ embeds: [errorEmbed('No Channel', 'You don\'t own a temp channel.')], ephemeral: true });

    const channel = interaction.guild.channels.cache.get(temp.channel_id);
    if (!channel) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Your temp channel no longer exists.')], ephemeral: true });

    if (sub === 'name') {
      const rawName = interaction.options.getString('name');
      const name = rawName.replace(/[\x00-\x1F\x7F]/g, '').trim();
      if (!name || name.length > 100) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Name', 'Channel name must be 1-100 characters.')], ephemeral: true });
      }
      try {
        await channel.setName(name);
      } catch (err) {
        logger.error(`Temp channel rename error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not rename the channel.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Renamed', `Channel renamed to **${name}**.`)], ephemeral: true });
    }

    if (sub === 'limit') {
      const limit = interaction.options.getInteger('number');
      try {
        await channel.setUserLimit(limit);
      } catch (err) {
        logger.error(`Temp channel limit error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not set the user limit.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Limit Set', limit === 0 ? 'Limit removed.' : `Limit set to **${limit}**.`)], ephemeral: true });
    }

    if (sub === 'lock') {
      try {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
      } catch (err) {
        logger.error(`Temp channel lock error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not lock the channel.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Locked', 'Your channel is now locked.')], ephemeral: true });
    }

    if (sub === 'unlock') {
      try {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null });
      } catch (err) {
        logger.error(`Temp channel unlock error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not unlock the channel.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Unlocked', 'Your channel is now unlocked.')], ephemeral: true });
    }

    if (sub === 'permit') {
      const user = interaction.options.getUser('user');
      try {
        await channel.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true });
      } catch (err) {
        logger.error(`Temp channel permit error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not update permissions.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Permitted', `${user} can now join.`)], ephemeral: true });
    }

    if (sub === 'reject') {
      const user = interaction.options.getUser('user');
      try {
        await channel.permissionOverwrites.edit(user.id, { Connect: false });
      } catch (err) {
        logger.error(`Temp channel reject error: ${err.stack}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not update permissions.')], ephemeral: true });
      }
      // Disconnect if in channel
      const member = interaction.guild.members.cache.get(user.id);
      if (member?.voice?.channelId === channel.id) {
        await member.voice.disconnect().catch(err => logger.warn(`Disconnect failed: ${err.message}`));
      }
      return interaction.reply({ embeds: [successEmbed('Rejected', `${user} can no longer join.`)], ephemeral: true });
    }
  },
};
