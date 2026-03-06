/*
 * $Id: enemy.d,v 1.2 2005/07/17 11:02:45 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Screen3D } from "../util/sdl/screen3d";
import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { MathUtil } from "../util/math";
import { SoundManager } from "./soundmanager";
import { EnemyShape, BaseShape, type Collidable } from "./shape";
import { TurretGroup, TurretGroupSpec, MovingTurretGroup, MovingTurretGroupSpec, TurretSpec } from "./turret";
import { Fragment, Spark, SparkFragment, Smoke, Wake } from "./particle";
import { Letter } from "./letter";
import { NumIndicator } from "./reel";
import { Screen } from "./screen";
import type { Shot } from "./shot";

type FieldLike = {
  size: Vector;
  outerSize: Vector;
  lastScrollY: number;
  checkInOuterField(p: Vector): boolean;
  checkInOuterHeightField(p: Vector): boolean;
  checkInField(p: Vector): boolean;
  checkInFieldExceptTop(p: Vector): boolean;
  getBlock(p: Vector): number;
  getBlock(x: number, y: number): number;
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

type BulletPoolLike = {
  getInstance(): BulletLike | null;
  removeIndexedBullets(idx: number): number;
};

type ShipLike = {
  nearPos(p: Vector): Vector;
  nearVel(p: Vector): Vector;
  higherPos: Vector;
  scrollSpeedBase: number;
};

type StageManagerLike = { rankMultiplier: number };

type SparkPoolLike = { getInstanceForced(): Spark };
type SmokePoolLike = { getInstance(): Smoke | null; getInstanceForced(): Smoke };
type FragmentPoolLike = { getInstanceForced(): Fragment };
type SparkFragmentPoolLike = { getInstanceForced(): SparkFragment };
type WakePoolLike = { getInstanceForced(): Wake };

type NumIndicatorLike = {
  set(n: number, type: number, size: number, p: Vector): void;
  set(n: number, type: number, size: number, x: number, y: number): void;
  addTarget(x: number, y: number, flyingTo: number, initialVelRatio: number, size: number, n: number, cnt: number): void;
  gotoNextTarget(): void;
};

type NumIndicatorPoolLike = { getInstanceForced(): NumIndicatorLike };
type ScoreReelLike = { addActualScore(v: number): void };


/**
 * Enemy ships.
 */
export class Enemy extends Actor {
  private spec!: EnemySpec;
  private _state!: EnemyState;

  public override init(args: unknown[] | null): void {
    const a = args ?? [];
    this._state = new EnemyState(
      a[0] as FieldLike,
      a[1] as Screen,
      a[2] as BulletPoolLike,
      a[3] as ShipLike,
      a[4] as SparkPoolLike,
      a[5] as SmokePoolLike,
      a[6] as FragmentPoolLike,
      a[7] as SparkFragmentPoolLike,
      a[8] as NumIndicatorPoolLike,
      a[9] as ScoreReelLike,
    );
  }

  public setEnemyPool(enemies: EnemyPool): void {
    this._state.setEnemyAndPool(this, enemies);
  }

  public setStageManager(stageManager: StageManagerLike): void {
    this._state.setStageManager(stageManager);
  }

  public set(spec: EnemySpec): void {
    this.spec = spec;
    this._state.setSpec(spec);
    this.exists = true;
  }

  public override move(): void {
    if (!this.spec.move(this._state)) this.remove();
  }

  public checkShotHit(p: Vector, shape: Collidable, shot: Shot | null): void {
    if (this._state.destroyedCnt >= 0) return;
    if (this.spec.checkCollision(this._state, p.x, p.y, shape, shot ?? undefined)) {
      if (shot) {
        (shot as unknown as { removeHitToEnemy: (isSmallEnemy?: boolean) => void }).removeHitToEnemy(this.spec.isSmallEnemy);
      }
    }
  }

  public checkHitShip(x: number, y: number, largeOnly = false): boolean {
    return this.spec.checkShipCollision(this._state, x, y, largeOnly);
  }

  public addDamage(n: number): void {
    this._state.addDamage(n);
  }

  public increaseMultiplier(m: number): void {
    this._state.increaseMultiplier(m);
  }

  public addScore(s: number): void {
    this._state.addScore(s);
  }

  public remove(): void {
    this._state.removeTurrets();
    this.exists = false;
  }

  public override draw(): void {
    this.spec.draw(this._state);
  }

  public get state(): EnemyState {
    return this._state;
  }

  public get pos(): Vector {
    return this._state.pos;
  }

  public get size(): number {
    return this.spec.size;
  }

  public get index(): number {
    return this._state.idx;
  }

  public get isBoss(): boolean {
    return this.spec.isBoss;
  }
}

/**
 * Enemy status (position, direction, velocity, turrets, etc).
 */
export class EnemyState {
  public static readonly AppearanceType = {
    TOP: 0,
    SIDE: 1,
    CENTER: 2,
  } as const;

  public static readonly TURRET_GROUP_MAX = 10;
  public static readonly MOVING_TURRET_GROUP_MAX = 4;
  public static readonly MULTIPLIER_DECREASE_RATIO = 0.005;

  private static readonly rand = new Rand();
  private static readonly edgePos = new Vector();
  private static readonly explodeVel = new Vector();
  private static readonly damagedPos = new Vector();
  private static idxCount = 0;

  public appType: number = EnemyState.AppearanceType.TOP;
  public readonly pos = new Vector();
  public readonly ppos = new Vector();
  public shield = 1;
  public deg = 0;
  public velDeg = 0;
  public speed = 0;
  public turnWay = 1;
  public trgDeg = 0;
  public turnCnt = 0;
  public state = 0;
  public cnt = 0;
  public readonly vel = new Vector();
  public readonly turretGroup: TurretGroup[] = [];
  public readonly movingTurretGroup: MovingTurretGroup[] = [];
  public damaged = false;
  public damagedCnt = 0;
  public destroyedCnt = -1;
  public explodeCnt = 0;
  public explodeItv = 1;
  public readonly idx: number;
  public multiplier = 1;
  public spec!: EnemySpec;

  private enemy!: Enemy;
  private enemies!: EnemyPool;
  private stageManager!: StageManagerLike;

  public constructor(
    public readonly field: FieldLike,
    public readonly screen: Screen,
    public readonly bullets: BulletPoolLike,
    public readonly ship: ShipLike,
    public readonly sparks: SparkPoolLike,
    public readonly smokes: SmokePoolLike,
    public readonly fragments: FragmentPoolLike,
    public readonly sparkFragments: SparkFragmentPoolLike,
    public readonly numIndicators: NumIndicatorPoolLike,
    public readonly scoreReel: ScoreReelLike,
  ) {
    this.idx = EnemyState.idxCount;
    EnemyState.idxCount++;
  }

  public static setRandSeed(seed: number): void {
    EnemyState.rand.setSeed(seed);
  }

