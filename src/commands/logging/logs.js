const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { getGuildConfig, setGuildConfig } = require('../../utils/db');

const LOG_TYPES = {
  mod: 'mod_log_channel',
  member: 'member_log_channel',
  message: 'message_log_channel',
  voice: 'voice_log_channel',
  server: 'server_log_channel',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure logging channels')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a log channel')
      .addStringOption(o => o.setName('type').setDescription('Log type').setRequired(true)
        .addChoices(
          { name: 'Mod', value: 'mod' },
          { name: 'Member', value: 'member' },
          { name: 'Message', value: 'message' },
          { name: 'Voice', value: 'voice' },
          { name: 'Server', value: 'server' }
        ))
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s => s
      .setName('disable')
      .setDescription('Disable a log type')
      .addStringOption(o => o.setName('type').setDescription('Log type').setRequired(true)
        .addChoices(
          { name: 'Mod', value: 'mod' },
          { name: 'Member', value: 'member' },
          { name: 'Message', value: 'message' },
          { name: 'Voice', value: 'voice' },
          { name: 'Server', value: 'server' }
        )))
    .addSubcommand(s => s.setName('list').setDescription('Show all log channels')),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuildConfig(interaction.guildId);

    if (sub === 'set') {
      const type = interaction.options.getString('type');
      const channel = interaction.options.getChannel('channel');
      setGuildConfig(interaction.guildId, LOG_TYPES[type], channel.id);
      return interaction.reply({ embeds: [successEmbed('Log Channel Set', `**${type}** logs → ${channel}`)], ephemeral: true });
    }

    if (sub === 'disable') {
      const type = interaction.options.getString('type');
      setGuildConfig(interaction.guildId, LOG_TYPES[type], null);
      return interaction.reply({ embeds: [successEmbed('Logging Disabled', `**${type}** logging disabled.`)], ephemeral: true });
    }

    if (sub === 'list') {
      const lines = Object.entries(LOG_TYPES).map(([name, key]) => {
        const id = config[key];
        return `**${name}**: ${id ? `<#${id}>` : 'Not set'}`;
      });

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Log Channels').setDescription(lines.join('\n')).setFooter({ text: 'Keepa' })],
        ephemeral: true,
      });
    }
  },
};
