const { EmbedBuilder } = require('discord.js');

const Colors = {
  SUCCESS: 0x2ecc71,
  ERROR: 0xe74c3c,
  INFO: 0x3498db,
  WARN: 0xf39c12,
  MOD: 0xe67e22,
};

function successEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'Keepa' });
}

function errorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'Keepa' });
}

function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'Keepa' });
}

function warnEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(Colors.WARN)
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'Keepa' });
}

function modLogEmbed(action, user, mod, reason, duration, caseId) {
  const embed = new EmbedBuilder()
    .setColor(Colors.MOD)
    .setTitle(`Case #${caseId} | ${action}`)
    .addFields(
      { name: 'User', value: `${user.tag || user.username} (${user.id})`, inline: true },
      { name: 'Moderator', value: `${mod.tag || mod.username} (${mod.id})`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setTimestamp()
    .setFooter({ text: 'Keepa' });

  if (duration) embed.addFields({ name: 'Duration', value: duration });
  return embed;
}

module.exports = { successEmbed, errorEmbed, infoEmbed, warnEmbed, modLogEmbed, Colors };
