const { PermissionsBitField } = require('discord.js');
const { errorEmbed } = require('./embeds');

function checkPermissions(interaction, permissions) {
  if (!permissions || permissions.length === 0) return true;
  const missing = permissions.filter(p => !interaction.memberPermissions.has(PermissionsBitField.Flags[p]));
  if (missing.length > 0) {
    interaction.reply({
      embeds: [errorEmbed('Missing Permissions', `You need: \`${missing.join('`, `')}\``)],
      ephemeral: true,
    });
    return false;
  }
  return true;
}

function checkBotPermissions(interaction, permissions) {
  if (!permissions || permissions.length === 0) return true;
  const me = interaction.guild.members.me;
  const missing = permissions.filter(p => !me.permissions.has(PermissionsBitField.Flags[p]));
  if (missing.length > 0) {
    interaction.reply({
      embeds: [errorEmbed('Bot Missing Permissions', `I need: \`${missing.join('`, `')}\``)],
      ephemeral: true,
    });
    return false;
  }
  return true;
}

module.exports = { checkPermissions, checkBotPermissions };
