const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed, Colors } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { paginate } = require('../../utils/paginator');
const { BOT_NAME } = require('../../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('infractions')
    .setDescription('View infractions for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),
  permissions: ['ModerateMembers'],
  botPermissions: [],

  async execute(interaction, client) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user');
    // Timestamps are stored as Unix seconds (BIGINT)
    const { rows } = await query(
      'SELECT id, type, reason, moderator_id, active, created_at FROM infractions WHERE guild_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 100',
      [interaction.guildId, user.id]
    );

    if (rows.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed('No Infractions', `**${user.tag || user.username}** has no infractions.`)] });
    }

    const perPage = 10;
    const pages = [];

    for (let i = 0; i < rows.length; i += perPage) {
      const chunk = rows.slice(i, i + perPage);
      const desc = chunk.map(r => {
        const date = new Date(r.created_at * 1000).toLocaleDateString();
        return `**#${r.id}** | ${r.type.toUpperCase()} | ${r.active ? 'Active' : 'Inactive'}\n> ${r.reason || 'No reason'}\n> Mod: <@${r.moderator_id}> | ${date}`;
      }).join('\n\n');

      pages.push(
        new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle(`Infractions for ${user.tag || user.username}`)
          .setDescription(desc)
          .setFooter({ text: `Showing last ${rows.length} infractions (max 100) | ${BOT_NAME}` })
          .setTimestamp()
      );
    }

    await paginate(interaction, pages);
  },
};
