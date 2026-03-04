const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { query } = require('../utils/db');
const { errorEmbed, successEmbed, Colors } = require('../utils/embeds');
const { nowUnixSeconds } = require('../utils/time');
const logger = require('../utils/logger');

const MAX_TRANSCRIPT_BATCHES = 20;

async function createTicket(interaction, client) {
  const { rows: configRows } = await query('SELECT * FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  const config = configRows[0];

  if (!config || !config.enabled) {
    return interaction.reply({ embeds: [errorEmbed('Tickets Disabled', 'The ticket system is not configured.')], ephemeral: true });
  }

  // Check max open tickets
  const { rows: countRows } = await query(
    "SELECT COUNT(*) as count FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status = 'open'",
    [interaction.guildId, interaction.user.id]
  );

  if (parseInt(countRows[0].count, 10) >= config.max_open) {
    return interaction.reply({ embeds: [errorEmbed('Limit Reached', `You can only have ${config.max_open} open ticket(s).`)], ephemeral: true });
  }

  // Create ticket channel
  const { rows: totalRows } = await query('SELECT COUNT(*) as count FROM tickets WHERE guild_id = $1', [interaction.guildId]);
  const ticketNum = parseInt(totalRows[0].count, 10) + 1;
  let supportRoles = [];
  try {
    supportRoles = JSON.parse(config.support_roles || '[]');
  } catch {
    supportRoles = [];
  }

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

    await query(
      'INSERT INTO tickets (guild_id, channel_id, user_id) VALUES ($1, $2, $3)',
      [interaction.guildId, channel.id, interaction.user.id]
    );

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(`Ticket #${ticketNum}`)
      .setDescription(`Welcome ${interaction.user}! A staff member will be with you shortly.\nUse \`/ticket close\` to close this ticket.`)
      .setTimestamp().setFooter({ text: 'Keepa' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
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
    "SELECT * FROM tickets WHERE channel_id = $1 AND status = 'open'",
    [interaction.channelId]
  );
  const ticket = ticketRows[0];

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'This is not an open ticket channel.')], ephemeral: true });
  }

  // Authorization check: ticket owner, support role, or ManageChannels
  const isOwner = ticket.user_id === interaction.user.id;
  const hasManageChannels = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

  let hasSupportRole = false;
  const { rows: configRows } = await query('SELECT support_roles FROM ticket_config WHERE guild_id = $1', [interaction.guildId]);
  if (configRows[0]) {
    let supportRoles = [];
    try { supportRoles = JSON.parse(configRows[0].support_roles || '[]'); } catch {}
    hasSupportRole = supportRoles.some(roleId => interaction.member.roles.cache.has(roleId));
  }

  if (!isOwner && !hasManageChannels && !hasSupportRole) {
    return interaction.reply({ embeds: [errorEmbed('No Permission', 'You do not have permission to close this ticket.')], ephemeral: true });
  }

  await interaction.deferReply();

  // Generate transcript
  const transcript = await generateTranscript(interaction.channel, ticket);

  // Log transcript
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
        .setTimestamp().setFooter({ text: 'Keepa' });
      await logChannel.send({ embeds: [embed], files: [attachment] }).catch(err => logger.warn(`Transcript send failed: ${err.message}`));
    }
  }

  const now = nowUnixSeconds();
  await query("UPDATE tickets SET status = 'closed', closed_at = $1 WHERE id = $2", [now, ticket.id]);

  await interaction.editReply({ embeds: [successEmbed('Ticket Closed', 'This channel will be deleted in 5 seconds.')] });
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
    const attachments = m.attachments.map(a => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name || 'attachment')}</a>`).join(' ');
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

module.exports = { createTicket, closeTicket };
