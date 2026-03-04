const { ChannelType, PermissionsBitField } = require('discord.js');
const { getDb } = require('../utils/db');
const logger = require('../utils/logger');
const { buildControlPanelEmbed, buildControlPanelButtons } = require('./tempChannelPanelHandler');

async function handleVoiceJoin(oldState, newState, client) {
  if (!newState.channelId || oldState.channelId === newState.channelId) return;

  const db = getDb();
  const hub = db.prepare('SELECT * FROM temp_channel_hubs WHERE channel_id = ? AND guild_id = ?')
    .get(newState.channelId, newState.guild.id);

  if (!hub) return;

  const name = (hub.channel_name || "{user}'s Channel").replace(/{user}/g, newState.member.user.username);

  try {
    const channel = await newState.guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: hub.category_id || newState.channel?.parentId,
      userLimit: hub.channel_limit || 0,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers],
        },
      ],
    });

    await newState.member.voice.setChannel(channel);

    db.prepare(
      'INSERT INTO temp_channels (channel_id, guild_id, owner_id, parent_id) VALUES (?, ?, ?, ?)'
    ).run(channel.id, newState.guild.id, newState.member.id, channel.parentId);

    const embed = buildControlPanelEmbed(channel, newState.member, false);
    const buttons = buildControlPanelButtons(false);
    const panelMsg = await channel.send({ embeds: [embed], components: buttons });
    db.prepare('UPDATE temp_channels SET control_message_id = ? WHERE channel_id = ?')
      .run(panelMsg.id, channel.id);

  } catch (err) {
    logger.error(`Temp channel creation error: ${err.message}`);
  }
}

async function handleVoiceLeave(oldState, newState, client) {
  if (!oldState.channelId || oldState.channelId === newState.channelId) return;

  const db = getDb();
  const temp = db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?').get(oldState.channelId);
  if (!temp) return;

  const channel = oldState.guild.channels.cache.get(oldState.channelId);
  if (!channel) return;

  if (channel.members.size === 0) {
    try {
      await channel.delete();
      db.prepare('DELETE FROM temp_channels WHERE channel_id = ?').run(oldState.channelId);
    } catch (err) {
      logger.error(`Temp channel delete error: ${err.message}`);
    }
  }
}

module.exports = { handleVoiceJoin, handleVoiceLeave };
