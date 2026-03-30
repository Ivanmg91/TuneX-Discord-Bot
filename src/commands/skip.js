'use strict';

const { SlashCommandBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta la canción actual y reproduce la siguiente de la cola'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);

    if (!player || !player.getCurrentSong()) {
      return interaction.reply({
        content: '❌ No hay ninguna canción reproduciéndose ahora mismo.',
        ephemeral: true,
      });
    }

    const skipped = player.getCurrentSong();
    player.skip();

    return interaction.reply(
      `⏭️ Saltada: **${skipped.title || 'Desconocido'}**`
    );
  },
};
