'use strict';

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
} = require('@discordjs/voice');
const { getSongUrl } = require('../services/firebase');
const prism = require('prism-media');
const { request } = require('undici');

// ─── Per-Guild Player ────────────────────────────────────────────────────────

class GuildMusicPlayer {
  /**
   * @param {import('discord.js').Guild} guild
   */
  constructor(guild) {
    this.guild = guild;
    this.queue = [];
    this.currentSong = null;
    this.connection = null;
    this.textChannel = null;
    this.loop = false;

    this.player = createAudioPlayer();

    this.player.on(AudioPlayerStatus.Idle, () => {
      this._playNext().catch(console.error);
    });

    this.player.on('error', (err) => {
      console.error(`[Player][guild:${guild.id}] ${err.message}`);
      this._playNext().catch(console.error);
    });
  }

  // ── Connection ─────────────────────────────────────────────────────────────

      async join(voiceChannel) {
        console.log(`[Voice][${this.guild.id}] joining ${voiceChannel.id}`);

        // Si hay una conexión previa, destrúyela para evitar estados raros.
        if (this.connection) {
          try { this.connection.destroy(); } catch {}
          this.connection = null;
        }

        this.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
        });

        this.connection.on('stateChange', (oldState, newState) => {
          console.log(`[Voice][${this.guild.id}] state ${oldState.status} -> ${newState.status}`);
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
          console.warn(`[Voice][${this.guild.id}] disconnected, trying to recover...`);
          try {
            await Promise.race([
              entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            console.log(`[Voice][${this.guild.id}] recovered from disconnect.`);
          } catch {
            console.warn(`[Voice][${this.guild.id}] could not recover, destroying.`);
            this.destroy();
          }
        });

        this.connection.subscribe(this.player);

        // Espera más tiempo. Si aun así no llega a Ready, lo tratamos como fallo.
        try {
          await entersState(this.connection, VoiceConnectionStatus.Ready, 60_000);
          console.log(`[Voice][${this.guild.id}] connection is Ready`);
        } catch (err) {
          console.error(`[Voice][${this.guild.id}] failed to enter Ready state:`, err);
          // Aquí SÍ destruimos y lanzamos: si no está Ready, no va a sonar nunca.
          this.destroy();
          throw err;
        }
      }

  // ── Playback ───────────────────────────────────────────────────────────────

  /**
   * Add a song to the queue and start playback if idle.
   *
   * @param {Object}                          song
   * @param {import('discord.js').VoiceBasedChannel} voiceChannel
   * @param {import('discord.js').TextChannel}       textChannel
   */
  async addSong(song, voiceChannel, textChannel) {
    this.textChannel = textChannel;
    this.queue.push(song);

    const isIdle = this.player.state.status === AudioPlayerStatus.Idle;

    if (!this.connection) {
      try {
        await this.join(voiceChannel);
      } catch (e) {
        this._send('❌ No puedo conectarme al canal de voz (conexión no llegó a READY).');
        throw e;
      }
    }

    if (isIdle) {
      await this._playNext();
    }
  }

  async _playNext() {
    if (this.loop && this.currentSong) {
      this.queue.unshift(this.currentSong);
    }

    if (this.queue.length === 0) {
      this.currentSong = null;
      this._send('✅ Cola vacía. Desconectando en 5 segundos…');
      setTimeout(() => this.destroy(), 5_000);
      return;
    }

    this.currentSong = this.queue.shift();

    try {
      const url = await getSongUrl(this.currentSong);
      console.log(`[Player][${this.guild.id}] Playing URL: ${url}`);

      const { body } = await request(url);

      // FFmpeg: MP3/lo-que-sea -> PCM 48kHz stereo
      const ffmpeg = new prism.FFmpeg({
        args: [
          '-analyzeduration', '0',
          '-loglevel', '0',
          '-i', 'pipe:0',
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
        ],
      });

      const pcmStream = body.pipe(ffmpeg);

      // Crea recurso como RAW PCM
      const resource = createAudioResource(pcmStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      resource.volume?.setVolume(0.8);
      this.player.play(resource);
      console.log(`[Player][${this.guild.id}] Resource started`);

      const title = this.currentSong.title || 'Desconocido';
      const artist = this.currentSong.artist || 'Desconocido';
      this._send(`🎵 Reproduciendo: **${title}** — ${artist}`);
    } catch (err) {
      console.error(`[Player] Error al reproducir: ${err.message}`);
      this._send(`❌ Error al reproducir **${this.currentSong.title}**. Saltando…`);
      await this._playNext();
    }
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  skip() {
    this.player.stop(true);
  }

  /**
   * Toggle pause/resume.
   * @returns {'paused'|'resumed'|'idle'}
   */
  togglePause() {
    const status = this.player.state.status;
    if (status === AudioPlayerStatus.Playing) {
      this.player.pause();
      return 'paused';
    }
    if (status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      return 'resumed';
    }
    return 'idle';
  }

  stop() {
    this.queue = [];
    this.currentSong = null;
    this.player.stop(true);
    this.destroy();
  }

  destroy() {
    if (this.connection) {
      try { this.connection.destroy(); } catch (err) {
        // Ignore 'already destroyed' errors; log anything unexpected
        if (!err.message?.includes('destroy')) console.error('[Player] destroy error:', err);
      }
      this.connection = null;
    }
    playerManager.delete(this.guild.id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _send(text) {
    this.textChannel?.send(text).catch(console.error);
  }

  getQueue() { return [...this.queue]; }
  getCurrentSong() { return this.currentSong; }
  isLooping() { return this.loop; }
  setLoop(value) { this.loop = value; }
}

// ─── Manager (singleton) ─────────────────────────────────────────────────────

class MusicPlayerManager {
  constructor() {
    /** @type {Map<string, GuildMusicPlayer>} */
    this.players = new Map();
  }

  /** @param {string} guildId */
  get(guildId) {
    return this.players.get(guildId);
  }

  /** @param {import('discord.js').Guild} guild */
  create(guild) {
    const player = new GuildMusicPlayer(guild);
    this.players.set(guild.id, player);
    return player;
  }

  /** @param {import('discord.js').Guild} guild */
  getOrCreate(guild) {
    return this.get(guild.id) ?? this.create(guild);
  }

  /** @param {string} guildId */
  delete(guildId) {
    this.players.delete(guildId);
  }
}

const playerManager = new MusicPlayerManager();
module.exports = playerManager;
