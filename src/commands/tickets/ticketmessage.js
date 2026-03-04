const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { DEFAULT_TEMPLATES, VALID_MESSAGE_TYPES, getTemplate } = require('../../utils/ticketTemplates');

const TYPE_CHOICES = [
  { name: 'Panel', value: 'panel' },
  { name: 'Welcome', value: 'welcome' },
  { name: 'Close', value: 'close' },
  { name: 'Re-open', value: 'reopen' },
  { name: 'Claim', value: 'claim' },
  { name: 'Delete', value: 'delete' },
];

function addTypeOption(sub) {
  return sub.addStringOption(o =>
    o.setName('type').setDescription('Message type').setRequired(true)
      .addChoices(...TYPE_CHOICES)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketmessage')
    .setDescription('Customize ticket message templates')
    .addSubcommand(s => addTypeOption(s.setName('edit').setDescription('Edit a ticket message template')))
    .addSubcommand(s => addTypeOption(s.setName('view').setDescription('View a ticket message template')))
    .addSubcommand(s => addTypeOption(s.setName('reset').setDescription('Reset a template to default')))
    .addSubcommand(s => s.setName('list').setDescription('List all ticket message templates')),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'edit') {
      const type = interaction.options.getString('type');
      const current = await getTemplate(interaction.guildId, type);

      const modal = new ModalBuilder()
        .setCustomId(`ticket_msg_edit_${type}`)
        .setTitle(`Edit ${type} template`);

      const titleInput = new TextInputBuilder()
        .setCustomId('ticket_msg_title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setValue(current.title)
        .setMaxLength(256)
        .setRequired(true);

      const contentInput = new TextInputBuilder()
        .setCustomId('ticket_msg_content')
        .setLabel('Content')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(current.content)
        .setMaxLength(4000)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(contentInput)
      );

      return interaction.showModal(modal);
    }

    if (sub === 'view') {
      const type = interaction.options.getString('type');
      const { rows } = await query(
        'SELECT title, content FROM ticket_messages WHERE guild_id = $1 AND message_type = $2',
        [interaction.guildId, type]
      );
      const isCustom = rows.length > 0;
      const template = isCustom ? rows[0] : DEFAULT_TEMPLATES[type];
      const status = isCustom ? 'Custom' : 'Default';

      const embed = infoEmbed(
        `${type} Template (${status})`,
        `**Title:** ${template.title}\n\n**Content:**\n${template.content}`
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'reset') {
      const type = interaction.options.getString('type');
      await query(
        'DELETE FROM ticket_messages WHERE guild_id = $1 AND message_type = $2',
        [interaction.guildId, type]
      );
      return interaction.reply({
        embeds: [successEmbed('Template Reset', `The **${type}** template has been reset to default.`)],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const { rows } = await query(
        'SELECT message_type FROM ticket_messages WHERE guild_id = $1',
        [interaction.guildId]
      );
      const customTypes = new Set(rows.map(r => r.message_type));

      const lines = [...VALID_MESSAGE_TYPES].map(type => {
        const status = customTypes.has(type) ? '`Custom`' : '`Default`';
        return `• **${type}** — ${status}`;
      });

      return interaction.reply({
        embeds: [infoEmbed('Ticket Message Templates', lines.join('\n'))],
        ephemeral: true,
      });
    }
  },
};
