/*
 * $Id: particle.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector, Vector3 } from "../util/vector";
import { Rand } from "../util/rand";
import { LuminousActor, LuminousActorPool } from "../util/sdl/luminous";

declare class Screen {
  public static setColor(r: number, g: number, b: number, a?: number): void;
  public static glTranslate(v: Vector3 | Vector): void;
}
type FieldLike = {
  lastScrollY: number;
  checkInOuterField(x: number, y: number): boolean;
  getBlock(x: number, y: number): number;
};

declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glRotatef(angleDeg: number, x: number, y: number, z: number): void;
declare function glScalef(x: number, y: number, z: number): void;
declare function glVertex3(x: number, y: number, z: number): void;
declare function sin(v: number): number;
declare function cos(v: number): number;

/**
 * Sparks.
 */
export class Spark extends LuminousActor {
  private static readonly rand = new Rand();

  private readonly pos = new Vector();
  private readonly vel = new Vector();
  private r = 0;
  private g = 0;
  private b = 0;
  private cnt = 0;

  public static setRandSeed(seed: number): void {
    Spark.rand.setSeed(seed);
  }

  public override init(_args: unknown[] | null): void {}

  public set(p: Vector, vx: number, vy: number, r: number, g: number, b: number, c: number): void {
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.vel.x = vx;
    this.vel.y = vy;
    this.r = r;
    this.g = g;
    this.b = b;
    this.cnt = c;
    this.exists = true;
  }

  public override move(): void {
    this.cnt--;
    if (this.cnt <= 0 || (Math.abs(this.vel.x) + Math.abs(this.vel.y)) < 0.005) {
      this.exists = false;
      return;
    }
    this.pos.opAddAssign(this.vel);
    this.vel.opMulAssign(0.96);
  }

  public override draw(): void {
    drawSparkTriangle(this.pos.x, this.pos.y, this.vel.x, this.vel.y, this.r, this.g, this.b);
  }

  public override drawLuminous(): void {
    drawSparkTriangle(this.pos.x, this.pos.y, this.vel.x, this.vel.y, this.r, this.g, this.b);
  }
}

export class SparkPool extends LuminousActorPool<Spark> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args ?? [], () => new Spark());
  }
}

/**
 * Smokes.
 */
export class Smoke extends LuminousActor {
  public static readonly SmokeType = {
    FIRE: 0,
    EXPLOSION: 1,
    SAND: 2,
    SPARK: 3,
    WAKE: 4,
    SMOKE: 5,
    LANCE_SPARK: 6,
  } as const;

  private static readonly rand = new Rand();
  private static readonly windVel = new Vector3(0.04, 0.04, 0.02);

  private field!: FieldLike;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private type: number = Smoke.SmokeType.FIRE;
  private cnt = 0;
  private startCnt = 1;
  private size = 1;
  private r = 1;
  private g = 1;
  private b = 1;
  private a = 1;

  public static setRandSeed(seed: number): void {
    Smoke.rand.setSeed(seed);
  }

  public override init(args: unknown[] | null): void {
    this.field = (args?.[0] as FieldLike) ?? {
      lastScrollY: 0,
      checkInOuterField: () => true,
      getBlock: () => -1,
    };
  }