  public setEnemyAndPool(enemy: Enemy, enemies: EnemyPool): void {
    this.enemy = enemy;
    this.enemies = enemies;
    this.turretGroup.length = 0;
    this.movingTurretGroup.length = 0;
    for (let i = 0; i < EnemyState.TURRET_GROUP_MAX; i++) {
      this.turretGroup.push(new TurretGroup(this.field, this.bullets, this.ship, this.sparks, this.smokes, this.fragments, enemy));
    }
    for (let i = 0; i < EnemyState.MOVING_TURRET_GROUP_MAX; i++) {
      this.movingTurretGroup.push(
        new MovingTurretGroup(this.field, this.bullets, this.ship, this.sparks, this.smokes, this.fragments, enemy),
      );
    }
  }

  public setStageManager(stageManager: StageManagerLike): void {
    this.stageManager = stageManager;
  }

  public setSpec(spec: EnemySpec): void {
    this.spec = spec;
    this.shield = spec.shield;
    for (let i = 0; i < spec.turretGroupNum; i++) this.turretGroup[i].set(spec.turretGroupSpec[i]);
    for (let i = 0; i < spec.movingTurretGroupNum; i++) this.movingTurretGroup[i].set(spec.movingTurretGroupSpec[i]);
    this.cnt = 0;
    this.damaged = false;
    this.damagedCnt = 0;
    this.destroyedCnt = -1;
    this.explodeCnt = 0;
    this.explodeItv = 1;
    this.multiplier = 1;
  }

  public setAppearancePos(field: FieldLike, _ship: ShipLike, rand: Rand, appType: number = EnemyState.AppearanceType.TOP): boolean {
    this.appType = appType;
    for (let i = 0; i < 8; i++) {
      switch (appType) {
        case EnemyState.AppearanceType.TOP:
          this.pos.x = rand.nextSignedFloat(field.size.x);
          this.pos.y = field.outerSize.y * 0.99 + this.spec.size;
          if (this.pos.x < 0) this.velDeg = this.deg = Math.PI - rand.nextFloat(0.5);
          else this.velDeg = this.deg = Math.PI + rand.nextFloat(0.5);
          break;
        case EnemyState.AppearanceType.SIDE:
          if (rand.nextInt(2) === 0) {
            this.pos.x = -field.outerSize.x * 0.99;
            this.velDeg = this.deg = Math.PI / 2 + rand.nextFloat(0.66);
          } else {
            this.pos.x = field.outerSize.x * 0.99;
            this.velDeg = this.deg = -Math.PI / 2 - rand.nextFloat(0.66);
          }
          this.pos.y = field.size.y + rand.nextFloat(field.size.y) + this.spec.size;
          break;
        case EnemyState.AppearanceType.CENTER:
        default:
          this.pos.x = 0;
          this.pos.y = field.outerSize.y * 0.99 + this.spec.size;
          this.velDeg = this.deg = 0;
          break;
      }
      this.ppos.x = this.pos.x;
      this.ppos.y = this.pos.y;
      this.vel.x = 0;
      this.vel.y = 0;
      this.speed = 0;
      if (appType === EnemyState.AppearanceType.CENTER || this.checkFrontClear(true)) return true;
    }
    return false;
  }

  public checkFrontClear(checkCurrentPos = false): boolean {
    const si = checkCurrentPos ? 0 : 1;
    for (let i = si; i < 5; i++) {
      const cx = this.pos.x + Math.sin(this.deg) * i * this.spec.size;
      const cy = this.pos.y + Math.cos(this.deg) * i * this.spec.size;
      if (this.field.getBlock(cx, cy) >= 0) return false;
      if (this.enemies.checkHitShip(cx, cy, this.enemy, true)) return false;
    }
    return true;
  }

  public move(): boolean {
    this.ppos.x = this.pos.x;
    this.ppos.y = this.pos.y;
    this.multiplier -= EnemyState.MULTIPLIER_DECREASE_RATIO;
    if (this.multiplier < 1) this.multiplier = 1;

    if (this.destroyedCnt >= 0) {
      this.destroyedCnt++;
      this.explodeCnt--;
      if (this.explodeCnt < 0) {
        this.explodeItv += 2;
        this.explodeItv = Math.trunc(this.explodeItv * (1.2 + EnemyState.rand.nextFloat(1)));
        this.explodeCnt = this.explodeItv;
        this.destroyedEdge(Math.trunc((Math.sqrt(this.spec.size) * 27.0) / (this.explodeItv * 0.1 + 1)));
      }
    }

    this.damaged = false;
    if (this.damagedCnt > 0) this.damagedCnt--;

    let alive = false;
    for (let i = 0; i < this.spec.turretGroupNum; i++) {
      if (this.turretGroup[i].move(this.pos, this.deg)) alive = true;
    }
    for (let i = 0; i < this.spec.movingTurretGroupNum; i++) this.movingTurretGroup[i].move(this.pos, this.deg);

    if (this.destroyedCnt < 0 && !alive) return this.destroyed();
    return true;
  }

  public checkCollision(x: number, y: number, c: Collidable, shot?: Shot): boolean {
    const ox = Math.abs(this.pos.x - x);
    const oy = Math.abs(this.pos.y - y);
    if (ox + oy > this.spec.size * 2) return false;

    for (let i = 0; i < this.spec.turretGroupNum; i++) {
      if (this.turretGroup[i].checkCollision(x, y, c, shot as Shot)) return true;
    }

    // bridge collision fallback based on bridge radius and collidable extent.
    const bc = c.collision();
    const br = Math.max(0.2, this.spec.size * (1 - this.spec.distRatio) * 0.9);
    if (ox <= br + bc.x && oy <= br + bc.y) {
      this.addDamage((shot as unknown as { damage?: number } | undefined)?.damage ?? 1, shot);
      return true;
    }
    return false;
  }

  public increaseMultiplier(m: number): void {
    this.multiplier += m;
  }

  public addScore(s: number): void {
    this.setScoreIndicator(s, 1);
  }

  public addDamage(n: number, shot?: Shot): void {
    this.shield -= n;
    if (this.shield <= 0) {
      this.destroyed(shot);
    } else {
      this.damaged = true;
      this.damagedCnt = 7;
    }
  }

