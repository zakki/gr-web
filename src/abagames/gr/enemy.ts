/*
 * $Id: enemy.d,v 1.2 2005/07/17 11:02:45 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { SoundManager } from "./soundmanager";
import { EnemyShape, type Collidable } from "./shape";
import { TurretGroup, TurretGroupSpec, MovingTurretGroup, MovingTurretGroupSpec, TurretSpec } from "./turret";
import { Fragment, Spark, SparkFragment, Smoke } from "./particle";
import type { Shot } from "./shot";

type FieldLike = {
  size: Vector;
  outerSize: Vector;
  lastScrollY: number;
  checkInField(p: Vector): boolean;
  checkInFieldExceptTop(p: Vector): boolean;
  checkInOuterField(p: Vector): boolean;
};
type ScreenLike = {
  setScreenShake(cnt: number, its: number): void;
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
  removeIndexedBullets(idx: number): number;
  getInstance(): BulletLike | null;
};
type ShipLike = {
  nearPos(p: Vector): Vector;
  nearVel(p: Vector): Vector;
};
type SparkPoolLike = { getInstanceForced(): Spark };
type SmokePoolLike = { getInstance(): Smoke | null; getInstanceForced(): Smoke };
type FragmentPoolLike = { getInstanceForced(): Fragment };
type SparkFragmentPoolLike = { getInstanceForced(): SparkFragment };
type NumIndicatorLike = {
  set(n: number, type: number, size: number, p: Vector): void;
  set(n: number, type: number, size: number, x: number, y: number): void;
  addTarget(x: number, y: number, flyingTo: number, initialVelRatio: number, size: number, n: number, cnt: number): void;
  gotoNextTarget(): void;
};
type NumIndicatorPoolLike = { getInstanceForced(): NumIndicatorLike };
type ScoreReelLike = { addActualScore(v: number): void };
type StageManagerLike = { rankMultiplier: number };

declare class NumIndicator {
  public static readonly IndicatorType: { readonly SCORE: number; readonly MULTIPLIER: number };
  public static readonly FlyingToType: { readonly RIGHT: number; readonly BOTTOM: number };
  public static getTargetY(): number;
}

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
      a[1] as ScreenLike,
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
  private static idxCount = 0;

  public appType: number = EnemyState.AppearanceType.TOP;
  public readonly pos = new Vector();
  public readonly ppos = new Vector();
  public shield = 1;
  public deg = 0;
  public velDeg = 0;
  public speed = 0;
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

  public static setRandSeed(seed: number): void {
    EnemyState.rand.setSeed(seed);
  }

  public constructor(
    public readonly field: FieldLike,
    public readonly screen: ScreenLike,
    public readonly bullets: BulletPoolLike,
    public readonly ship: ShipLike,
    public readonly sparks: SparkPoolLike,
    public readonly smokes: SmokePoolLike,
    public readonly fragments: FragmentPoolLike,
    public readonly sparkFragments: SparkFragmentPoolLike,
    public readonly numIndicators: NumIndicatorPoolLike,
    public readonly scoreReel: ScoreReelLike,
  ) {
    this.idx = EnemyState.idxCount++;
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
      this.movingTurretGroup.push(new MovingTurretGroup(this.field, this.bullets, this.ship, this.sparks, this.smokes, this.fragments, enemy));
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
    switch (appType) {
      case EnemyState.AppearanceType.TOP:
        this.pos.x = rand.nextSignedFloat(field.size.x);
        this.pos.y = field.outerSize.y * 0.99 + this.spec.size;
        this.velDeg = this.deg = this.pos.x < 0 ? Math.PI - rand.nextFloat(0.5) : Math.PI + rand.nextFloat(0.5);
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
    return true;
  }

  public move(): boolean {
    this.ppos.x = this.pos.x;
    this.ppos.y = this.pos.y;
    this.multiplier = Math.max(1, this.multiplier - EnemyState.MULTIPLIER_DECREASE_RATIO);
    if (this.destroyedCnt >= 0) {
      this.destroyedCnt++;
      return !this.spec.isSmallEnemy;
    }

    this.vel.x = Math.sin(this.velDeg) * this.speed;
    this.vel.y = Math.cos(this.velDeg) * this.speed;
    this.pos.opAddAssign(this.vel);
    this.pos.y -= this.field.lastScrollY;
    this.cnt++;

    let aliveTurret = false;
    for (let i = 0; i < this.spec.turretGroupNum; i++) aliveTurret ||= this.turretGroup[i].move(this.pos, this.deg);
    for (let i = 0; i < this.spec.movingTurretGroupNum; i++) this.movingTurretGroup[i].move(this.pos, this.deg);

    if (!this.field.checkInOuterField(this.pos)) return false;
    if (!aliveTurret && this.spec.turretGroupNum > 0) return this.destroyed();
    return true;
  }

  public checkCollision(x: number, y: number, c: Collidable, shot?: Shot): boolean {
    const cc = c.collision();
    const r = this.spec.size + Math.max(cc.x, cc.y);
    const dx = this.pos.x - x;
    const dy = this.pos.y - y;
    if (dx * dx + dy * dy > r * r) return false;
    for (let i = 0; i < this.spec.turretGroupNum; i++) {
      if (this.turretGroup[i].checkCollision(x, y, c, shot as Shot)) return true;
    }
    this.addDamage((shot as unknown as { damage?: number } | undefined)?.damage ?? 1, shot);
    return true;
  }

  public increaseMultiplier(m: number): void {
    this.multiplier += m;
  }

  public addScore(s: number): void {
    this.setScoreIndicator(s, 1);
  }

  public addDamage(n: number, shot?: Shot): void {
    this.shield -= n;
    if (this.shield <= 0) this.destroyed(shot);
    else {
      this.damaged = true;
      this.damagedCnt = 7;
    }
  }

  public destroyed(_shot?: Shot): boolean {
    for (let i = 0; i < 6; i++) {
      this.smokes.getInstanceForced().set(this.pos, EnemyState.rand.nextSignedFloat(0.1), EnemyState.rand.nextSignedFloat(0.1), EnemyState.rand.nextFloat(0.04), Smoke.SmokeType.EXPLOSION, 32 + EnemyState.rand.nextInt(30), Math.min(2, this.spec.size * 1.5));
    }
    for (let i = 0; i < 18; i++) {
      this.sparks.getInstanceForced().set(this.pos, EnemyState.rand.nextSignedFloat(0.8), EnemyState.rand.nextSignedFloat(0.8), 0.5 + EnemyState.rand.nextFloat(0.5), 0.5 + EnemyState.rand.nextFloat(0.5), 0, 30 + EnemyState.rand.nextInt(30));
    }
    for (let i = 0; i < 8; i++) {
      this.fragments.getInstanceForced().set(this.pos, EnemyState.rand.nextSignedFloat(0.33), EnemyState.rand.nextSignedFloat(0.33), 0.05 + EnemyState.rand.nextFloat(0.1), 0.2 + EnemyState.rand.nextFloat(0.33));
    }
    this.removeTurrets();
    let score = this.spec.score;
    if (this.spec.isSmallEnemy) {
      SoundManager.playSe("small_destroyed.wav");
      this.setScoreIndicator(score, this.multiplier);
      return false;
    }
    SoundManager.playSe("destroyed.wav");
    score += this.bullets.removeIndexedBullets(this.idx) * 10;
    this.destroyedCnt = 0;
    if (this.spec.isBoss) this.screen.setScreenShake(45, 0.04);
    this.setScoreIndicator(score, this.multiplier);
    return true;
  }

  private setScoreIndicator(sc: number, mp: number): void {
    const ty = NumIndicator.getTargetY();
    const ni = this.numIndicators.getInstanceForced();
    ni.set(sc, NumIndicator.IndicatorType.SCORE, mp > 1 ? 0.5 : 0.3, this.pos);
    ni.addTarget(11, ty, NumIndicator.FlyingToType.RIGHT, 1, 0.2, sc, 40);
    ni.addTarget(12, -8, NumIndicator.FlyingToType.BOTTOM, 0.5, 0.1, Math.trunc(sc * mp * this.stageManager.rankMultiplier), 40);
    ni.gotoNextTarget();
    this.scoreReel.addActualScore(Math.trunc(sc * mp * this.stageManager.rankMultiplier));
  }

  public removeTurrets(): void {
    for (let i = 0; i < this.spec.turretGroupNum; i++) this.turretGroup[i].remove();
    for (let i = 0; i < this.spec.movingTurretGroupNum; i++) this.movingTurretGroup[i].remove();
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
  public shape: EnemyShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL);
  public damagedShape: EnemyShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_DAMAGED);
  public destroyedShape: EnemyShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_DESTROYED);
  public bridgeShape: EnemyShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_BRIDGE);
  public type: number = EnemySpec.EnemyType.SMALL;
  public score = 10;
  public isBoss = false;
  public isSmallEnemy = true;
  public speed = 0.03;

  public constructor(
    protected readonly field: FieldLike,
    protected readonly ship: ShipLike,
    protected readonly sparks: SparkPoolLike,
    protected readonly smokes: SmokePoolLike,
    protected readonly fragments: FragmentPoolLike,
    protected readonly wakes: { getInstanceForced: () => { set: (...args: unknown[]) => void } },
  ) {}

  public static setRandSeed(seed: number): void {
    EnemySpec.rand.setSeed(seed);
  }

  public set(type: number): void {
    this.type = type;
  }

  protected getTurretGroupSpec(): TurretGroupSpec {
    const idx = this.turretGroupNum++;
    this.turretGroupSpec[idx].init();
    return this.turretGroupSpec[idx];
  }

  protected getMovingTurretGroupSpec(): MovingTurretGroupSpec {
    const idx = this.movingTurretGroupNum++;
    this.movingTurretGroupSpec[idx].init();
    return this.movingTurretGroupSpec[idx];
  }

  public checkCollision(es: EnemyState, x: number, y: number, c: Collidable, shot?: Shot): boolean {
    return es.checkCollision(x, y, c, shot);
  }

  public checkShipCollision(es: EnemyState, x: number, y: number, largeOnly = false): boolean {
    if (largeOnly && this.isSmallEnemy) return false;
    const dx = es.pos.x - x;
    const dy = es.pos.y - y;
    const rr = this.size * 1.1;
    return dx * dx + dy * dy <= rr * rr;
  }

  public move(es: EnemyState): boolean {
    es.speed = this.speed;
    return es.move();
  }

  public draw(es: EnemyState): void {
    if (es.destroyedCnt >= 0) this.destroyedShape.draw();
    else if (es.damaged) this.damagedShape.draw();
    else this.shape.draw();
    if (es.destroyedCnt < 0) this.bridgeShape.draw();
    for (let i = 0; i < this.turretGroupNum; i++) es.turretGroup[i].draw();
  }

  public get size(): number {
    return this._size;
  }

  public set size(v: number) {
    this._size = v;
    this.shape.size = v;
    this.damagedShape.size = v;
    this.destroyedShape.size = v;
    this.bridgeShape.size = Math.max(0.2, v * (1 - this.distRatio));
  }
}

export interface HasAppearType {
  setFirstState(es: EnemyState, appType: number): boolean;
}

export class SmallShipEnemySpec extends EnemySpec implements HasAppearType {
  public constructor(field: FieldLike, ship: ShipLike, sparks: SparkPoolLike, smokes: SmokePoolLike, fragments: FragmentPoolLike, wakes: { getInstanceForced: () => { set: (...args: unknown[]) => void } }) {
    super(field, ship, sparks, smokes, fragments, wakes);
    this.set(EnemySpec.EnemyType.SMALL);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_DAMAGED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.SMALL_BRIDGE);
    this.destroyedShape = this.damagedShape;
    this.isSmallEnemy = true;
    this.score = 10;
  }

  public setParam(rank: number, rand: Rand): void {
    this.size = 0.47 + rand.nextFloat(0.1);
    this.shield = Math.max(1, Math.trunc(3 + rank * 0.15));
    this.speed = 0.04 + rand.nextFloat(0.03);
    this.turretGroupNum = this.movingTurretGroupNum = 0;
    const tgs = this.getTurretGroupSpec();
    tgs.turretSpec.setParam(Math.max(0.1, rank * 0.5), TurretSpec.TurretType.SMALL, rand);
    tgs.num = 1;
    tgs.radius = this.size * 0.2;
  }

  public setFirstState(es: EnemyState, appType: number): boolean {
    return es.setAppearancePos(this.field, this.ship, EnemySpec.rand, appType);
  }
}

export class ShipEnemySpec extends EnemySpec implements HasAppearType {
  public static readonly ShipClass = {
    BOSS: 0,
    LARGE: 1,
    MIDDLE: 2,
  } as const;

  public constructor(field: FieldLike, ship: ShipLike, sparks: SparkPoolLike, smokes: SmokePoolLike, fragments: FragmentPoolLike, wakes: { getInstanceForced: () => { set: (...args: unknown[]) => void } }) {
    super(field, ship, sparks, smokes, fragments, wakes);
    this.set(EnemySpec.EnemyType.LARGE);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_DAMAGED);
    this.destroyedShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_DESTROYED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.MIDDLE_BRIDGE);
    this.isSmallEnemy = false;
    this.score = 40;
  }

  public setParam(rank: number, shipClass: number, rand: Rand): void {
    this.isBoss = shipClass === ShipEnemySpec.ShipClass.BOSS;
    this.size = this.isBoss ? 2.4 + rand.nextFloat(0.6) : shipClass === ShipEnemySpec.ShipClass.LARGE ? 1.4 + rand.nextFloat(0.4) : 1 + rand.nextFloat(0.3);
    this.shield = Math.max(8, Math.trunc(this.size * 10 + rank * (this.isBoss ? 3 : 1.2)));
    this.speed = this.isBoss ? 0.02 : 0.025 + rand.nextFloat(0.02);
    this.score = this.isBoss ? 200 : shipClass === ShipEnemySpec.ShipClass.LARGE ? 80 : 40;
    this.turretGroupNum = this.movingTurretGroupNum = 0;

    const main = this.getTurretGroupSpec();
    main.turretSpec.setParam(rank, TurretSpec.TurretType.MAIN, rand);
    if (this.isBoss) main.turretSpec.setBossSpec();
    main.num = this.isBoss ? 4 : 2;
    main.alignType = TurretGroupSpec.AlignType.ROUND;
    main.alignWidth = Math.PI * 1.4;
    main.radius = this.size * 0.7;

    const sub = this.getTurretGroupSpec();
    sub.turretSpec.setParam(rank * 0.8, TurretSpec.TurretType.SUB, rand);
    if (this.isBoss) sub.turretSpec.setBossSpec();
    sub.num = this.isBoss ? 6 : 2;
    sub.alignType = TurretGroupSpec.AlignType.ROUND;
    sub.alignWidth = Math.PI * 1.8;
    sub.radius = this.size * 0.9;
  }

  public setFirstState(es: EnemyState, appType: number): boolean {
    const ap = this.isBoss ? EnemyState.AppearanceType.CENTER : appType;
    return es.setAppearancePos(this.field, this.ship, EnemySpec.rand, ap);
  }
}

export class PlatformEnemySpec extends EnemySpec {
  private firstX = 0;
  private firstY = 0;
  private firstD = 0;

  public constructor(field: FieldLike, ship: ShipLike, sparks: SparkPoolLike, smokes: SmokePoolLike, fragments: FragmentPoolLike, wakes: { getInstanceForced: () => { set: (...args: unknown[]) => void } }) {
    super(field, ship, sparks, smokes, fragments, wakes);
    this.set(EnemySpec.EnemyType.PLATFORM);
    this.shape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM);
    this.damagedShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_DAMAGED);
    this.destroyedShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_DESTROYED);
    this.bridgeShape = new EnemyShape(EnemyShape.EnemyShapeType.PLATFORM_BRIDGE);
    this.isSmallEnemy = false;
    this.score = 60;
  }

  public setParam(rank: number, rand: Rand): void {
    this.size = 1 + rank / 30 + rand.nextFloat(rank / 30);
    if (this.size > 2.4) this.size = 2.4;
    this.shield = Math.max(10, Math.trunc(this.size * 20));
    this.speed = 0.015;
    this.turretGroupNum = this.movingTurretGroupNum = 0;
    const tgs = this.getTurretGroupSpec();
    tgs.turretSpec.setParam(rank, TurretSpec.TurretType.SUB, rand);
    tgs.num = 2;
    tgs.alignType = TurretGroupSpec.AlignType.ROUND;
    tgs.alignWidth = Math.PI;
    tgs.radius = this.size * 0.7;
  }

  public setFirstState(es: EnemyState, x: number, y: number, d: number): boolean {
    this.firstX = x;
    this.firstY = y;
    this.firstD = d;
    es.pos.x = x;
    es.pos.y = y;
    es.deg = d;
    es.velDeg = d;
    return true;
  }

  public override move(es: EnemyState): boolean {
    es.pos.x = this.firstX;
    es.pos.y = this.firstY - this.field.lastScrollY;
    es.deg = this.firstD;
    es.velDeg = this.firstD;
    es.cnt++;
    let aliveTurret = false;
    for (let i = 0; i < this.turretGroupNum; i++) aliveTurret ||= es.turretGroup[i].move(es.pos, es.deg);
    if (!this.field.checkInOuterField(es.pos)) return false;
    if (!aliveTurret && this.turretGroupNum > 0) return es.destroyed();
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
    for (const e of this.actor) if (e.exists) e.checkShotHit(pos, shape, shot);
  }

  public checkHitShip(x: number, y: number, deselection: Enemy | null = null, largeOnly = false): Enemy | null {
    for (const e of this.actor) {
      if (!e.exists || e === deselection) continue;
      if (e.checkHitShip(x, y, largeOnly)) return e;
    }
    return null;
  }

  public get hasBoss(): boolean {
    for (const e of this.actor) if (e.exists && e.isBoss) return true;
    return false;
  }
}
