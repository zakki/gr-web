/*
 * $Id: field.d,v 1.3 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { MathUtil } from "../util/math";
import { Screen3D } from "../util/sdl/screen3d";
import { Screen } from "./screen";
import type { StageManager } from "./stagemanager";
import type { Ship } from "./ship";

export class PlatformPos {
  public pos = new Vector();
  public deg = 0;
  public used = false;
}

class Panel {
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
  private static readonly TIME_COLOR_INDEX = 5;
  private static readonly TIME_CHANGE_RATIO = 0.00033;
  private static readonly DEG_BLOCK_OFS: ReadonlyArray<readonly [number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  private stageManager!: StageManager;
  private ship!: Ship;
  private readonly rand = new Rand();
  private readonly _size: Vector;
  private readonly _outerSize: Vector;

  private static readonly SCREEN_BLOCK_SIZE_X = 20;
  private static readonly SCREEN_BLOCK_SIZE_Y = 24;
  private static readonly BLOCK_WIDTH = 1;

  private static readonly PANEL_WIDTH = 1.8;
  private static readonly PANEL_HEIGHT_BASE = 0.66;

  private readonly block: number[][];
  private readonly panel: Panel[][];

  private nextBlockY = 0;
  private screenY = Field.NEXT_BLOCK_AREA_SIZE;
  private blockCreateCnt = 0;
  private _lastScrollY = 0;
  private readonly screenPos = new Vector();

  public readonly platformPos: PlatformPos[];
  public platformPosNum = 0;

  private readonly baseColorTime: number[][][] = [
    [
      [0.15, 0.15, 0.3],
      [0.25, 0.25, 0.5],
      [0.35, 0.35, 0.45],
      [0.6, 0.7, 0.35],
      [0.45, 0.8, 0.3],
      [0.2, 0.6, 0.1],
    ],
    [
      [0.1, 0.1, 0.3],
      [0.2, 0.2, 0.5],
      [0.3, 0.3, 0.4],
      [0.5, 0.65, 0.35],
      [0.4, 0.7, 0.3],
      [0.1, 0.5, 0.1],
    ],
    [
      [0.1, 0.1, 0.3],
      [0.2, 0.2, 0.5],
      [0.3, 0.3, 0.4],
      [0.5, 0.65, 0.35],
      [0.4, 0.7, 0.3],
      [0.1, 0.5, 0.1],
    ],
    [
      [0.2, 0.15, 0.25],
      [0.35, 0.2, 0.4],
      [0.5, 0.35, 0.45],
      [0.7, 0.6, 0.3],
      [0.6, 0.65, 0.25],
      [0.2, 0.45, 0.1],
    ],
    [
      [0.0, 0.0, 0.1],
      [0.1, 0.1, 0.3],
      [0.2, 0.2, 0.3],
      [0.2, 0.3, 0.15],
      [0.2, 0.2, 0.1],
      [0.0, 0.15, 0.0],
    ],
  ];
  private readonly baseColor: number[][] = Array.from({ length: 6 }, () => [0, 0, 0]);
  private time = 0;

  public constructor() {
    this._size = new Vector((Field.SCREEN_BLOCK_SIZE_X / 2) * 0.9, (Field.SCREEN_BLOCK_SIZE_Y / 2) * 0.8);
    this._outerSize = new Vector(Field.SCREEN_BLOCK_SIZE_X / 2, Field.SCREEN_BLOCK_SIZE_Y / 2);
    this.block = Array.from({ length: Field.BLOCK_SIZE_X }, () => Array<number>(Field.BLOCK_SIZE_Y).fill(-3));
    this.panel = Array.from({ length: Field.BLOCK_SIZE_X }, () => Array.from({ length: Field.BLOCK_SIZE_Y }, () => new Panel()));
    this.platformPos = Array.from({ length: Field.SCREEN_BLOCK_SIZE_X * Field.NEXT_BLOCK_AREA_SIZE }, () => new PlatformPos());
  }

  public setRandSeed(seed: number): void {
    this.rand.setSeed(seed);
  }

  public setStageManager(sm: StageManager): void {
    this.stageManager = sm;
  }

  public setShip(sp: Ship): void {
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
    this.time = this.rand.nextFloat(Field.TIME_COLOR_INDEX);
  }

  private createPanel(x: number, y: number): void {
    const p = this.panel[x][y];
    p.x = this.rand.nextFloat(1) - 0.75;
    p.y = this.rand.nextFloat(1) - 0.75;
    p.z = this.block[x][y] * Field.PANEL_HEIGHT_BASE + this.rand.nextFloat(Field.PANEL_HEIGHT_BASE);
    p.ci = this.block[x][y] + 3;
    p.or = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
    p.og = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
    p.ob = (1 + this.rand.nextSignedFloat(0.1)) * 0.33;
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
      const by = y % Field.BLOCK_SIZE_Y;
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) this.block[bx][by] = -3;
    }

    this.platformPosNum = 0;
    const type = this.rand.nextInt(3);
    for (let i = 0; i < groundDensity; i++) this.addGround(type);

    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = y % Field.BLOCK_SIZE_Y;
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) {
        if (y === this.nextBlockY || y === this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE - 1) this.block[bx][by] = -3;
      }
    }

    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = y % Field.BLOCK_SIZE_Y;

      for (let bx = 0; bx < Field.BLOCK_SIZE_X - 1; bx++) {
        if (this.block[bx][by] === 0 && this.countAroundBlock(bx, by) <= 1) this.block[bx][by] = -2;
      }

      for (let bx = Field.BLOCK_SIZE_X - 1; bx >= 0; bx--) {
        if (this.block[bx][by] === 0 && this.countAroundBlock(bx, by) <= 1) this.block[bx][by] = -2;
      }

      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) {
        const c = this.countAroundBlock(bx, by);
        let b = this.block[bx][by];

        if (this.block[bx][by] >= 0) {
          switch (c) {
            case 0:
              b = -2;
              break;
            case 1:
            case 2:
            case 3:
              b = 0;
              break;
            case 4:
              b = 2;
              break;
          }
        } else {
          switch (c) {
            case 0:
              b = -3;
              break;
            case 1:
            case 2:
            case 3:
            case 4:
              b = -1;
              break;
          }
        }

        this.block[bx][by] = b;

        if (b === -1 && bx >= 2 && bx < Field.BLOCK_SIZE_X - 2) {
          const pd = this.calcPlatformDeg(bx, by);
          if (pd >= -Math.PI * 2) {
            this.platformPos[this.platformPosNum].pos.x = bx;
            this.platformPos[this.platformPosNum].pos.y = by;
            this.platformPos[this.platformPosNum].deg = pd;
            this.platformPos[this.platformPosNum].used = false;
            this.platformPosNum++;
          }
        }
      }
    }

    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = y % Field.BLOCK_SIZE_Y;
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) {
        if (this.block[bx][by] === -3) {
          if (this.countAroundBlock(bx, by, -1) > 0) this.block[bx][by] = -2;
        } else if (this.block[bx][by] === 2) {
          if (this.countAroundBlock(bx, by, 1) < 4) this.block[bx][by] = 1;
        }
        this.createPanel(bx, by);
      }
    }
  }

  private addGround(type: number): void {
    let cx: number;
    switch (type) {
      case 0:
        cx = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.4)) + Math.trunc(Field.BLOCK_SIZE_X * 0.1);
        break;
      case 1:
        cx = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.4)) + Math.trunc(Field.BLOCK_SIZE_X * 0.5);
        break;
      case 2:
      default:
        if (this.rand.nextInt(2) === 0) cx = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.4)) - Math.trunc(Field.BLOCK_SIZE_X * 0.2);
        else cx = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.4)) + Math.trunc(Field.BLOCK_SIZE_X * 0.8);
        break;
    }

    let cy = this.rand.nextInt(Math.trunc(Field.NEXT_BLOCK_AREA_SIZE * 0.6)) + Math.trunc(Field.NEXT_BLOCK_AREA_SIZE * 0.2);
    cy += this.nextBlockY;

    const w = this.rand.nextInt(Math.trunc(Field.BLOCK_SIZE_X * 0.33)) + Math.trunc(Field.BLOCK_SIZE_X * 0.33);
    const h = this.rand.nextInt(Math.trunc(Field.NEXT_BLOCK_AREA_SIZE * 0.24)) + Math.trunc(Field.NEXT_BLOCK_AREA_SIZE * 0.33);

    cx -= Math.trunc(w / 2);
    cy -= Math.trunc(h / 2);

    for (let y = this.nextBlockY; y < this.nextBlockY + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      const by = y % Field.BLOCK_SIZE_Y;
      for (let bx = 0; bx < Field.BLOCK_SIZE_X; bx++) {
        if (bx >= cx && bx < cx + w && y >= cy && y < cy + h) {
          let wr = this.rand.nextFloat(0.2) + 0.2;
          let hr = this.rand.nextFloat(0.3) + 0.4;
          let o = (bx - cx) * wr + (y - cy) * hr;

          wr = this.rand.nextFloat(0.2) + 0.2;
          hr = this.rand.nextFloat(0.3) + 0.4;
          let to = (cx + w - 1 - bx) * wr + (y - cy) * hr;
          if (to < o) o = to;

          wr = this.rand.nextFloat(0.2) + 0.2;
          hr = this.rand.nextFloat(0.3) + 0.4;
          to = (bx - cx) * wr + (cy + h - 1 - y) * hr;
          if (to < o) o = to;

          wr = this.rand.nextFloat(0.2) + 0.2;
          hr = this.rand.nextFloat(0.3) + 0.4;
          to = (cx + w - 1 - bx) * wr + (cy + h - 1 - y) * hr;
          if (to < o) o = to;

          if (o > 1) this.block[bx][by] = 0;
        }
      }
    }
  }

  private gotoNextBlockArea(): void {
    this.blockCreateCnt += Field.NEXT_BLOCK_AREA_SIZE;
    this.nextBlockY -= Field.NEXT_BLOCK_AREA_SIZE;
    if (this.nextBlockY < 0) this.nextBlockY += Field.BLOCK_SIZE_Y;
  }

  public getBlock(p: Vector): number;
  public getBlock(x: number, y: number): number;
  public getBlock(arg0: Vector | number, y?: number): number {
    const x = arg0 instanceof Vector ? arg0.x : arg0;
    const yy = arg0 instanceof Vector ? arg0.y : y;
    if (yy == null) return -1;

    const fy = yy - (this.screenY - Math.trunc(this.screenY));
    const bx = Math.trunc((x + (Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_X) / 2) / Field.BLOCK_WIDTH);
    let by = Math.trunc(this.screenY) + Math.trunc((-fy + (Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_Y) / 2) / Field.BLOCK_WIDTH);

    if (bx < 0 || bx >= Field.BLOCK_SIZE_X) return -1;
    if (by < 0) by += Field.BLOCK_SIZE_Y;
    else if (by >= Field.BLOCK_SIZE_Y) by -= Field.BLOCK_SIZE_Y;

    return this.block[bx][by];
  }

  public convertToScreenPos(bx: number, y: number): Vector {
    const oy = this.screenY - Math.trunc(this.screenY);
    let by = y - Math.trunc(this.screenY);
    if (by <= -Field.BLOCK_SIZE_Y) by += Field.BLOCK_SIZE_Y;
    if (by > 0) by -= Field.BLOCK_SIZE_Y;

    this.screenPos.x = bx * Field.BLOCK_WIDTH - (Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_X) / 2 + Field.BLOCK_WIDTH / 2;
    this.screenPos.y = by * -Field.BLOCK_WIDTH + (Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_Y) / 2 + oy - Field.BLOCK_WIDTH / 2;
    return this.screenPos;
  }

  public move(): void {
    this.time += Field.TIME_CHANGE_RATIO;
    if (this.time >= Field.TIME_COLOR_INDEX) this.time -= Field.TIME_COLOR_INDEX;
  }

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
    const ci = Math.trunc(this.time);
    let nci = ci + 1;
    if (nci >= Field.TIME_COLOR_INDEX) nci = 0;
    const co = this.time - ci;

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        this.baseColor[i][j] = this.baseColorTime[ci][i][j] * (1 - co) + this.baseColorTime[nci][i][j] * co;
      }
    }

    let by = Math.trunc(this.screenY);
    const oy = this.screenY - by;
    let sy = (Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_Y) / 2 + oy;
    by--;
    if (by < 0) by += Field.BLOCK_SIZE_Y;
    sy += Field.BLOCK_WIDTH;

    Screen3D.glBegin(Screen3D.GL_QUADS);
    for (let y = -1; y < Field.SCREEN_BLOCK_SIZE_Y + Field.NEXT_BLOCK_AREA_SIZE; y++) {
      if (by >= Field.BLOCK_SIZE_Y) by -= Field.BLOCK_SIZE_Y;
      let sx = (-Field.BLOCK_WIDTH * Field.SCREEN_BLOCK_SIZE_X) / 2;
      for (let bx = 0; bx < Field.SCREEN_BLOCK_SIZE_X; bx++) {
        const p = this.panel[bx][by];

        Screen.setColor(this.baseColor[p.ci][0] * p.or * 0.66, this.baseColor[p.ci][1] * p.og * 0.66, this.baseColor[p.ci][2] * p.ob * 0.66);
        Screen3D.glVertex3f(sx + p.x, sy - p.y, p.z);
        Screen3D.glVertex3f(sx + p.x + Field.PANEL_WIDTH, sy - p.y, p.z);
        Screen3D.glVertex3f(sx + p.x + Field.PANEL_WIDTH, sy - p.y - Field.PANEL_WIDTH, p.z);
        Screen3D.glVertex3f(sx + p.x, sy - p.y - Field.PANEL_WIDTH, p.z);

        Screen.setColor(this.baseColor[p.ci][0] * 0.33, this.baseColor[p.ci][1] * 0.33, this.baseColor[p.ci][2] * 0.33);
        Screen3D.glVertex3f(sx, sy, 0);
        Screen3D.glVertex3f(sx + Field.BLOCK_WIDTH, sy, 0);
        Screen3D.glVertex3f(sx + Field.BLOCK_WIDTH, sy - Field.BLOCK_WIDTH, 0);
        Screen3D.glVertex3f(sx, sy - Field.BLOCK_WIDTH, 0);

        sx += Field.BLOCK_WIDTH;
      }
      sy -= Field.BLOCK_WIDTH;
      by++;
    }
    Screen3D.glEnd();
  }

  private calcPlatformDeg(x: number, y: number): number {
    let d = this.rand.nextInt(4);
    for (let i = 0; i < 4; i++) {
      if (!this.checkBlock(x + Field.DEG_BLOCK_OFS[d][0], y + Field.DEG_BLOCK_OFS[d][1], -1, true)) {
        let pd = (d * Math.PI) / 2;
        const ox = x + Field.DEG_BLOCK_OFS[d][0];
        const oy = y + Field.DEG_BLOCK_OFS[d][1];

        let td = d - 1;
        if (td < 0) td = 3;
        const b1 = this.checkBlock(ox + Field.DEG_BLOCK_OFS[td][0], oy + Field.DEG_BLOCK_OFS[td][1], -1, true);

        td = d + 1;
        if (td >= 4) td = 0;
        const b2 = this.checkBlock(ox + Field.DEG_BLOCK_OFS[td][0], oy + Field.DEG_BLOCK_OFS[td][1], -1, true);

        if (!b1 && b2) pd -= Math.PI / 4;
        if (b1 && !b2) pd += Math.PI / 4;
        pd = MathUtil.normalizeDeg(pd);
        return pd;
      }
      d++;
      if (d >= 4) d = 0;
    }
    return -99999;
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
    let by = y;
    if (by < 0) by += Field.BLOCK_SIZE_Y;
    if (by >= Field.BLOCK_SIZE_Y) by -= Field.BLOCK_SIZE_Y;
    return this.block[x][by] >= th;
  }

  public checkInField(p: Vector): boolean;
  public checkInField(x: number, y: number): boolean;
  public checkInField(arg0: Vector | number, y?: number): boolean {
    const x = arg0 instanceof Vector ? arg0.x : arg0;
    const yy = arg0 instanceof Vector ? arg0.y : y;
    if (yy == null) return false;
    return x >= -this._size.x && x <= this._size.x && yy >= -this._size.y && yy <= this._size.y;
  }

  public checkInOuterField(p: Vector): boolean;
  public checkInOuterField(x: number, y: number): boolean;
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
