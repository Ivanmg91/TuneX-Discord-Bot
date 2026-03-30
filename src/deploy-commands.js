'use strict';

/**
 * deploy-commands.js
 *
 * Registers slash commands with Discord's API.
 * Run this script once whenever you add or change commands:
 *
 *   node src/deploy-commands.js
 *
 * If DISCORD_GUILD_ID is set, commands are registered to that guild instantly.
 * Otherwise, they are registered globally (can take up to 1 hour to appear).
 */

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('[Deploy] DISCORD_TOKEN y DISCORD_CLIENT_ID son obligatorios en el .env');
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const { data } = require(path.join(commandsDir, file));
  if (data) commands.push(data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`[Deploy] Registrando ${commands.length} comando(s)…`);

    let route;
    if (guildId) {
      route = Routes.applicationGuildCommands(clientId, guildId);
      console.log(`[Deploy] Modo: Guild (${guildId}) — activo de inmediato`);
    } else {
      route = Routes.applicationCommands(clientId);
      console.log('[Deploy] Modo: Global — puede tardar hasta 1 hora');
    }

    const data = await rest.put(route, { body: commands });
    console.log(`[Deploy] ✅ ${data.length} comando(s) registrado(s) correctamente.`);
  } catch (err) {
    console.error('[Deploy] Error:', err);
    process.exit(1);
  }
})();
