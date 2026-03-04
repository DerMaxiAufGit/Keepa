const { SlashCommandBuilder, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { successEmbed, errorEmbed, Colors } = require('../../utils/embeds');
const { query } = require('../../utils/db');
const { getTemplate, resolvePlaceholders } = require('../../utils/ticketTemplates');
const logger = require('../../utils/logger');

const SUPPORT_ROLE_COLOR = 0x3498db;
const SUPPORT_ROLE_NAME = 'Ticket Support';
const CATEGORY_NAME = 'Support Tickets';
const CHANNEL_NAME = 'support';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('One-command ticket system setup: creates role, category, channel, and panel'),
  permissions: ['ManageGuild'],
  botPermissions: ['ManageChannels', 'ManageRoles'],

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const created = [];

    // 1. Find or create support role
    let supportRole = guild.roles.cache.find(r => r.name === SUPPORT_ROLE_NAME);
    if (!supportRole) {
      try {
        supportRole = await guild.roles.create({
          name: SUPPORT_ROLE_NAME,
          color: SUPPORT_ROLE_COLOR,
          reason: 'Ticket system setup',
        });
        created.push(`Role: **${supportRole.name}**`);
      } catch (err) {
        logger.error(`Ticket setup role creation failed: ${err.message}`);
        return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not create the support role. Check bot permissions.')] });
      }
    } else {
      created.push(`Role: **${supportRole.name}** (existing)`);
    }

    // 2. Find or create category
    let category = guild.channels.cache.find(c => c.name === CATEGORY_NAME && c.type === ChannelType.GuildCategory);
    if (!category) {
      try {
        category = await guild.channels.create({
          name: CATEGORY_NAME,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: supportRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
          ],
        });
        created.push(`Category: **${category.name}**`);
      } catch (err) {
        logger.error(`Ticket setup category creation failed: ${err.message}`);
        return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not create the category. Check bot permissions.')] });
      }
    } else {
      created.push(`Category: **${category.name}** (existing)`);
    }

    // 3. Find or create #support channel
    let supportChannel = guild.channels.cache.find(
      c => c.name === CHANNEL_NAME && c.parentId === category.id && c.type === ChannelType.GuildText
    );
    if (!supportChannel) {
      try {
        supportChannel = await guild.channels.create({
          name: CHANNEL_NAME,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] },
            { id: supportRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
          ],
        });
        created.push(`Channel: ${supportChannel}`);
      } catch (err) {
        logger.error(`Ticket setup channel creation failed: ${err.message}`);
        return interaction.editReply({ embeds: [errorEmbed('Error', 'Could not create the support channel. Check bot permissions.')] });
      }
    } else {
      created.push(`Channel: ${supportChannel} (existing)`);
    }

    // 4. Upsert ticket_config
    const supportRolesJson = JSON.stringify([supportRole.id]);
    await query(
      `INSERT INTO ticket_config (guild_id, enabled, category_id, support_roles)
       VALUES ($1, 1, $2, $3)
       ON CONFLICT (guild_id) DO UPDATE SET enabled = 1, category_id = $2, support_roles = $3`,
      [guild.id, category.id, supportRolesJson]
    );

    // 5. Post panel embed
    const template = await getTemplate(guild.id, 'panel');
    const ctx = { server: guild.name };

    const panelEmbed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(resolvePlaceholders(template.title, ctx))
      .setDescription(resolvePlaceholders(template.content, ctx))
      .setFooter({ text: 'Keepa' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_ticket').setLabel('Create Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
    );

    try {
      await supportChannel.send({ embeds: [panelEmbed], components: [row] });
      created.push('Panel embed posted');
    } catch (err) {
      logger.error(`Ticket setup panel send failed: ${err.message}`);
      created.push('Panel embed failed to send');
    }

    // 6. Reply summary
    const summary = created.map(item => `• ${item}`).join('\n');
    await interaction.editReply({
      embeds: [successEmbed('Ticket System Setup Complete', `${summary}\n\nThe ticket system is now active.`)],
    });
  },
};
