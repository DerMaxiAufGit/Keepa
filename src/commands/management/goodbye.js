const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, Colors } = require('../../utils/embeds');
const { getGuildConfig, setGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configure goodbye messages')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set goodbye channel and message')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message ({user}, {server}, {membercount})').setRequired(true).setMaxLength(1800)))
    .addSubcommand(s => s.setName('toggle').setDescription('Enable/disable goodbye messages'))
    .addSubcommand(s => s.setName('test').setDescription('Send a test goodbye message')),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      await setGuildConfig(interaction.guildId, 'goodbye_channel', channel.id);
      await setGuildConfig(interaction.guildId, 'goodbye_message', message);
      return interaction.reply({ embeds: [successEmbed('Goodbye Set', `Channel: ${channel}\nMessage: ${message}`)], ephemeral: true });
    }

    if (sub === 'toggle') {
      const config = await getGuildConfig(interaction.guildId);
      const newVal = config.goodbye_enabled ? 0 : 1;
      await setGuildConfig(interaction.guildId, 'goodbye_enabled', newVal);
      return interaction.reply({ embeds: [successEmbed('Goodbye Toggled', `Goodbye messages are now **${newVal ? 'enabled' : 'disabled'}**.`)], ephemeral: true });
    }

    if (sub === 'test') {
      const config = await getGuildConfig(interaction.guildId);
      if (!config.goodbye_channel || !config.goodbye_message) {
        return interaction.reply({ content: 'Goodbye not configured. Use `/goodbye set` first.', ephemeral: true });
      }

      const channel = interaction.guild.channels.cache.get(config.goodbye_channel);
      if (!channel) return interaction.reply({ content: 'Goodbye channel not found.', ephemeral: true });

      const text = config.goodbye_message
        .replace(/{user}/g, interaction.user.username)
        .replace(/{server}/g, interaction.guild.name)
        .replace(/{membercount}/g, interaction.guild.memberCount);

      await channel.send(text);
      return interaction.reply({ content: 'Test goodbye sent!', ephemeral: true });
    }
  },
};
