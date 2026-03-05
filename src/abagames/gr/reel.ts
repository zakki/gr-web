/*
 * $Id: reel.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Actor, ActorPool } from "../util/actor";
import { Rand } from "../util/rand";

declare class Letter {
  public static readonly LINE_COLOR: number;
  public static drawLetter(n: number, style: number): void;
  public static drawNumSign(
    n: number,
    x: number,
    y: number,
    size: number,
    color: number,
    width?: number,
    spacing?: number,
  ): void;
}
declare class Screen {
  public static setColor(r: number, g: number, b: number, a?: number): void;
}
declare class SoundManager {
  public static playSe(name: string): void;
}

declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glTranslatef(x: number, y: number, z: number): void;
declare function glRotatef(angleDeg: number, x: number, y: number, z: number): void;
declare function glScalef(x: number, y: number, z: number): void;

/**
 * Rolling reel that displays the score.
 */
export class ScoreReel {
  public static readonly MAX_DIGIT = 16;

  private score = 0;
  private targetScore = 0;
  private _actualScore = 0;
  private digit = 1;
  private readonly numReel: NumReel[];

  public constructor() {
    this.numReel = Array.from({ length: ScoreReel.MAX_DIGIT }, () => new NumReel());
  }

  public clear(digit = 9): void {
    this.score = this.targetScore = this._actualScore = 0;
    this.digit = digit;
    for (let i = 0; i < digit; i++) this.numReel[i].clear();
  }

  public move(): void {
    for (let i = 0; i < this.digit; i++) this.numReel[i].move();
  }

  public draw(x: number, y: number, s: number): void {
    let lx = x;
    const ly = y;
    for (let i = 0; i < this.digit; i++) {
      this.numReel[i].draw(lx, ly, s);
      lx -= s * 2;
    }
  }

  public addReelScore(as: number): void {
    this.targetScore += as;
    let ts = this.targetScore;
    for (let i = 0; i < this.digit; i++) {
      this.numReel[i].targetDeg = (ts * 360) / 10;
      ts = Math.trunc(ts / 10);
      if (ts < 0) break;
    }
  }

  public accelerate(): void {
    for (let i = 0; i < this.digit; i++) this.numReel[i].accelerate();
  }

  public addActualScore(as: number): void {
    this._actualScore += as;
  }

  public get actualScore(): number {
    return this._actualScore;
  }
}

export class NumReel {
  private static readonly VEL_MIN = 5;
  private static readonly rand = new Rand();

  private deg = 0;
  private _targetDeg = 0;
  private ofs = 0;
  private velRatio = 1;

  public static setRandSeed(seed: number): void {
    NumReel.rand.setSeed(seed);
  }

  public clear(): void {
    this.deg = 0;
    this._targetDeg = 0;
    this.ofs = 0;
    this.velRatio = 1;
  }

  public move(): void {
    let vd = this._targetDeg - this.deg;
    vd *= 0.05 * this.velRatio;
    if (vd < NumReel.VEL_MIN * this.velRatio) vd = NumReel.VEL_MIN * this.velRatio;
    this.deg += vd;
    if (this.deg > this._targetDeg) this.deg = this._targetDeg;
  }

  public draw(x: number, y: number, s: number): void {
    let n = (Math.trunc(this.deg / 36 + 0.99) + 1) % 10;
    const d = this.deg % 360;
    let od = normalizeDeg360((d - (n * 360) / 10 - 15) * 1.5);

    for (let i = 0; i < 3; i++) {
      glPushMatrix();
      if (this.ofs > 0.005) {
        glTranslatef(x + NumReel.rand.nextSignedFloat(1) * this.ofs, y + NumReel.rand.nextSignedFloat(1) * this.ofs, 0);
      } else {
        glTranslatef(x, y, 0);
      }
      glRotatef(od, 1, 0, 0);
      glTranslatef(0, 0, s * 2.4);
      glScalef(s, -s, s);
      let a = 1 - Math.abs((od + 15) / (54)) / 2;
      if (a < 0) a = 0;
      Screen.setColor(a, a, a);
      Letter.drawLetter(n, 2);
      Screen.setColor(a / 2, a / 2, a / 2);
      Letter.drawLetter(n, 3);
      glPopMatrix();

      n--;
      if (n < 0) n = 9;
      od = normalizeDeg360(od + 54);
    }
    this.ofs *= 0.95;
  }

