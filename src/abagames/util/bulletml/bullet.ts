/*
 * $Id: bullet.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../vector";
import { Rand } from "../rand";
import type { BulletsManager } from "./bulletsmanager";

export type BulletMLRunner = {
  run?: () => void;
  update?: () => void;
  isEnd?: () => boolean;
  end?: boolean;
  finished?: boolean;
  callbacks?: Record<string, unknown>;
  dispose?: () => void;
  close?: () => void;
};
export type BulletMLState = {
  createRunner: () => BulletMLRunner;
};

/**
 * Bullet controlled by BulletML.
 */
export class Bullet {
  public static now: Bullet;
  public static target: Vector;
  public pos: Vector;
  public acc: Vector;
  public deg = 0;
  public speed = 0;
  public id: number;

  private static rand: Rand = new Rand();
  private static manager: BulletsManager;
  private runner: BulletMLRunner | null = null;
  private _rank = 0;

  public static setRandSeed(s: number): void {
    Bullet.rand.setSeed(s);
  }

  public static setBulletsManager(bm: BulletsManager): void {
    Bullet.manager = bm;
    Bullet.target = new Vector();
    Bullet.target.x = 0;
    Bullet.target.y = 0;
  }

  public static getRand(): number {
    return Bullet.rand.nextFloat(1);
  }

  public static addBullet(deg: number, speed: number): void;
  public static addBullet(state: BulletMLState, deg: number, speed: number): void;
  public static addBullet(a: number | BulletMLState, b: number, c?: number): void {
    if (typeof a === "number") {
      Bullet.manager.addSimpleBullet(a, b);
      return;
    }
    Bullet.manager.addStateBullet(a, b, c ?? 0);
  }

  public static getTurn(): number {
    return Bullet.manager.getTurn();
  }

  public constructor(id: number) {
    this.pos = new Vector();
    this.acc = new Vector();
    this.id = id;
  }

  public set(x: number, y: number, deg: number, speed: number, rank: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.acc.x = 0;
    this.acc.y = 0;
    this.deg = deg;
    this.speed = speed;
    this.rank = rank;
    this.runner = null;
  }

  public setRunner(runner: BulletMLRunner): void {
    this.runner = runner;
  }

  public setWithRunner(
    runner: BulletMLRunner,
    x: number,
    y: number,
    deg: number,
    speed: number,
    rank: number,
  ): void {
    this.set(x, y, deg, speed, rank);
    this.setRunner(runner);
  }

  public move(): void {
    Bullet.now = this;
    if (this.runner && !BulletMLRunner_isEnd(this.runner)) {
      BulletMLRunner_run(this.runner);
    }
  }

  public isEnd(): boolean {
    if (!this.runner) return true;
    return BulletMLRunner_isEnd(this.runner);
  }

  public kill(): void {
    Bullet.manager.killMe(this);
  }

  public remove(): void {
    if (this.runner) {
      BulletMLRunner_delete(this.runner);
      this.runner = null;
    }
  }

  public get rank(): number {
    return this._rank;
  }

  public set rank(value: number) {
    this._rank = value;
  }
}

const VEL_SS_SDM_RATIO = 62.0 / 10;
const VEL_SDM_SS_RATIO = 10.0 / 62;

export function rtod(a: number): number {
  return (a * 180) / Math.PI;
}

export function dtor(a: number): number {
  return (a * Math.PI) / 180;
}

export function getBulletDirection_(_r: BulletMLRunner): number {
  return rtod(Bullet.now.deg);
}

export function getAimDirection_(_r: BulletMLRunner): number {
  const b = Bullet.now.pos;
  const t = Bullet.target;
  return rtod(Math.atan2(t.x - b.x, t.y - b.y));
}

export function getBulletSpeed_(_r: BulletMLRunner): number {
  return Bullet.now.speed * VEL_SS_SDM_RATIO;
}

export function getDefaultSpeed_(_r: BulletMLRunner): number {
  return 1;
}

export function getRank_(_r: BulletMLRunner): number {
  return Bullet.now.rank;
}

export function createSimpleBullet_(_r: BulletMLRunner, d: number, s: number): void {
  Bullet.addBullet(dtor(d), s * VEL_SDM_SS_RATIO);
}

export function createBullet_(
  _r: BulletMLRunner,
  state: BulletMLState,
  d: number,
  s: number,
): void {
  Bullet.addBullet(state, dtor(d), s * VEL_SDM_SS_RATIO);
}

export function getTurn_(_r: BulletMLRunner): number {
  return Bullet.getTurn();
}

export function doVanish_(_r: BulletMLRunner): void {
  Bullet.now.kill();
}

export function doChangeDirection_(_r: BulletMLRunner, d: number): void {
  Bullet.now.deg = dtor(d);
}

export function doChangeSpeed_(_r: BulletMLRunner, s: number): void {
  Bullet.now.speed = s * VEL_SDM_SS_RATIO;
}

export function doAccelX_(_r: BulletMLRunner, sx: number): void {
  Bullet.now.acc.x = sx * VEL_SDM_SS_RATIO;
}

export function doAccelY_(_r: BulletMLRunner, sy: number): void {
  Bullet.now.acc.y = sy * VEL_SDM_SS_RATIO;
}

export function getBulletSpeedX_(_r: BulletMLRunner): number {
  return Bullet.now.acc.x;
}

export function getBulletSpeedY_(_r: BulletMLRunner): number {
  return Bullet.now.acc.y;
}

export function getRand_(_r: BulletMLRunner): number {
  return Bullet.getRand();
}

function BulletMLRunner_isEnd(runner: BulletMLRunner | null): boolean {
  if (!runner) return true;
  if (typeof runner.isEnd === "function") return runner.isEnd();
  return !!runner.end || !!runner.finished;
}

function BulletMLRunner_run(runner: BulletMLRunner): void {
  if (typeof runner.run === "function") {
    runner.run();
    return;
  }
  if (typeof runner.update === "function") runner.update();
}

function BulletMLRunner_delete(runner: BulletMLRunner): void {
  if (typeof runner.dispose === "function") runner.dispose();
  if (typeof runner.close === "function") runner.close();
  runner.end = true;
}
