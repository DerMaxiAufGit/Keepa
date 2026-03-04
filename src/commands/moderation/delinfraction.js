const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delinfraction')
    .setDescription('Delete an infraction by case ID')
    .addIntegerOption(o => o.setName('case_id').setDescription('Case ID to delete').setRequired(true)),
  permissions: ['Administrator'],
  botPermissions: [],

  async execute(interaction) {
    const caseId = interaction.options.getInteger('case_id');
    const { rows } = await query('SELECT id FROM infractions WHERE id = $1 AND guild_id = $2 AND active = 1', [caseId, interaction.guildId]);

    if (rows.length === 0) return interaction.reply({ embeds: [errorEmbed('Not Found', `Case #${caseId} not found or already deleted.`)], ephemeral: true });

    await query('UPDATE infractions SET active = 0, deleted_by = $1 WHERE id = $2 AND guild_id = $3', [interaction.user.id, caseId, interaction.guildId]);
    await interaction.reply({ embeds: [successEmbed('Infraction Deleted', `Case #${caseId} has been soft-deleted.`)] });
  },
};
