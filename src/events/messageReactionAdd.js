const { getDb } = require('../utils/db');
const logger = require('../utils/logger');

module.exports = {
  async execute(reaction, user, client) {
    if (user.bot) return;
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }

    const db = getDb();
    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const row = db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND emoji = ?')
      .get(reaction.message.id, emoji);

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
