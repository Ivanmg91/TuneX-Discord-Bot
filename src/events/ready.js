'use strict';

module.exports = {
  name: 'ready',
  once: true,

  /** @param {import('discord.js').Client} client */
  execute(client) {
    console.log(`[Bot] Conectado como ${client.user.tag}`);
    client.user.setActivity('/play <canción>', { type: 2 /* LISTENING */ });
  },
};