  public destroyed(shot?: Shot): boolean {
    let vz = 0;
    if (shot) {
      const sd = (shot as unknown as { deg: number }).deg;
      EnemyState.explodeVel.x = Math.sin(sd) * 0.3;
      EnemyState.explodeVel.y = Math.cos(sd) * 0.3;
      vz = 0;
    } else {
      EnemyState.explodeVel.x = 0;
      EnemyState.explodeVel.y = 0;
      vz = 0.05;
    }

    let ss = this.spec.size * 1.5;
    if (ss > 2) ss = 2;

    let sn: number;
    if (this.spec.size < 1) sn = this.spec.size;
    else sn = Math.sqrt(this.spec.size);
    if (sn > 3) sn = 3;

    for (let i = 0; i < sn * 8; i++) {
      const s = this.smokes.getInstanceForced();
      s.set(
        this.pos,
        EnemyState.rand.nextSignedFloat(0.1) + EnemyState.explodeVel.x,
        EnemyState.rand.nextSignedFloat(0.1) + EnemyState.explodeVel.y,
        EnemyState.rand.nextFloat(vz),
        Smoke.SmokeType.EXPLOSION,
        32 + EnemyState.rand.nextInt(30),
        ss,
      );
    }

    for (let i = 0; i < sn * 36; i++) {
      const sp = this.sparks.getInstanceForced();
      sp.set(
        this.pos,
        EnemyState.rand.nextSignedFloat(0.8) + EnemyState.explodeVel.x,
        EnemyState.rand.nextSignedFloat(0.8) + EnemyState.explodeVel.y,
        0.5 + EnemyState.rand.nextFloat(0.5),
        0.5 + EnemyState.rand.nextFloat(0.5),
        0,
        30 + EnemyState.rand.nextInt(30),
      );
    }

    for (let i = 0; i < sn * 12; i++) {
      const f = this.fragments.getInstanceForced();
      f.set(
        this.pos,
        EnemyState.rand.nextSignedFloat(0.33) + EnemyState.explodeVel.x,
        EnemyState.rand.nextSignedFloat(0.33) + EnemyState.explodeVel.y,
        0.05 + EnemyState.rand.nextFloat(0.1),
        0.2 + EnemyState.rand.nextFloat(0.33),
      );
    }

    this.removeTurrets();
    let sc = this.spec.score;

    if (this.spec.type === EnemySpec.EnemyType.SMALL) {
      SoundManager.playSe("small_destroyed.wav");
      this.setScoreIndicator(sc, this.multiplier);
      return false;
    }

    SoundManager.playSe("destroyed.wav");
    const bn = this.bullets.removeIndexedBullets(this.idx);
    this.destroyedCnt = 0;
    this.explodeCnt = 1;
    this.explodeItv = 3;
    sc += bn * 10;
    if (this.spec.isBoss) this.screen.setScreenShake(45, 0.04);
    this.setScoreIndicator(sc, this.multiplier);
    return true;
  }

  private setScoreIndicator(sc: number, mp: number): void {
    const ty = NumIndicator.getTargetY();
    if (mp > 1) {
      let ni = this.numIndicators.getInstanceForced();
      ni.set(sc, NumIndicator.IndicatorType.SCORE, 0.5, this.pos);
      ni.addTarget(8, ty, NumIndicator.FlyingToType.RIGHT, 1, 0.5, sc, 40);
      ni.addTarget(11, ty, NumIndicator.FlyingToType.RIGHT, 0.5, 0.75, Math.trunc(sc * mp), 30);
      ni.addTarget(13, ty, NumIndicator.FlyingToType.RIGHT, 0.25, 1, Math.trunc(sc * mp * this.stageManager.rankMultiplier), 20);
      ni.addTarget(12, -8, NumIndicator.FlyingToType.BOTTOM, 0.5, 0.1, Math.trunc(sc * mp * this.stageManager.rankMultiplier), 40);
      ni.gotoNextTarget();

      ni = this.numIndicators.getInstanceForced();
      const mn = Math.trunc(mp * 1000);
      ni.set(mn, NumIndicator.IndicatorType.MULTIPLIER, 0.7, this.pos);
      ni.addTarget(10.5, ty, NumIndicator.FlyingToType.RIGHT, 0.5, 0.2, mn, 70);
      ni.gotoNextTarget();

      ni = this.numIndicators.getInstanceForced();
      const rn = Math.trunc(this.stageManager.rankMultiplier * 1000);
      ni.set(rn, NumIndicator.IndicatorType.MULTIPLIER, 0.4, 11, 8);
      ni.addTarget(13, ty, NumIndicator.FlyingToType.RIGHT, 0.5, 0.2, rn, 40);
      ni.gotoNextTarget();

      this.scoreReel.addActualScore(Math.trunc(sc * mp * this.stageManager.rankMultiplier));
    } else {
      let ni = this.numIndicators.getInstanceForced();
      ni.set(sc, NumIndicator.IndicatorType.SCORE, 0.3, this.pos);
      ni.addTarget(11, ty, NumIndicator.FlyingToType.RIGHT, 1.5, 0.2, sc, 40);
      ni.addTarget(13, ty, NumIndicator.FlyingToType.RIGHT, 0.25, 0.25, Math.trunc(sc * this.stageManager.rankMultiplier), 20);
      ni.addTarget(12, -8, NumIndicator.FlyingToType.BOTTOM, 0.5, 0.1, Math.trunc(sc * this.stageManager.rankMultiplier), 40);
      ni.gotoNextTarget();

      ni = this.numIndicators.getInstanceForced();
      const rn = Math.trunc(this.stageManager.rankMultiplier * 1000);
      ni.set(rn, NumIndicator.IndicatorType.MULTIPLIER, 0.4, 11, 8);
      ni.addTarget(13, ty, NumIndicator.FlyingToType.RIGHT, 0.5, 0.2, rn, 40);
      ni.gotoNextTarget();

      this.scoreReel.addActualScore(Math.trunc(sc * this.stageManager.rankMultiplier));
    }
  }

  public destroyedEdge(n: number): void {
    SoundManager.playSe("explode.wav");
    let sn = n;
    if (sn > 48) sn = 48;

    const bs = (this.spec.shape as unknown as { shape?: BaseShape }).shape;
    const spp = bs?.pointPos?.() ?? [new Vector(0, this.spec.size)];
    const spd = bs?.pointDeg?.() ?? [0];

    const si = EnemyState.rand.nextInt(spp.length);
    EnemyState.edgePos.x = spp[si].x * this.spec.size + this.pos.x;
    EnemyState.edgePos.y = spp[si].y * this.spec.size + this.pos.y;

    let ss = this.spec.size * 0.5;
    if (ss > 1) ss = 1;

    for (let i = 0; i < sn; i++) {
      const s = this.smokes.getInstanceForced();
      const sr = EnemyState.rand.nextFloat(0.5);
      const sd = spd[si] + EnemyState.rand.nextSignedFloat(0.2);
      s.set(EnemyState.edgePos, Math.sin(sd) * sr, Math.cos(sd) * sr, -0.004, Smoke.SmokeType.EXPLOSION, 75 + EnemyState.rand.nextInt(25), ss);

      for (let j = 0; j < 2; j++) {
        const sp = this.sparks.getInstanceForced();
        sp.set(
          EnemyState.edgePos,
          Math.sin(sd) * sr * 2,
          Math.cos(sd) * sr * 2,
          0.5 + EnemyState.rand.nextFloat(0.5),
          0.5 + EnemyState.rand.nextFloat(0.5),
          0,
          30 + EnemyState.rand.nextInt(30),
        );
      }

      if (i % 2 === 0) {
        const sf = this.sparkFragments.getInstanceForced();
        sf.set(
          EnemyState.edgePos,
          Math.sin(sd) * sr * 0.5,
          Math.cos(sd) * sr * 0.5,
          0.06 + EnemyState.rand.nextFloat(0.07),
          0.2 + EnemyState.rand.nextFloat(0.1),
        );
      }
    }
  }

  public removeTurrets(): void {
    for (let i = 0; i < this.spec.turretGroupNum; i++) this.turretGroup[i].remove();
    for (let i = 0; i < this.spec.movingTurretGroupNum; i++) this.movingTurretGroup[i].remove();
  }