  public set(p: Vector, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(p: Vector3, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(x: number, y: number, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(
    pOrX: Vector | Vector3 | number,
    myOrY: number,
    mzOrMx: number,
    tOrMy: number,
    cOrMz: number,
    szOrT: number,
    c = 60,
    sz = 2,
  ): void {
    let x: number;
    let y: number;
    let z = 0;
    let mx: number;
    let my: number;
    let mz: number;
    let t: number;

    if (typeof pOrX === "number") {
      x = pOrX;
      y = myOrY;
      mx = mzOrMx;
      my = tOrMy;
      mz = cOrMz;
      t = szOrT;
    } else {
      x = pOrX.x;
      y = pOrX.y;
      z = "z" in pOrX ? (pOrX as Vector3).z : 0;
      mx = myOrY;
      my = mzOrMx;
      mz = tOrMy;
      t = cOrMz;
      c = szOrT;
    }

    if (!this.field.checkInOuterField(x, y)) return;
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = mx;
    this.vel.y = my;
    this.vel.z = mz;
    this.type = t;
    this.startCnt = this.cnt = c;
    this.size = sz;

    switch (this.type) {
      case Smoke.SmokeType.FIRE:
        this.r = 0.9 + Smoke.rand.nextFloat(0.1);
        this.g = 0.2 + Smoke.rand.nextFloat(0.2);
        this.b = 0;
        this.a = 1;
        break;
      case Smoke.SmokeType.EXPLOSION:
        this.r = 0.7 + Smoke.rand.nextFloat(0.3);
        this.g = 0.3 + Smoke.rand.nextFloat(0.3);
        this.b = 0;
        this.a = 1;
        break;
      case Smoke.SmokeType.SAND:
        this.r = 0.8;
        this.g = 0.8;
        this.b = 0.6;
        this.a = 0.6;
        break;
      case Smoke.SmokeType.SPARK:
        this.r = 0.7 + Smoke.rand.nextFloat(0.3);
        this.g = 0.5 + Smoke.rand.nextFloat(0.5);
        this.b = 0;
        this.a = 1;
        break;
      case Smoke.SmokeType.WAKE:
        this.r = 0.6;
        this.g = 0.6;
        this.b = 0.8;
        this.a = 0.6;
        break;
      case Smoke.SmokeType.SMOKE:
        this.r = 0.1 + Smoke.rand.nextFloat(0.1);
        this.g = 0.1 + Smoke.rand.nextFloat(0.1);
        this.b = 0.1;
        this.a = 0.5;
        break;
      case Smoke.SmokeType.LANCE_SPARK:
      default:
        this.r = 0.4;
        this.g = 0.7 + Smoke.rand.nextFloat(0.2);
        this.b = 0.7 + Smoke.rand.nextFloat(0.2);
        this.a = 1;
        break;
    }
    this.exists = true;
  }

  public override move(): void {
    this.cnt--;
    if (this.cnt <= 0 || !this.field.checkInOuterField(this.pos.x, this.pos.y)) {
      this.exists = false;
      return;
    }

    if (this.type !== Smoke.SmokeType.WAKE) {
      this.vel.x += (Smoke.windVel.x - this.vel.x) * 0.01;
      this.vel.y += (Smoke.windVel.y - this.vel.y) * 0.01;
      this.vel.z += (Smoke.windVel.z - this.vel.z) * 0.01;
    }

    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;
    this.pos.z += this.vel.z;

    if (this.type === Smoke.SmokeType.SPARK || this.type === Smoke.SmokeType.LANCE_SPARK) {
      this.vel.x *= 0.9;
      this.vel.y *= 0.9;
      this.a *= 0.95;
    } else {
      this.size *= 1.01;
      if (this.cnt < this.startCnt / 2) {
        this.r *= 0.96;
        this.g *= 0.96;
        this.b *= 0.96;
      } else {
        this.a *= 0.97;
      }
    }
  }

  public override draw(): void {
    drawSmokeQuad(this.pos, this.size, this.r, this.g, this.b, this.a);
  }

  public override drawLuminous(): void {
    if (this.r + this.g <= 0.8 || this.b >= 0.5) return;
    drawSmokeQuad(this.pos, this.size, this.r, this.g, this.b, this.a);
  }
}

export class SmokePool extends LuminousActorPool<Smoke> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args ?? [], () => new Smoke());
  }
}

/**
 * Fragments of destroyed enemies.
 */
export class Fragment extends Actor {
  private static readonly rand = new Rand();

