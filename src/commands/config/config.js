const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { getGuildConfig, setGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Server configuration')
    .addSubcommand(s => s.setName('view').setDescription('View current config'))
    .addSubcommand(s => s.setName('minaccountage').setDescription('Set minimum account age')
      .addIntegerOption(o => o.setName('seconds').setDescription('Age in seconds (0 to disable)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s.setName('antiraid').setDescription('Configure anti-raid')
      .addStringOption(o => o.setName('toggle').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }))
      .addIntegerOption(o => o.setName('threshold').setDescription('Join threshold'))
      .addIntegerOption(o => o.setName('window').setDescription('Window in seconds')))
    .addSubcommand(s => s.setName('verificationrole').setDescription('Set verification role')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const c = await getGuildConfig(interaction.guildId);
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Server Configuration')
        .addFields(
          { name: 'Mod Log', value: c.mod_log_channel ? `<#${c.mod_log_channel}>` : 'Not set', inline: true },
          { name: 'Member Log', value: c.member_log_channel ? `<#${c.member_log_channel}>` : 'Not set', inline: true },
          { name: 'Message Log', value: c.message_log_channel ? `<#${c.message_log_channel}>` : 'Not set', inline: true },
          { name: 'Welcome', value: c.welcome_channel ? `<#${c.welcome_channel}>` : 'Not set', inline: true },
          { name: 'Goodbye', value: c.goodbye_channel ? `<#${c.goodbye_channel}>` : 'Not set', inline: true },
          { name: 'Min Account Age', value: `${c.min_account_age}s`, inline: true },
          { name: 'Anti-Raid', value: c.anti_raid_enabled ? `Enabled (${c.anti_raid_threshold} in ${c.anti_raid_window}s)` : 'Disabled', inline: true },
          { name: 'Verification Role', value: c.verification_role ? `<@&${c.verification_role}>` : 'Not set', inline: true },
          { name: 'Phishing Filter', value: c.phishing_filter ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Invite Filter', value: c.invite_filter ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Spam Filter', value: c.spam_enabled ? `Enabled (${c.spam_threshold} msgs)` : 'Disabled', inline: true },
          { name: 'Caps Filter', value: c.caps_enabled ? `Enabled (${c.caps_threshold}%)` : 'Disabled', inline: true }
        )
        .setFooter({ text: 'Keepa' }).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'minaccountage') {
      const seconds = interaction.options.getInteger('seconds');
      await setGuildConfig(interaction.guildId, 'min_account_age', seconds);
      return interaction.reply({ embeds: [successEmbed('Config Updated', seconds === 0 ? 'Min account age disabled.' : `Min account age set to **${seconds}** seconds.`)], ephemeral: true });
    }

    if (sub === 'antiraid') {
      const toggle = interaction.options.getString('toggle');
      const threshold = interaction.options.getInteger('threshold');
      const window = interaction.options.getInteger('window');

      await setGuildConfig(interaction.guildId, 'anti_raid_enabled', toggle === 'enable' ? 1 : 0);
      if (threshold) await setGuildConfig(interaction.guildId, 'anti_raid_threshold', threshold);
      if (window) await setGuildConfig(interaction.guildId, 'anti_raid_window', window);

      return interaction.reply({ embeds: [successEmbed('Anti-Raid Updated', `Anti-raid **${toggle}d**.${threshold ? ` Threshold: ${threshold}` : ''}${window ? ` Window: ${window}s` : ''}`)], ephemeral: true });
    }

    if (sub === 'verificationrole') {
      const role = interaction.options.getRole('role');
      await setGuildConfig(interaction.guildId, 'verification_role', role.id);
      return interaction.reply({ embeds: [successEmbed('Verification Role Set', `${role}`)], ephemeral: true });
    }
  },
};