  public draw(): void {
    Screen3D.glPushMatrix();
    if (this.destroyedCnt < 0 && this.damagedCnt > 0) {
      EnemyState.damagedPos.x = this.pos.x + EnemyState.rand.nextSignedFloat(this.damagedCnt * 0.01);
      EnemyState.damagedPos.y = this.pos.y + EnemyState.rand.nextSignedFloat(this.damagedCnt * 0.01);
      Screen3D.glTranslatef(EnemyState.damagedPos.x, EnemyState.damagedPos.y, 0);
    } else {
      Screen3D.glTranslatef(this.pos.x, this.pos.y, 0);
    }
    Screen3D.glRotatef((-this.deg * 180) / Math.PI, 0, 0, 1);

    if (this.destroyedCnt >= 0) this.spec.destroyedShape.draw();
    else if (!this.damaged) this.spec.shape.draw();
    else this.spec.damagedShape.draw();

    if (this.destroyedCnt < 0) this.spec.bridgeShape.draw();
    Screen3D.glPopMatrix();

    if (this.destroyedCnt >= 0) return;

    for (let i = 0; i < this.spec.turretGroupNum; i++) this.turretGroup[i].draw();

    if (this.multiplier > 1) {
      let ox: number;
      let oy = 1.25;
      if (this.multiplier < 10) ox = 2.1;
      else ox = 1.4;
      if (this.spec.isBoss) {
        ox += 4;
        oy -= 1.25;
      }
      Letter.drawNumSign(Math.trunc(this.multiplier * 1000), this.pos.x + ox, this.pos.y + oy, 0.33, 1, 33, 3);
    }
  }
}

/**
 * Base class for a specification of an enemy.
 */
export class EnemySpec {
  public static readonly EnemyType = {
    SMALL: 0,
    LARGE: 1,
    PLATFORM: 2,
  } as const;

  protected static readonly rand = new Rand();

  public shield = 1;
  private _size = 1;
  public distRatio = 0;
  public turretGroupSpec: TurretGroupSpec[] = Array.from({ length: EnemyState.TURRET_GROUP_MAX }, () => new TurretGroupSpec());
  public turretGroupNum = 0;
  public movingTurretGroupSpec: MovingTurretGroupSpec[] = Array.from(
    { length: EnemyState.MOVING_TURRET_GROUP_MAX },
    () => new MovingTurretGroupSpec(),
  );
  public movingTurretGroupNum = 0;
  public shape!: EnemyShape;
  public damagedShape!: EnemyShape;
  public destroyedShape!: EnemyShape;
  public bridgeShape!: EnemyShape;
  public type: number = EnemySpec.EnemyType.SMALL;

  protected _score = 0;
  protected _isBoss = false;

  public constructor(
    protected readonly field: FieldLike,
    protected readonly ship: ShipLike,
    protected readonly sparks: SparkPoolLike,
    protected readonly smokes: SmokePoolLike,
    protected readonly fragments: FragmentPoolLike,
    protected readonly wakes: WakePoolLike,
  ) {
    this.set(this.type);
  }

  public static setRandSeed(seed: number): void {
    EnemySpec.rand.setSeed(seed);
  }

  public set(type: number): void {
    this.type = type;
    this._size = 1;
    this.distRatio = 0;
    this.turretGroupNum = 0;
    this.movingTurretGroupNum = 0;
  }

  protected getTurretGroupSpec(): TurretGroupSpec {
    const i = this.turretGroupNum;
    this.turretGroupNum++;
    this.turretGroupSpec[i].init();
    return this.turretGroupSpec[i];
  }

  protected getMovingTurretGroupSpec(): MovingTurretGroupSpec {
    const i = this.movingTurretGroupNum;
    this.movingTurretGroupNum++;
    this.movingTurretGroupSpec[i].init();
    return this.movingTurretGroupSpec[i];
  }

  protected addMovingTurret(rank: number, bossMode = false): void {
    let mtn = Math.trunc(rank * 0.2);
    if (mtn > EnemyState.MOVING_TURRET_GROUP_MAX) mtn = EnemyState.MOVING_TURRET_GROUP_MAX;
    if (mtn >= 2) mtn = 1 + EnemySpec.rand.nextInt(mtn - 1);
    else mtn = 1;

    const br = rank / mtn;

    let moveType: number = MovingTurretGroupSpec.MoveType.ROLL;
    if (!bossMode) {
      switch (EnemySpec.rand.nextInt(4)) {
        case 0:
        case 1:
          moveType = MovingTurretGroupSpec.MoveType.ROLL;
          break;
        case 2:
          moveType = MovingTurretGroupSpec.MoveType.SWING_FIX;
          break;
        default:
          moveType = MovingTurretGroupSpec.MoveType.SWING_AIM;
          break;
      }
    }

    let rad = 0.9 + EnemySpec.rand.nextFloat(0.4) - mtn * 0.1;
    const radInc = 0.5 + EnemySpec.rand.nextFloat(0.25);
    let ad = Math.PI * 2;

    let a = 0;
    let av = 0;
    let dv = 0;
    let s = 0;
    let sv = 0;

    switch (moveType) {
      case MovingTurretGroupSpec.MoveType.ROLL:
        a = 0.01 + EnemySpec.rand.nextFloat(0.04);
        av = 0.01 + EnemySpec.rand.nextFloat(0.03);
        dv = 0.01 + EnemySpec.rand.nextFloat(0.04);
        break;
      case MovingTurretGroupSpec.MoveType.SWING_FIX:
        ad = Math.PI / 10 + EnemySpec.rand.nextFloat(Math.PI / 15);
        s = 0.01 + EnemySpec.rand.nextFloat(0.02);
        sv = 0.01 + EnemySpec.rand.nextFloat(0.03);
        break;
      case MovingTurretGroupSpec.MoveType.SWING_AIM:
        ad = Math.PI / 10 + EnemySpec.rand.nextFloat(Math.PI / 15);
        if (EnemySpec.rand.nextInt(5) === 0) s = 0.01 + EnemySpec.rand.nextFloat(0.01);
        else s = 0;
        sv = 0.01 + EnemySpec.rand.nextFloat(0.02);
        break;
    }

    for (let i = 0; i < mtn; i++) {
      const tgs = this.getMovingTurretGroupSpec();
      tgs.moveType = moveType;
      tgs.radiusBase = rad;
      let sr = br;

      switch (moveType) {
        case MovingTurretGroupSpec.MoveType.ROLL:
          tgs.alignDeg = ad;
          tgs.num = 4 + EnemySpec.rand.nextInt(6);
          if (EnemySpec.rand.nextInt(2) === 0) {
            if (EnemySpec.rand.nextInt(2) === 0) tgs.setRoll(dv, 0, 0);
            else tgs.setRoll(-dv, 0, 0);
          } else if (EnemySpec.rand.nextInt(2) === 0) {
            tgs.setRoll(0, a, av);
          } else {
            tgs.setRoll(0, -a, av);
          }
          if (EnemySpec.rand.nextInt(3) === 0) tgs.setRadiusAmp(1 + EnemySpec.rand.nextFloat(1), 0.01 + EnemySpec.rand.nextFloat(0.03));
          if (EnemySpec.rand.nextInt(2) === 0) tgs.distRatio = 0.8 + EnemySpec.rand.nextSignedFloat(0.3);
          sr = br / tgs.num;
          break;
        case MovingTurretGroupSpec.MoveType.SWING_FIX:
          tgs.num = 3 + EnemySpec.rand.nextInt(5);
          tgs.alignDeg = ad * (tgs.num * 0.1 + 0.3);
          if (EnemySpec.rand.nextInt(2) === 0) tgs.setSwing(s, sv);
          else tgs.setSwing(-s, sv);
          if (EnemySpec.rand.nextInt(6) === 0) tgs.setRadiusAmp(1 + EnemySpec.rand.nextFloat(1), 0.01 + EnemySpec.rand.nextFloat(0.03));
          if (EnemySpec.rand.nextInt(4) === 0) tgs.setAlignAmp(0.25 + EnemySpec.rand.nextFloat(0.25), 0.01 + EnemySpec.rand.nextFloat(0.02));
          sr = (br / tgs.num) * 0.6;
          break;
        default:
          tgs.num = 3 + EnemySpec.rand.nextInt(4);
          tgs.alignDeg = ad * (tgs.num * 0.1 + 0.3);
          if (EnemySpec.rand.nextInt(2) === 0) tgs.setSwing(s, sv, true);
          else tgs.setSwing(-s, sv, true);
          if (EnemySpec.rand.nextInt(4) === 0) tgs.setRadiusAmp(1 + EnemySpec.rand.nextFloat(1), 0.01 + EnemySpec.rand.nextFloat(0.03));
          if (EnemySpec.rand.nextInt(5) === 0) tgs.setAlignAmp(0.25 + EnemySpec.rand.nextFloat(0.25), 0.01 + EnemySpec.rand.nextFloat(0.02));
          sr = (br / tgs.num) * 0.4;
          break;
      }

      if (EnemySpec.rand.nextInt(4) === 0) tgs.setXReverse(-1);
      tgs.turretSpec.setParam(sr, TurretSpec.TurretType.MOVING, EnemySpec.rand);
      if (bossMode) tgs.turretSpec.setBossSpec();

      rad += radInc;
      ad *= 1 + EnemySpec.rand.nextSignedFloat(0.2);
    }
  }

