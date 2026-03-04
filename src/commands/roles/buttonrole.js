const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

const styleMap = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buttonrole')
    .setDescription('Create a button role panel')
    .addSubcommand(s => s.setName('create').setDescription('Create a button role embed')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
      .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
      .addStringOption(o => o.setName('label1').setDescription('Button label 1').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description'))
      .addStringOption(o => o.setName('style1').setDescription('Style 1').addChoices(
        { name: 'Primary', value: 'primary' }, { name: 'Secondary', value: 'secondary' },
        { name: 'Success', value: 'success' }, { name: 'Danger', value: 'danger' }))
      .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
      .addStringOption(o => o.setName('label2').setDescription('Button label 2'))
      .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
      .addStringOption(o => o.setName('label3').setDescription('Button label 3'))
      .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
      .addStringOption(o => o.setName('label4').setDescription('Button label 4'))
      .addRoleOption(o => o.setName('role5').setDescription('Role 5'))
      .addStringOption(o => o.setName('label5').setDescription('Button label 5'))),
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description') || 'Click a button to toggle a role.';
    const db = getDb();

    const roles = [];
    for (let i = 1; i <= 5; i++) {
      const role = interaction.options.getRole(`role${i}`);
      const label = interaction.options.getString(`label${i}`);
      if (role && label) {
        const style = interaction.options.getString(`style${i === 1 ? '1' : ''}`) || 'primary';
        roles.push({ role, label, style });
      }
    }

    if (roles.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('No Roles', 'Provide at least one role.')], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: 'Keepa' });

    const row = new ActionRowBuilder();
    const buttons = [];

    for (let i = 0; i < roles.length; i++) {
      const { role, label, style } = roles[i];
      const customId = `role_${role.id}_${i}`;
      row.addComponents(
        new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(styleMap[style] || ButtonStyle.Primary)
      );
      buttons.push({ customId, roleId: role.id, label });
    }

    const msg = await channel.send({ embeds: [embed], components: [row] });

    for (const btn of buttons) {
      db.prepare(
        'INSERT INTO component_roles (guild_id, channel_id, message_id, custom_id, role_id, label) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(interaction.guildId, channel.id, msg.id, btn.customId, btn.roleId, btn.label);
    }

    await interaction.reply({ embeds: [successEmbed('Button Roles Created', `Panel posted in ${channel}.`)], ephemeral: true });
  },
};
