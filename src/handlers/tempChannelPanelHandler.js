const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require('discord.js');
const { getDb } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

function buildControlPanelEmbed(channel, owner, isLocked) {
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('Channel Settings')
    .setDescription('Use the buttons below to manage your temporary channel.')
    .addFields(
      { name: 'Owner', value: `<@${owner.id || owner}>`, inline: true },
      { name: 'User Limit', value: channel.userLimit ? `${channel.userLimit}` : 'Unlimited', inline: true },
      { name: 'Status', value: isLocked ? 'Locked' : 'Unlocked', inline: true },
    )
    .setFooter({ text: 'Keepa' })
    .setTimestamp();
}

function buildControlPanelButtons(isLocked) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_lock').setLabel(isLocked ? 'Unlock' : 'Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tc_rename').setLabel('Rename').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tc_limit').setLabel('Limit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tc_delete').setLabel('Delete').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tc_permit').setLabel('Permit').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tc_reject').setLabel('Reject').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tc_claim').setLabel('Claim').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

function isChannelLocked(channel) {
  const everyonePerms = channel.permissionOverwrites.cache.get(channel.guild.id);
  if (!everyonePerms) return false;
  return everyonePerms.deny.has(PermissionsBitField.Flags.Connect);
}

function checkPanelPermission(interaction, temp) {
  const isOwner = temp.owner_id === interaction.user.id;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
  if (!isOwner && !isAdmin && !isMod) {
    interaction.reply({ content: 'You do not have permission to manage this channel.', ephemeral: true });
    return false;
  }
  return true;
}

async function updateControlPanel(channel, temp) {
  if (!temp.control_message_id) return;
  try {
    const msg = await channel.messages.fetch(temp.control_message_id);
    const locked = isChannelLocked(channel);
    const embed = buildControlPanelEmbed(channel, temp.owner_id, locked);
    const buttons = buildControlPanelButtons(locked);
    await msg.edit({ embeds: [embed], components: buttons });
  } catch {
    // Message may have been deleted
  }
}

async function handleTempChannelButton(interaction) {
  const db = getDb();
  const temp = db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?').get(interaction.channel.id);
  if (!temp) {
    return interaction.reply({ content: 'This is not a managed temp channel.', ephemeral: true });
  }

  if (!checkPanelPermission(interaction, temp)) return;

  const channel = interaction.channel;
  const action = interaction.customId;

  if (action === 'tc_lock') {
    const locked = isChannelLocked(channel);
    await channel.permissionOverwrites.edit(channel.guild.id, { Connect: locked ? null : false });
    await interaction.reply({ content: locked ? 'Channel unlocked.' : 'Channel locked.', ephemeral: true });
    await updateControlPanel(channel, temp);
  }

  else if (action === 'tc_rename') {
    const modal = new ModalBuilder()
      .setCustomId('tc_modal_rename')
      .setTitle('Rename Channel')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('New channel name')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  }

  else if (action === 'tc_limit') {
    const modal = new ModalBuilder()
      .setCustomId('tc_modal_limit')
      .setTitle('Set User Limit')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('limit')
            .setLabel('User limit (0 for unlimited)')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(3)
            .setRequired(true),
        ),
      );
    await interaction.showModal(modal);
  }

  else if (action === 'tc_delete') {
    db.prepare('DELETE FROM temp_channels WHERE channel_id = ?').run(channel.id);
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(() => {});
  }

  else if (action === 'tc_permit') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('tc_select_permit').setPlaceholder('Select a user to permit').setMaxValues(1),
    );
    await interaction.reply({ content: 'Select a user to permit:', components: [row], ephemeral: true });
  }

  else if (action === 'tc_reject') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('tc_select_reject').setPlaceholder('Select a user to reject').setMaxValues(1),
    );
    await interaction.reply({ content: 'Select a user to reject:', components: [row], ephemeral: true });
  }

  else if (action === 'tc_claim') {
    if (temp.owner_id === interaction.user.id) {
      return interaction.reply({ content: 'You already own this channel.', ephemeral: true });
    }
    const voiceChannel = interaction.guild.channels.cache.get(channel.id);
    const ownerInChannel = voiceChannel?.members.has(temp.owner_id);
    if (ownerInChannel) {
      return interaction.reply({ content: 'The owner is still in the channel.', ephemeral: true });
    }

    // Remove old owner perms, add new owner perms
    await channel.permissionOverwrites.delete(temp.owner_id).catch(() => {});
    await channel.permissionOverwrites.edit(interaction.user.id, {
      ManageChannels: true,
      MoveMembers: true,
    });

    db.prepare('UPDATE temp_channels SET owner_id = ? WHERE channel_id = ?')
      .run(interaction.user.id, channel.id);

    const updatedTemp = db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?').get(channel.id);
    await interaction.reply({ content: 'You are now the owner of this channel.', ephemeral: true });
    await updateControlPanel(channel, updatedTemp);
  }
}

async function handleTempChannelModal(interaction) {
  const db = getDb();
  const temp = db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?').get(interaction.channel.id);
  if (!temp) {
    return interaction.reply({ content: 'This is not a managed temp channel.', ephemeral: true });
  }

  const channel = interaction.channel;

  if (interaction.customId === 'tc_modal_rename') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) return interaction.reply({ content: 'Name cannot be empty.', ephemeral: true });
    await channel.setName(name);
    await interaction.reply({ content: `Channel renamed to **${name}**.`, ephemeral: true });
    await updateControlPanel(channel, temp);
  }

  else if (interaction.customId === 'tc_modal_limit') {
    const input = interaction.fields.getTextInputValue('limit').trim();
    const limit = parseInt(input, 10);
    if (isNaN(limit) || limit < 0 || limit > 99) {
      return interaction.reply({ content: 'Please enter a number between 0 and 99.', ephemeral: true });
    }
    await channel.setUserLimit(limit);
    await interaction.reply({ content: limit === 0 ? 'User limit removed.' : `User limit set to **${limit}**.`, ephemeral: true });
    await updateControlPanel(channel, temp);
  }
}

async function handleTempChannelSelect(interaction) {
  const db = getDb();
  const temp = db.prepare('SELECT * FROM temp_channels WHERE channel_id = ?').get(interaction.channel.id);
  if (!temp) {
    return interaction.reply({ content: 'This is not a managed temp channel.', ephemeral: true });
  }

  if (!checkPanelPermission(interaction, temp)) return;

  const channel = interaction.channel;
  const targetId = interaction.values[0];
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });

  if (interaction.customId === 'tc_select_permit') {
    await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
    await interaction.reply({ content: `Permitted <@${targetId}> to join.`, ephemeral: true });
  }

  else if (interaction.customId === 'tc_select_reject') {
    await channel.permissionOverwrites.edit(targetId, { Connect: false });
    if (target.voice?.channelId === channel.id) {
      await target.voice.disconnect().catch(() => {});
    }
    await interaction.reply({ content: `Rejected <@${targetId}> from the channel.`, ephemeral: true });
  }
}

module.exports = {
  buildControlPanelEmbed,
  buildControlPanelButtons,
  isChannelLocked,
  handleTempChannelButton,
  handleTempChannelModal,
  handleTempChannelSelect,
};
