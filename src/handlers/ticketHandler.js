const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { query } = require('../utils/db');
const { errorEmbed, successEmbed, Colors } = require('../utils/embeds');
const { nowUnixSeconds } = require('../utils/time');
const { getTemplate, resolvePlaceholders } = require('../utils/ticketTemplates');
const logger = require('../utils/logger');

const MAX_TRANSCRIPT_BATCHES = 20;

function parseSupportRoles(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function hasSupportAccess(member, supportRoles) {
  return member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    || supportRoles.some(roleId => member.roles.cache.has(roleId));
}

async function createTicket(interaction, client) {
  const { rows: configRows } = await query(
    'SELECT guild_id, enabled, category_id, log_channel, support_roles, max_open, transcript_channel FROM ticket_config WHERE guild_id = $1',
    [interaction.guildId]
  );
  const config = configRows[0];

  if (!config || !config.enabled) {
    return interaction.reply({ embeds: [errorEmbed('Tickets Disabled', 'The ticket system is not configured.')], ephemeral: true });
  }

  const { rows: countRows } = await query(
    "SELECT COUNT(*) as count FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status = 'open'",
    [interaction.guildId, interaction.user.id]
  );

  if (parseInt(countRows[0].count, 10) >= config.max_open) {
    return interaction.reply({ embeds: [errorEmbed('Limit Reached', `You can only have ${config.max_open} open ticket(s).`)], ephemeral: true });
  }

  const supportRoles = parseSupportRoles(config.support_roles);

  // Reserve ticket number via INSERT RETURNING to avoid race conditions
  const { rows: insertRows } = await query(
    "INSERT INTO tickets (guild_id, channel_id, user_id) VALUES ($1, 'pending', $2) RETURNING id",
    [interaction.guildId, interaction.user.id]
  );
  const ticketNum = insertRows[0].id;

  const permissionOverwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
  ];

  for (const roleId of supportRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
    });
  }

  try {
    const channel = await interaction.guild.channels.create({
      name: `ticket-${ticketNum}`,
      type: ChannelType.GuildText,
      parent: config.category_id || null,
      permissionOverwrites,
    });

    await query('UPDATE tickets SET channel_id = $1 WHERE id = $2', [channel.id, ticketNum]);

    const template = await getTemplate(interaction.guildId, 'welcome');
    const ctx = {
      user: `${interaction.user}`,
      userTag: interaction.user.tag || interaction.user.username,
      ticket: String(ticketNum),
      channel: `${channel}`,
      server: interaction.guild.name,
    };

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(resolvePlaceholders(template.title, ctx))
      .setDescription(resolvePlaceholders(template.content, ctx))
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  } catch (err) {
    logger.error(`Ticket creation error: ${err.stack}`);
    await interaction.reply({ embeds: [errorEmbed('Error', 'Could not create ticket.')], ephemeral: true });
  }
}

