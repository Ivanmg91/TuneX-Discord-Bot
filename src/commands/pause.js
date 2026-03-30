'use strict';

const { SlashCommandBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pausa o reanuda la canción actual'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);

    if (!player || !player.getCurrentSong()) {
      return interaction.reply({
        content: '❌ No hay ninguna canción reproduciéndose ahora mismo.',
        ephemeral: true,
      });
    }

    const result = player.togglePause();

    if (result === 'paused') {
      return interaction.reply('⏸️ Reproducción pausada.');
    }
    if (result === 'resumed') {
      return interaction.reply('▶️ Reproducción reanudada.');
    }
    return interaction.reply({
      content: '❌ No se pudo pausar/reanudar en este momento.',
      ephemeral: true,
    });
  },
};
