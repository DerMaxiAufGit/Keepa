const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');
const { setGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configure goodbye messages')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set goodbye channel and message')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message ({user}, {server}, {membercount})').setRequired(true))),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    setGuildConfig(interaction.guildId, 'goodbye_channel', channel.id);
    setGuildConfig(interaction.guildId, 'goodbye_message', message);
    return interaction.reply({ embeds: [successEmbed('Goodbye Set', `Channel: ${channel}\nMessage: ${message}`)], ephemeral: true });
  },
};