  private field!: FieldLike;
  private smokes!: SmokePool;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private size = 1;
  private d2 = 0;
  private md2 = 0;

  public static init(): void {}
  public static close(): void {}
  public static setRandSeed(seed: number): void {
    Fragment.rand.setSeed(seed);
  }

  public override init(args: unknown[] | null): void {
    this.field = args?.[0] as FieldLike;
    this.smokes = args?.[1] as SmokePool;
  }

  public set(p: Vector, mx: number, my: number, mz: number, sz = 1): void {
    if (!this.field.checkInOuterField(p.x, p.y)) return;
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.pos.z = 0;
    this.vel.x = mx;
    this.vel.y = my;
    this.vel.z = mz;
    this.size = Math.min(5, sz);
    this.d2 = Fragment.rand.nextFloat(360);
    this.md2 = Fragment.rand.nextSignedFloat(20);
    this.exists = true;
  }

  public override move(): void {
    if (!this.field.checkInOuterField(this.pos.x, this.pos.y)) {
      this.exists = false;
      return;
    }
    this.vel.x *= 0.96;
    this.vel.y *= 0.96;
    this.vel.z += (-0.04 - this.vel.z) * 0.01;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;
    this.pos.z += this.vel.z;
    if (this.pos.z < 0) {
      const s = this.smokes.getInstanceForced();
      s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.SAND, 60, this.size * 0.75);
      this.exists = false;
      return;
    }
    this.d2 += this.md2;
  }

  public override draw(): void {
    glPushMatrix();
    Screen.setColor(0.7, 0.5, 0.5, 0.9);
    Screen.glTranslate(this.pos);
    glRotatef(this.d2, 1, 0, 0);
    glScalef(this.size, this.size, 1);
    glVertex3(-0.5, -0.25, 0);
    glVertex3(0.5, -0.25, 0);
    glVertex3(0.5, 0.25, 0);
    glVertex3(-0.5, 0.25, 0);
    glPopMatrix();
  }
}

export class FragmentPool extends ActorPool<Fragment> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Fragment());
  }
}

/**
 * Luminous fragments.
 */
export class SparkFragment extends LuminousActor {
  private static readonly rand = new Rand();

  private field!: FieldLike;
  private smokes!: SmokePool;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private size = 1;
  private d2 = 0;
  private md2 = 0;
  private cnt = 0;
  private hasSmoke = false;

  public static init(): void {}
  public static close(): void {}
  public static setRandSeed(seed: number): void {
    SparkFragment.rand.setSeed(seed);
  }

  public override init(args: unknown[] | null): void {
    this.field = args?.[0] as FieldLike;
    this.smokes = args?.[1] as SmokePool;
  }

  public set(p: Vector, mx: number, my: number, mz: number, sz = 1): void {
    if (!this.field.checkInOuterField(p.x, p.y)) return;
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.pos.z = 0;
    this.vel.x = mx;
    this.vel.y = my;
    this.vel.z = mz;
    this.size = Math.min(5, sz);
    this.d2 = SparkFragment.rand.nextFloat(360);
    this.md2 = SparkFragment.rand.nextSignedFloat(15);
    this.hasSmoke = SparkFragment.rand.nextInt(4) === 0;
    this.cnt = 0;
    this.exists = true;
  }

  public override move(): void {
    if (!this.field.checkInOuterField(this.pos.x, this.pos.y)) {
      this.exists = false;
      return;
    }
    this.vel.x *= 0.99;
    this.vel.y *= 0.99;
    this.vel.z += (-0.08 - this.vel.z) * 0.01;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;
    this.pos.z += this.vel.z;
    if (this.pos.z < 0) {
      const s = this.smokes.getInstanceForced();
      s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.SAND, 60, this.size * 0.75);
      this.exists = false;
      return;
    }
    this.d2 += this.md2;
    this.cnt++;
    if (this.hasSmoke && this.cnt % 5 === 0) {
      const s = this.smokes.getInstance();
      if (s) s.set(this.pos, 0, 0, 0, Smoke.SmokeType.SMOKE, 90 + SparkFragment.rand.nextInt(60), this.size * 0.5);
    }
  }

  public override draw(): void {
    drawSparkFragment(this.pos, this.size, this.d2);
  }

  public override drawLuminous(): void {
    drawSparkFragment(this.pos, this.size, this.d2);
  }
}

