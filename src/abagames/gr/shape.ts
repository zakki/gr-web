/*
 * $Id: shape.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Screen3D } from "../util/sdl/screen3d";
import { Rand } from "../util/rand";
import { DisplayList } from "../util/sdl/displaylist";
import { Screen } from "./screen";
import { type WakePool } from "./particle";

export interface Collidable {
  collision(): Vector;
}

export abstract class DrawableShape {
  private displayList: DisplayList | null = null;
  private initialized = false;

  protected abstract createDisplayList(): void;

  protected ensureInit(): void {
    if (this.initialized) return;
    this.displayList = new DisplayList(1);
    this.displayList.beginNewList();
    this.createDisplayList();
    this.displayList.endNewList();
    this.initialized = true;
  }

  public draw(): void {
    this.ensureInit();
    this.displayList?.call(0);
  }

  public close(): void {
    this.displayList?.close();
    this.displayList = null;
    this.initialized = false;
  }
}

export class ResizableDrawable extends DrawableShape {
  public size = 1;
  protected shape: DrawableShape | null = null;

  protected override createDisplayList(): void {}

  public override draw(): void {
    if (!this.shape) return;
    Screen3D.glPushMatrix();
    Screen3D.glScalef(this.size, this.size, this.size);
    this.shape.draw();
    Screen3D.glPopMatrix();
  }

  public override close(): void {}
}

export abstract class CollidableDrawable extends DrawableShape implements Collidable {
  protected _collision = new Vector(0.5, 0.5);

  public collision(): Vector {
    return this._collision;
  }
}

/**
 * Shape of a ship/platform/turret/bridge.
 */
export class BaseShape extends DrawableShape {
  public static readonly ShapeType = {
    SHIP: 0,
    SHIP_ROUNDTAIL: 1,
    SHIP_SHADOW: 2,
    PLATFORM: 3,
    TURRET: 4,
    BRIDGE: 5,
    SHIP_DAMAGED: 6,
    SHIP_DESTROYED: 7,
    PLATFORM_DAMAGED: 8,
    PLATFORM_DESTROYED: 9,
    TURRET_DAMAGED: 10,
    TURRET_DESTROYED: 11,
  } as const;

  private static readonly POINT_NUM = 16;
  private static readonly PILLAR_POINT_NUM = 8;
  private static readonly rand = new Rand();
  private static readonly wakePos = new Vector();

  private readonly pillarPos: Vector[] = [];
  private readonly _pointPos: Vector[] = [];
  private readonly _pointDeg: number[] = [];

  public constructor(
    public size: number,
    public distRatio: number,
    public spinyRatio: number,
    public type: number,
    public r: number,
    public g: number,
    public b: number,
  ) {
    super();
  }

  public static setRandSeed(seed: number): void {
    BaseShape.rand.setSeed(seed);
  }

