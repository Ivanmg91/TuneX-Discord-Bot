'use strict';

module.exports = {
  name: 'interactionCreate',

  /** @param {import('discord.js').Interaction} interaction */
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`[Commands] Comando desconocido: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[Commands] Error en /${interaction.commandName}:`, err);

      const payload = {
        content: '❌ Ocurrió un error al ejecutar este comando.',
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(console.error);
      } else {
        await interaction.reply(payload).catch(console.error);
      }
    }
  },
};
