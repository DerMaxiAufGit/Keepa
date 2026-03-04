const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { getGuildConfig, setGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage auto-assigned roles')
    .addSubcommand(s => s.setName('add').setDescription('Add an autorole')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove an autorole')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List autoroles')),
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = getGuildConfig(interaction.guildId);
    const roles = JSON.parse(config.auto_roles || '[]');

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      if (roles.includes(role.id)) return interaction.reply({ embeds: [errorEmbed('Already Added', 'This role is already an autorole.')], ephemeral: true });
      roles.push(role.id);
      setGuildConfig(interaction.guildId, 'auto_roles', JSON.stringify(roles));
      return interaction.reply({ embeds: [successEmbed('Autorole Added', `${role} will be assigned on join.`)], ephemeral: true });
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      const idx = roles.indexOf(role.id);
      if (idx === -1) return interaction.reply({ embeds: [errorEmbed('Not Found', 'This role is not an autorole.')], ephemeral: true });
      roles.splice(idx, 1);
      setGuildConfig(interaction.guildId, 'auto_roles', JSON.stringify(roles));
      return interaction.reply({ embeds: [successEmbed('Autorole Removed', `${role} removed from autoroles.`)], ephemeral: true });
    }

    if (sub === 'list') {
      const list = roles.length > 0 ? roles.map(id => `<@&${id}>`).join('\n') : 'No autoroles configured.';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Autoroles').setDescription(list).setFooter({ text: 'Keepa' })],
        ephemeral: true,
      });
    }
  },
};