async function closeTicket(interaction, client, reason) {
  const { rows: ticketRows } = await query(
    "SELECT id, guild_id, channel_id, user_id, assigned_to, status FROM tickets WHERE channel_id = $1 AND status = 'open'",
    [interaction.channelId]
  );
  const ticket = ticketRows[0];

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'This is not an open ticket channel.')], ephemeral: true });
  }

  const isOwner = ticket.user_id === interaction.user.id;
  const { rows: configRows } = await query('SELECT support_roles, transcript_channel FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  const supportRoles = parseSupportRoles(configRows[0]?.support_roles);
  const hasAccess = isOwner || hasSupportAccess(interaction.member, supportRoles);

  if (!hasAccess) {
    return interaction.reply({ embeds: [errorEmbed('No Permission', 'You do not have permission to close this ticket.')], ephemeral: true });
  }

  await interaction.deferReply();

  // Generate and log transcript
  const transcript = await generateTranscript(interaction.channel, ticket);
  const config = configRows[0];
  if (config?.transcript_channel) {
    const logChannel = interaction.guild.channels.cache.get(config.transcript_channel);
    if (logChannel) {
      const attachment = new AttachmentBuilder(Buffer.from(transcript), { name: `ticket-${ticket.id}.html` });
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`Ticket #${ticket.id} Closed`)
        .addFields(
          { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true },
          { name: 'Closed by', value: `${interaction.user}`, inline: true },
          { name: 'Reason', value: reason || 'No reason' }
        )
        .setTimestamp()
        .setFooter({ text: 'Keepa' });
      await logChannel.send({ embeds: [embed], files: [attachment] }).catch(err => logger.warn(`Transcript send failed: ${err.message}`));
    }
  }

  const now = nowUnixSeconds();
  await query(
    "UPDATE tickets SET status = 'closed', closed_at = $1, closed_by = $2 WHERE id = $3",
    [now, interaction.user.id, ticket.id]
  );

  // Lock channel instead of deleting
  try {
    await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false });
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { SendMessages: false });
  } catch (err) {
    logger.warn(`Failed to lock ticket channel: ${err.message}`);
  }

  const template = await getTemplate(interaction.guildId, 'close');
  const ctx = {
    user: `<@${ticket.user_id}>`,
    userTag: ticket.user_id,
    staff: `${interaction.user}`,
    ticket: String(ticket.id),
    channel: `${interaction.channel}`,
    reason: reason || 'No reason provided',
    server: interaction.guild.name,
  };

  const closeEmbed = new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle(resolvePlaceholders(template.title, ctx))
    .setDescription(resolvePlaceholders(template.content, ctx))
    .setTimestamp()
    .setFooter({ text: 'Keepa' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Re-open').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [closeEmbed], components: [row] });
}

async function reopenTicket(interaction, client) {
  const { rows: ticketRows } = await query(
    "SELECT id, guild_id, channel_id, user_id, assigned_to, status FROM tickets WHERE channel_id = $1 AND status = 'closed'",
    [interaction.channelId]
  );
  const ticket = ticketRows[0];

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Cannot Re-open', 'This is not a closed ticket channel.')], ephemeral: true });
  }

  const isOwner = ticket.user_id === interaction.user.id;
  const { rows: configRows } = await query('SELECT support_roles FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  const supportRoles = parseSupportRoles(configRows[0]?.support_roles);
  const hasAccess = isOwner || hasSupportAccess(interaction.member, supportRoles);

  if (!hasAccess) {
    return interaction.reply({ embeds: [errorEmbed('No Permission', 'You do not have permission to re-open this ticket.')], ephemeral: true });
  }

  await interaction.deferReply();

  // Restore permissions
  try {
    await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: true });
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { SendMessages: null });
  } catch (err) {
    logger.warn(`Failed to restore ticket permissions: ${err.message}`);
  }

  const now = nowUnixSeconds();
  await query(
    "UPDATE tickets SET status = 'open', reopened_at = $1, closed_at = NULL, closed_by = NULL WHERE id = $2",
    [now, ticket.id]
  );

  const template = await getTemplate(interaction.guildId, 'reopen');
  const ctx = {
    user: `${interaction.user}`,
    userTag: interaction.user.tag || interaction.user.username,
    ticket: String(ticket.id),
    channel: `${interaction.channel}`,
    server: interaction.guild.name,
  };

  const embed = new EmbedBuilder()
    .setColor(Colors.SUCCESS)
    .setTitle(resolvePlaceholders(template.title, ctx))
    .setDescription(resolvePlaceholders(template.content, ctx))
    .setTimestamp()
    .setFooter({ text: 'Keepa' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function claimTicket(interaction, client) {
  const { rows: ticketRows } = await query(
    "SELECT id, guild_id, channel_id, user_id, assigned_to, claimed_by, status FROM tickets WHERE channel_id = $1 AND status = 'open'",
    [interaction.channelId]
  );
  const ticket = ticketRows[0];

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Cannot Claim', 'This is not an open ticket channel.')], ephemeral: true });
  }

  const { rows: configRows } = await query('SELECT support_roles FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  const supportRoles = parseSupportRoles(configRows[0]?.support_roles);

  if (!hasSupportAccess(interaction.member, supportRoles)) {
    return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only staff members can claim tickets.')], ephemeral: true });
  }

  if (ticket.claimed_by) {
    return interaction.reply({ embeds: [errorEmbed('Already Claimed', `This ticket is already claimed by <@${ticket.claimed_by}>.`)], ephemeral: true });
  }

  await query(
    'UPDATE tickets SET claimed_by = $1, assigned_to = $1 WHERE id = $2',
    [interaction.user.id, ticket.id]
  );

  // Grant claimer channel permissions
  try {
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
  } catch (err) {
    logger.warn(`Failed to set claim permissions: ${err.message}`);
  }

  const template = await getTemplate(interaction.guildId, 'claim');
  const ctx = {
    user: `<@${ticket.user_id}>`,
    staff: `${interaction.user}`,
    ticket: String(ticket.id),
    channel: `${interaction.channel}`,
    server: interaction.guild.name,
  };

  const embed = new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle(resolvePlaceholders(template.title, ctx))
    .setDescription(resolvePlaceholders(template.content, ctx))
    .setTimestamp()
    .setFooter({ text: 'Keepa' });

  await interaction.reply({ embeds: [embed] });
}

async function deleteTicket(interaction, client) {
  const { rows: ticketRows } = await query(
    "SELECT id, guild_id, channel_id, user_id, status FROM tickets WHERE channel_id = $1 AND status = 'closed'",
    [interaction.channelId]
  );
  const ticket = ticketRows[0];

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Cannot Delete', 'Only closed tickets can be deleted.')], ephemeral: true });
  }

  const { rows: configRows } = await query('SELECT support_roles FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  const supportRoles = parseSupportRoles(configRows[0]?.support_roles);

  if (!hasSupportAccess(interaction.member, supportRoles)) {
    return interaction.reply({ embeds: [errorEmbed('No Permission', 'Only staff members can delete tickets.')], ephemeral: true });
  }

  const template = await getTemplate(interaction.guildId, 'delete');
  const ctx = {
    user: `<@${ticket.user_id}>`,
    staff: `${interaction.user}`,
    ticket: String(ticket.id),
    channel: `${interaction.channel}`,
    server: interaction.guild.name,
  };

  const embed = new EmbedBuilder()
    .setColor(Colors.ERROR)
    .setTitle(resolvePlaceholders(template.title, ctx))
    .setDescription(resolvePlaceholders(template.content, ctx))
    .setTimestamp()
    .setFooter({ text: 'Keepa' });

  await interaction.reply({ embeds: [embed] });
  setTimeout(() => interaction.channel.delete().catch(err => logger.warn(`Ticket channel delete failed: ${err.message}`)), 5000);
}

async function generateTranscript(channel, ticket) {
  const allMessages = [];
  let lastId;
  let batches = 0;

  while (batches < MAX_TRANSCRIPT_BATCHES) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    batches++;
  }

  const sorted = [...allMessages].reverse();

  const rows = sorted.map(m => {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = m.author?.tag || m.author?.username || 'Unknown';
    const content = m.content || '';
    const attachments = m.attachments.map(a => `<a href="${a.url}">${escapeHtml(a.name || 'attachment')}</a>`).join(' ');
    return `<div class="msg"><span class="time">${time}</span> <strong>${escapeHtml(author)}</strong>: ${escapeHtml(content)} ${attachments}</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket #${ticket.id}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#36393f;color:#dcddde}
.msg{padding:4px 0;border-bottom:1px solid #40444b}.time{color:#72767d;font-size:0.8em}strong{color:#fff}a{color:#00b0f4}</style>
</head><body><h2>Ticket #${ticket.id}</h2><p>Opened by: ${escapeHtml(ticket.user_id)}</p><hr>${rows}</body></html>`;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { createTicket, closeTicket, reopenTicket, claimTicket, deleteTicket };
