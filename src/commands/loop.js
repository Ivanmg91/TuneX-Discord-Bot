'use strict';

const { SlashCommandBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Activa o desactiva el loop de la canción actual'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);

    if (!player || !player.getCurrentSong()) {
      return interaction.reply({
        content: '❌ No hay ninguna canción reproduciéndose ahora mismo.',
        ephemeral: true,
      });
    }

    const newState = !player.isLooping();
    player.setLoop(newState);

    return interaction.reply(
      newState
        ? '🔁 Loop activado. La canción actual se repetirá al finalizar.'
        : '➡️ Loop desactivado.'
    );
  },
};
