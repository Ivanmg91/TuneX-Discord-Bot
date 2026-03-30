'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Muestra información sobre la canción que se está reproduciendo'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);
    const song = player?.getCurrentSong();

    if (!song) {
      return interaction.reply({
        content: '❌ No hay ninguna canción reproduciéndose ahora mismo.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎵 Reproduciendo ahora')
      .setDescription(`**${song.title || 'Desconocido'}**`)
      .addFields(
        { name: 'Artista', value: song.artist || 'Desconocido', inline: true },
        { name: 'Álbum', value: song.album || '—', inline: true },
        { name: 'Duración', value: song.duration || '—', inline: true },
        { name: 'Género', value: song.genre || '—', inline: true },
        {
          name: 'Loop',
          value: player.isLooping() ? '🔁 Activo' : 'Desactivado',
          inline: true,
        }
      );

    if (song.coverUrl || song.thumbnailUrl) {
      embed.setThumbnail(song.coverUrl || song.thumbnailUrl);
    }

    return interaction.reply({ embeds: [embed] });
  },
};
