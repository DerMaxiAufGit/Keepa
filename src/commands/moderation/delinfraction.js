const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delinfraction')
    .setDescription('Delete an infraction by case ID')
    .addIntegerOption(o => o.setName('case_id').setDescription('Case ID to delete').setRequired(true)),
  permissions: ['Administrator'],
  botPermissions: [],

  async execute(interaction) {
    const caseId = interaction.options.getInteger('case_id');
    try {
      const { rowCount } = await query(
        'UPDATE infractions SET active = 0, deleted_by = $1 WHERE id = $2 AND guild_id = $3 AND active = 1',
        [interaction.user.id, caseId, interaction.guildId]
      );
      if (rowCount === 0) {
        return interaction.reply({ embeds: [errorEmbed('Not Found', `Case #${caseId} not found or already deleted.`)], ephemeral: true });
      }
      await interaction.reply({ embeds: [successEmbed('Infraction Deleted', `Case #${caseId} has been soft-deleted.`)] });
    } catch (err) {
      logger.error(`Failed to delete infraction #${caseId}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Error', 'Could not delete the infraction (DB error).')], ephemeral: true });
    }
  },
};
