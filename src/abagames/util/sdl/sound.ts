/*
 * $Id: sound.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { SDLException, SDLInitFailedException } from "./sdlexception";

/**
 * Initialize and close SDL_mixer.
 */
export class SoundManager {
  public static noSound = false;
  private static audioContext: AudioContext | null = null;
  private static unlocked = false;
  private static unlockHandlersBound = false;

  public static init(): void {
    if (SoundManager.noSound) return;
    if (typeof AudioContext === "undefined") return;
    try {
      if (!SoundManager.audioContext) SoundManager.audioContext = new AudioContext();
      SoundManager.bindUnlockHandlers();
    } catch {
      SoundManager.noSound = true;
      throw new SDLInitFailedException("Unable to initialize audio");
    }
  }

  public static close(): void {
    if (SoundManager.noSound) return;
    if (!SoundManager.audioContext) return;
    void SoundManager.audioContext.suspend();
  }

  public static getContext(): AudioContext | null {
    return SoundManager.audioContext;
  }

  public static unlock(): void {
    if (!SoundManager.audioContext || SoundManager.unlocked) return;
    const ctx = SoundManager.audioContext;
    void ctx.resume().finally(() => {
      SoundManager.unlocked = ctx.state === "running";
    });
  }

  private static bindUnlockHandlers(): void {
    if (SoundManager.unlockHandlersBound || typeof window === "undefined") return;
    SoundManager.unlockHandlersBound = true;
    const unlock = (): void => {
      SoundManager.unlock();
      if (SoundManager.unlocked) {
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      }
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
}

/**
 * Music / Chunk.
 */
export interface Sound {
  load(name: string): void;
  load(name: string, ch: number): void;
  free(): void;
  play(): void;
  fade(): void;
  halt(): void;
}

export class Music implements Sound {
  public static fadeOutSpeed = 1280;
  public static dir = "sounds/musics";
  private static active = new Set<Music>();
  private audio: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private music: string | null = null;

  public load(name: string): void;
  public load(name: string, _ch: number): void;
  public load(name: string): void {
    if (SoundManager.noSound) return;
    const fileName = `${Music.dir}/${name}`;
    this.music = fileName;
    if (typeof Audio !== "undefined") {
      this.audio = new Audio(fileName);
      this.audio.preload = "auto";
      this.audio.loop = true;
      const ctx = SoundManager.getContext();
      if (ctx) {
        this.source = ctx.createMediaElementSource(this.audio);
        this.gain = ctx.createGain();
        this.gain.gain.value = 1;
        this.source.connect(this.gain);
        this.gain.connect(ctx.destination);
      }
    } else if (!this.music) {
      throw new SDLException(`Couldn't load: ${fileName}`);
    }
  }

  public free(): void {
    this.halt();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
    this.audio = null;
    this.music = null;
  }

  public play(): void {
    if (SoundManager.noSound) return;
    SoundManager.unlock();
    if (!this.audio) return;
    this.audio.loop = true;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => {
      // Missing/unsupported audio source should not break gameplay loop.
    });
    Music.active.add(this);
  }

  public playOnce(): void {
    if (SoundManager.noSound) return;
    SoundManager.unlock();
    if (!this.audio) return;
    this.audio.loop = false;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => {
      // Missing/unsupported audio source should not break gameplay loop.
    });
    Music.active.add(this);
  }

  public fade(): void {
    Music.fadeMusic();
  }

  public halt(): void {
    Music.haltMusic();
  }

  public static fadeMusic(): void {
    if (SoundManager.noSound) return;
    const ctx = SoundManager.getContext();
    if (ctx) {
      const now = ctx.currentTime;
      for (const m of Music.active) {
        if (!m.gain) continue;
        m.gain.gain.cancelScheduledValues(now);
        m.gain.gain.setValueAtTime(m.gain.gain.value, now);
        m.gain.gain.linearRampToValueAtTime(0, now + 0.4);
      }
      return;
    }
    for (const m of Music.active) {
      if (!m.audio) continue;
      m.audio.volume = Math.max(0, m.audio.volume - 0.3);
    }
  }

  public static haltMusic(): void {
    if (SoundManager.noSound) return;
    for (const m of Music.active) {
      if (!m.audio) continue;
      m.audio.pause();
      m.audio.currentTime = 0;
      m.audio.volume = 1;
      if (m.gain) m.gain.gain.value = 1;
    }
    Music.active.clear();
  }
}

export class Chunk implements Sound {
  public static dir = "sounds/chunks";
  private static bufferCache = new Map<string, Promise<AudioBuffer | null>>();
  private chunk: string | null = null;
  private buffer: AudioBuffer | null = null;
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly maxPlayers = 8;
  private chunkChannel = 0;
  private pendingPlay = false;

  public load(name: string): void;
  public load(name: string, ch: number): void;
  public load(name: string, ch = 0): void {
    if (SoundManager.noSound) return;
    const fileName = `${Chunk.dir}/${name}`;
    this.chunk = fileName;
    this.chunkChannel = ch;
    this.buffer = null;
    this.activeSources.clear();
    this.pendingPlay = false;
    void this.decodeChunk(fileName);
  }

  public free(): void {
    if (this.chunk) {
      this.halt();
      this.chunk = null;
      this.buffer = null;
      this.pendingPlay = false;
    }
  }

  public play(): void {
    if (SoundManager.noSound) return;
    SoundManager.unlock();
    if (!this.chunk) return;
    const ctx = SoundManager.getContext();
    if (!ctx) return;
    if (!this.buffer) {
      this.pendingPlay = true;
      void this.decodeChunk(this.chunk);
      return;
    }
    this.playWithBuffer(ctx);
    void this.chunkChannel;
  }

  private playWithBuffer(ctx: AudioContext): void {
    if (!this.buffer) return;
    if (this.activeSources.size >= this.maxPlayers) {
      const oldest = this.activeSources.values().next().value as AudioBufferSourceNode | undefined;
      oldest?.stop();
    }
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(ctx.destination);
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      source.disconnect();
    };
    source.start(0);
  }

  public halt(): void {
    if (SoundManager.noSound) return;
    for (const s of this.activeSources) {
      s.stop();
      s.disconnect();
    }
    this.activeSources.clear();
  }

  public fade(): void {
    this.halt();
  }

  private async decodeChunk(fileName: string): Promise<void> {
    const ctx = SoundManager.getContext();
    if (!ctx) return;
    let p = Chunk.bufferCache.get(fileName);
    if (!p) {
      p = fetch(fileName)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new SDLException(`Couldn't load: ${fileName}`))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      Chunk.bufferCache.set(fileName, p);
    }
    const decoded = await p;
    if (this.chunk === fileName) {
      this.buffer = decoded;
      if (decoded && this.pendingPlay) {
        this.pendingPlay = false;
        const ctx2 = SoundManager.getContext();
        if (ctx2) this.playWithBuffer(ctx2);
      }
    }
  }
}
