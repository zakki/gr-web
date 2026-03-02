import { Vector } from "../util/vector";
import { Screen3D } from "../util/sdl/screen3d";
import { GrStageManager, PlatformPosEntry } from "./stagemanager";
import { Ship } from "./ship";

export interface PlatformPos {
  pos: Vector;
  deg: number;
  used: boolean;
}

export class GrField {
  public static readonly BLOCK_SIZE_X = 20;
  public static readonly BLOCK_SIZE_Y = 64;
  public static readonly ON_BLOCK_THRESHOLD = 1;
  public static readonly NEXT_BLOCK_AREA_SIZE = 16;
  public static readonly SCREEN_BLOCK_SIZE_X = 20;
  public static readonly SCREEN_BLOCK_SIZE_Y = 24;

  private static readonly PANEL_WIDTH = 1.8;
  private static readonly PANEL_HEIGHT_BASE = 0.66;

  private stageManager: GrStageManager | null = null;
  private ship: Ship | null = null;
  private block: number[][];
  private platformPos: PlatformPos[] = [];
  private screenPos = new Vector(0, 0);
  private time = 0;

  constructor() {
    this.block = Array.from({ length: GrField.BLOCK_SIZE_Y }, () =>
      new Array(GrField.BLOCK_SIZE_X).fill(-3),
    );
    for (let i = 0; i < GrField.SCREEN_BLOCK_SIZE_X * GrField.NEXT_BLOCK_AREA_SIZE; i++) {
      this.platformPos.push({ pos: new Vector(), deg: 0, used: false });
    }
  }

  public start(): void {
    this.time = 0;
  }

  public setStageManager(sm: GrStageManager): void {
    this.stageManager = sm;
  }

  public setShip(ship: Ship): void {
    this.ship = ship;
  }

  public scroll(_my: number, _isDemo = false): void {
    this.stageManager?.gotoNextBlockArea();
  }

  public move(): void {
    this.time = (this.time + 0.001) % 5;
  }

  public getBlock(): number {
    return -3;
  }

  public convertToScreenPos(): Vector {
    return this.screenPos;
  }

  public draw(): void {
    Screen3D.glBegin(Screen3D.GL_QUADS);
    Screen3D.glEnd();
  }

  public drawSideWalls(): void {
    Screen3D.glBegin(Screen3D.GL_QUADS);
    Screen3D.glEnd();
  }

  public getPlatformPositions(): PlatformPosEntry[] {
    return [];
  }
}
