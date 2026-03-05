/*
 * $Id: turret.d,v 1.3 2005/07/17 11:02:46 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Screen3D } from "../util/sdl/screen3d";
import { Rand } from "../util/rand";
import { Screen } from "./screen";
import { Smoke, Spark, Fragment } from "./particle";
import { BulletShape, TurretShape, type Collidable } from "./shape";
import type { Shot } from "./shot";
import { SoundManager } from "./soundmanager";

type FieldLike = {
  checkInField(p: Vector): boolean;
  checkInFieldExceptTop(p: Vector): boolean;
  checkInOuterField(p: Vector): boolean;
};

type BulletLike = {
  set(
    enemyIdx: number,
    p: Vector,
    deg: number,
    speed: number,
    size: number,
    shapeType: number,
    range: number,
    startSpeed?: number,
    startDeg?: number,
    destructive?: boolean,
  ): void;
};

type BulletPoolLike = { getInstance(): BulletLike | null };
type ShipLike = { nearPos(p: Vector): Vector; nearVel(p: Vector): Vector };
type SparkPoolLike = { getInstanceForced(): Spark };
type SmokePoolLike = { getInstance(): Smoke | null; getInstanceForced(): Smoke };
type FragmentPoolLike = { getInstanceForced(): Fragment };
type EnemyLike = { index: number; isBoss: boolean; increaseMultiplier(v: number): void; addScore(v: number): void };


function normalizeDeg(v: number): number {
  let r = v;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/**
 * Turret mounted on a deck of an enemy ship.
 */
export class Turret {
  private static readonly rand = new Rand();
  private static readonly damagedPos = new Vector();

  private spec!: TurretSpec;
  private readonly pos = new Vector();
  private deg = 0;
  private baseDeg = 0;
  private cnt = 0;
  private appCnt = 0;
  private startCnt = 0;
  private shield = 0;
  private damaged = false;
  private destroyedCnt = -1;
  private damagedCnt = 0;
  private bulletSpeed = 1;
  private burstCnt = 0;

  public static init(): void {}

  public static setRandSeed(seed: number): void {
    Turret.rand.setSeed(seed);
  }

  public constructor(
    private readonly field: FieldLike,
    private readonly bullets: BulletPoolLike,
    private readonly ship: ShipLike,
    private readonly sparks: SparkPoolLike,
    private readonly smokes: SmokePoolLike,
    private readonly fragments: FragmentPoolLike,
    private readonly parent: EnemyLike,
  ) {}

  public start(spec: TurretSpec): void {
    this.spec = spec;
    this.shield = spec.shield;
    this.appCnt = this.cnt = this.startCnt = 0;
    this.deg = this.baseDeg = 0;
    this.damaged = false;
    this.damagedCnt = 0;
    this.destroyedCnt = -1;
    this.bulletSpeed = 1;
    this.burstCnt = 0;
  }

