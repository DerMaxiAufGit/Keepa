const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getDb } = require('../utils/db');
const { errorEmbed, successEmbed, Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

async function createTicket(interaction, client) {
  const db = getDb();
  const config = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(interaction.guildId);

  if (!config || !config.enabled) {
    return interaction.reply({ embeds: [errorEmbed('Tickets Disabled', 'The ticket system is not configured.')], ephemeral: true });
  }

  // Check max open tickets
  const openCount = db.prepare(
    "SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'"
  ).get(interaction.guildId, interaction.user.id);

  if (openCount.count >= config.max_open) {
    return interaction.reply({ embeds: [errorEmbed('Limit Reached', `You can only have ${config.max_open} open ticket(s).`)], ephemeral: true });
  }

  // Create ticket channel
  const ticketNum = db.prepare('SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?').get(interaction.guildId).count + 1;
  const supportRoles = JSON.parse(config.support_roles || '[]');

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

    db.prepare(
      'INSERT INTO tickets (guild_id, channel_id, user_id) VALUES (?, ?, ?)'
    ).run(interaction.guildId, channel.id, interaction.user.id);

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
  const db = getDb();
  const ticket = db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").get(interaction.channelId);

  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed('Not a Ticket', 'This is not an open ticket channel.')], ephemeral: true });
  }

  await interaction.deferReply();

  // Generate transcript
  const transcript = await generateTranscript(interaction.channel, ticket);

  // Log transcript
  const config = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(interaction.guildId);
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
      await logChannel.send({ embeds: [embed], files: [attachment] }).catch(() => {});
    }
  }

  const now = Math.floor(Date.now() / 1000);
  db.prepare("UPDATE tickets SET status = 'closed', closed_at = ? WHERE id = ?").run(now, ticket.id);

  await interaction.editReply({ embeds: [successEmbed('Ticket Closed', 'This channel will be deleted in 5 seconds.')] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

async function generateTranscript(channel, ticket) {
  let messages = [];
  let lastId;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    messages = messages.concat([...batch.values()]);
    lastId = batch.last().id;
  }

  messages.reverse();

  const rows = messages.map(m => {
    const time = new Date(m.createdTimestamp).toISOString();
    const author = m.author?.tag || m.author?.username || 'Unknown';
    const content = m.content || '';
    const attachments = m.attachments.map(a => `<a href="${a.url}">${a.name}</a>`).join(' ');
    return `<div class="msg"><span class="time">${time}</span> <strong>${escapeHtml(author)}</strong>: ${escapeHtml(content)} ${attachments}</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket #${ticket.id}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#36393f;color:#dcddde}
.msg{padding:4px 0;border-bottom:1px solid #40444b}.time{color:#72767d;font-size:0.8em}strong{color:#fff}a{color:#00b0f4}</style>
</head><body><h2>Ticket #${ticket.id}</h2><p>Opened by: ${ticket.user_id}</p><hr>${rows}</body></html>`;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { createTicket, closeTicket };
