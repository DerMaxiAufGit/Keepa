const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const { handleVoiceJoin, handleVoiceLeave } = require('../handlers/tempChannelHandler');

module.exports = {
  async execute(oldState, newState, client) {
    // Temp channel logic first
    await handleVoiceJoin(oldState, newState, client);
    await handleVoiceLeave(oldState, newState, client);

    // Voice logging
    const guild = newState.guild;
    const config = getGuildConfig(guild.id);
    if (!config.voice_log_channel) return;
    const logChannel = guild.channels.cache.get(config.voice_log_channel);
    if (!logChannel) return;

    const member = newState.member || oldState.member;
    if (!member) return;
    const tag = member.user.tag || member.user.username;

    // Joined voice
    if (!oldState.channelId && newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('Voice Join')
        .setDescription(`**${tag}** joined <#${newState.channelId}>`)
        .setTimestamp().setFooter({ text: 'Keepa' });
      logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    // Left voice
    else if (oldState.channelId && !newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle('Voice Leave')
        .setDescription(`**${tag}** left <#${oldState.channelId}>`)
        .setTimestamp().setFooter({ text: 'Keepa' });
      logChannel.send({ embeds: [embed] }).catch(() => {});
    }
    // Moved channels
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Voice Move')
        .setDescription(`**${tag}** moved from <#${oldState.channelId}> to <#${newState.channelId}>`)
        .setTimestamp().setFooter({ text: 'Keepa' });
      logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  },
};