  public move(x: number, y: number, d: number, bulletFireSpeed = 0, bulletFireDeg = -99999): boolean {
    this.pos.x = x;
    this.pos.y = y;
    this.baseDeg = d;
    if (this.destroyedCnt >= 0) {
      this.destroyedCnt++;
      if (this.destroyedCnt % 20 === 0) {
        const s = this.smokes.getInstance();
        s?.set(this.pos, 0, 0, 0.01 + Turret.rand.nextFloat(0.01), Smoke.SmokeType.FIRE, 90 + Turret.rand.nextInt(30), this.spec.size);
      }
      return false;
    }

    const shipPos = this.ship.nearPos(this.pos);
    const shipVel = this.ship.nearVel(this.pos);
    let ax = shipPos.x - this.pos.x;
    let ay = shipPos.y - this.pos.y;
    if (this.spec.lookAheadRatio !== 0) {
      const rd = Math.max(0.1, this.pos.dist(shipPos) / Math.max(0.1, this.spec.speed));
      ax += shipVel.x * this.spec.lookAheadRatio * rd;
      ay += shipVel.y * this.spec.lookAheadRatio * rd;
    }
    const ad = Math.abs(ax) + Math.abs(ay) < 0.1 ? 0 : Math.atan2(ax, ay);
    const td = this.baseDeg + this.deg;
    const od = normalizeDeg(td - ad);
    const ts = this.cnt >= 0 ? this.spec.turnSpeed : this.spec.turnSpeed * this.spec.burstTurnRatio;
    if (Math.abs(od) <= ts) this.deg = ad - this.baseDeg;
    else if (od > 0) this.deg -= ts;
    else this.deg += ts;
    this.deg = Math.max(-this.spec.turnRange, Math.min(this.spec.turnRange, normalizeDeg(this.deg)));

    this.cnt++;
    if (this.field.checkInField(this.pos) || (this.parent.isBoss && this.cnt % 4 === 0)) this.appCnt++;

    if (this.cnt >= this.spec.interval) {
      const inRange = this.pos.dist(shipPos) < this.spec.maxRange * 1.1 && this.pos.dist(shipPos) > this.spec.minRange;
      if (this.spec.blind || (Math.abs(od) <= this.spec.turnSpeed && inRange)) {
        this.cnt = -(this.spec.burstNum - 1) * this.spec.burstInterval;
        this.bulletSpeed = this.spec.speed;
        this.burstCnt = 0;
      }
    }

    const canShoot =
      this.cnt <= 0 &&
      (-this.cnt) % this.spec.burstInterval === 0 &&
      ((this.spec.invisible && this.field.checkInField(this.pos)) ||
        (!this.spec.invisible && this.field.checkInFieldExceptTop(this.pos)) ||
        (this.spec.invisible && this.parent.isBoss && this.field.checkInOuterField(this.pos))) &&
      this.pos.dist(shipPos) > this.spec.minRange;

    if (canShoot) {
      let bd = this.baseDeg + this.deg;
      this.smokes.getInstance()?.set(
        this.pos,
        Math.sin(bd) * this.bulletSpeed,
        Math.cos(bd) * this.bulletSpeed,
        0,
        Smoke.SmokeType.SPARK,
        20,
        this.spec.size * 2,
      );
      let nw = this.spec.nway;
      if (this.spec.nwayChange && this.burstCnt % 2 === 1) nw = Math.max(1, nw - 1);
      bd -= (this.spec.nwayAngle * (nw - 1)) / 2;
      for (let i = 0; i < nw; i++) {
        const b = this.bullets.getInstance();
        if (!b) break;
        b.set(
          this.parent.index,
          this.pos,
          bd,
          this.bulletSpeed,
          this.spec.size * 3,
          this.spec.bulletShape,
          this.spec.maxRange,
          bulletFireSpeed,
          bulletFireDeg,
          this.spec.bulletDestructive,
        );
        bd += this.spec.nwayAngle;
      }
      this.bulletSpeed += this.spec.speedAccel;
      this.burstCnt++;
    }

    this.damaged = false;
    if (this.damagedCnt > 0) this.damagedCnt--;
    this.startCnt++;
    return true;
  }

  public draw(): void {
    if (this.spec.invisible) return;
    Screen3D.glPushMatrix();
    if (this.destroyedCnt < 0 && this.damagedCnt > 0) {
      Turret.damagedPos.x = this.pos.x + Turret.rand.nextSignedFloat(this.damagedCnt * 0.015);
      Turret.damagedPos.y = this.pos.y + Turret.rand.nextSignedFloat(this.damagedCnt * 0.015);
      Screen3D.glTranslatef(Turret.damagedPos.x, Turret.damagedPos.y, 0);
    } else {
      Screen3D.glTranslatef(this.pos.x, this.pos.y, 0);
    }
    Screen3D.glRotatef((-(this.baseDeg + this.deg) * 180) / Math.PI, 0, 0, 1);
    if (this.destroyedCnt >= 0) this.spec.destroyedShape.draw();
    else if (!this.damaged) this.spec.shape.draw();
    else this.spec.damagedShape.draw();
    Screen3D.glPopMatrix();

    if (this.destroyedCnt >= 0 || this.appCnt > 120) return;
    const a = this.startCnt < 12 ? this.startCnt / 12 : 1 - this.appCnt / 120;
    const td = this.baseDeg + this.deg;
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen.setColor(0.9, 0.1, 0.1, a);
    Screen3D.glVertex3f(this.pos.x + Math.sin(td) * this.spec.minRange, this.pos.y + Math.cos(td) * this.spec.minRange, 0);
    Screen.setColor(0.9, 0.1, 0.1, a * 0.5);
    Screen3D.glVertex3f(this.pos.x + Math.sin(td) * this.spec.maxRange, this.pos.y + Math.cos(td) * this.spec.maxRange, 0);
    Screen3D.glEnd();
  }

