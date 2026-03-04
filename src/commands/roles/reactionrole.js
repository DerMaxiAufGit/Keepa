const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { validateAssignableRole } = require('../../utils/roleValidation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .addSubcommand(s => s.setName('add').setDescription('Add a reaction role')
      .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a reaction role')
      .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))),
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles', 'AddReactions'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const messageId = interaction.options.getString('message_id');
    const emoji = interaction.options.getString('emoji');

    // Validate message ID format
    if (!/^\d{17,20}$/.test(messageId)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid ID', 'Please provide a valid message ID (17-20 digits).')], ephemeral: true });
    }

    if (sub === 'add') {
      const role = interaction.options.getRole('role');

      const validation = validateAssignableRole(role, interaction.guild);
      if (!validation.valid) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Role', `${role} cannot be assigned: ${validation.reason}.`)], ephemeral: true });
      }

      // Try to react to verify message exists
      try {
        const msg = await interaction.channel.messages.fetch(messageId);
        await msg.react(emoji);
      } catch {
        return interaction.reply({ embeds: [errorEmbed('Error', 'Could not find message or react with that emoji.')], ephemeral: true });
      }

      try {
        await query(
          'INSERT INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES ($1, $2, $3, $4, $5)',
          [interaction.guildId, interaction.channelId, messageId, emoji, role.id]
        );
        return interaction.reply({ embeds: [successEmbed('Reaction Role Added', `${emoji} → ${role}`)], ephemeral: true });
      } catch {
        return interaction.reply({ embeds: [errorEmbed('Already Exists', 'That emoji is already bound on this message.')], ephemeral: true });
      }
    }

    if (sub === 'remove') {
      const result = await query(
        'DELETE FROM reaction_roles WHERE guild_id = $1 AND message_id = $2 AND emoji = $3',
        [interaction.guildId, messageId, emoji]
      );
      if (result.rowCount === 0) return interaction.reply({ embeds: [errorEmbed('Not Found', 'No reaction role found.')], ephemeral: true });
      return interaction.reply({ embeds: [successEmbed('Reaction Role Removed', 'Binding removed.')], ephemeral: true });
    }
  },
};
