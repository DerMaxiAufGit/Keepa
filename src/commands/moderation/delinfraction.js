const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delinfraction')
    .setDescription('Delete an infraction by case ID')
    .addIntegerOption(o => o.setName('case_id').setDescription('Case ID to delete').setRequired(true)),
  permissions: ['Administrator'],
  botPermissions: [],

  async execute(interaction) {
    const caseId = interaction.options.getInteger('case_id');
    const db = getDb();
    const row = db.prepare('SELECT * FROM infractions WHERE id = ? AND guild_id = ?').get(caseId, interaction.guildId);

    if (!row) return interaction.reply({ embeds: [errorEmbed('Not Found', `Case #${caseId} not found.`)], ephemeral: true });

    db.prepare('DELETE FROM infractions WHERE id = ? AND guild_id = ?').run(caseId, interaction.guildId);
    await interaction.reply({ embeds: [successEmbed('Infraction Deleted', `Case #${caseId} has been removed.`)] });
  },
};
