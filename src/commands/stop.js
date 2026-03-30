'use strict';

const { SlashCommandBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la reproducción, vacía la cola y desconecta al bot'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);

    if (!player) {
      return interaction.reply({
        content: '❌ El bot no está en ningún canal de voz.',
        ephemeral: true,
      });
    }

    player.stop();
    return interaction.reply('⏹️ Reproducción detenida y cola vaciada.');
  },
};
