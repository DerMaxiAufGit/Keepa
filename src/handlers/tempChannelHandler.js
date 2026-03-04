const { ChannelType, PermissionsBitField } = require('discord.js');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { buildControlPanelEmbed, buildControlPanelButtons } = require('./tempChannelPanelHandler');

async function handleVoiceJoin(oldState, newState, client) {
  if (!newState.channelId || oldState.channelId === newState.channelId) return;

  const { rows } = await query(
    'SELECT * FROM temp_channel_hubs WHERE channel_id = $1 AND guild_id = $2',
    [newState.channelId, newState.guild.id]
  );
  const hub = rows[0];

  if (!hub) return;

  const template = hub.channel_name || "{user}'s Channel";
  // Validate template characters at runtime
  const name = template.replace(/{user}/g, newState.member.user.username);

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

    await query(
      'INSERT INTO temp_channels (channel_id, guild_id, owner_id, parent_id) VALUES ($1, $2, $3, $4)',
      [channel.id, newState.guild.id, newState.member.id, channel.parentId]
    );

    const embed = buildControlPanelEmbed(channel, newState.member, false);
    const buttons = buildControlPanelButtons(false);
    const panelMsg = await channel.send({ embeds: [embed], components: buttons });
    await query('UPDATE temp_channels SET control_message_id = $1 WHERE channel_id = $2', [panelMsg.id, channel.id]);

  } catch (err) {
    logger.error(`Temp channel creation error: ${err.message}`);
  }
}

async function handleVoiceLeave(oldState, newState, client) {
  if (!oldState.channelId || oldState.channelId === newState.channelId) return;

  const { rows } = await query('SELECT * FROM temp_channels WHERE channel_id = $1', [oldState.channelId]);
  const temp = rows[0];
  if (!temp) return;

  const channel = oldState.guild.channels.cache.get(oldState.channelId);
  if (!channel) return;

  if (channel.members.size === 0) {
    try {
      await channel.delete();
      await query('DELETE FROM temp_channels WHERE channel_id = $1', [oldState.channelId]);
    } catch (err) {
      logger.error(`Temp channel delete error: ${err.message}`);
    }
  }
}

module.exports = { handleVoiceJoin, handleVoiceLeave };
