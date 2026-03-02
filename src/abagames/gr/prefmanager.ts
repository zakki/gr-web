import type { PrefManager } from "../util/prefmanager";

const PREF_STORAGE_KEY = "gr.pref.v14";
const PREF_STORAGE_KEY_V13 = "gr.pref.v13";

export class GrPrefManager implements PrefManager {
  private readonly prefDataValue = new PrefData();

  public load(): void {
    const raw = this.loadRaw(PREF_STORAGE_KEY) ?? this.loadRaw(PREF_STORAGE_KEY_V13);
    if (!raw) {
      this.prefDataValue.init();
      return;
    }

    try {
      if (Array.isArray(raw.highScore)) {
        for (let i = 0; i < 4; i++) {
          this.prefDataValue.highScore[i] = Number(raw.highScore[i] ?? 0) | 0;
        }
      }
      this.prefDataValue.gameMode = Number(raw.gameMode ?? 0) | 0;
    } catch {
      this.prefDataValue.init();
    }
  }

  public save(): void {
    if (typeof localStorage === "undefined") return;
    const payload = JSON.stringify({
      highScore: this.prefDataValue.highScore,
      gameMode: this.prefDataValue.gameMode,
    });
    localStorage.setItem(PREF_STORAGE_KEY, payload);
  }

  public prefData(): PrefData {
    return this.prefDataValue;
  }

  private loadRaw(key: string): { highScore?: unknown[]; gameMode?: unknown } | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { highScore?: unknown[]; gameMode?: unknown };
    } catch {
      return null;
    }
  }
}

export class PrefData {
  public highScore: number[] = [0, 0, 0, 0];
  public gameMode = 0;

  public init(): void {
    this.highScore = [0, 0, 0, 0];
    this.gameMode = 0;
  }

  public recordGameMode(gm: number): void {
    this.gameMode = gm;
  }

  public recordResult(score: number, gm: number): void {
    if (gm < 0 || gm >= this.highScore.length) return;
    if (score > this.highScore[gm]) this.highScore[gm] = score;
    this.gameMode = gm;
  }

  public getHighScore(gm: number): number {
    if (gm < 0 || gm >= this.highScore.length) return 0;
    return this.highScore[gm];
  }

  public getGameMode(): number {
    return this.gameMode;
  }
}
