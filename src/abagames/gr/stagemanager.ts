export interface PlatformPosEntry {
  pos: { x: number; y: number };
  deg: number;
  used: boolean;
}

export class GrStageManager {
  public bossMode = false;
  public blockDensity = 6;

  public gotoNextBlockArea(): void {}

  public addBatteries(_platforms: PlatformPosEntry[], _num: number): void {}
}
