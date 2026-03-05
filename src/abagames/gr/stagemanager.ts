/*
 * $Id: stagemanager.d,v 1.2 2005/07/03 07:05:22 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { Field } from "./field";
import { EnemyState, Enemy, EnemyPool, EnemySpec, ShipEnemySpec, PlatformEnemySpec, SmallShipEnemySpec } from "./enemy";
import { Ship } from "./ship";
import { BulletPool } from "./bullet";
import { SparkPool, SmokePool, FragmentPool, WakePool } from "./particle";
import { SoundManager } from "./soundmanager";
import { Letter } from "./letter";

type PlatformPos = {
  pos: Vector;
  deg: number;
  used: boolean;
};

function hasSetFirstState(
  spec: EnemySpec | null,
): spec is EnemySpec & { setFirstState: (...args: number[] | [unknown, ...number[]]) => boolean } {
  return !!spec && typeof (spec as { setFirstState?: unknown }).setFirstState === "function";
}

/**
 * Manage an enemys' appearance, a rank(difficulty) and a field.
 */
export class StageManager {
  private static readonly RANK_INC_BASE = 0.0018;
  private static readonly BLOCK_DENSITY_MIN = 0;
  private static readonly BLOCK_DENSITY_MAX = 3;

  private readonly field: Field;
  private readonly enemies: EnemyPool;
  private readonly ship: Ship;
  private readonly bullets: BulletPool;
  private readonly sparks: SparkPool;
  private readonly smokes: SmokePool;
  private readonly fragments: FragmentPool;
  private readonly wakes: WakePool;
  private readonly rand: Rand;
  private rank = 1;
  private baseRank = 1;
  private addRank = 0;
  private rankVel = 0;
  private rankInc = 0;
  private readonly enemyApp: EnemyAppearance[];
  private _blockDensity = 2;
  private batteryNum = 0;
  private platformEnemySpec: PlatformEnemySpec;
  private _bossMode = false;
  private bossAppCnt = 0;
  private bossAppTime = 0;
  private bossAppTimeBase = 0;
  private bgmStartCnt = -1;

  public constructor(
    field: Field,
    enemies: EnemyPool,
    ship: Ship,
    bullets: BulletPool,
    sparks: SparkPool,
    smokes: SmokePool,
    fragments: FragmentPool,
    wakes: WakePool,
  ) {
    this.field = field;
    this.enemies = enemies;
    this.ship = ship;
    this.bullets = bullets;
    this.sparks = sparks;
    this.smokes = smokes;
    this.fragments = fragments;
    this.wakes = wakes;
    this.rand = new Rand();
    this.enemyApp = Array.from({ length: 3 }, () => new EnemyAppearance());
    this.platformEnemySpec = new PlatformEnemySpec(field, ship, sparks, smokes, fragments, wakes);
  }

  public setRandSeed(seed: number): void {
    this.rand.setSeed(seed);
  }

  public start(rankIncRatio: number): void {
    this.rank = this.baseRank = 1;
    this.addRank = this.rankVel = 0;
    this.rankInc = StageManager.RANK_INC_BASE * rankIncRatio;
    this._blockDensity =
      this.rand.nextInt(StageManager.BLOCK_DENSITY_MAX - StageManager.BLOCK_DENSITY_MIN + 1) + StageManager.BLOCK_DENSITY_MIN;
    this._bossMode = false;
    this.bossAppTimeBase = 60 * 1000;
    this.resetBossMode();
    this.gotoNextBlockArea();
    this.bgmStartCnt = -1;
  }

  public startBossMode(): void {
    this._bossMode = true;
    this.bossAppCnt = 2;
    SoundManager.fadeBgm();
    this.bgmStartCnt = 120;
    this.rankVel = 0;
  }

  public resetBossMode(): void {
    if (this._bossMode) {
      this._bossMode = false;
      SoundManager.fadeBgm();
      this.bgmStartCnt = 120;
      this.bossAppTimeBase += 30 * 1000;
    }
    this.bossAppTime = this.bossAppTimeBase;
  }