  protected override createDisplayList(): void {
    this.pillarPos.length = 0;
    this._pointPos.length = 0;
    this._pointDeg.length = 0;

    const height = this.size * 0.5;
    let z = 0;
    let sz = 1;

    if (this.type === BaseShape.ShapeType.BRIDGE) z += height;

    if (this.type !== BaseShape.ShapeType.SHIP_DESTROYED) Screen.setColor(this.r, this.g, this.b);

    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    if (this.type !== BaseShape.ShapeType.BRIDGE) this.createLoop(sz, z, false, true);
    else this.createSquareLoop(sz, z, false, 1);
    Screen3D.glEnd();

    if (
      this.type !== BaseShape.ShapeType.SHIP_SHADOW &&
      this.type !== BaseShape.ShapeType.SHIP_DESTROYED &&
      this.type !== BaseShape.ShapeType.PLATFORM_DESTROYED &&
      this.type !== BaseShape.ShapeType.TURRET_DESTROYED
    ) {
      Screen.setColor(this.r * 0.4, this.g * 0.4, this.b * 0.4);
      Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
      this.createLoop(sz, z, true);
      Screen3D.glEnd();
    }

    switch (this.type) {
      case BaseShape.ShapeType.SHIP:
      case BaseShape.ShapeType.SHIP_ROUNDTAIL:
      case BaseShape.ShapeType.SHIP_SHADOW:
      case BaseShape.ShapeType.SHIP_DAMAGED:
      case BaseShape.ShapeType.SHIP_DESTROYED:
        if (this.type !== BaseShape.ShapeType.SHIP_DESTROYED) Screen.setColor(this.r * 0.4, this.g * 0.4, this.b * 0.4);
        for (let i = 0; i < 3; i++) {
          z -= height / 4;
          sz -= 0.2;
          Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
          this.createLoop(sz, z);
          Screen3D.glEnd();
        }
        break;

      case BaseShape.ShapeType.PLATFORM:
      case BaseShape.ShapeType.PLATFORM_DAMAGED:
      case BaseShape.ShapeType.PLATFORM_DESTROYED:
        Screen.setColor(this.r * 0.4, this.g * 0.4, this.b * 0.4);
        for (let i = 0; i < 3; i++) {
          z -= height / 3;
          for (const pp of this.pillarPos) {
            Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
            this.createPillar(pp, this.size * 0.2, z);
            Screen3D.glEnd();
          }
        }
        break;

      case BaseShape.ShapeType.BRIDGE:
      case BaseShape.ShapeType.TURRET:
      case BaseShape.ShapeType.TURRET_DAMAGED:
        Screen.setColor(this.r * 0.6, this.g * 0.6, this.b * 0.6);
        z += height;
        sz -= 0.33;
        Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
        if (this.type === BaseShape.ShapeType.BRIDGE) this.createSquareLoop(sz, z);
        else this.createSquareLoop(sz, z / 2, false, 3);
        Screen3D.glEnd();

        Screen.setColor(this.r * 0.25, this.g * 0.25, this.b * 0.25);
        Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
        if (this.type === BaseShape.ShapeType.BRIDGE) this.createSquareLoop(sz, z, true);
        else this.createSquareLoop(sz, z / 2, true, 3);
        Screen3D.glEnd();
        break;

      case BaseShape.ShapeType.TURRET_DESTROYED:
      default:
        break;
    }
  }

  private createLoop(s: number, z: number, backToFirst = false, record = false): void {
    let firstPoint = true;
    let fpx = 0;
    let fpy = 0;

    for (let i = 0; i < BaseShape.POINT_NUM; i++) {
      if (
        this.type !== BaseShape.ShapeType.SHIP &&
        this.type !== BaseShape.ShapeType.SHIP_DESTROYED &&
        this.type !== BaseShape.ShapeType.SHIP_DAMAGED &&
        i > (BaseShape.POINT_NUM * 2) / 5 &&
        i <= (BaseShape.POINT_NUM * 3) / 5
      ) {
        continue;
      }

      if (
        (this.type === BaseShape.ShapeType.TURRET || this.type === BaseShape.ShapeType.TURRET_DAMAGED || this.type === BaseShape.ShapeType.TURRET_DESTROYED) &&
        (i <= BaseShape.POINT_NUM / 5 || i > (BaseShape.POINT_NUM * 4) / 5)
      ) {
        continue;
      }

      const d = (Math.PI * 2 * i) / BaseShape.POINT_NUM;
      const cx = Math.sin(d) * this.size * s * (1 - this.distRatio);
      const cy = Math.cos(d) * this.size * s;

      let sy: number;
      if (i === BaseShape.POINT_NUM / 4 || i === (BaseShape.POINT_NUM / 4) * 3) sy = 0;
      else sy = 1 / (1 + Math.abs(Math.tan(d)));

      let sx = 1 - sy;
      if (i >= BaseShape.POINT_NUM / 2) sx *= -1;
      if (i >= BaseShape.POINT_NUM / 4 && i <= (BaseShape.POINT_NUM / 4) * 3) sy *= -1;

      sx *= this.size * s * (1 - this.distRatio);
      sy *= this.size * s;

      const px = cx * (1 - this.spinyRatio) + sx * this.spinyRatio;
      const py = cy * (1 - this.spinyRatio) + sy * this.spinyRatio;

      Screen3D.glVertex3f(px, py, z);

      if (backToFirst && firstPoint) {
        fpx = px;
        fpy = py;
        firstPoint = false;
      }

      if (record) {
        if (
          i === BaseShape.POINT_NUM / 8 ||
          i === (BaseShape.POINT_NUM / 8) * 3 ||
          i === (BaseShape.POINT_NUM / 8) * 5 ||
          i === (BaseShape.POINT_NUM / 8) * 7
        ) {
          this.pillarPos.push(new Vector(px * 0.8, py * 0.8));
        }
        this._pointPos.push(new Vector(px, py));
        this._pointDeg.push(d);
      }
    }

    if (backToFirst) Screen3D.glVertex3f(fpx, fpy, z);
  }

