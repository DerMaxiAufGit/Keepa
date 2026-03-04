const { query } = require('./db');

const VALID_MESSAGE_TYPES = new Set([
  'panel', 'welcome', 'close', 'reopen', 'claim', 'delete',
]);

const DEFAULT_TEMPLATES = Object.freeze({
  panel: {
    title: 'Support Tickets',
    content: 'Click the button below to create a support ticket.',
  },
  welcome: {
    title: 'Ticket #{ticket}',
    content: 'Welcome {user}! A staff member will be with you shortly.\nPlease describe your issue and wait patiently.',
  },
  close: {
    title: 'Ticket Closed',
    content: 'This ticket was closed by {staff}.\nReason: {reason}',
  },
  reopen: {
    title: 'Ticket Re-opened',
    content: 'This ticket was re-opened by {user}.',
  },
  claim: {
    title: 'Ticket Claimed',
    content: 'This ticket has been claimed by {staff}.',
  },
  delete: {
    title: 'Ticket Deleted',
    content: 'This ticket will be deleted in 5 seconds.',
  },
});

async function getTemplate(guildId, messageType) {
  const { rows } = await query(
    'SELECT title, content FROM ticket_messages WHERE guild_id = $1 AND message_type = $2',
    [guildId, messageType]
  );
  if (rows.length > 0) return rows[0];
  return DEFAULT_TEMPLATES[messageType] || { title: messageType, content: '' };
}

function resolvePlaceholders(text, context) {
  if (!text) return text;
  return text
    .replace(/\{user\}/g, context.user ?? '{user}')
    .replace(/\{user\.tag\}/g, context.userTag ?? '{user.tag}')
    .replace(/\{ticket\}/g, context.ticket ?? '{ticket}')
    .replace(/\{channel\}/g, context.channel ?? '{channel}')
    .replace(/\{staff\}/g, context.staff ?? '{staff}')
    .replace(/\{reason\}/g, context.reason ?? '{reason}')
    .replace(/\{server\}/g, context.server ?? '{server}');
}

module.exports = { DEFAULT_TEMPLATES, VALID_MESSAGE_TYPES, getTemplate, resolvePlaceholders };
