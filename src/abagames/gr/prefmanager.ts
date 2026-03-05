/*
 * $Id: prefmanager.d,v 1.4 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

/**
 * Save/Load the high score.
 */
export class PrefManager {
  static readonly VERSION_NUM = 14;
  static readonly VERSION_NUM_13 = 13;
  private static readonly STORAGE_KEY = "gr.pref";

  private readonly _prefData: PrefData;

  public constructor() {
    this._prefData = new PrefData();
  }

  public load(): void {
    try {
      const raw = globalThis.localStorage?.getItem(PrefManager.STORAGE_KEY);
      if (!raw) {
        this._prefData.init();
        return;
      }
      const parsed = JSON.parse(raw) as {
        version?: number;
        highScore?: unknown;
        gameMode?: unknown;
      };
      const version = parsed.version;
      if (version === PrefManager.VERSION_NUM_13) {
        this._prefData.loadVer13(parsed.highScore, parsed.gameMode);
      } else if (version === PrefManager.VERSION_NUM) {
        this._prefData.load(parsed.highScore, parsed.gameMode);
      } else {
        this._prefData.init();
      }
    } catch {
      this._prefData.init();
    }
  }

  public save(): void {
    const payload = JSON.stringify({
      version: PrefManager.VERSION_NUM,
      highScore: this._prefData.exportHighScores(),
      gameMode: this._prefData.gameMode,
    });
    globalThis.localStorage?.setItem(PrefManager.STORAGE_KEY, payload);
  }

  public get prefData(): PrefData {
    return this._prefData;
  }
}

export class PrefData {
  private static readonly GAME_MODE_NUM = 4;

  private _highScore: number[];
  private _gameMode: number;

  public constructor() {
    this._highScore = new Array<number>(PrefData.GAME_MODE_NUM).fill(0);
    this._gameMode = 0;
  }

  public init(): void {
    this._highScore.fill(0);
    this._gameMode = 0;
  }

  public load(highScore: unknown, gameMode: unknown): void {
    this._highScore = this.normalizeHighScore(highScore, PrefData.GAME_MODE_NUM);
    this._gameMode = this.normalizeGameMode(gameMode);
  }

  public loadVer13(highScore: unknown, gameMode: unknown): void {
    this.init();
    const ver13 = this.normalizeHighScore(highScore, 3);
    for (let i = 0; i < ver13.length; i++) {
      this._highScore[i] = ver13[i];
    }
    this._gameMode = this.normalizeGameMode(gameMode);
  }

  public recordGameMode(gm: number): void {
    this._gameMode = this.normalizeGameMode(gm);
  }

  public recordResult(score: number, gm: number): void {
    const mode = this.normalizeGameMode(gm);
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.trunc(score)) : 0;
    if (safeScore > this._highScore[mode]) {
      this._highScore[mode] = safeScore;
    }
    this._gameMode = mode;
  }

  public highScore(gm: number): number {
    return this._highScore[this.normalizeGameMode(gm)] ?? 0;
  }

  public get gameMode(): number {
    return this._gameMode;
  }

  public exportHighScores(): number[] {
    return [...this._highScore];
  }

  private normalizeHighScore(value: unknown, length: number): number[] {
    const result = new Array<number>(length).fill(0);
    if (!Array.isArray(value)) {
      return result;
    }
    for (let i = 0; i < length; i++) {
      const v = value[i];
      result[i] = Number.isFinite(v) ? Math.max(0, Math.trunc(v as number)) : 0;
    }
    return result;
  }

  private normalizeGameMode(value: unknown): number {
    const mode = Number.isFinite(value) ? Math.trunc(value as number) : 0;
    if (mode < 0) {
      return 0;
    }
    if (mode >= PrefData.GAME_MODE_NUM) {
      return PrefData.GAME_MODE_NUM - 1;
    }
    return mode;
  }
}
