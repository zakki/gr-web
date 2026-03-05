/*
 * $Id: bullet.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector } from "../util/vector";

declare class GameManager {
  public addSlowdownRatio(v: number): void;
}
declare class Field {
  public static readonly ON_BLOCK_THRESHOLD: number;
  public lastScrollY: number;
  public checkInOuterField(v: Vector): boolean;
  public checkInOuterFieldExceptTop(v: Vector): boolean;
  public getBlock(v: Vector): number;
}
declare class Ship {
  public checkBulletHit(p: Vector, pp: Vector): boolean;
}
declare class Smoke {
  public static readonly SmokeType: {
    readonly SAND: number;
    readonly SPARK: number;
  };
  public set(pos: Vector, vx: number, vy: number, vz: number, type: number, cnt: number, size: number): void;
}
declare class SmokePool {
  public getInstanceForced(): Smoke;
  public getInstance(): Smoke | null;
}
declare class Wake {
  public set(pos: Vector, deg: number, speed: number, cnt: number, size: number, fade: boolean): void;
}
declare class WakePool {
  public getInstanceForced(): Wake;
}
declare class Crystal {
  public set(p: Vector): void;
}
declare class CrystalPool {
  public getInstance(): Crystal | null;
}
declare class Shot {
  public removeHitToBullet(): void;
}
declare class Collidable {}
declare class BulletShape {
  public size: number;
  public set(shapeType: number): void;
  public draw(): void;
}
declare class Screen {
  public static glTranslate(v: Vector): void;
}

declare const PI: number;
declare function sin(v: number): number;
declare function cos(v: number): number;
declare function fabs(v: number): number;
declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glRotatef(angleDeg: number, x: number, y: number, z: number): void;

function normalizeDeg(v: number): number {
  let r = v;
  while (r > PI) r -= PI * 2;
  while (r < -PI) r += PI * 2;
  return r;
}

/**
 * Enemy's bullets.
 */
export class Bullet extends Actor {
  private gameManager!: GameManager;
  private field!: Field;
  private ship!: Ship;
  private smokes!: SmokePool;
  private wakes!: WakePool;
  private crystals!: CrystalPool;
  private readonly pos: Vector;
  private readonly ppos: Vector;
  private deg = 0;
  private speed = 1;
  private trgDeg = 0;
  private trgSpeed = 1;
  private size = 1;
  private cnt = 0;
  private range = 1;
  private _destructive = false;
  private readonly shape: BulletShape;
  private _enemyIdx = -1;

  public constructor() {
    super();
    this.pos = new Vector();
    this.ppos = new Vector();
    this.shape = new BulletShape();
  }

  public override init(args: unknown[] | null): void {
    this.gameManager = args?.[0] as GameManager;
    this.field = args?.[1] as Field;
    this.ship = args?.[2] as Ship;
    this.smokes = args?.[3] as SmokePool;
    this.wakes = args?.[4] as WakePool;
    this.crystals = args?.[5] as CrystalPool;
  }

  public set(
    enemyIdx: number,
    p: Vector,
    deg: number,
    speed: number,
    size: number,
    shapeType: number,
    range: number,
    startSpeed = 0,
    startDeg = -99999,
    destructive = false,
  ): void {
    if (!this.field.checkInOuterFieldExceptTop(p)) {
      return;
    }
    this._enemyIdx = enemyIdx;
    this.ppos.x = this.pos.x = p.x;
    this.ppos.y = this.pos.y = p.y;
    this.speed = startSpeed;
    this.deg = startDeg === -99999 ? deg : startDeg;
    this.trgDeg = deg;
    this.trgSpeed = speed;
    this.size = size;
    this.range = range;
    this._destructive = destructive;
    this.shape.set(shapeType);
    this.shape.size = size;
    this.cnt = 0;
    this.exists = true;
  }

  public override move(): void {
    this.ppos.x = this.pos.x;
    this.ppos.y = this.pos.y;
    if (this.cnt < 30) {
      this.speed += (this.trgSpeed - this.speed) * 0.066;
      const md = normalizeDeg(this.trgDeg - this.deg);
      this.deg += md * 0.066;
      if (this.cnt === 29) {
        this.speed = this.trgSpeed;
        this.deg = this.trgDeg;
      }
    }
    if (this.field.checkInOuterField(this.pos)) {
      this.gameManager.addSlowdownRatio(this.speed * 0.24);
    }
    const mx = sin(this.deg) * this.speed;
    const my = cos(this.deg) * this.speed;
    this.pos.x += mx;
    this.pos.y += my;
    this.pos.y -= this.field.lastScrollY;
    if (this.ship.checkBulletHit(this.pos, this.ppos) || !this.field.checkInOuterFieldExceptTop(this.pos)) {
      this.remove();
      return;
    }
    this.cnt++;
    this.range -= this.speed;
    if (this.range <= 0) {
      this.startDisappear();
    }
    if (this.field.getBlock(this.pos) >= Field.ON_BLOCK_THRESHOLD) {
      this.startDisappear();
    }
  }

  public startDisappear(): void {
    if (this.field.getBlock(this.pos) >= 0) {
      const s = this.smokes.getInstanceForced();
      s.set(this.pos, sin(this.deg) * this.speed * 0.2, cos(this.deg) * this.speed * 0.2, 0, Smoke.SmokeType.SAND, 30, this.size * 0.5);
    } else {
      const w = this.wakes.getInstanceForced();
      w.set(this.pos, this.deg, this.speed, 60, this.size * 3, true);
    }
    this.remove();
  }

  public changeToCrystal(): void {
    const c = this.crystals.getInstance();
    if (c) {
      c.set(this.pos);
    }
    this.remove();
  }

  public remove(): void {
    this.exists = false;
  }

  public override draw(): void {
    if (!this.field.checkInOuterField(this.pos)) {
      return;
    }
    glPushMatrix();
    Screen.glTranslate(this.pos);
    if (this._destructive) {
      glRotatef(this.cnt * 13, 0, 0, 1);
    } else {
      glRotatef((-this.deg * 180) / PI, 0, 0, 1);
      glRotatef(this.cnt * 13, 0, 1, 0);
    }
    this.shape.draw();
    glPopMatrix();
  }

  public checkShotHit(p: Vector, shape: Collidable, shot: Shot): void {
    void shape;
    const ox = fabs(this.pos.x - p.x);
    const oy = fabs(this.pos.y - p.y);
    if (ox + oy < 0.5) {
      shot.removeHitToBullet();
      const smoke = this.smokes.getInstance();
      if (smoke) {
        smoke.set(this.pos, sin(this.deg) * this.speed, cos(this.deg) * this.speed, 0, Smoke.SmokeType.SPARK, 30, this.size * 0.5);
      }
      this.remove();
    }
  }

  public get destructive(): boolean {
    return this._destructive;
  }

  public get enemyIdx(): number {
    return this._enemyIdx;
  }
}

export class BulletPool extends ActorPool<Bullet> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Bullet());
  }

  public removeIndexedBullets(idx: number): number {
    let n = 0;
    for (const b of this.actor) {
      if (b.exists && b.enemyIdx === idx) {
        b.changeToCrystal();
        n++;
      }
    }
    return n;
  }

  public checkShotHit(pos: Vector, shape: Collidable, shot: Shot): void {
    for (const b of this.actor) {
      if (b.exists && b.destructive) {
        b.checkShotHit(pos, shape, shot);
      }
    }
  }
}