  private createSquareLoop(s: number, z: number, backToFirst = false, yRatio = 1): void {
    const pn = backToFirst ? 4 : 3;
    for (let i = 0; i <= pn; i++) {
      const d = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      const px = Math.sin(d) * this.size * s;
      let py = Math.cos(d) * this.size * s;
      if (py > 0) py *= yRatio;
      Screen3D.glVertex3f(px, py, z);
    }
  }

  private createPillar(p: Vector, s: number, z: number): void {
    for (let i = 0; i < BaseShape.PILLAR_POINT_NUM; i++) {
      const d = (Math.PI * 2 * i) / BaseShape.PILLAR_POINT_NUM;
      Screen3D.glVertex3f(Math.sin(d) * s + p.x, Math.cos(d) * s + p.y, z);
    }
  }

  public addWake(wakes: WakePool, pos: Vector, deg: number, spd: number, sr = 1): void {
    let sp = spd;
    if (sp > 0.1) sp = 0.1;

    let sz = this.size;
    if (sz > 10) sz = 10;

    BaseShape.wakePos.x = pos.x + Math.sin(deg + Math.PI / 2 + 0.7) * this.size * 0.5 * sr;
    BaseShape.wakePos.y = pos.y + Math.cos(deg + Math.PI / 2 + 0.7) * this.size * 0.5 * sr;
    let w = wakes.getInstanceForced();
    w.set(BaseShape.wakePos, deg + Math.PI - 0.2 + BaseShape.rand.nextSignedFloat(0.1), sp, 40, sz * 32 * sr);

    BaseShape.wakePos.x = pos.x + Math.sin(deg - Math.PI / 2 - 0.7) * this.size * 0.5 * sr;
    BaseShape.wakePos.y = pos.y + Math.cos(deg - Math.PI / 2 - 0.7) * this.size * 0.5 * sr;
    w = wakes.getInstanceForced();
    w.set(BaseShape.wakePos, deg + Math.PI + 0.2 + BaseShape.rand.nextSignedFloat(0.1), sp, 40, sz * 32 * sr);
  }

  public pointPos(): Vector[] {
    return this._pointPos;
  }

  public pointDeg(): number[] {
    return this._pointDeg;
  }

  public checkShipCollision(x: number, y: number, deg: number, sr = 1): boolean {
    let cs = this.size * (1 - this.distRatio) * 1.1 * sr;
    if (this.dist(x, y, 0, 0) < cs) return true;

    let ofs = 0;
    for (;;) {
      ofs += cs;
      cs *= this.distRatio;
      if (cs < 0.2) return false;
      if (this.dist(x, y, Math.sin(deg) * ofs, Math.cos(deg) * ofs) < cs || this.dist(x, y, -Math.sin(deg) * ofs, -Math.cos(deg) * ofs) < cs) {
        return true;
      }
    }
  }

  private dist(x: number, y: number, px: number, py: number): number {
    const ax = Math.abs(x - px);
    const ay = Math.abs(y - py);
    return ax > ay ? ax + ay / 2 : ay + ax / 2;
  }
}

export class CollidableBaseShape extends BaseShape implements Collidable {
  private readonly _c: Vector;

  public constructor(size: number, distRatio: number, spinyRatio: number, type: number, r: number, g: number, b: number) {
    super(size, distRatio, spinyRatio, type, r, g, b);
    this._c = new Vector(size / 2, size / 2);
  }

  public collision(): Vector {
    return this._c;
  }
}

export class TurretShape extends ResizableDrawable {
  public static readonly TurretShapeType = {
    NORMAL: 0,
    DAMAGED: 1,
    DESTROYED: 2,
  } as const;

  private static shapes: BaseShape[] = [];

  public static init(): void {
    TurretShape.shapes = [
      new CollidableBaseShape(1, 0, 0, BaseShape.ShapeType.TURRET, 1, 0.8, 0.8),
      new BaseShape(1, 0, 0, BaseShape.ShapeType.TURRET_DAMAGED, 0.9, 0.9, 1),
      new BaseShape(1, 0, 0, BaseShape.ShapeType.TURRET_DESTROYED, 0.8, 0.33, 0.66),
    ];
  }

