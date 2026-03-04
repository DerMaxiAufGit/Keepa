const { SlashCommandBuilder } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');
const { setGuildConfig, getGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automod features')
    .addSubcommand(s => s.setName('invites').setDescription('Toggle invite filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })))
    .addSubcommand(s => s.setName('phishing').setDescription('Toggle phishing filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })))
    .addSubcommand(s => s.setName('spam').setDescription('Toggle spam detection')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Messages per 3 seconds')))
    .addSubcommand(s => s.setName('mentions').setDescription('Toggle mention spam')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Max mentions per message')))
    .addSubcommand(s => s.setName('caps').setDescription('Toggle caps filter')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Caps percentage (0-100)'))),
  permissions: ['ManageGuild'],
  botPermissions: ['ManageMessages'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const toggle = interaction.options.getString('toggle');
    const enabled = toggle === 'enable' ? 1 : 0;

    const map = {
      invites: { key: 'invite_filter' },
      phishing: { key: 'phishing_filter' },
      spam: { key: 'spam_enabled', thresholdKey: 'spam_threshold' },
      mentions: { key: 'mention_enabled', thresholdKey: 'mention_threshold' },
      caps: { key: 'caps_enabled', thresholdKey: 'caps_threshold' },
    };

    const entry = map[sub];
    setGuildConfig(interaction.guildId, entry.key, enabled);

    const threshold = interaction.options.getInteger('threshold');
    let extra = '';
    if (threshold && entry.thresholdKey) {
      setGuildConfig(interaction.guildId, entry.thresholdKey, threshold);
      extra = ` Threshold: ${threshold}`;
    }

    await interaction.reply({
      embeds: [successEmbed('AutoMod Updated', `**${sub}** filter **${toggle}d**.${extra}`)],
      ephemeral: true,
    });
  },
};
