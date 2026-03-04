const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Filter by user'))
    .addStringOption(o => o.setName('contains').setDescription('Filter by content substring')),
  permissions: ['ManageMessages'],
  botPermissions: ['ManageMessages'],

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    const contains = interaction.options.getString('contains');

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);
    if (user) messages = messages.filter(m => m.author.id === user.id);
    if (contains) messages = messages.filter(m => m.content.toLowerCase().includes(contains.toLowerCase()));

    const toDelete = [...messages.values()].slice(0, amount);
    if (toDelete.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed('No Messages', 'No messages matched the criteria.')] });
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await interaction.editReply({ embeds: [successEmbed('Messages Purged', `Deleted **${deleted.size}** messages.`)] });
  },
};