  public checkCollision(es: EnemyState, x: number, y: number, c: Collidable, shot?: Shot): boolean {
    return es.checkCollision(x, y, c, shot);
  }

  public checkShipCollision(es: EnemyState, x: number, y: number, largeOnly = false): boolean {
    if (es.destroyedCnt >= 0 || (largeOnly && this.type !== EnemySpec.EnemyType.LARGE)) return false;
    return this.shape.checkShipCollision(x - es.pos.x, y - es.pos.y, es.deg);
  }

  public move(es: EnemyState): boolean {
    return es.move();
  }

  public draw(es: EnemyState): void {
    es.draw();
  }

  public get size(): number {
    return this._size;
  }

  public set size(v: number) {
    this._size = v;
    if (this.shape) this.shape.size = this._size;
    if (this.damagedShape) this.damagedShape.size = this._size;
    if (this.destroyedShape) this.destroyedShape.size = this._size;
    if (this.bridgeShape) this.bridgeShape.size = 0.9 * (1 - this.distRatio);
  }

  public get isSmallEnemy(): boolean {
    return this.type === EnemySpec.EnemyType.SMALL;
  }

  public get score(): number {
    return this._score;
  }

  public get isBoss(): boolean {
    return this._isBoss;
  }
}

export interface HasAppearType {
  setFirstState(es: EnemyState, appType: number): boolean;
}

/**
 * Specification for a small class ship.
 */
export class SmallShipEnemySpec extends EnemySpec implements HasAppearType {
  public static readonly MoveType = {
    STOPANDGO: 0,
    CHASE: 1,
  } as const;

  public static readonly MoveState = {
    STAYING: 0,
    MOVING: 1,
  } as const;

  private moveType: number = SmallShipEnemySpec.MoveType.STOPANDGO;
  private accel = 0;
  private maxSpeed = 0;
  private staySpeed = 0;
  private moveDuration = 1;
  private stayDuration = 1;
  private chaseSpeed = 0;
  private turnDeg = 0;

  public constructor(
    field: FieldLike,
    ship: ShipLike,
    sparks: SparkPoolLike,
    smokes: SmokePoolLike,
    fragments: FragmentPoolLike,
    wakes: WakePoolLike,
  ) {
    super(field, ship, sparks, smokes, fragments, wakes);
  }

  public setParam(rank: number, rand: Rand): void {
    this.set(EnemySpec.EnemyType.SMALL);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_DAMAGED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_BRIDGE);
    this.destroyedShape = this.damagedShape;
    this._isBoss = false;
    this._score = 50;

    this.moveType = rand.nextInt(2);
    let sr = rand.nextFloat(rank * 0.8);
    if (sr > 25) sr = 25;

    switch (this.moveType) {
      case SmallShipEnemySpec.MoveType.STOPANDGO:
        this.distRatio = 0.5;
        this.size = 0.47 + rand.nextFloat(0.1);
        this.accel = 0.5 - 0.5 / (2.0 + rand.nextFloat(rank));
        this.maxSpeed = 0.05 * (1.0 + sr);
        this.staySpeed = 0.03;
        this.moveDuration = 32 + rand.nextSignedInt(12);
        this.stayDuration = 32 + rand.nextSignedInt(12);
        break;
      default:
        this.distRatio = 0.5;
        this.size = 0.5 + rand.nextFloat(0.1);
        this.chaseSpeed = 0.036 * (1.0 + sr);
        this.turnDeg = 0.02 + rand.nextSignedFloat(0.04);
        break;
    }

