const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set channel slowmode')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    .addIntegerOption(o => o.setName('seconds').setDescription('Slowmode seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const seconds = interaction.options.getInteger('seconds');
    await channel.setRateLimitPerUser(seconds);
    await interaction.reply({ embeds: [successEmbed('Slowmode Updated', seconds === 0 ? `Slowmode disabled in ${channel}.` : `Slowmode set to **${seconds}s** in ${channel}.`)] });
  },
};