  public move(): void {
    this.bgmStartCnt--;
    if (this.bgmStartCnt === 0) {
      if (this._bossMode) SoundManager.playBgm("gr0.ogg");
      else SoundManager.nextBgm();
    }

    if (this._bossMode) {
      this.addRank *= 0.999;
      if (!this.enemies.hasBoss && this.bossAppCnt <= 0) this.resetBossMode();
    } else {
      const rv = this.field.lastScrollY / this.ship.scrollSpeedBase - 2;
      this.bossAppTime -= 17;
      if (this.bossAppTime <= 0) {
        this.bossAppTime = 0;
        this.startBossMode();
      }
      if (rv > 0) {
        this.rankVel += rv * rv * 0.0004 * this.baseRank;
      } else {
        this.rankVel += rv * this.baseRank;
        if (this.rankVel < 0) this.rankVel = 0;
      }
      this.addRank += this.rankInc * (this.rankVel + 1);
      this.addRank *= 0.999;
      this.baseRank += this.rankInc + this.addRank * 0.0001;
    }

    this.rank = this.baseRank + this.addRank;
    for (const ea of this.enemyApp) ea.move(this.enemies, this.field);
  }

  public shipDestroyed(): void {
    this.rankVel = 0;
    if (!this._bossMode) this.addRank = 0;
    else this.addRank /= 2;
  }

  public gotoNextBlockArea(): void {
    if (this._bossMode) {
      this.bossAppCnt--;
      if (this.bossAppCnt === 0) {
        const ses = new ShipEnemySpec(this.field, this.ship, this.sparks, this.smokes, this.fragments, this.wakes);
        ses.setParam(this.rank, ShipEnemySpec.ShipClass.BOSS, this.rand);
        const en = this.enemies.getInstance();
        if (en) {
          if (ses.setFirstState(en.state, EnemyState.AppearanceType.CENTER)) en.set(ses);
        } else {
          this.resetBossMode();
        }
      }
      for (const ea of this.enemyApp) ea.unset();
      return;
    }

    const noSmallShip = this._blockDensity < StageManager.BLOCK_DENSITY_MAX && this.rand.nextInt(2) === 0;

    this._blockDensity += this.rand.nextSignedInt(1);
    if (this._blockDensity < StageManager.BLOCK_DENSITY_MIN) this._blockDensity = StageManager.BLOCK_DENSITY_MIN;
    else if (this._blockDensity > StageManager.BLOCK_DENSITY_MAX) this._blockDensity = StageManager.BLOCK_DENSITY_MAX;

    this.batteryNum = Math.trunc((this._blockDensity + this.rand.nextSignedFloat(1)) * 0.75);
    let tr = this.rank;

    let largeShipNum = Math.trunc((2 - this._blockDensity + this.rand.nextSignedFloat(1)) * 0.5);
    if (noSmallShip) largeShipNum = Math.trunc(largeShipNum * 1.5);
    else largeShipNum = Math.trunc(largeShipNum * 0.5);

    let appType = this.rand.nextInt(2);
    if (largeShipNum > 0) {
      let lr = tr * (0.25 + this.rand.nextFloat(0.15));
      if (noSmallShip) lr *= 1.5;
      tr -= lr;
      const ses = new ShipEnemySpec(this.field, this.ship, this.sparks, this.smokes, this.fragments, this.wakes);
      ses.setParam(lr / largeShipNum, ShipEnemySpec.ShipClass.LARGE, this.rand);
      this.enemyApp[0].set(ses, largeShipNum, appType, this.rand);
    } else {
      this.enemyApp[0].unset();
    }

    if (this.batteryNum > 0) {
      this.platformEnemySpec = new PlatformEnemySpec(this.field, this.ship, this.sparks, this.smokes, this.fragments, this.wakes);
      const pr = tr * (0.3 + this.rand.nextFloat(0.1));
      this.platformEnemySpec.setParam(pr / this.batteryNum, this.rand);
    }

    appType = (appType + 1) % 2;
    let middleShipNum = Math.trunc((4 - this._blockDensity + this.rand.nextSignedFloat(1)) * 0.66);
    if (noSmallShip) middleShipNum *= 2;
    if (middleShipNum > 0) {
      let mr: number;
      if (noSmallShip) mr = tr;
      else mr = tr * (0.33 + this.rand.nextFloat(0.33));
      tr -= mr;
      const ses = new ShipEnemySpec(this.field, this.ship, this.sparks, this.smokes, this.fragments, this.wakes);
      ses.setParam(mr / middleShipNum, ShipEnemySpec.ShipClass.MIDDLE, this.rand);
      this.enemyApp[1].set(ses, middleShipNum, appType, this.rand);
    } else {
      this.enemyApp[1].unset();
    }

    if (!noSmallShip) {
      appType = EnemyState.AppearanceType.TOP;
      let smallShipNum = Math.trunc(Math.sqrt(3 + tr) * (1 + this.rand.nextSignedFloat(0.5)) * 2) + 1;
      if (smallShipNum > 256) smallShipNum = 256;
      const sses = new SmallShipEnemySpec(this.field, this.ship, this.sparks, this.smokes, this.fragments, this.wakes);
      sses.setParam(tr / smallShipNum, this.rand);
      this.enemyApp[2].set(sses, smallShipNum, appType, this.rand);
    } else {
      this.enemyApp[2].unset();
    }
  }

