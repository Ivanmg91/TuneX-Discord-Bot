'use strict';

const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const { getSongUrl } = require('../services/firebase');

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

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(`[Voice][${this.guild.id}] disconnected, trying to recover...`);
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        console.log(`[Voice][${this.guild.id}] reconnected after disconnect.`);
      } catch {
        console.warn(`[Voice][${this.guild.id}] could not reconnect, destroying connection.`);
        this.destroy();
      }
    });

    this.connection.subscribe(this.player);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 40_000);
      console.log(`[Voice][${this.guild.id}] connection is Ready`);
    } catch (err) {
      // IMPORTANTE: ya no lanzamos ni destruimos aquí,
      // solo avisamos y dejamos que la conexión intente seguir.
      console.warn(`[Voice][${this.guild.id}] not Ready after 40s, will try to play anyway:`, err);
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
      await this.join(voiceChannel);
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

      const resource = createAudioResource(url, {
        inputType: StreamType.Arbitrary,
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