    this.shield = 1;
    const tgs = this.getTurretGroupSpec();
    tgs.turretSpec.setParam(rank - sr * 0.5, TurretSpec.TurretType.SMALL, rand);
  }

  public setFirstState(es: EnemyState, appType: number): boolean {
    es.setSpec(this);
    if (!es.setAppearancePos(this.field, this.ship, EnemySpec.rand, appType)) return false;

    switch (this.moveType) {
      case SmallShipEnemySpec.MoveType.STOPANDGO:
        es.speed = 0;
        es.state = SmallShipEnemySpec.MoveState.MOVING;
        es.cnt = this.moveDuration;
        break;
      default:
        es.speed = this.chaseSpeed;
        break;
    }
    return true;
  }

  public override move(es: EnemyState): boolean {
    if (!super.move(es)) return false;

    switch (this.moveType) {
      case SmallShipEnemySpec.MoveType.STOPANDGO:
        es.pos.x += Math.sin(es.velDeg) * es.speed;
        es.pos.y += Math.cos(es.velDeg) * es.speed;
        es.pos.y -= this.field.lastScrollY;
        if (es.pos.y <= -this.field.outerSize.y) return false;

        if (this.field.getBlock(es.pos) >= 0 || !this.field.checkInOuterHeightField(es.pos)) {
          es.velDeg += Math.PI;
          es.pos.x += Math.sin(es.velDeg) * es.speed * 2;
          es.pos.y += Math.cos(es.velDeg) * es.speed * 2;
        }

        switch (es.state) {
          case SmallShipEnemySpec.MoveState.MOVING:
            es.speed += (this.maxSpeed - es.speed) * this.accel;
            es.cnt--;
            if (es.cnt <= 0) {
              es.velDeg = EnemySpec.rand.nextFloat(Math.PI * 2);
              es.cnt = this.stayDuration;
              es.state = SmallShipEnemySpec.MoveState.STAYING;
            }
            break;
          default:
            es.speed += (this.staySpeed - es.speed) * this.accel;
            es.cnt--;
            if (es.cnt <= 0) {
              es.cnt = this.moveDuration;
              es.state = SmallShipEnemySpec.MoveState.MOVING;
            }
            break;
        }
        break;

      default:
        es.pos.x += Math.sin(es.velDeg) * this.chaseSpeed;
        es.pos.y += Math.cos(es.velDeg) * this.chaseSpeed;
        es.pos.y -= this.field.lastScrollY;
        if (es.pos.y <= -this.field.outerSize.y) return false;

        if (this.field.getBlock(es.pos) >= 0 || !this.field.checkInOuterHeightField(es.pos)) {
          es.velDeg += Math.PI;
          es.pos.x += Math.sin(es.velDeg) * es.speed * 2;
          es.pos.y += Math.cos(es.velDeg) * es.speed * 2;
        }

        const shipPos = this.ship.nearPos(es.pos);
        let ad = 0;
        if (shipPos.dist(es.pos) >= 0.1) ad = Math.atan2(shipPos.x - es.pos.x, shipPos.y - es.pos.y);
        let od = ad - es.velDeg;
        od = MathUtil.normalizeDeg(od);
        if (od <= this.turnDeg && od >= -this.turnDeg) es.velDeg = ad;
        else if (od < 0) es.velDeg -= this.turnDeg;
        else es.velDeg += this.turnDeg;
        es.velDeg = MathUtil.normalizeDeg(es.velDeg);
        es.cnt++;
        break;
    }

    let od = es.velDeg - es.deg;
    od = MathUtil.normalizeDeg(od);
    es.deg += od * 0.05;
    es.deg = MathUtil.normalizeDeg(es.deg);

    if (es.cnt % 6 === 0 && es.speed >= 0.03) this.shape.addWake(this.wakes as unknown as never, es.pos, es.deg, es.speed);
    return true;
  }
}

/**
 * Specification for a large/middle class ship.
 */
export class ShipEnemySpec extends EnemySpec implements HasAppearType {
  public static readonly ShipClass = {
    MIDDLE: 0,
    LARGE: 1,
    BOSS: 2,
  } as const;

  private static readonly SINK_INTERVAL = 120;

  private speed = 0;
  private degVel = 0;
  private shipClass: number = ShipEnemySpec.ShipClass.MIDDLE;

  public constructor(
    field: FieldLike,
    ship: ShipLike,
    sparks: SparkPoolLike,
    smokes: SmokePoolLike,
    fragments: FragmentPoolLike,
    wakes: WakePoolLike,
  ) {
    super(field, ship, sparks, smokes, fragments, wakes);
  }

