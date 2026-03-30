'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { searchSongs } = require('../services/firebase');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Busca y reproduce una canción de tu biblioteca de Firebase')
    .addStringOption((opt) =>
      opt
        .setName('cancion')
        .setDescription('Nombre de la canción o artista')
        .setRequired(true)
    ),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const query = interaction.options.getString('cancion');
    const voiceChannel = interaction.member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Debes estar en un canal de voz para reproducir música.',
        ephemeral: true,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!voiceChannel.permissionsFor(botMember).has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      return interaction.reply({
        content: '❌ No tengo permisos para unirme o hablar en tu canal de voz.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const songs = await searchSongs(query);

      if (songs.length === 0) {
        return interaction.editReply(
          `❌ No se encontró ninguna canción con: **${query}**`
        );
      }

      const song = songs[0];
      const player = playerManager.getOrCreate(interaction.guild);
      await player.addSong(song, voiceChannel, interaction.channel);

      const queuePos =
        player.getQueue().length + (player.getCurrentSong() ? 1 : 0);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎵 Añadida a la cola')
        .setDescription(`**${song.title || 'Desconocido'}**`)
        .addFields(
          {
            name: 'Artista',
            value: song.artist || 'Desconocido',
            inline: true,
          },
          {
            name: 'Duración',
            value: song.duration || '—',
            inline: true,
          },
          {
            name: 'Posición en cola',
            value: `#${queuePos}`,
            inline: true,
          }
        );

      if (song.coverUrl || song.thumbnailUrl) {
        embed.setThumbnail(song.coverUrl || song.thumbnailUrl);
      }

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[/play]', err);
      return interaction.editReply(`❌ Error: ${err.message}`);
    }
  },
};