export class SparkFragmentPool extends LuminousActorPool<SparkFragment> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args ?? [], () => new SparkFragment());
  }
}

/**
 * Wakes of ships and smokes.
 */
export class Wake extends Actor {
  private field!: FieldLike;
  private readonly pos = new Vector();
  private readonly vel = new Vector();
  private size = 1;
  private cnt = 0;
  private revShape = false;

  public override init(args: unknown[] | null): void {
    this.field = args?.[0] as FieldLike;
  }

  public set(p: Vector, deg: number, speed: number, c = 60, sz = 1, rs = false): void {
    if (!this.field.checkInOuterField(p.x, p.y)) return;
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.vel.x = sin(deg) * speed;
    this.vel.y = cos(deg) * speed;
    this.cnt = c;
    this.size = sz;
    this.revShape = rs;
    this.exists = true;
  }

  public override move(): void {
    this.cnt--;
    if (this.cnt <= 0 || (Math.abs(this.vel.x) + Math.abs(this.vel.y)) < 0.005 || !this.field.checkInOuterField(this.pos.x, this.pos.y)) {
      this.exists = false;
      return;
    }
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;
    this.vel.opMulAssign(0.96);
    this.size *= 1.02;
  }

  public override draw(): void {
    let ox = this.vel.x * this.size;
    let oy = this.vel.y * this.size;
    Screen.setColor(0.33, 0.33, 1);
    if (this.revShape) glVertex3(this.pos.x + ox, this.pos.y + oy, 0);
    else glVertex3(this.pos.x - ox, this.pos.y - oy, 0);
    ox *= 0.2;
    oy *= 0.2;
    Screen.setColor(0.2, 0.2, 0.6, 0.5);
    glVertex3(this.pos.x - oy, this.pos.y + ox, 0);
    glVertex3(this.pos.x + oy, this.pos.y - ox, 0);
  }
}

export class WakePool extends ActorPool<Wake> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Wake());
  }
}

function drawSparkTriangle(x: number, y: number, vx: number, vy: number, r: number, g: number, b: number): void {
  let ox = vx * 2;
  let oy = vy * 2;
  Screen.setColor(r, g, b, 1);
  glVertex3(x - ox, y - oy, 0);
  ox *= 0.5;
  oy *= 0.5;
  Screen.setColor(r * 0.5, g * 0.5, b * 0.5, 0);
  glVertex3(x - oy, y + ox, 0);
  glVertex3(x + oy, y - ox, 0);
}

function drawSmokeQuad(pos: Vector3, size: number, r: number, g: number, b: number, a: number): void {
  const q = size / 2;
  Screen.setColor(r, g, b, a);
  glVertex3(pos.x - q, pos.y - q, pos.z);
  glVertex3(pos.x + q, pos.y - q, pos.z);
  glVertex3(pos.x + q, pos.y + q, pos.z);
  glVertex3(pos.x - q, pos.y + q, pos.z);
}

function drawSparkFragment(pos: Vector3, size: number, d2: number): void {
  glPushMatrix();
  Screen.setColor(1, Math.random(), 0, 0.8);
  Screen.glTranslate(pos);
  glRotatef(d2, 1, 0, 0);
  glScalef(size, size, 1);
  glVertex3(-0.25, -0.25, 0);
  glVertex3(0.25, -0.25, 0);
  glVertex3(0.25, 0.25, 0);
  glVertex3(-0.25, 0.25, 0);
  glPopMatrix();
}