  public checkCollision(x: number, y: number, c: Collidable, shot: Shot): boolean {
    if (this.destroyedCnt >= 0 || this.spec.invisible) return false;
    const cc = c.collision();
    const hitR = this.spec.size + Math.max(cc.x, cc.y);
    const dx = this.pos.x - x;
    const dy = this.pos.y - y;
    if (dx * dx + dy * dy <= hitR * hitR) {
      this.addDamage((shot as unknown as { damage: number }).damage ?? 1);
      return true;
    }
    return false;
  }

  public addDamage(n: number): void {
    this.shield -= n;
    if (this.shield <= 0) this.destroyed();
    this.damaged = true;
    this.damagedCnt = 10;
  }

  public destroyed(): void {
    SoundManager.playSe("turret_destroyed.wav");
    this.destroyedCnt = 0;
    for (let i = 0; i < 6; i++) {
      this.smokes
        .getInstanceForced()
        .set(
          this.pos,
          Turret.rand.nextSignedFloat(0.1),
          Turret.rand.nextSignedFloat(0.1),
          Turret.rand.nextFloat(0.04),
          Smoke.SmokeType.EXPLOSION,
          30 + Turret.rand.nextInt(20),
          this.spec.size * 1.5,
        );
    }
    for (let i = 0; i < 32; i++) {
      this.sparks
        .getInstanceForced()
        .set(
          this.pos,
          Turret.rand.nextSignedFloat(0.5),
          Turret.rand.nextSignedFloat(0.5),
          0.5 + Turret.rand.nextFloat(0.5),
          0.5 + Turret.rand.nextFloat(0.5),
          0,
          30 + Turret.rand.nextInt(30),
        );
    }
    for (let i = 0; i < 7; i++) {
      this.fragments
        .getInstanceForced()
        .set(
          this.pos,
          Turret.rand.nextSignedFloat(0.25),
          Turret.rand.nextSignedFloat(0.25),
          0.05 + Turret.rand.nextFloat(0.05),
          this.spec.size * (0.5 + Turret.rand.nextFloat(0.5)),
        );
    }
    switch (this.spec.type) {
      case TurretSpec.TurretType.MAIN:
        this.parent.increaseMultiplier(2);
        this.parent.addScore(40);
        break;
      case TurretSpec.TurretType.SUB:
      case TurretSpec.TurretType.SUB_DESTRUCTIVE:
        this.parent.increaseMultiplier(1);
        this.parent.addScore(20);
        break;
    }
  }

  public remove(): void {
    if (this.destroyedCnt < 0) this.destroyedCnt = 999;
  }
}

/**
 * Turret specification changing according to a rank(difficulty).
 */
export class TurretSpec {
  public static readonly TurretType = {
    MAIN: 0,
    SUB: 1,
    SUB_DESTRUCTIVE: 2,
    SMALL: 3,
    MOVING: 4,
    DUMMY: 5,
  } as const;

  public type: number = 0;
  public interval = 99999;
  public speed = 1;
  public speedAccel = 0;
  public minRange = 0;
  public maxRange = 99999;
  public turnSpeed = 99999;
  public turnRange = Math.PI;
  public burstNum = 1;
  public burstInterval = 99999;
  public burstTurnRatio = 1;
  public blind = false;
  public lookAheadRatio = 0;
  public nway = 1;
  public nwayAngle = 0;
  public nwayChange = false;
  public bulletShape: number = BulletShape.BulletShapeType.NORMAL;
  public bulletDestructive = false;
  public shield = 99999;
  public invisible = false;
  public shape: TurretShape;
  public damagedShape: TurretShape;
  public destroyedShape: TurretShape;
  private _size = 1;

  public constructor() {
    this.shape = new TurretShape(TurretShape.TurretShapeType.NORMAL);
    this.damagedShape = new TurretShape(TurretShape.TurretShapeType.DAMAGED);
    this.destroyedShape = new TurretShape(TurretShape.TurretShapeType.DESTROYED);
  }

