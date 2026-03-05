/*
 * $Id: bullet.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Screen3D } from "../util/sdl/screen3d";
import { Vector } from "../util/vector";
import type { GameManager } from "./gamemanager";
import { Field } from "./field";
import type { Ship } from "./ship";
import { Smoke, SmokePool, WakePool } from "./particle";
import { CrystalPool } from "./crystal";
import type { Shot } from "./shot";
import { BulletShape, type Collidable } from "./shape";

function normalizeDeg(v: number): number {
  let r = v;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
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
    const mx = Math.sin(this.deg) * this.speed;
    const my = Math.cos(this.deg) * this.speed;
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
      s.set(this.pos, Math.sin(this.deg) * this.speed * 0.2, Math.cos(this.deg) * this.speed * 0.2, 0, Smoke.SmokeType.SAND, 30, this.size * 0.5);
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
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(this.pos.x, this.pos.y, 0);
    if (this._destructive) {
      Screen3D.glRotatef(this.cnt * 13, 0, 0, 1);
    } else {
      Screen3D.glRotatef((-this.deg * 180) / Math.PI, 0, 0, 1);
      Screen3D.glRotatef(this.cnt * 13, 0, 1, 0);
    }
    this.shape.draw();
    Screen3D.glPopMatrix();
  }

  public checkShotHit(p: Vector, shape: Collidable, shot: Shot): void {
    void shape;
    const ox = Math.abs(this.pos.x - p.x);
    const oy = Math.abs(this.pos.y - p.y);
    if (ox + oy < 0.5) {
      shot.removeHitToBullet();
      const smoke = this.smokes.getInstance();
      if (smoke) {
        smoke.set(this.pos, Math.sin(this.deg) * this.speed, Math.cos(this.deg) * this.speed, 0, Smoke.SmokeType.SPARK, 30, this.size * 0.5);
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
