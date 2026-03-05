import { Logger } from "../util/logger";
import { Rand } from "../util/rand";
import { Chunk, Music, SoundManager as BaseSoundManager } from "../util/sdl/sound";

/**
 * Manage BGMs and SEs.
 */
export class SoundManager extends BaseSoundManager {
  private static readonly seFileName = [
    "shot.wav",
    "lance.wav",
    "hit.wav",
    "turret_destroyed.wav",
    "destroyed.wav",
    "small_destroyed.wav",
    "explode.wav",
    "ship_destroyed.wav",
    "ship_shield_lost.wav",
    "score_up.wav",
  ];

  private static readonly seChannel = [0, 1, 2, 3, 4, 5, 6, 7, 7, 6];
  private static readonly bgmFileName = ["gr0.ogg", "gr1.ogg", "gr2.ogg", "gr3.ogg"];
  private static readonly RANDOM_BGM_START_INDEX = 1;

  private static bgm: Record<string, Music> = {};
  private static se: Record<string, Chunk> = {};
  private static seMark: Record<string, boolean> = {};
  private static rand = new Rand();
  private static currentBgm: string | null = null;
  private static prevBgmIdx = 0;
  private static nextIdxMv = 1;
  private static bgmDisabled = false;
  private static seDisabled = false;

  public static setRandSeed(seed: number): void {
    SoundManager.rand.setSeed(seed);
  }

  public static loadSounds(): void {
    SoundManager.loadMusics();
    SoundManager.loadChunks();
    SoundManager.rand = new Rand();
  }

  private static loadMusics(): void {
    SoundManager.bgm = {};
    for (const fileName of SoundManager.bgmFileName) {
      const music = new Music();
      music.load(fileName);
      SoundManager.bgm[fileName] = music;
      Logger.info(`Load bgm: ${fileName}`);
    }
  }

  private static loadChunks(): void {
    SoundManager.se = {};
    SoundManager.seMark = {};
    for (let i = 0; i < SoundManager.seFileName.length; i++) {
      const fileName = SoundManager.seFileName[i];
      const chunk = new Chunk();
      chunk.load(fileName, SoundManager.seChannel[i] ?? 0);
      SoundManager.se[fileName] = chunk;
      SoundManager.seMark[fileName] = false;
      Logger.info(`Load SE: ${fileName}`);
    }
  }

  public static playBgm(name?: string): void {
    if (!name) {
      const span = Math.max(1, SoundManager.bgmFileName.length - SoundManager.RANDOM_BGM_START_INDEX);
      const bgmIdx = SoundManager.rand.nextInt(span) + SoundManager.RANDOM_BGM_START_INDEX;
      SoundManager.nextIdxMv = SoundManager.rand.nextInt(2) * 2 - 1;
      SoundManager.prevBgmIdx = bgmIdx;
      SoundManager.playBgm(SoundManager.bgmFileName[bgmIdx]);
      return;
    }
    SoundManager.currentBgm = name;
    if (SoundManager.bgmDisabled) return;
    Music.haltMusic();
    SoundManager.bgm[name]?.play();
  }

  public static nextBgm(): void {
    const len = SoundManager.bgmFileName.length;
    if (len <= SoundManager.RANDOM_BGM_START_INDEX) return;
    let bgmIdx = SoundManager.prevBgmIdx + SoundManager.nextIdxMv;
    if (bgmIdx < SoundManager.RANDOM_BGM_START_INDEX) bgmIdx = len - 1;
    else if (bgmIdx >= len) bgmIdx = SoundManager.RANDOM_BGM_START_INDEX;
    SoundManager.prevBgmIdx = bgmIdx;
    SoundManager.playBgm(SoundManager.bgmFileName[bgmIdx]);
  }

  public static playCurrentBgm(): void {
    if (!SoundManager.currentBgm) {
      SoundManager.playBgm();
      return;
    }
    SoundManager.playBgm(SoundManager.currentBgm);
  }

  public static fadeBgm(): void {
    Music.fadeMusic();
  }

  public static haltBgm(): void {
    Music.haltMusic();
  }

  public static playSe(name: string): void {
    if (SoundManager.seDisabled) return;
    if (name in SoundManager.seMark) SoundManager.seMark[name] = true;
  }

  public static playMarkedSe(): void {
    for (const key of Object.keys(SoundManager.seMark)) {
      if (!SoundManager.seMark[key]) continue;
      SoundManager.se[key]?.play();
      SoundManager.seMark[key] = false;
    }
  }

  public static disableSe(): void {
    SoundManager.seDisabled = true;
  }

  public static enableSe(): void {
    SoundManager.seDisabled = false;
  }

  public static disableBgm(): void {
    SoundManager.bgmDisabled = true;
  }

  public static enableBgm(): void {
    SoundManager.bgmDisabled = false;
  }
}
