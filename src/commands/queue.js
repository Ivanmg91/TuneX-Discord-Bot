'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const playerManager = require('../music/MusicPlayer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra las canciones en la cola de reproducción'),

  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    const player = playerManager.get(interaction.guild.id);

    if (!player || (!player.getCurrentSong() && player.getQueue().length === 0)) {
      return interaction.reply({
        content: '❌ La cola está vacía.',
        ephemeral: true,
      });
    }

    const current = player.getCurrentSong();
    const queue = player.getQueue();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎶 Cola de reproducción');

    if (current) {
      embed.addFields({
        name: '▶️  Reproduciendo ahora',
        value: `**${current.title || 'Desconocido'}** — ${current.artist || 'Desconocido'}`,
      });
    }

    if (queue.length > 0) {
      const maxShow = 10;
      const lines = queue
        .slice(0, maxShow)
        .map(
          (s, i) =>
            `\`${i + 1}.\` **${s.title || 'Desconocido'}** — ${s.artist || 'Desconocido'}`
        )
        .join('\n');

      const extra = queue.length > maxShow ? `\n…y ${queue.length - maxShow} más` : '';
      embed.addFields({ name: '⏭️  Próximas canciones', value: lines + extra });
    }

    embed.setFooter({
      text: `${queue.length} canción(es) en cola${player.isLooping() ? ' • 🔁 Loop activo' : ''}`,
    });

    return interaction.reply({ embeds: [embed] });
  },
};
