const logger = require('../utils/logger');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { VALID_MESSAGE_TYPES } = require('../utils/ticketTemplates');
const { checkPermissions, checkBotPermissions } = require('../utils/permissions');
const { query } = require('../utils/db');
const { validateAssignableRole } = require('../utils/roleValidation');
const { handleTempChannelButton, handleTempChannelModal, handleTempChannelSelect } = require('../handlers/tempChannelPanelHandler');
const { createTicket, closeTicket, reopenTicket, claimTicket, deleteTicket } = require('../handlers/ticketHandler');

module.exports = {
  async execute(interaction, client) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      if (!checkPermissions(interaction, command.permissions)) return;
      if (!checkBotPermissions(interaction, command.botPermissions)) return;

      try {
        await command.execute(interaction, client);
      } catch (err) {
        logger.error(`Command ${interaction.commandName} error: ${err.stack}`);
        const reply = { embeds: [errorEmbed('Error', 'Something went wrong.')], ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    // Button interactions
    if (interaction.isButton()) {
      // Paginator buttons are handled by collectors, skip them
      if (interaction.customId.startsWith('paginate_')) return;

      // Ticket creation button
      if (interaction.customId === 'create_ticket') {
        try {
          await createTicket(interaction, client);
        } catch (err) {
          logger.error(`Ticket creation error: ${err.stack}`);
        }
        return;
      }

      // Ticket close button
      if (interaction.customId === 'close_ticket') {
        try {
          await closeTicket(interaction, client, 'Closed via button');
        } catch (err) {
          logger.error(`Ticket close error: ${err.stack}`);
        }
        return;
      }

      // Ticket re-open button
      if (interaction.customId === 'ticket_reopen') {
        try {
          await reopenTicket(interaction, client);
        } catch (err) {
          logger.error(`Ticket reopen error: ${err.stack}`);
        }
        return;
      }

      // Ticket claim button
      if (interaction.customId === 'ticket_claim') {
        try {
          await claimTicket(interaction, client);
        } catch (err) {
          logger.error(`Ticket claim error: ${err.stack}`);
        }
        return;
      }

      // Ticket delete button
      if (interaction.customId === 'ticket_delete') {
        try {
          await deleteTicket(interaction, client);
        } catch (err) {
          logger.error(`Ticket delete error: ${err.stack}`);
        }
        return;
      }

      // Temp channel panel buttons
      if (interaction.customId.startsWith('tc_')) {
        try {
          await handleTempChannelButton(interaction);
        } catch (err) {
          logger.error(`Temp channel button error: ${err.stack}`);
        }
        return;
      }

      // Button roles
      if (interaction.customId.startsWith('role_')) {
        try {
          const { rows } = await query(
            'SELECT role_id FROM component_roles WHERE message_id = $1 AND custom_id = $2',
            [interaction.message.id, interaction.customId]
          );
          const row = rows[0];

          if (!row) return;
          const role = interaction.guild.roles.cache.get(row.role_id);
          if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

          const validation = validateAssignableRole(role, interaction.guild);
          if (!validation.valid) {
            return interaction.reply({ content: `I cannot manage the **${role.name}** role: ${validation.reason}.`, ephemeral: true });
          }

          const member = interaction.member;
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            await interaction.reply({ content: `Removed **${role.name}**.`, ephemeral: true });
          } else {
            await member.roles.add(role);
            await interaction.reply({ content: `Added **${role.name}**.`, ephemeral: true });
          }
        } catch (err) {
          logger.error(`Button role error: ${err.stack}`);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Failed to update your role.', ephemeral: true }).catch(() => {});
          }
        }
        return;
      }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      // Ticket message template edit modal
      if (interaction.customId.startsWith('ticket_msg_edit_')) {
        try {
          const messageType = interaction.customId.replace('ticket_msg_edit_', '');
          if (!VALID_MESSAGE_TYPES.has(messageType)) {
            return interaction.reply({ embeds: [errorEmbed('Invalid Type', 'Unknown message type.')], ephemeral: true });
          }
          const title = interaction.fields.getTextInputValue('ticket_msg_title');
          const content = interaction.fields.getTextInputValue('ticket_msg_content');
          await query(
            `INSERT INTO ticket_messages (guild_id, message_type, title, content) VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, message_type) DO UPDATE SET title = $3, content = $4`,
            [interaction.guildId, messageType, title, content]
          );
          await interaction.reply({ embeds: [successEmbed('Template Updated', `The **${messageType}** template has been saved.`)], ephemeral: true });
        } catch (err) {
          logger.error(`Ticket message modal error: ${err.stack}`);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed('Error', 'Failed to save template.')], ephemeral: true }).catch(() => {});
          }
        }
        return;
      }

      if (interaction.customId.startsWith('tc_modal_')) {
        try {
          await handleTempChannelModal(interaction);
        } catch (err) {
          logger.error(`Temp channel modal error: ${err.stack}`);
        }
        return;
      }
    }

    // User select menus
    if (interaction.isUserSelectMenu()) {
      if (interaction.customId.startsWith('tc_select_')) {
        try {
          await handleTempChannelSelect(interaction);
        } catch (err) {
          logger.error(`Temp channel select error: ${err.stack}`);
        }
        return;
      }
    }
  },
};