  public setParam(rank: number, cls: number, rand: Rand): void {
    this.shipClass = cls;
    this.set(EnemySpec.EnemyType.LARGE);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_DAMAGED);
    this.destroyedShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_DESTROYED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_BRIDGE);
    this.distRatio = 0.7;

    let mainTurretNum = 0;
    let subTurretNum = 0;
    let movingTurretRatio = 0;
    let rk = rank;

    switch (cls) {
      case ShipEnemySpec.ShipClass.MIDDLE: {
        let sz = 1.5 + rank / 15 + rand.nextFloat(rank / 15);
        const ms = 2 + rand.nextFloat(0.5);
        if (sz > ms) sz = ms;
        this.size = sz;
        this.speed = 0.015 + rand.nextSignedFloat(0.005);
        this.degVel = 0.005 + rand.nextSignedFloat(0.003);

        switch (rand.nextInt(3)) {
          case 0:
            mainTurretNum = Math.trunc(this.size * (1 + rand.nextSignedFloat(0.25)) + 1);
            break;
          case 1:
            subTurretNum = Math.trunc(this.size * 1.6 * (1 + rand.nextSignedFloat(0.5)) + 2);
            break;
          default:
            mainTurretNum = Math.trunc(this.size * (0.5 + rand.nextSignedFloat(0.12)) + 1);
            movingTurretRatio = 0.5 + rand.nextFloat(0.25);
            rk = rank * (1 - movingTurretRatio);
            movingTurretRatio *= 2;
            break;
        }
        break;
      }

      case ShipEnemySpec.ShipClass.LARGE: {
        let sz = 2.5 + rank / 24 + rand.nextFloat(rank / 24);
        const ms = 3 + rand.nextFloat(1);
        if (sz > ms) sz = ms;
        this.size = sz;
        this.speed = 0.01 + rand.nextSignedFloat(0.005);
        this.degVel = 0.003 + rand.nextSignedFloat(0.002);
        mainTurretNum = Math.trunc(this.size * (0.7 + rand.nextSignedFloat(0.2)) + 1);
        subTurretNum = Math.trunc(this.size * 1.6 * (0.7 + rand.nextSignedFloat(0.33)) + 2);
        movingTurretRatio = 0.25 + rand.nextFloat(0.5);
        rk = rank * (1 - movingTurretRatio);
        movingTurretRatio *= 3;
        break;
      }

      default: {
        let sz = 5 + rank / 30 + rand.nextFloat(rank / 30);
        const ms = 9 + rand.nextFloat(3);
        if (sz > ms) sz = ms;
        this.size = sz;
        this.speed = this.ship.scrollSpeedBase + 0.0025 + rand.nextSignedFloat(0.001);
        this.degVel = 0.003 + rand.nextSignedFloat(0.002);
        mainTurretNum = Math.trunc(this.size * 0.8 * (1.5 + rand.nextSignedFloat(0.4)) + 2);
        subTurretNum = Math.trunc(this.size * 0.8 * (2.4 + rand.nextSignedFloat(0.6)) + 2);
        movingTurretRatio = 0.2 + rand.nextFloat(0.3);
        rk = rank * (1 - movingTurretRatio);
        movingTurretRatio *= 2.5;
        break;
      }
    }

    this.shield = Math.trunc(this.size * 10);
    if (cls === ShipEnemySpec.ShipClass.BOSS) this.shield = Math.trunc(this.shield * 2.4);

    if (mainTurretNum + subTurretNum <= 0) {
      const tgs = this.getTurretGroupSpec();
      tgs.turretSpec.setParam(0, TurretSpec.TurretType.DUMMY, rand);
    } else {
      const subTurretRank = rk / (mainTurretNum * 3 + subTurretNum);
      let mainTurretRank = subTurretRank * 2.5;

      if (cls !== ShipEnemySpec.ShipClass.BOSS) {
        const frontMainTurretNum = Math.trunc(mainTurretNum / 2 + 0.99);
        const rearMainTurretNum = mainTurretNum - frontMainTurretNum;

        if (frontMainTurretNum > 0) {
          const tgs = this.getTurretGroupSpec();
          tgs.turretSpec.setParam(mainTurretRank, TurretSpec.TurretType.MAIN, rand);
          tgs.num = frontMainTurretNum;
          tgs.alignType = TurretGroupSpec.AlignType.STRAIGHT;
          tgs.offset.y = -this.size * (0.9 + rand.nextSignedFloat(0.05));
        }

        if (rearMainTurretNum > 0) {
          const tgs = this.getTurretGroupSpec();
          tgs.turretSpec.setParam(mainTurretRank, TurretSpec.TurretType.MAIN, rand);
          tgs.num = rearMainTurretNum;
          tgs.alignType = TurretGroupSpec.AlignType.STRAIGHT;
          tgs.offset.y = this.size * (0.9 + rand.nextSignedFloat(0.05));
        }

        if (subTurretNum > 0) {
          const frontSubTurretNum = Math.trunc((subTurretNum + 2) / 4);
          const rearSubTurretNum = Math.trunc((subTurretNum - frontSubTurretNum * 2) / 2);
          let tn = frontSubTurretNum;
          let ad = -Math.PI / 4;
          let pts: TurretSpec | null = null;

          for (let i = 0; i < 4; i++) {
            if (i === 2) tn = rearSubTurretNum;
            if (tn <= 0) continue;

            const tgs = this.getTurretGroupSpec();
            if (i === 0 || i === 2) {
              if (rand.nextInt(2) === 0) tgs.turretSpec.setParam(subTurretRank, TurretSpec.TurretType.SUB, rand);
              else tgs.turretSpec.setParam(subTurretRank, TurretSpec.TurretType.SUB_DESTRUCTIVE, rand);
              pts = tgs.turretSpec;
            } else if (pts) {
              tgs.turretSpec.setParam(pts);
            }

            tgs.num = tn;
            tgs.alignType = TurretGroupSpec.AlignType.ROUND;
            tgs.alignDeg = ad;
            ad += Math.PI / 2;
            tgs.alignWidth = Math.PI / 6 + rand.nextFloat(Math.PI / 8);
            tgs.radius = this.size * 0.75;
            tgs.distRatio = this.distRatio;
          }
        }
      } else {
        mainTurretRank *= 2.5;
        const bossSubTurretRank = subTurretRank * 2;

        if (mainTurretNum > 0) {
          const frontMainTurretNum = Math.trunc((mainTurretNum + 2) / 4);
          const rearMainTurretNum = Math.trunc((mainTurretNum - frontMainTurretNum * 2) / 2);
          let tn = frontMainTurretNum;
          let ad = -Math.PI / 4;
          let pts: TurretSpec | null = null;

          for (let i = 0; i < 4; i++) {
            if (i === 2) tn = rearMainTurretNum;
            if (tn <= 0) continue;

            const tgs = this.getTurretGroupSpec();
            if (i === 0 || i === 2) {
              tgs.turretSpec.setParam(mainTurretRank, TurretSpec.TurretType.MAIN, rand);
              tgs.turretSpec.setBossSpec();
              pts = tgs.turretSpec;
            } else if (pts) {
              tgs.turretSpec.setParam(pts);
            }

            tgs.num = tn;
            tgs.alignType = TurretGroupSpec.AlignType.ROUND;
            tgs.alignDeg = ad;
            ad += Math.PI / 2;
            tgs.alignWidth = Math.PI / 6 + rand.nextFloat(Math.PI / 8);
            tgs.radius = this.size * 0.45;
            tgs.distRatio = this.distRatio;
          }
        }

        if (subTurretNum > 0) {
          const tn = [
            Math.trunc((subTurretNum + 2) / 6),
            Math.trunc((subTurretNum - Math.trunc((subTurretNum + 2) / 6) * 2) / 4),
            0,
          ];
          tn[2] = Math.trunc(subTurretNum - tn[0] * 2 - tn[1] * 2);
          const ad = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (Math.PI / 4) * 3, (-Math.PI / 4) * 3];
          let pts: TurretSpec | null = null;

          for (let i = 0; i < 6; i++) {
            const idx = Math.trunc(i / 2);
            if (tn[idx] <= 0) continue;

            const tgs = this.getTurretGroupSpec();
            if (i === 0 || i === 2 || i === 4) {
              if (rand.nextInt(2) === 0) tgs.turretSpec.setParam(bossSubTurretRank, TurretSpec.TurretType.SUB, rand);
              else tgs.turretSpec.setParam(bossSubTurretRank, TurretSpec.TurretType.SUB_DESTRUCTIVE, rand);
              tgs.turretSpec.setBossSpec();
              pts = tgs.turretSpec;
            } else if (pts) {
              tgs.turretSpec.setParam(pts);
            }

            tgs.num = tn[idx];
            tgs.alignType = TurretGroupSpec.AlignType.ROUND;
            tgs.alignDeg = ad[i];
            tgs.alignWidth = Math.PI / 7 + rand.nextFloat(Math.PI / 9);
            tgs.radius = this.size * 0.75;
            tgs.distRatio = this.distRatio;
          }
        }
      }
    }

    if (movingTurretRatio > 0) {
      if (cls === ShipEnemySpec.ShipClass.BOSS) this.addMovingTurret(rank * movingTurretRatio, true);
      else this.addMovingTurret(rank * movingTurretRatio);
    }

    this._score = this.shipClass === ShipEnemySpec.ShipClass.MIDDLE ? 100 : this.shipClass === ShipEnemySpec.ShipClass.LARGE ? 300 : 1000;
    this._isBoss = this.shipClass === ShipEnemySpec.ShipClass.BOSS;
  }

  public setFirstState(es: EnemyState, appType: number): boolean {
    es.setSpec(this);
    if (!es.setAppearancePos(this.field, this.ship, EnemySpec.rand, appType)) return false;
    es.speed = this.speed;
    es.turnWay = es.pos.x < 0 ? -1 : 1;

    if (this.isBoss) {
      es.trgDeg = EnemySpec.rand.nextFloat(0.1) + 0.1;
      if (EnemySpec.rand.nextInt(2) === 0) es.trgDeg *= -1;
      es.turnCnt = 250 + EnemySpec.rand.nextInt(150);
    }
    return true;
  }

  public override move(es: EnemyState): boolean {
    if (es.destroyedCnt >= ShipEnemySpec.SINK_INTERVAL) return false;
    if (!super.move(es)) return false;

    es.pos.x += Math.sin(es.deg) * es.speed;
    es.pos.y += Math.cos(es.deg) * es.speed;
    es.pos.y -= this.field.lastScrollY;

    if (
      es.pos.x <= -this.field.outerSize.x - this.size ||
      es.pos.x >= this.field.outerSize.x + this.size ||
      es.pos.y <= -this.field.outerSize.y - this.size
    ) {
      return false;
    }

    if (es.pos.y > this.field.outerSize.y * 2.2 + this.size) es.pos.y = this.field.outerSize.y * 2.2 + this.size;

    if (this.isBoss) {
      es.turnCnt--;
      if (es.turnCnt <= 0) {
        es.turnCnt = 250 + EnemySpec.rand.nextInt(150);
        es.trgDeg = EnemySpec.rand.nextFloat(0.1) + 0.2;
        if (es.pos.x > 0) es.trgDeg *= -1;
      }
      es.deg += (es.trgDeg - es.deg) * 0.0025;
      if (this.ship.higherPos.y > es.pos.y) es.speed += (this.speed * 2 - es.speed) * 0.005;
      else es.speed += (this.speed - es.speed) * 0.01;
    } else if (!es.checkFrontClear()) {
      es.deg += this.degVel * es.turnWay;
      es.speed *= 0.98;
    } else if (es.destroyedCnt < 0) {
      es.speed += (this.speed - es.speed) * 0.01;
    } else {
      es.speed *= 0.98;
    }

    es.cnt++;
    if (es.cnt % 6 === 0 && es.speed >= 0.01 && es.destroyedCnt < ShipEnemySpec.SINK_INTERVAL / 2) {
      this.shape.addWake(this.wakes as unknown as never, es.pos, es.deg, es.speed);
    }
    return true;
  }

  public override draw(es: EnemyState): void {
    if (es.destroyedCnt >= 0) {
      const ratio = (1 - es.destroyedCnt / ShipEnemySpec.SINK_INTERVAL) * 0.5;
      Screen.setColor(EnemyShape.MIDDLE_COLOR_R * ratio, EnemyShape.MIDDLE_COLOR_G * ratio, EnemyShape.MIDDLE_COLOR_B * ratio);
    }
    super.draw(es);
  }
}