  public set targetDeg(td: number) {
    if (td - this._targetDeg > 1) this.ofs += 0.1;
    this._targetDeg = td;
  }

  public accelerate(): void {
    this.velRatio = 4;
  }
}

class NumIndicatorTarget {
  public pos = new Vector();
  public flyingTo = 0;
  public initialVelRatio = 0;
  public size = 0;
  public n = 0;
  public cnt = 0;
}

/**
 * Flying indicator that shows the score and the multiplier.
 */
export class NumIndicator extends Actor {
  public static readonly IndicatorType = {
    SCORE: 0,
    MULTIPLIER: 1,
  } as const;
  public static readonly FlyingToType = {
    RIGHT: 0,
    BOTTOM: 1,
  } as const;

  private static readonly rand = new Rand();
  private static readonly TARGET_Y_MIN = -7;
  private static readonly TARGET_Y_MAX = 7;
  private static readonly TARGET_Y_INTERVAL = 1;
  private static targetY = NumIndicator.TARGET_Y_MIN;

  private scoreReel!: ScoreReel;
  private readonly pos: Vector;
  private readonly vel: Vector;
  private n = 0;
  private type: number = NumIndicator.IndicatorType.SCORE;
  private size = 1;
  private cnt = 0;
  private alpha = 1;
  private readonly target: NumIndicatorTarget[];
  private targetIdx = 0;
  private targetNum = 0;

  public static setRandSeed(seed: number): void {
    NumIndicator.rand.setSeed(seed);
  }

  public static initTargetY(): void {
    NumIndicator.targetY = NumIndicator.TARGET_Y_MIN;
  }

  public static getTargetY(): number {
    const ty = NumIndicator.targetY;
    NumIndicator.targetY += NumIndicator.TARGET_Y_INTERVAL;
    if (NumIndicator.targetY > NumIndicator.TARGET_Y_MAX) NumIndicator.targetY = NumIndicator.TARGET_Y_MIN;
    return ty;
  }

  public static decTargetY(): void {
    NumIndicator.targetY -= NumIndicator.TARGET_Y_INTERVAL;
    if (NumIndicator.targetY < NumIndicator.TARGET_Y_MIN) NumIndicator.targetY = NumIndicator.TARGET_Y_MAX;
  }

  public constructor() {
    super();
    this.pos = new Vector();
    this.vel = new Vector();
    this.target = Array.from({ length: 16 }, () => new NumIndicatorTarget());
  }

  public override init(args: unknown[] | null): void {
    this.scoreReel = args?.[0] as ScoreReel;
  }

  public set(n: number, type: number, size: number, p: Vector): void;
  public set(n: number, type: number, size: number, x: number, y: number): void;
  public set(n: number, type: number, size: number, pOrX: Vector | number, y?: number): void {
    const x = typeof pOrX === "number" ? pOrX : pOrX.x;
    const yy = typeof pOrX === "number" ? (y ?? 0) : pOrX.y;

    if (this.exists && this.type === NumIndicator.IndicatorType.SCORE) {
      if (this.target[this.targetIdx].flyingTo === NumIndicator.FlyingToType.RIGHT) NumIndicator.decTargetY();
      this.scoreReel.addReelScore(this.target[Math.max(0, this.targetNum - 1)].n);
    }
    this.n = n;
    this.type = type;
    this.size = size;
    this.pos.x = x;
    this.pos.y = yy;
    this.targetIdx = -1;
    this.targetNum = 0;
    this.alpha = 0.1;
    this.exists = true;
  }

