const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { paginate } = require('../../utils/paginator');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Manage word and link filters')
    .addSubcommand(s => s.setName('add').setDescription('Add a word filter')
      .addStringOption(o => o.setName('word').setDescription('Word/phrase').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Action').addChoices(
        { name: 'delete', value: 'delete' },
        { name: 'warn', value: 'warn' },
        { name: 'mute', value: 'mute' },
        { name: 'kick', value: 'kick' },
        { name: 'ban', value: 'ban' }
      )))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a word filter')
      .addStringOption(o => o.setName('word').setDescription('Word/phrase').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List word filters'))
    .addSubcommandGroup(g => g
      .setName('links')
      .setDescription('Manage link filters')
      .addSubcommand(s => s.setName('add').setDescription('Add a link filter')
        .addStringOption(o => o.setName('domain').setDescription('Domain').setRequired(true))
        .addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true)
          .addChoices({ name: 'blacklist', value: 'blacklist' }, { name: 'whitelist', value: 'whitelist' })))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a link filter')
        .addStringOption(o => o.setName('domain').setDescription('Domain').setRequired(true)))),
  permissions: ['ManageGuild'],
  botPermissions: ['ManageMessages'],

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'links') {
      if (sub === 'add') {
        const domain = interaction.options.getString('domain').toLowerCase();
        const mode = interaction.options.getString('mode');
        // Validate domain format
        if (!/^[a-z0-9.-]{1,253}$/.test(domain)) {
          return interaction.reply({ embeds: [errorEmbed('Invalid Domain', 'Please provide a valid domain (e.g. example.com).')], ephemeral: true });
        }
        try {
          await query('INSERT INTO filter_links (guild_id, domain, mode) VALUES ($1, $2, $3)', [interaction.guildId, domain, mode]);
          return interaction.reply({ embeds: [successEmbed('Link Filter Added', `\`${domain}\` added to **${mode}**.`)], ephemeral: true });
        } catch {
          return interaction.reply({ embeds: [errorEmbed('Already Exists', 'This domain is already filtered.')], ephemeral: true });
        }
      }
      if (sub === 'remove') {
        const domain = interaction.options.getString('domain').toLowerCase();
        const result = await query('DELETE FROM filter_links WHERE guild_id = $1 AND domain = $2', [interaction.guildId, domain]);
        if (result.rowCount === 0) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Domain not in filters.')], ephemeral: true });
        return interaction.reply({ embeds: [successEmbed('Link Filter Removed', `\`${domain}\` removed.`)], ephemeral: true });
      }
    }

    if (sub === 'add') {
      const word = interaction.options.getString('word').toLowerCase();
      const action = interaction.options.getString('action') || 'delete';
      try {
        await query('INSERT INTO filter_words (guild_id, word, action) VALUES ($1, $2, $3)', [interaction.guildId, word, action]);
        return interaction.reply({ embeds: [successEmbed('Word Filter Added', `\`${word}\` → **${action}**`)], ephemeral: true });
      } catch {
        return interaction.reply({ embeds: [errorEmbed('Already Exists', 'This word is already filtered.')], ephemeral: true });
      }
    }

    if (sub === 'remove') {
      const word = interaction.options.getString('word').toLowerCase();
      const result = await query('DELETE FROM filter_words WHERE guild_id = $1 AND word = $2', [interaction.guildId, word]);
      if (result.rowCount === 0) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Word not in filters.')], ephemeral: true });
      return interaction.reply({ embeds: [successEmbed('Word Filter Removed', `\`${word}\` removed.`)], ephemeral: true });
    }

    if (sub === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const { rows: words } = await query('SELECT word, action FROM filter_words WHERE guild_id = $1 LIMIT 500', [interaction.guildId]);
      const { rows: links } = await query('SELECT domain, mode FROM filter_links WHERE guild_id = $1 LIMIT 500', [interaction.guildId]);

      if (words.length === 0 && links.length === 0) {
        return interaction.editReply({ embeds: [errorEmbed('No Filters', 'No filters configured.')] });
      }

      const items = [];
      words.forEach(w => items.push(`Word: \`${w.word}\` → **${w.action}**`));
      links.forEach(l => items.push(`Link: \`${l.domain}\` — **${l.mode}**`));

      const perPage = 15;
      const pages = [];
      for (let i = 0; i < items.length; i += perPage) {
        pages.push(new EmbedBuilder().setColor(Colors.INFO).setTitle('Filters').setDescription(items.slice(i, i + perPage).join('\n')).setFooter({ text: 'Keepa' }));
      }
      await paginate(interaction, pages);
    }
  },
};
