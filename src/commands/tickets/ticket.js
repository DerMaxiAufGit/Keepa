const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');
const { closeTicket } = require('../../handlers/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management')
    .addSubcommand(s => s.setName('close').setDescription('Close this ticket')
      .addStringOption(o => o.setName('reason').setDescription('Close reason')))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('assign').setDescription('Assign staff to this ticket')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true)))
    .addSubcommand(s => s.setName('rename').setDescription('Rename this ticket')
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true))),
  permissions: [],
  botPermissions: ['ManageChannels'],

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const db = getDb();

    if (sub === 'close') {
      const reason = interaction.options.getString('reason');
      return closeTicket(interaction, client, reason);
    }

    // Check this is a ticket channel
    const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").get(interaction.channelId);
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'Use this in a ticket channel.')], ephemeral: true });

    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return interaction.reply({ embeds: [successEmbed('User Added', `${user} has been added to this ticket.`)] });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(user.id);
      return interaction.reply({ embeds: [successEmbed('User Removed', `${user} has been removed from this ticket.`)] });
    }

    if (sub === 'assign') {
      const user = interaction.options.getUser('user');
      db.prepare('UPDATE tickets SET assigned_to = ? WHERE id = ?').run(user.id, ticket.id);
      await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return interaction.reply({ embeds: [successEmbed('Ticket Assigned', `${user} has been assigned to this ticket.`)] });
    }

    if (sub === 'rename') {
      const name = interaction.options.getString('name');
      await interaction.channel.setName(name);
      return interaction.reply({ embeds: [successEmbed('Ticket Renamed', `Channel renamed to **${name}**.`)], ephemeral: true });
    }
  },
};
