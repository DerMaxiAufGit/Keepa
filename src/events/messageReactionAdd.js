const { query } = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  async execute(reaction, user, client) {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const { rows } = await query(
      'SELECT role_id, mode FROM reaction_roles WHERE message_id = $1 AND emoji = $2',
      [reaction.message.id, emoji]
    );
    const row = rows[0];

    if (!row) return;

    const guild = reaction.message.guild;
    if (!guild) return;

    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.add(row.role_id);
    } catch (err) {
      logger.error(`Reaction role add error: ${err.message}`);
    }
  },
};
