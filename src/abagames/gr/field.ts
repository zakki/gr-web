/*
 * $Id: field.d,v 1.3 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Screen3D } from "../util/sdl/screen3d";
import { Rand } from "../util/rand";
import { Screen } from "./screen";


type StageManagerLike = {
  gotoNextBlockArea(): void;
  addBatteries(platformPos: PlatformPos[], platformPosNum: number): void;
  readonly bossMode: boolean;
  readonly blockDensity: number;
};

type ShipLike = unknown;

export class PlatformPos {
  public pos = new Vector();
  public deg = 0;
  public used = false;
}

export class Panel {
  public x = 0;
  public y = 0;
  public z = 0;
  public ci = 0;
  public or = 1;
  public og = 1;
  public ob = 1;
}

/**
 * Game field.
 */
export class Field {
  public static readonly BLOCK_SIZE_X = 20;
  public static readonly BLOCK_SIZE_Y = 64;
  public static readonly ON_BLOCK_THRESHOLD = 1;
  public static readonly NEXT_BLOCK_AREA_SIZE = 16;
  private static readonly SIDEWALL_X1 = 18;
  private static readonly SIDEWALL_X2 = 9.3;
  private static readonly SIDEWALL_Y = 15;

  private stageManager!: StageManagerLike;
  private ship!: ShipLike;
  private readonly rand = new Rand();
  private readonly _size = new Vector(9, 9.6);
  private readonly _outerSize = new Vector(10, 12);
  private readonly screenBlockSizeX = 20;
  private readonly screenBlockSizeY = 24;
  private readonly blockWidth = 1;
  private block: number[][];
  private panel: Panel[][];
  private nextBlockY = 0;
  private screenY = Field.NEXT_BLOCK_AREA_SIZE;
  private blockCreateCnt = 0;
  private _lastScrollY = 0;
  private readonly screenPos = new Vector();
  public platformPos: PlatformPos[];
  public platformPosNum = 0;

  public constructor() {
    this.block = Array.from({ length: Field.BLOCK_SIZE_X }, () => Array(Field.BLOCK_SIZE_Y).fill(-3));
    this.panel = Array.from({ length: Field.BLOCK_SIZE_X }, () => Array.from({ length: Field.BLOCK_SIZE_Y }, () => new Panel()));
    this.platformPos = Array.from({ length: this.screenBlockSizeX * Field.NEXT_BLOCK_AREA_SIZE }, () => new PlatformPos());
  }

  public setRandSeed(s: number): void {
    this.rand.setSeed(s);
  }

  public setStageManager(sm: StageManagerLike): void {
    this.stageManager = sm;
  }

  public setShip(sp: ShipLike): void {
    this.ship = sp;
    void this.ship;
  }

  public start(): void {
    this._lastScrollY = 0;
    this.nextBlockY = 0;
    this.screenY = Field.NEXT_BLOCK_AREA_SIZE;
    this.blockCreateCnt = 0;
    for (let y = 0; y < Field.BLOCK_SIZE_Y; y++) {
      for (let x = 0; x < Field.BLOCK_SIZE_X; x++) {
        this.block[x][y] = -3;
        this.createPanel(x, y);
      }
    }
  }

  public scroll(my: number, isDemo = false): void {
    this._lastScrollY = my;
    this.screenY -= my;
    if (this.screenY < 0) this.screenY += Field.BLOCK_SIZE_Y;
    this.blockCreateCnt -= my;
    if (this.blockCreateCnt < 0) {
      this.stageManager.gotoNextBlockArea();
      const bd = this.stageManager.bossMode ? 0 : this.stageManager.blockDensity;
      this.createBlocks(bd);
      if (!isDemo) this.stageManager.addBatteries(this.platformPos, this.platformPosNum);
      this.gotoNextBlockArea();
    }
  }

