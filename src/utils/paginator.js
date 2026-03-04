const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function paginate(interaction, pages, timeout = 120000) {
  if (pages.length === 0) return;
  if (pages.length === 1) {
    return interaction.editReply({ embeds: [pages[0]] });
  }

  let page = 0;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('paginate_prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('paginate_page').setLabel(`1/${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('paginate_next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pages.length <= 1)
  );

  const msg = await interaction.editReply({ embeds: [pages[0]], components: [row] });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: timeout,
  });

  collector.on('collect', async i => {
    if (i.customId === 'paginate_prev') page--;
    if (i.customId === 'paginate_next') page++;

    row.components[0].setDisabled(page === 0);
    row.components[1].setLabel(`${page + 1}/${pages.length}`);
    row.components[2].setDisabled(page === pages.length - 1);

    await i.update({ embeds: [pages[page]], components: [row] });
  });

  collector.on('end', () => {
    row.components.forEach(c => c.setDisabled(true));
    msg.edit({ components: [row] }).catch(() => {});
  });
}

module.exports = { paginate };