/**
 * Specification for a sea-based platform.
 */
export class PlatformEnemySpec extends EnemySpec {
  public constructor(
    field: FieldLike,
    ship: ShipLike,
    sparks: SparkPoolLike,
    smokes: SmokePoolLike,
    fragments: FragmentPoolLike,
    wakes: WakePoolLike,
  ) {
    super(field, ship, sparks, smokes, fragments, wakes);
  }

  public setParam(rank: number, rand: Rand): void {
    this.set(EnemySpec.EnemyType.PLATFORM);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_DAMAGED);
    this.destroyedShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_DESTROYED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_BRIDGE);
    this.distRatio = 0;

    this.size = 1 + rank / 30 + rand.nextFloat(rank / 30);
    const ms = 1 + rand.nextFloat(0.25);
    if (this.size > ms) this.size = ms;

    let mainTurretNum = 0;
    let frontTurretNum = 0;
    let sideTurretNum = 0;
    let rk = rank;
    let movingTurretRatio = 0;

    switch (rand.nextInt(3)) {
      case 0:
        frontTurretNum = Math.trunc(this.size * (2 + rand.nextSignedFloat(0.5)) + 1);
        movingTurretRatio = 0.33 + rand.nextFloat(0.46);
        rk *= 1 - movingTurretRatio;
        movingTurretRatio *= 2.5;
        break;
      case 1:
        frontTurretNum = Math.trunc(this.size * (0.5 + rand.nextSignedFloat(0.2)) + 1);
        sideTurretNum = Math.trunc(this.size * (0.5 + rand.nextSignedFloat(0.2)) + 1) * 2;
        break;
      default:
        mainTurretNum = Math.trunc(this.size * (1 + rand.nextSignedFloat(0.33)) + 1);
        break;
    }

    this.shield = Math.trunc(this.size * 20);

    const subTurretNum = frontTurretNum + sideTurretNum;
    const subTurretRank = rk / (mainTurretNum * 3 + subTurretNum);
    const mainTurretRank = subTurretRank * 2.5;

    if (mainTurretNum > 0) {
      const tgs = this.getTurretGroupSpec();
      tgs.turretSpec.setParam(mainTurretRank, TurretSpec.TurretType.MAIN, rand);
      tgs.num = mainTurretNum;
      tgs.alignType = TurretGroupSpec.AlignType.ROUND;
      tgs.alignDeg = 0;
      tgs.alignWidth = Math.PI * 0.66 + rand.nextFloat(Math.PI / 2);
      tgs.radius = this.size * 0.7;
      tgs.distRatio = this.distRatio;
    }

    if (frontTurretNum > 0) {
      const tgs = this.getTurretGroupSpec();
      tgs.turretSpec.setParam(subTurretRank, TurretSpec.TurretType.SUB, rand);
      tgs.num = frontTurretNum;
      tgs.alignType = TurretGroupSpec.AlignType.ROUND;
      tgs.alignDeg = 0;
      tgs.alignWidth = Math.PI / 5 + rand.nextFloat(Math.PI / 6);
      tgs.radius = this.size * 0.8;
      tgs.distRatio = this.distRatio;
    }

    sideTurretNum = Math.trunc(sideTurretNum / 2);
    if (sideTurretNum > 0) {
      let pts: TurretSpec | null = null;
      for (let i = 0; i < 2; i++) {
        const tgs = this.getTurretGroupSpec();
        if (i === 0) {
          tgs.turretSpec.setParam(subTurretRank, TurretSpec.TurretType.SUB, rand);
          pts = tgs.turretSpec;
        } else if (pts) {
          tgs.turretSpec.setParam(pts);
        }
        tgs.num = sideTurretNum;
        tgs.alignType = TurretGroupSpec.AlignType.ROUND;
        tgs.alignDeg = Math.PI / 2 - Math.PI * i;
        tgs.alignWidth = Math.PI / 5 + rand.nextFloat(Math.PI / 6);
        tgs.radius = this.size * 0.75;
        tgs.distRatio = this.distRatio;
      }
    }

    if (movingTurretRatio > 0) this.addMovingTurret(rank * movingTurretRatio);

    this._score = 100;
    this._isBoss = false;
  }

  public setFirstState(es: EnemyState, x: number, y: number, d: number): boolean {
    es.setSpec(this);
    es.pos.x = x;
    es.pos.y = y;
    es.deg = d;
    es.speed = 0;
    if (!es.checkFrontClear(true)) return false;
    return true;
  }

  public override move(es: EnemyState): boolean {
    if (!super.move(es)) return false;
    es.pos.y -= this.field.lastScrollY;
    if (es.pos.y <= -this.field.outerSize.y) return false;
    return true;
  }
}

export class EnemyPool extends ActorPool<Enemy> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Enemy());
    for (const e of this.actor) e.setEnemyPool(this);
  }

  public setStageManager(stageManager: StageManagerLike): void {
    for (const e of this.actor) e.setStageManager(stageManager);
  }

  public checkShotHit(pos: Vector, shape: Collidable, shot: Shot | null = null): void {
    for (const e of this.actor) {
      if (e.exists) e.checkShotHit(pos, shape, shot);
    }
  }

  public checkHitShip(x: number, y: number, deselection: Enemy | null = null, largeOnly = false): Enemy | null {
    for (const e of this.actor) {
      if (e.exists && e !== deselection && e.checkHitShip(x, y, largeOnly)) return e;
    }
    return null;
  }

  public get hasBoss(): boolean {
    for (const e of this.actor) {
      if (e.exists && e.isBoss) return true;
    }
    return false;
  }
}