  public static close(): void {
    for (const s of TurretShape.shapes) s.close();
  }

  public constructor(t: number) {
    super();
    this.shape = TurretShape.shapes[t] ?? TurretShape.shapes[0] ?? null;
  }
}

export class EnemyShape extends ResizableDrawable {
  public static readonly EnemyShapeType = {
    SMALL: 0,
    SMALL_DAMAGED: 1,
    SMALL_BRIDGE: 2,
    MIDDLE: 3,
    MIDDLE_DAMAGED: 4,
    MIDDLE_DESTROYED: 5,
    MIDDLE_BRIDGE: 6,
    PLATFORM: 7,
    PLATFORM_DAMAGED: 8,
    PLATFORM_DESTROYED: 9,
    PLATFORM_BRIDGE: 10,
  } as const;

  public static readonly MIDDLE_COLOR_R = 1;
  public static readonly MIDDLE_COLOR_G = 0.6;
  public static readonly MIDDLE_COLOR_B = 0.5;

  private static shapes: BaseShape[] = [];

  public static init(): void {
    EnemyShape.shapes = [
      new BaseShape(1, 0.5, 0.1, BaseShape.ShapeType.SHIP, 0.9, 0.7, 0.5),
      new BaseShape(1, 0.5, 0.1, BaseShape.ShapeType.SHIP_DAMAGED, 0.5, 0.5, 0.9),
      new CollidableBaseShape(0.66, 0, 0, BaseShape.ShapeType.BRIDGE, 1, 0.2, 0.3),
      new BaseShape(1, 0.7, 0.33, BaseShape.ShapeType.SHIP, EnemyShape.MIDDLE_COLOR_R, EnemyShape.MIDDLE_COLOR_G, EnemyShape.MIDDLE_COLOR_B),
      new BaseShape(1, 0.7, 0.33, BaseShape.ShapeType.SHIP_DAMAGED, 0.5, 0.5, 0.9),
      new BaseShape(1, 0.7, 0.33, BaseShape.ShapeType.SHIP_DESTROYED, 0, 0, 0),
      new CollidableBaseShape(0.66, 0, 0, BaseShape.ShapeType.BRIDGE, 1, 0.2, 0.3),
      new BaseShape(1, 0, 0, BaseShape.ShapeType.PLATFORM, 1, 0.6, 0.7),
      new BaseShape(1, 0, 0, BaseShape.ShapeType.PLATFORM_DAMAGED, 0.5, 0.5, 0.9),
      new BaseShape(1, 0, 0, BaseShape.ShapeType.PLATFORM_DESTROYED, 1, 0.6, 0.7),
      new CollidableBaseShape(0.5, 0, 0, BaseShape.ShapeType.BRIDGE, 1, 0.2, 0.3),
    ];
  }

  public static close(): void {
    for (const s of EnemyShape.shapes) s.close();
  }

  public constructor(t: number) {
    super();
    this.shape = EnemyShape.shapes[t] ?? EnemyShape.shapes[0] ?? null;
  }

  public addWake(wakes: WakePool, pos: Vector, deg: number, sp: number): void {
    const bs = this.shape as BaseShape | null;
    bs?.addWake(wakes, pos, deg, sp, this.size);
  }

  public checkShipCollision(x: number, y: number, deg: number): boolean {
    const bs = this.shape as BaseShape | null;
    return bs ? bs.checkShipCollision(x, y, deg, this.size) : false;
  }
}

export class BulletShape extends ResizableDrawable {
  public static readonly BulletShapeType = {
    NORMAL: 0,
    SMALL: 1,
    MOVING_TURRET: 2,
    DESTRUCTIVE: 3,
  } as const;

  private static shapes: DrawableShape[] = [];

  public static init(): void {
    BulletShape.shapes = [new NormalBulletShape(), new SmallBulletShape(), new MovingTurretBulletShape(), new DestructiveBulletShape()];
  }

  public static close(): void {
    for (const s of BulletShape.shapes) s.close();
  }

  public constructor() {
    super();
    this.shape = BulletShape.shapes[0] ?? null;
  }

  public set(t: number): void {
    this.shape = BulletShape.shapes[t] ?? BulletShape.shapes[0] ?? null;
  }
}

