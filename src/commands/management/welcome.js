const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, Colors } = require('../../utils/embeds');
const { getGuildConfig, setGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages')
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set welcome channel and message')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message ({user}, {user.mention}, {server}, {membercount})').setRequired(true).setMaxLength(1800)))
    .addSubcommand(s => s.setName('test').setDescription('Send a test welcome message'))
    .addSubcommand(s => s.setName('toggle').setDescription('Enable/disable welcome messages')),
  permissions: ['ManageGuild'],
  botPermissions: ['SendMessages'],

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      await setGuildConfig(interaction.guildId, 'welcome_channel', channel.id);
      await setGuildConfig(interaction.guildId, 'welcome_message', message);
      return interaction.reply({ embeds: [successEmbed('Welcome Set', `Channel: ${channel}\nMessage: ${message}`)], ephemeral: true });
    }

    if (sub === 'toggle') {
      const config = await getGuildConfig(interaction.guildId);
      const newVal = config.welcome_enabled ? 0 : 1;
      await setGuildConfig(interaction.guildId, 'welcome_enabled', newVal);
      return interaction.reply({ embeds: [successEmbed('Welcome Toggled', `Welcome messages are now **${newVal ? 'enabled' : 'disabled'}**.`)], ephemeral: true });
    }

    if (sub === 'test') {
      const config = await getGuildConfig(interaction.guildId);
      if (!config.welcome_channel || !config.welcome_message) {
        return interaction.reply({ content: 'Welcome not configured. Use `/welcome set` first.', ephemeral: true });
      }

      const channel = interaction.guild.channels.cache.get(config.welcome_channel);
      if (!channel) return interaction.reply({ content: 'Welcome channel not found.', ephemeral: true });

      const text = config.welcome_message
        .replace(/{user}/g, interaction.user.username)
        .replace(/{user\.mention}/g, `<@${interaction.user.id}>`)
        .replace(/{server}/g, interaction.guild.name)
        .replace(/{membercount}/g, interaction.guild.memberCount);

      if (config.welcome_embed) {
        await channel.send({ embeds: [new EmbedBuilder().setColor(Colors.SUCCESS).setDescription(text).setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: 'Keepa' })] });
      } else {
        await channel.send(text);
      }

      return interaction.reply({ content: 'Test welcome sent!', ephemeral: true });
    }
  },
};
