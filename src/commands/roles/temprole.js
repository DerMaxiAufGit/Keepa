const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { parseDuration, formatDuration, nowUnixSeconds } = require('../../utils/time');
const { validateAssignableRole } = require('../../utils/roleValidation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Assign a temporary role')
    .addSubcommand(s => s.setName('give').setDescription('Give a temp role')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1h, 7d)').setRequired(true))),
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const role = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const duration = parseDuration(durationStr);

    if (!duration) return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Provide a valid duration.')], ephemeral: true });

    const validation = validateAssignableRole(role, interaction.guild);
    if (!validation.valid) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Role', `${role} cannot be assigned: ${validation.reason}.`)], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });

    await member.roles.add(role);

    const now = nowUnixSeconds();
    await query(
      'INSERT INTO temp_roles (guild_id, user_id, role_id, expires_at) VALUES ($1, $2, $3, $4)',
      [interaction.guildId, user.id, role.id, now + duration]
    );

    await interaction.reply({ embeds: [successEmbed('Temp Role Assigned', `${role} given to ${user} for ${formatDuration(duration)}.`)] });
  },
};