  public setParam(ts: TurretSpec): void;
  public setParam(rank: number, type: number, rand: Rand): void;
  public setParam(a: TurretSpec | number, type?: number, rand?: Rand): void {
    if (a instanceof TurretSpec) {
      const ts = a;
      this.type = ts.type;
      this.interval = ts.interval;
      this.speed = ts.speed;
      this.speedAccel = ts.speedAccel;
      this.minRange = ts.minRange;
      this.maxRange = ts.maxRange;
      this.turnSpeed = ts.turnSpeed;
      this.turnRange = ts.turnRange;
      this.burstNum = ts.burstNum;
      this.burstInterval = ts.burstInterval;
      this.burstTurnRatio = ts.burstTurnRatio;
      this.blind = ts.blind;
      this.lookAheadRatio = ts.lookAheadRatio;
      this.nway = ts.nway;
      this.nwayAngle = ts.nwayAngle;
      this.nwayChange = ts.nwayChange;
      this.bulletShape = ts.bulletShape;
      this.bulletDestructive = ts.bulletDestructive;
      this.shield = ts.shield;
      this.invisible = ts.invisible;
      this.size = ts.size;
      return;
    }

    const rk = Math.max(0, a);
    const r = rand ?? new Rand();
    const t = type ?? TurretSpec.TurretType.MAIN;
    this.type = t;
    if (t === TurretSpec.TurretType.DUMMY) {
      this.invisible = true;
      this.interval = 99999;
      this.shield = 1;
      return;
    }

    this.minRange = 4 + r.nextFloat(6);
    this.maxRange = this.minRange + 8 + r.nextFloat(10);
    this.turnSpeed = 0.005 + r.nextFloat(0.02);
    this.turnRange = Math.PI / 4 + r.nextFloat(Math.PI / 4);
    this.burstNum = 1 + r.nextInt(2 + Math.min(4, Math.trunc(rk * 0.15)));
    this.burstInterval = 4 + r.nextInt(8);
    this.interval = 20 + r.nextInt(70);
    this.speed = 0.12 + Math.sqrt(Math.max(0.1, rk * 0.03 + r.nextFloat(0.3))) * 0.18;
    this.speedAccel = r.nextSignedFloat(0.015);
    this.nway = 1 + r.nextInt(1 + Math.min(3, Math.trunc(rk * 0.05)));
    this.nwayAngle = 0.1 + r.nextFloat(0.25);
    this.blind = r.nextInt(3) !== 0;
    this.lookAheadRatio = r.nextFloat(Math.min(1, rk * 0.03));
    this.shield = 8 + Math.trunc(rk * 0.4);
    this.size = 0.33 + r.nextFloat(0.12);

    if (t === TurretSpec.TurretType.SUB_DESTRUCTIVE) {
      this.bulletShape = BulletShape.BulletShapeType.DESTRUCTIVE;
      this.bulletDestructive = true;
      this.interval = Math.max(8, Math.trunc(this.interval * 0.7));
    } else if (t === TurretSpec.TurretType.SMALL) {
      this.bulletShape = BulletShape.BulletShapeType.SMALL;
      this.invisible = true;
      this.turnSpeed = 0;
      this.nway = 1;
    } else if (t === TurretSpec.TurretType.MOVING) {
      this.bulletShape = BulletShape.BulletShapeType.MOVING_TURRET;
      this.invisible = true;
      this.turnSpeed = 0;
    } else if (t === TurretSpec.TurretType.SUB) {
      this.shield = Math.max(4, Math.trunc(this.shield * 0.75));
    }
  }

  public setBossSpec(): void {
    this.minRange = 0;
    this.maxRange *= 1.5;
    this.shield = Math.trunc(this.shield * 2.1);
  }

  public get size(): number {
    return this._size;
  }

  public set size(v: number) {
    this._size = v;
    this.shape.size = v;
    this.damagedShape.size = v;
    this.destroyedShape.size = v;
  }
}

/**
 * Grouped turrets.
 */
export class TurretGroup {
  private static readonly MAX_NUM = 16;
  private spec!: TurretGroupSpec;
  private readonly centerPos = new Vector();
  private readonly turret: Turret[];
  private cnt = 0;

  public constructor(
    field: FieldLike,
    bullets: BulletPoolLike,
    ship: ShipLike,
    sparks: SparkPoolLike,
    smokes: SmokePoolLike,
    fragments: FragmentPoolLike,
    parent: EnemyLike,
  ) {
    this.turret = Array.from({ length: TurretGroup.MAX_NUM }, () => new Turret(field, bullets, ship, sparks, smokes, fragments, parent));
  }

  public set(spec: TurretGroupSpec): void {
    this.spec = spec;
    for (let i = 0; i < spec.num; i++) this.turret[i].start(spec.turretSpec);
    this.cnt = 0;
  }

