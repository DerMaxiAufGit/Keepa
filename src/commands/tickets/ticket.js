const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { closeTicket, reopenTicket } = require('../../handlers/ticketHandler');
const logger = require('../../utils/logger');

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
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
    .addSubcommand(s => s.setName('reopen').setDescription('Re-open a closed ticket')),
  permissions: [],
  botPermissions: ['ManageChannels'],

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'close') {
      const reason = interaction.options.getString('reason');
      return closeTicket(interaction, client, reason);
    }

    if (sub === 'reopen') {
      return reopenTicket(interaction, client);
    }

    // Check this is a ticket channel
    const { rows } = await query("SELECT id, guild_id, channel_id, user_id, assigned_to, status FROM tickets WHERE channel_id = $1 AND status = 'open'", [interaction.channelId]);
    const ticket = rows[0];
    if (!ticket) return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'Use this in a ticket channel.')], ephemeral: true });

    // Authorization: ticket owner, support role, or ManageChannels
    const isOwner = ticket.user_id === interaction.user.id;
    const hasManageChannels = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

    let hasSupportRole = false;
    const { rows: configRows } = await query('SELECT support_roles FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
    if (configRows[0]) {
      let supportRoles = [];
      try { supportRoles = JSON.parse(configRows[0].support_roles || '[]'); } catch {}
      hasSupportRole = supportRoles.some(roleId => interaction.member.roles.cache.has(roleId));
    }

    if (sub === 'add') {
      if (!isOwner && !hasManageChannels && !hasSupportRole) {
        return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only the ticket owner or staff can add users.')], ephemeral: true });
      }
      const user = interaction.options.getUser('user');
      try {
        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      } catch (err) {
        logger.error(`Ticket permission edit failed: ${err.message}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not update permissions.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('User Added', `${user} has been added to this ticket.`)] });
    }

    if (sub === 'remove') {
      if (!isOwner && !hasManageChannels && !hasSupportRole) {
        return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only the ticket owner or staff can remove users.')], ephemeral: true });
      }
      const user = interaction.options.getUser('user');
      try {
        await interaction.channel.permissionOverwrites.delete(user.id);
      } catch (err) {
        logger.error(`Ticket permission delete failed: ${err.message}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not update permissions.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('User Removed', `${user} has been removed from this ticket.`)] });
    }

    if (sub === 'assign') {
      if (!hasManageChannels && !hasSupportRole) {
        return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only staff can assign tickets.')], ephemeral: true });
      }
      const user = interaction.options.getUser('user');
      await query('UPDATE tickets SET assigned_to = $1 WHERE id = $2', [user.id, ticket.id]);
      try {
        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      } catch (err) {
        logger.error(`Ticket permission edit failed: ${err.message}`);
      }
      return interaction.reply({ embeds: [successEmbed('Ticket Assigned', `${user} has been assigned to this ticket.`)] });
    }

    if (sub === 'rename') {
      const name = interaction.options.getString('name');
      // Validate channel name: 1-100 chars, strip control characters
      const sanitized = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
      if (sanitized.length === 0 || sanitized.length > 100) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Name', 'Channel name must be 1-100 characters.')], ephemeral: true });
      }
      try {
        await interaction.channel.setName(sanitized);
      } catch (err) {
        logger.error(`Ticket rename failed: ${err.message}`);
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not rename the channel.')], ephemeral: true });
      }
      return interaction.reply({ embeds: [successEmbed('Ticket Renamed', `Channel renamed to **${sanitized}**.`)], ephemeral: true });
    }
  },
};
