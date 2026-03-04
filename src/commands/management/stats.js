const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { successEmbed } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Live stat counter channels')
    .addSubcommand(s => s.setName('create').setDescription('Create a stats channel')
      .addStringOption(o => o.setName('type').setDescription('Stat type').setRequired(true)
        .addChoices(
          { name: 'Members', value: 'members' },
          { name: 'Online', value: 'online' },
          { name: 'Bots', value: 'bots' },
          { name: 'Channels', value: 'channels' },
          { name: 'Roles', value: 'roles' }
        ))),
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const guild = interaction.guild;

    let count = 0;
    if (type === 'members') count = guild.memberCount;
    else if (type === 'online') count = guild.members.cache.filter(m => m.presence?.status === 'online').size;
    else if (type === 'bots') count = guild.members.cache.filter(m => m.user.bot).size;
    else if (type === 'channels') count = guild.channels.cache.size;
    else if (type === 'roles') count = guild.roles.cache.size;

    const name = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count.toLocaleString()}`;

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: ['Connect'] },
      ],
    });

    const db = getDb();
    db.prepare('INSERT INTO stats_channels (guild_id, channel_id, type) VALUES (?, ?, ?)')
      .run(interaction.guildId, channel.id, type);

    await interaction.reply({ embeds: [successEmbed('Stats Channel Created', `${channel} — updates every 10 minutes.`)], ephemeral: true });
  },
};
