'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { initFirebase } = require('./services/firebase');

// ── Ensure required env vars are present ───────────────────────────────────
const required = ['DISCORD_TOKEN', 'FIREBASE_STORAGE_BUCKET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[Config] Falta la variable de entorno: ${key}. Revisa tu archivo .env (copia .env.example como punto de partida).`);
    process.exit(1);
  }
}

// ── Initialise Firebase ────────────────────────────────────────────────────
initFirebase();

// ── Discord client ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// ── Load commands ──────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  if (!command.data || !command.execute) {
    console.warn(`[Commands] ${file} no tiene 'data' o 'execute'. Se omitirá.`);
    continue;
  }
  client.commands.set(command.data.name, command);
}

console.log(`[Commands] ${client.commands.size} comando(s) cargado(s).`);

// ── Load events ────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');

for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  const handler = (...args) => event.execute(...args);

  if (event.once) {
    client.once(event.name, handler);
  } else {
    client.on(event.name, handler);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