  public addBatteries(platformPos: PlatformPos[], platformPosNum: number): void {
    let ppn = platformPosNum;
    let bn = this.batteryNum;

    for (let i = 0; i < 100; i++) {
      if (ppn <= 0 || bn <= 0) break;
      let ppi = this.rand.nextInt(platformPosNum);
      for (let j = 0; j < platformPosNum; j++) {
        if (!platformPos[ppi].used) break;
        ppi++;
        if (ppi >= platformPosNum) ppi = 0;
      }
      if (platformPos[ppi].used) break;

      const en = this.enemies.getInstance();
      if (!en) break;

      platformPos[ppi].used = true;
      ppn--;
      const p = this.field.convertToScreenPos(Math.trunc(platformPos[ppi].pos.x), Math.trunc(platformPos[ppi].pos.y));
      if (!this.platformEnemySpec.setFirstState(en.state, p.x, p.y, platformPos[ppi].deg)) continue;

      for (let j = 0; j < platformPosNum; j++) {
        if (
          Math.abs(platformPos[ppi].pos.x - platformPos[j].pos.x) <= 1 &&
          Math.abs(platformPos[ppi].pos.y - platformPos[j].pos.y) <= 1 &&
          !platformPos[j].used
        ) {
          platformPos[j].used = true;
          ppn--;
        }
      }
      en.set(this.platformEnemySpec);
      bn--;
    }
  }

  public get blockDensity(): number {
    return this._blockDensity;
  }

  public draw(): void {
    Letter.drawNum(Math.trunc(this.rank * 1000), 620, 10, 10, 0, 0, 33, 3);
    Letter.drawTime(this.bossAppTime, 120, 20, 7);
  }

  public get rankMultiplier(): number {
    return this.rank;
  }

  public get bossMode(): boolean {
    return this._bossMode;
  }
}

export class EnemyAppearance {
  private spec: EnemySpec | null = null;
  private nextAppDist = 0;
  private nextAppDistInterval = 1;
  private appType = 0;

  public set(s: EnemySpec, num: number, appType: number, rand: Rand): void {
    this.spec = s;
    this.nextAppDistInterval = Field.NEXT_BLOCK_AREA_SIZE / num;
    this.nextAppDist = rand.nextFloat(this.nextAppDistInterval);
    this.appType = appType;
  }

  public unset(): void {
    this.spec = null;
  }

  public move(enemies: EnemyPool, field: Field): void {
    if (!this.spec) return;
    this.nextAppDist -= field.lastScrollY;
    if (this.nextAppDist <= 0) {
      this.nextAppDist += this.nextAppDistInterval;
      this.appear(enemies);
    }
  }

  private appear(enemies: EnemyPool): void {
    const en = enemies.getInstance();
    if (!en || !this.spec) return;
    if (hasSetFirstState(this.spec) && this.spec.setFirstState(en.state, this.appType)) {
      en.set(this.spec);
    }
  }
}
