/*
 * $Id: shape.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { DisplayList } from "../util/sdl/displaylist";

declare class Screen {
  public static setColor(r: number, g: number, b: number, a?: number): void;
  public static glTranslate(v: Vector | { x: number; y: number; z?: number }): void;
}
declare class Wake {
  public set(p: Vector, deg: number, speed: number, cnt?: number, size?: number, revShape?: boolean): void;
}
declare class WakePool {
  public getInstanceForced(): Wake;
}

declare const PI: number;
declare const GL_LINE_LOOP: number;
declare const GL_LINE_STRIP: number;
declare const GL_TRIANGLE_FAN: number;
declare const GL_BLEND: number;
declare function sin(v: number): number;
declare function cos(v: number): number;
declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glScalef(x: number, y: number, z: number): void;
declare function glRotatef(angleDeg: number, x: number, y: number, z: number): void;
declare function glDisable(cap: number): void;
declare function glEnable(cap: number): void;
declare function glBegin(mode: number): void;
declare function glEnd(): void;
declare function glVertex3(x: number, y: number, z: number): void;

export interface Collidable {
  collision(): Vector;
}

export abstract class DrawableShape {
  private displayList: DisplayList | null = null;
  private initialized = false;

  public constructor() {}

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
    glPushMatrix();
    glScalef(this.size, this.size, this.size);
    this.shape.draw();
    glPopMatrix();
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

  private static readonly rand = new Rand();
  private static readonly wakePos = new Vector();

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
    this.buildPoints();
  }

  public static setRandSeed(seed: number): void {
    BaseShape.rand.setSeed(seed);
  }

  protected override createDisplayList(): void {
    Screen.setColor(this.r, this.g, this.b);
    glBegin(GL_LINE_LOOP);
    for (const p of this._pointPos) glVertex3(p.x, p.y, 0);
    glEnd();
  }

  private buildPoints(): void {
    this._pointPos.length = 0;
    this._pointDeg.length = 0;
    const pointNum = 12;
    for (let i = 0; i < pointNum; i++) {
      const d = (PI * 2 * i) / pointNum;
      const px = sin(d) * this.size * (1 - this.distRatio * 0.35);
      const py = cos(d) * this.size;
      this._pointPos.push(new Vector(px, py));
      this._pointDeg.push(d);
    }
  }

  public pointPos(): Vector[] {
    return this._pointPos;
  }

  public pointDeg(): number[] {
    return this._pointDeg;
  }

  public addWake(wakes: WakePool, pos: Vector, deg: number, spd: number, sr = 1): void {
    const w = wakes.getInstanceForced();
    const sz = Math.min(this.size, 10) * 24 * sr;
    const sp = Math.min(spd, 0.1);
    BaseShape.wakePos.x = pos.x + sin(deg + PI / 2) * this.size * 0.5 * sr;
    BaseShape.wakePos.y = pos.y + cos(deg + PI / 2) * this.size * 0.5 * sr;
    w.set(BaseShape.wakePos, deg + PI + BaseShape.rand.nextSignedFloat(0.1), sp, 40, sz);
  }

  public checkShipCollision(x: number, y: number, _deg: number, sr = 1): boolean {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const d = ax > ay ? ax + ay / 2 : ay + ax / 2;
    return d < this.size * (1 - this.distRatio * 0.2) * 1.1 * sr;
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
    glDisable(GL_BLEND);
    Screen.setColor(1, 1, 0.3);
    glBegin(GL_LINE_STRIP);
    glVertex3(0.2, -0.25, 0.2);
    glVertex3(0, 0.33, 0);
    glVertex3(-0.2, -0.25, -0.2);
    glEnd();
    glEnable(GL_BLEND);
  }
}

export class SmallBulletShape extends DrawableShape {
  protected override createDisplayList(): void {
    glDisable(GL_BLEND);
    Screen.setColor(0.6, 0.9, 0.3);
    glBegin(GL_LINE_STRIP);
    glVertex3(0.25, -0.25, 0.25);
    glVertex3(0, 0.33, 0);
    glVertex3(-0.25, -0.25, -0.25);
    glEnd();
    glEnable(GL_BLEND);
  }
}

export class MovingTurretBulletShape extends DrawableShape {
  protected override createDisplayList(): void {
    glDisable(GL_BLEND);
    Screen.setColor(0.7, 0.5, 0.9);
    glBegin(GL_LINE_STRIP);
    glVertex3(0.25, -0.25, 0.25);
    glVertex3(0, 0.33, 0);
    glVertex3(-0.25, -0.25, -0.25);
    glEnd();
    glEnable(GL_BLEND);
  }
}

export class DestructiveBulletShape extends CollidableDrawable {
  protected override createDisplayList(): void {
    glDisable(GL_BLEND);
    Screen.setColor(0.9, 0.9, 0.6);
    glBegin(GL_LINE_LOOP);
    glVertex3(0.2, 0, 0);
    glVertex3(0, 0.4, 0);
    glVertex3(-0.2, 0, 0);
    glVertex3(0, -0.4, 0);
    glEnd();
    glEnable(GL_BLEND);
    this._collision = new Vector(0.4, 0.4);
  }
}

export class CrystalShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen.setColor(0.6, 1, 0.7);
    glBegin(GL_LINE_LOOP);
    glVertex3(-0.2, 0.2, 0);
    glVertex3(0.2, 0.2, 0);
    glVertex3(0.2, -0.2, 0);
    glVertex3(-0.2, -0.2, 0);
    glEnd();
  }
}

export class ShieldShape extends DrawableShape {
  protected override createDisplayList(): void {
    Screen.setColor(0.5, 0.5, 0.7);
    glBegin(GL_LINE_LOOP);
    let d = 0;
    for (let i = 0; i < 8; i++) {
      glVertex3(sin(d), cos(d), 0);
      d += PI / 4;
    }
    glEnd();
  }
}