  private createBlocks(groundDensity: number): void {
    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = this.wrapY(y);
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) this.block[bx][by] = -3;
    }

    this.platformPosNum = 0;
    for (let i = 0; i < groundDensity; i++) this.addGround();

    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = this.wrapY(y);
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) this.createPanel(bx, by);
    }
  }

  private addGround(): void {
    const cx = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.8)) + 2;
    const cy = this.rand.nextInt(Math.trunc(Field.NEXT_BLOCK_AREA_SIZE * 0.8)) + this.nextBlockY;
    const w = this.rand.nextInt(6) + 5;
    const h = this.rand.nextInt(5) + 4;
    for (let y = cy - Math.trunc(h / 2); y < cy + Math.trunc(h / 2); y++) {
      const by = this.wrapY(y);
      for (let x = cx - Math.trunc(w / 2); x < cx + Math.trunc(w / 2); x++) {
        if (x < 0 || x >= Field.BLOCK_SIZE_X) continue;
        this.block[x][by] = 0;
        if (this.rand.nextInt(5) === 0 && x >= 2 && x < Field.BLOCK_SIZE_X - 2) {
          const pp = this.platformPos[this.platformPosNum];
          pp.pos.x = x;
          pp.pos.y = by;
          pp.deg = (this.rand.nextInt(8) * Math.PI) / 4;
          pp.used = false;
          this.platformPosNum = Math.min(this.platformPos.length, this.platformPosNum + 1);
        }
      }
    }
  }

  private gotoNextBlockArea(): void {
    this.blockCreateCnt += Field.NEXT_BLOCK_AREA_SIZE;
    this.nextBlockY -= Field.NEXT_BLOCK_AREA_SIZE;
    if (this.nextBlockY < 0) this.nextBlockY += Field.BLOCK_SIZE_Y;
  }

  public getBlock(arg0: Vector | number, y?: number): number {
    const x = arg0 instanceof Vector ? arg0.x : arg0;
    const yy = arg0 instanceof Vector ? arg0.y : y;
    if (yy == null) return -1;
    const oy = yy - (this.screenY - Math.trunc(this.screenY));
    const bx = Math.trunc((x + (this.blockWidth * this.screenBlockSizeX) / 2) / this.blockWidth);
    let by = Math.trunc(this.screenY) + Math.trunc((-oy + (this.blockWidth * this.screenBlockSizeY) / 2) / this.blockWidth);
    if (bx < 0 || bx >= Field.BLOCK_SIZE_X) return -1;
    by = this.wrapY(by);
    return this.block[bx][by];
  }

  public convertToScreenPos(bx: number, y: number): Vector {
    const oy = this.screenY - Math.trunc(this.screenY);
    let by = y - Math.trunc(this.screenY);
    if (by <= -Field.BLOCK_SIZE_Y) by += Field.BLOCK_SIZE_Y;
    if (by > 0) by -= Field.BLOCK_SIZE_Y;
    this.screenPos.x = bx * this.blockWidth - (this.blockWidth * this.screenBlockSizeX) / 2 + this.blockWidth / 2;
    this.screenPos.y = by * -this.blockWidth + (this.blockWidth * this.screenBlockSizeY) / 2 + oy - this.blockWidth / 2;
    return this.screenPos;
  }

  public move(): void {}

  public draw(): void {
    this.drawPanel();
  }

  public drawSideWalls(): void {
    Screen3D.glDisable(Screen3D.GL_BLEND);
    Screen.setColor(0, 0, 0, 1);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(Field.SIDEWALL_X1, Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(Field.SIDEWALL_X2, Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(Field.SIDEWALL_X2, -Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(Field.SIDEWALL_X1, -Field.SIDEWALL_Y, 0);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(-Field.SIDEWALL_X1, Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(-Field.SIDEWALL_X2, Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(-Field.SIDEWALL_X2, -Field.SIDEWALL_Y, 0);
    Screen3D.glVertex3f(-Field.SIDEWALL_X1, -Field.SIDEWALL_Y, 0);
    Screen3D.glEnd();
    Screen3D.glEnable(Screen3D.GL_BLEND);
  }

  private drawPanel(): void {
    let by = Math.trunc(this.screenY);
    let oy = this.screenY - by;
    let sy = (this.blockWidth * this.screenBlockSizeY) / 2 + oy;
    by = this.wrapY(by - 1);
    sy += this.blockWidth;
    Screen3D.glBegin(Screen3D.GL_QUADS);
    for (let y = -1; y < this.screenBlockSizeY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      let sx = (-this.blockWidth * this.screenBlockSizeX) / 2;
      for (let bx = 0; bx < this.screenBlockSizeX; bx++) {
        const p = this.panel[bx][by];
        const c = p.ci <= 0 ? 0.2 : p.ci === 1 ? 0.35 : 0.5;
        Screen.setColor(c * p.or, c * p.og, c * p.ob);
        Screen3D.glVertex3f(sx + p.x, sy - p.y, p.z);
        Screen3D.glVertex3f(sx + p.x + 1.8, sy - p.y, p.z);
        Screen3D.glVertex3f(sx + p.x + 1.8, sy - p.y - 1.8, p.z);
        Screen3D.glVertex3f(sx + p.x, sy - p.y - 1.8, p.z);
        sx += this.blockWidth;
      }
      sy -= this.blockWidth;
      by = this.wrapY(by + 1);
    }
    Screen3D.glEnd();
  }

  private createPanel(x: number, y: number): void {
    const p = this.panel[x][y];
    p.x = this.rand.nextFloat(1) - 0.75;
    p.y = this.rand.nextFloat(1) - 0.75;
    p.z = this.block[x][y] * 0.66 + this.rand.nextFloat(0.66);
    p.ci = this.block[x][y] + 3;
    p.or = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
    p.og = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
    p.ob = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
  }

  private wrapY(y: number): number {
    let by = y;
    while (by < 0) by += Field.BLOCK_SIZE_Y;
    while (by >= Field.BLOCK_SIZE_Y) by -= Field.BLOCK_SIZE_Y;
    return by;
  }

  public countAroundBlock(x: number, y: number, th = 0): number {
    let c = 0;
    if (this.checkBlock(x, y - 1, th)) c++;
    if (this.checkBlock(x + 1, y, th)) c++;
    if (this.checkBlock(x, y + 1, th)) c++;
    if (this.checkBlock(x - 1, y, th)) c++;
    return c;
  }

  private checkBlock(x: number, y: number, th = 0, outScreen = false): boolean {
    if (x < 0 || x >= Field.BLOCK_SIZE_X) return outScreen;
    return this.block[x][this.wrapY(y)] >= th;
  }

  public checkInField(arg0: Vector | number, y?: number): boolean {
    const x = arg0 instanceof Vector ? arg0.x : arg0;
    const yy = arg0 instanceof Vector ? arg0.y : y;
    if (yy == null) return false;
    return x >= -this._size.x && x <= this._size.x && yy >= -this._size.y && yy <= this._size.y;
  }

  public checkInOuterField(arg0: Vector | number, y?: number): boolean {
    const x = arg0 instanceof Vector ? arg0.x : arg0;
    const yy = arg0 instanceof Vector ? arg0.y : y;
    if (yy == null) return false;
    return x >= -this._outerSize.x && x <= this._outerSize.x && yy >= -this._outerSize.y && yy <= this._outerSize.y;
  }

  public checkInOuterHeightField(p: Vector): boolean {
    return p.x >= -this._size.x && p.x <= this._size.x && p.y >= -this._outerSize.y && p.y <= this._outerSize.y;
  }

  public checkInFieldExceptTop(p: Vector): boolean {
    return p.x >= -this._size.x && p.x <= this._size.x && p.y >= -this._size.y;
  }

  public checkInOuterFieldExceptTop(p: Vector): boolean {
    return p.x >= -this._outerSize.x && p.x <= this._outerSize.x && p.y >= -this._outerSize.y && p.y <= this._outerSize.y * 2;
  }

  public get size(): Vector {
    return this._size;
  }

  public get outerSize(): Vector {
    return this._outerSize;
  }

  public get lastScrollY(): number {
    return this._lastScrollY;
  }
}