  public move(p: Vector, deg: number): boolean {
    let alive = false;
    this.centerPos.x = p.x;
    this.centerPos.y = p.y;
    if (this.spec.alignType === TurretGroupSpec.AlignType.ROUND) {
      let d = this.spec.alignDeg - (this.spec.alignWidth / 2);
      const md = this.spec.num > 1 ? this.spec.alignWidth / (this.spec.num - 1) : 0;
      for (let i = 0; i < this.spec.num; i++) {
        const tbx = Math.sin(d) * this.spec.radius * (1 - this.spec.distRatio);
        const tby = Math.cos(d) * this.spec.radius;
        const bx = tbx * Math.cos(-deg) - tby * Math.sin(-deg);
        const by = tbx * Math.sin(-deg) + tby * Math.cos(-deg);
        alive ||= this.turret[i].move(this.centerPos.x + bx, this.centerPos.y + by, d + deg);
        d += md;
      }
    } else {
      const my = this.spec.offset.y / (this.spec.num + 1);
      let y = 0;
      for (let i = 0; i < this.spec.num; i++) {
        y += my;
        const tbx = this.spec.offset.x * (1 - this.spec.distRatio);
        const tby = y;
        const d = Math.atan2(tbx, tby);
        const bx = tbx * Math.cos(-deg) - tby * Math.sin(-deg);
        const by = tbx * Math.sin(-deg) + tby * Math.cos(-deg);
        alive ||= this.turret[i].move(this.centerPos.x + bx, this.centerPos.y + by, d + deg);
      }
    }
    this.cnt++;
    return alive;
  }

  public draw(): void {
    for (let i = 0; i < this.spec.num; i++) this.turret[i].draw();
  }

  public remove(): void {
    for (let i = 0; i < this.spec.num; i++) this.turret[i].remove();
  }

  public checkCollision(x: number, y: number, c: Collidable, shot: Shot): boolean {
    let col = false;
    for (let i = 0; i < this.spec.num; i++) col ||= this.turret[i].checkCollision(x, y, c, shot);
    return col;
  }
}

export class TurretGroupSpec {
  public static readonly AlignType = {
    ROUND: 0,
    STRAIGHT: 1,
  } as const;

  public turretSpec = new TurretSpec();
  public num = 1;
  public alignType: number = TurretGroupSpec.AlignType.ROUND;
  public alignDeg = 0;
  public alignWidth = 0;
  public radius = 0;
  public distRatio = 0;
  public offset = new Vector();

  public init(): void {
    this.num = 1;
    this.alignType = TurretGroupSpec.AlignType.ROUND;
    this.alignDeg = 0;
    this.alignWidth = 0;
    this.radius = 0;
    this.distRatio = 0;
    this.offset.x = 0;
    this.offset.y = 0;
  }
}

/**
 * Turrets moving around a bridge.
 */
export class MovingTurretGroup {
  private static readonly MAX_NUM = 16;
  private spec!: MovingTurretGroupSpec;
  private radius = 0;
  private radiusAmpCnt = 0;
  private deg = 0;
  private rollAmpCnt = 0;
  private swingAmpCnt = 0;
  private swingAmpDeg = 0;
  private swingFixDeg = Math.PI;
  private alignAmpCnt = 0;
  private cnt = 0;
  private readonly centerPos = new Vector();
  private readonly turret: Turret[];

  public constructor(
    field: FieldLike,
    bullets: BulletPoolLike,
    ship: ShipLike,
    sparks: SparkPoolLike,
    smokes: SmokePoolLike,
    fragments: FragmentPoolLike,
    parent: EnemyLike,
  ) {
    this.turret = Array.from(
      { length: MovingTurretGroup.MAX_NUM },
      () => new Turret(field, bullets, ship, sparks, smokes, fragments, parent),
    );
  }

  public set(spec: MovingTurretGroupSpec): void {
    this.spec = spec;
    this.radius = spec.radiusBase;
    this.radiusAmpCnt = 0;
    this.deg = 0;
    this.rollAmpCnt = this.swingAmpCnt = this.swingAmpDeg = this.alignAmpCnt = 0;
    this.swingFixDeg = Math.PI;
    for (let i = 0; i < spec.num; i++) this.turret[i].start(spec.turretSpec);
    this.cnt = 0;
  }

