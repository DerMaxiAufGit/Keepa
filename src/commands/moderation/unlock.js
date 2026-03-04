const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to unlock').setRequired(true)),
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    });

    await interaction.reply({ embeds: [successEmbed('Channel Unlocked', `${channel} has been unlocked.`)] });
  },
};