  public addTarget(x: number, y: number, flyingTo: number, initialVelRatio: number, size: number, n: number, cnt: number): void {
    this.target[this.targetNum].pos.x = x;
    this.target[this.targetNum].pos.y = y;
    this.target[this.targetNum].flyingTo = flyingTo;
    this.target[this.targetNum].initialVelRatio = initialVelRatio;
    this.target[this.targetNum].size = size;
    this.target[this.targetNum].n = n;
    this.target[this.targetNum].cnt = cnt;
    this.targetNum++;
  }

  public gotoNextTarget(): void {
    this.targetIdx++;
    if (this.targetIdx > 0) SoundManager.playSe("score_up.wav");
    if (this.targetIdx >= this.targetNum) {
      if (this.target[this.targetIdx - 1].flyingTo === NumIndicator.FlyingToType.BOTTOM) {
        this.scoreReel.addReelScore(this.target[this.targetIdx - 1].n);
      }
      this.exists = false;
      return;
    }

    switch (this.target[this.targetIdx].flyingTo) {
      case NumIndicator.FlyingToType.RIGHT:
        this.vel.x = -0.3 + NumIndicator.rand.nextSignedFloat(0.05);
        this.vel.y = NumIndicator.rand.nextSignedFloat(0.1);
        break;
      case NumIndicator.FlyingToType.BOTTOM:
        this.vel.x = NumIndicator.rand.nextSignedFloat(0.1);
        this.vel.y = 0.3 + NumIndicator.rand.nextSignedFloat(0.05);
        NumIndicator.decTargetY();
        break;
    }
    this.vel.opMulAssign(this.target[this.targetIdx].initialVelRatio);
    this.cnt = this.target[this.targetIdx].cnt;
  }

  public override move(): void {
    if (this.targetIdx < 0) return;
    const tp = this.target[this.targetIdx].pos;
    switch (this.target[this.targetIdx].flyingTo) {
      case NumIndicator.FlyingToType.RIGHT:
        this.vel.x += (tp.x - this.pos.x) * 0.0036;
        this.pos.y += (tp.y - this.pos.y) * 0.1;
        if (Math.abs(this.pos.y - tp.y) < 0.5) this.pos.y += (tp.y - this.pos.y) * 0.33;
        this.alpha += (1 - this.alpha) * 0.03;
        break;
      case NumIndicator.FlyingToType.BOTTOM:
        this.pos.x += (tp.x - this.pos.x) * 0.1;
        this.vel.y += (tp.y - this.pos.y) * 0.0036;
        this.alpha *= 0.97;
        break;
    }
    this.vel.opMulAssign(0.98);
    this.size += (this.target[this.targetIdx].size - this.size) * 0.025;
    this.pos.opAddAssign(this.vel);

    const vn = Math.trunc((this.target[this.targetIdx].n - this.n) * 0.2);
    if (vn < 10 && vn > -10) this.n = this.target[this.targetIdx].n;
    else this.n += vn;

    switch (this.target[this.targetIdx].flyingTo) {
      case NumIndicator.FlyingToType.RIGHT:
        if (this.pos.x > tp.x) {
          this.pos.x = tp.x;
          this.vel.x *= -0.05;
        }
        break;
      case NumIndicator.FlyingToType.BOTTOM:
        if (this.pos.y < tp.y) {
          this.pos.y = tp.y;
          this.vel.y *= -0.05;
        }
        break;
    }
    this.cnt--;
    if (this.cnt < 0) this.gotoNextTarget();
  }

  public override draw(): void {
    Screen.setColor(this.alpha, this.alpha, this.alpha);
    switch (this.type) {
      case NumIndicator.IndicatorType.SCORE:
        Letter.drawNumSign(this.n, this.pos.x, this.pos.y, this.size, Letter.LINE_COLOR);
        break;
      case NumIndicator.IndicatorType.MULTIPLIER:
        Letter.drawNumSign(this.n, this.pos.x, this.pos.y, this.size, Letter.LINE_COLOR, 33, 3);
        break;
    }
  }
}

export class NumIndicatorPool extends ActorPool<NumIndicator> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new NumIndicator());
  }
}

function normalizeDeg360(v: number): number {
  let r = v % 360;
  if (r < 0) r += 360;
  return r;
}
