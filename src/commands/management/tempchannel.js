const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

function getUserTempChannel(interaction) {
  const db = getDb();
  return db.prepare('SELECT * FROM temp_channels WHERE guild_id = ? AND owner_id = ?')
    .get(interaction.guildId, interaction.user.id);
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
    const db = getDb();

    if (sub === 'setup') {
      if (!interaction.memberPermissions.has('ManageChannels')) {
        return interaction.reply({ embeds: [errorEmbed('Missing Permissions', 'You need `ManageChannels`.')], ephemeral: true });
      }
      const channel = interaction.options.getChannel('channel');
      try {
        db.prepare('INSERT OR REPLACE INTO temp_channel_hubs (channel_id, guild_id, category_id) VALUES (?, ?, ?)')
          .run(channel.id, interaction.guildId, channel.parentId);
        return interaction.reply({ embeds: [successEmbed('Hub Set', `${channel} is now a temp channel hub.`)], ephemeral: true });
      } catch (err) {
        return interaction.reply({ embeds: [errorEmbed('Error', err.message)], ephemeral: true });
      }
    }

    // All other subcommands require owning a temp channel
    const temp = getUserTempChannel(interaction);
    if (!temp) return interaction.reply({ embeds: [errorEmbed('No Channel', 'You don\'t own a temp channel.')], ephemeral: true });

    const channel = interaction.guild.channels.cache.get(temp.channel_id);
    if (!channel) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Your temp channel no longer exists.')], ephemeral: true });

    if (sub === 'name') {
      const name = interaction.options.getString('name');
      await channel.setName(name);
      return interaction.reply({ embeds: [successEmbed('Renamed', `Channel renamed to **${name}**.`)], ephemeral: true });
    }

    if (sub === 'limit') {
      const limit = interaction.options.getInteger('number');
      await channel.setUserLimit(limit);
      return interaction.reply({ embeds: [successEmbed('Limit Set', limit === 0 ? 'Limit removed.' : `Limit set to **${limit}**.`)], ephemeral: true });
    }

    if (sub === 'lock') {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
      return interaction.reply({ embeds: [successEmbed('Locked', 'Your channel is now locked.')], ephemeral: true });
    }

    if (sub === 'unlock') {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null });
      return interaction.reply({ embeds: [successEmbed('Unlocked', 'Your channel is now unlocked.')], ephemeral: true });
    }

    if (sub === 'permit') {
      const user = interaction.options.getUser('user');
      await channel.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true });
      return interaction.reply({ embeds: [successEmbed('Permitted', `${user} can now join.`)], ephemeral: true });
    }

    if (sub === 'reject') {
      const user = interaction.options.getUser('user');
      await channel.permissionOverwrites.edit(user.id, { Connect: false });
      // Disconnect if in channel
      const member = interaction.guild.members.cache.get(user.id);
      if (member?.voice?.channelId === channel.id) {
        await member.voice.disconnect().catch(() => {});
      }
      return interaction.reply({ embeds: [successEmbed('Rejected', `${user} can no longer join.`)], ephemeral: true });
    }
  },
};
