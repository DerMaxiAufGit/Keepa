const logger = require('../utils/logger');
const { errorEmbed } = require('../utils/embeds');
const { checkPermissions, checkBotPermissions } = require('../utils/permissions');
const { query } = require('../utils/db');
const { validateAssignableRole } = require('../utils/roleValidation');
const { handleTempChannelButton, handleTempChannelModal, handleTempChannelSelect } = require('../handlers/tempChannelPanelHandler');
const { createTicket, closeTicket } = require('../handlers/ticketHandler');

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
