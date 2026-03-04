const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Ticket panel management')
    .addSubcommand(s => s.setName('create').setDescription('Create a ticket panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Embed title'))
      .addStringOption(o => o.setName('description').setDescription('Embed description')))
    .addSubcommand(s => s.setName('setup').setDescription('Configure ticket system')
      .addRoleOption(o => o.setName('support_role').setDescription('Support role'))
      .addChannelOption(o => o.setName('category').setDescription('Ticket category'))
      .addChannelOption(o => o.setName('log_channel').setDescription('Transcript channel'))
      .addIntegerOption(o => o.setName('max_open').setDescription('Max open tickets per user').setMinValue(1).setMaxValue(10))),
  permissions: ['ManageGuild'],
  botPermissions: ['ManageChannels'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const db = getDb();

    if (sub === 'setup') {
      const supportRole = interaction.options.getRole('support_role');
      const category = interaction.options.getChannel('category');
      const logChannel = interaction.options.getChannel('log_channel');
      const maxOpen = interaction.options.getInteger('max_open');

      // Ensure config exists
      db.prepare('INSERT OR IGNORE INTO ticket_config (guild_id) VALUES (?)').run(interaction.guildId);

      if (supportRole) {
        const current = db.prepare('SELECT support_roles FROM ticket_config WHERE guild_id = ?').get(interaction.guildId);
        const roles = JSON.parse(current.support_roles || '[]');
        if (!roles.includes(supportRole.id)) roles.push(supportRole.id);
        db.prepare('UPDATE ticket_config SET support_roles = ? WHERE guild_id = ?').run(JSON.stringify(roles), interaction.guildId);
      }
      if (category) db.prepare('UPDATE ticket_config SET category_id = ? WHERE guild_id = ?').run(category.id, interaction.guildId);
      if (logChannel) db.prepare('UPDATE ticket_config SET transcript_channel = ? WHERE guild_id = ?').run(logChannel.id, interaction.guildId);
      if (maxOpen) db.prepare('UPDATE ticket_config SET max_open = ? WHERE guild_id = ?').run(maxOpen, interaction.guildId);

      db.prepare('UPDATE ticket_config SET enabled = 1 WHERE guild_id = ?').run(interaction.guildId);

      return interaction.reply({ embeds: [successEmbed('Ticket System Configured', 'Ticket system is now enabled.')], ephemeral: true });
    }

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title') || 'Support Tickets';
      const description = interaction.options.getString('description') || 'Click the button below to create a support ticket.';

      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'Keepa' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );

      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ embeds: [successEmbed('Panel Created', `Ticket panel posted in ${channel}.`)], ephemeral: true });
    }
  },
};
