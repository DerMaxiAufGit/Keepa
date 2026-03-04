const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to lock').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    });

    await interaction.reply({ embeds: [successEmbed('Channel Locked', `${channel} has been locked.\nReason: ${reason}`)] });
  },
};
