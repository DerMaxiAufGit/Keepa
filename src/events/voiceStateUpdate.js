const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const { handleVoiceJoin, handleVoiceLeave } = require('../handlers/tempChannelHandler');
const logger = require('../utils/logger');

module.exports = {
  async execute(oldState, newState, client) {
    // Temp channel logic first
    try {
      await handleVoiceJoin(oldState, newState, client);
    } catch (err) {
      logger.error(`handleVoiceJoin error: ${err.message}`);
    }
    try {
      await handleVoiceLeave(oldState, newState, client);
    } catch (err) {
      logger.error(`handleVoiceLeave error: ${err.message}`);
    }

    // Voice logging
    const guild = newState.guild;
    let config;
    try {
      config = await getGuildConfig(guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config: ${err.message}`);
      return;
    }
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
      logChannel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
    }
    // Left voice
    else if (oldState.channelId && !newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle('Voice Leave')
        .setDescription(`**${tag}** left <#${oldState.channelId}>`)
        .setTimestamp().setFooter({ text: 'Keepa' });
      logChannel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
    }
    // Moved channels
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Voice Move')
        .setDescription(`**${tag}** moved from <#${oldState.channelId}> to <#${newState.channelId}>`)
        .setTimestamp().setFooter({ text: 'Keepa' });
      logChannel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
    }
  },
};