  public move(p: Vector, ed: number): void {
    if (this.spec.moveType === MovingTurretGroupSpec.MoveType.SWING_FIX) this.swingFixDeg = ed;
    this.centerPos.x = p.x;
    this.centerPos.y = p.y;

    if (this.spec.radiusAmp > 0) {
      this.radiusAmpCnt += this.spec.radiusAmpVel;
      this.radius = this.spec.radiusBase + this.spec.radiusAmp * Math.sin(this.radiusAmpCnt);
    }

    if (this.spec.moveType === MovingTurretGroupSpec.MoveType.ROLL) {
      this.rollAmpCnt += this.spec.rollAmpVel;
      this.deg += this.spec.rollDegVel + this.spec.rollAmp * Math.sin(this.rollAmpCnt);
    } else {
      this.swingAmpCnt += this.spec.swingAmpVel;
      this.swingAmpDeg += Math.cos(this.swingAmpCnt) > 0 ? this.spec.swingDegVel : -this.spec.swingDegVel;
      const target = this.spec.moveType === MovingTurretGroupSpec.MoveType.SWING_AIM ? ed : this.swingFixDeg;
      this.deg += normalizeDeg(target + this.swingAmpDeg - this.deg) * 0.1;
    }

    this.alignAmpCnt += this.spec.alignAmpVel;
    const ad = this.spec.alignDeg * (1 + Math.sin(this.alignAmpCnt) * this.spec.alignAmp);
    const md = this.spec.num > 1 ? ad / (this.spec.moveType === MovingTurretGroupSpec.MoveType.ROLL ? this.spec.num : (this.spec.num - 1)) : 0;
    let d = this.deg - md - ad / 2;

    for (let i = 0; i < this.spec.num; i++) {
      d += md;
      const bx = Math.sin(d) * this.radius * this.spec.xReverse;
      const by = Math.cos(d) * this.radius * (1 - this.spec.distRatio);
      const fs = Math.sqrt(bx * bx + by * by) * 0.06;
      const fd = Math.abs(bx) + Math.abs(by) < 0.1 ? d : Math.atan2(bx, by);
      this.turret[i].move(this.centerPos.x, this.centerPos.y, d, fs, fd);
    }
    this.cnt++;
  }

  public draw(): void {
    for (let i = 0; i < this.spec.num; i++) this.turret[i].draw();
  }

  public remove(): void {
    for (let i = 0; i < this.spec.num; i++) this.turret[i].remove();
  }
}

export class MovingTurretGroupSpec {
  public static readonly MoveType = {
    ROLL: 0,
    SWING_FIX: 1,
    SWING_AIM: 2,
  } as const;

  public turretSpec = new TurretSpec();
  public num = 1;
  public alignDeg = Math.PI * 2;
  public alignAmp = 0;
  public alignAmpVel = 0;
  public radiusBase = 1;
  public radiusAmp = 0;
  public radiusAmpVel = 0;
  public moveType: number = MovingTurretGroupSpec.MoveType.SWING_FIX;
  public rollDegVel = 0;
  public rollAmp = 0;
  public rollAmpVel = 0;
  public swingDegVel = 0;
  public swingAmpVel = 0;
  public distRatio = 0;
  public xReverse = 1;

  public init(): void {
    this.num = 1;
    this.alignDeg = Math.PI * 2;
    this.alignAmp = this.alignAmpVel = 0;
    this.radiusBase = 1;
    this.radiusAmp = this.radiusAmpVel = 0;
    this.moveType = MovingTurretGroupSpec.MoveType.SWING_FIX;
    this.rollDegVel = this.rollAmp = this.rollAmpVel = 0;
    this.swingDegVel = this.swingAmpVel = 0;
    this.distRatio = 0;
    this.xReverse = 1;
  }

  public setAlignAmp(a: number, v: number): void {
    this.alignAmp = a;
    this.alignAmpVel = v;
  }

  public setRadiusAmp(a: number, v: number): void {
    this.radiusAmp = a;
    this.radiusAmpVel = v;
  }

  public setRoll(dv: number, a: number, v: number): void {
    this.moveType = MovingTurretGroupSpec.MoveType.ROLL;
    this.rollDegVel = dv;
    this.rollAmp = a;
    this.rollAmpVel = v;
  }

  public setSwing(dv: number, a: number, aim = false): void {
    this.moveType = aim ? MovingTurretGroupSpec.MoveType.SWING_AIM : MovingTurretGroupSpec.MoveType.SWING_FIX;
    this.swingDegVel = dv;
    this.swingAmpVel = a;
  }

  public setXReverse(xr: number): void {
    this.xReverse = xr;
  }
}