export class NormalBulletShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen3D.glDisable(Screen3D.GL_BLEND);
    Screen.setColor(1, 1, 0.3);
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(0.2, -0.25, 0.2);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(-0.2, -0.25, -0.2);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(-0.2, -0.25, 0.2);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.2, -0.25, -0.2);
    Screen3D.glEnd();
    Screen3D.glEnable(Screen3D.GL_BLEND);

    Screen.setColor(0.5, 0.2, 0.1);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.2, -0.25, 0.2);
    Screen3D.glVertex3f(-0.2, -0.25, 0.2);
    Screen3D.glVertex3f(-0.2, -0.25, -0.2);
    Screen3D.glVertex3f(0.2, -0.25, -0.2);
    Screen3D.glVertex3f(0.2, -0.25, 0.2);
    Screen3D.glEnd();
  }
}

export class SmallBulletShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen3D.glDisable(Screen3D.GL_BLEND);
    Screen.setColor(0.6, 0.9, 0.3);
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(-0.25, -0.25, -0.25);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(-0.25, -0.25, 0.25);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.25, -0.25, -0.25);
    Screen3D.glEnd();
    Screen3D.glEnable(Screen3D.GL_BLEND);

    Screen.setColor(0.2, 0.4, 0.1);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glVertex3f(-0.25, -0.25, 0.25);
    Screen3D.glVertex3f(-0.25, -0.25, -0.25);
    Screen3D.glVertex3f(0.25, -0.25, -0.25);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glEnd();
  }
}

export class MovingTurretBulletShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen3D.glDisable(Screen3D.GL_BLEND);
    Screen.setColor(0.7, 0.5, 0.9);
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(-0.25, -0.25, -0.25);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(-0.25, -0.25, 0.25);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.25, -0.25, -0.25);
    Screen3D.glEnd();
    Screen3D.glEnable(Screen3D.GL_BLEND);

    Screen.setColor(0.2, 0.2, 0.3);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(0, 0.33, 0);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glVertex3f(-0.25, -0.25, 0.25);
    Screen3D.glVertex3f(-0.25, -0.25, -0.25);
    Screen3D.glVertex3f(0.25, -0.25, -0.25);
    Screen3D.glVertex3f(0.25, -0.25, 0.25);
    Screen3D.glEnd();
  }
}

export class DestructiveBulletShape extends CollidableDrawable {
  protected override createDisplayList(): void {
    Screen3D.glDisable(Screen3D.GL_BLEND);
    Screen.setColor(0.9, 0.9, 0.6);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    Screen3D.glVertex3f(0.2, 0, 0);
    Screen3D.glVertex3f(0, 0.4, 0);
    Screen3D.glVertex3f(-0.2, 0, 0);
    Screen3D.glVertex3f(0, -0.4, 0);
    Screen3D.glEnd();
    Screen3D.glEnable(Screen3D.GL_BLEND);

    Screen.setColor(0.7, 0.5, 0.4);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(0.2, 0, 0);
    Screen3D.glVertex3f(0, 0.4, 0);
    Screen3D.glVertex3f(-0.2, 0, 0);
    Screen3D.glVertex3f(0, -0.4, 0);
    Screen3D.glEnd();

    this._collision = new Vector(0.4, 0.4);
  }
}

export class CrystalShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen.setColor(0.6, 1, 0.7);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    Screen3D.glVertex3f(-0.2, 0.2, 0);
    Screen3D.glVertex3f(0.2, 0.2, 0);
    Screen3D.glVertex3f(0.2, -0.2, 0);
    Screen3D.glVertex3f(-0.2, -0.2, 0);
    Screen3D.glEnd();
  }
}

export class ShieldShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen.setColor(0.5, 0.5, 0.7);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    let d = 0;
    for (let i = 0; i < 8; i++) {
      Screen3D.glVertex3f(Math.sin(d), Math.cos(d), 0);
      d += Math.PI / 4;
    }
    Screen3D.glEnd();

    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen.setColor(0, 0, 0);
    Screen3D.glVertex3f(0, 0, 0);
    d = 0;
    Screen.setColor(0.3, 0.3, 0.5);
    for (let i = 0; i < 9; i++) {
      Screen3D.glVertex3f(Math.sin(d), Math.cos(d), 0);
      d += Math.PI / 4;
    }
    Screen3D.glEnd();
  }
}
