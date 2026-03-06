/*
 * $Id: particle.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector, Vector3 } from "../util/vector";
import { Rand } from "../util/rand";
import { LuminousActor, LuminousActorPool } from "../util/sdl/luminous";
import { DisplayList } from "../util/sdl/displaylist";
import { Screen3D } from "../util/sdl/screen3d";
import { Screen } from "./screen";

type FieldLike = {
  lastScrollY: number;
  checkInOuterField(x: number, y: number): boolean;
  getBlock(x: number, y: number): number;
};

/**
 * Sparks.
 */
export class Spark extends LuminousActor {
  private static readonly rand = new Rand();

  private readonly pos = new Vector();
  private readonly ppos = new Vector();
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
    this.ppos.x = this.pos.x = p.x;
    this.ppos.y = this.pos.y = p.y;
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
    if (this.cnt <= 0 || this.vel.size() < 0.005) {
      this.exists = false;
      return;
    }
    this.ppos.x = this.pos.x;
    this.ppos.y = this.pos.y;
    this.pos.opAddAssign(this.vel);
    this.vel.opMulAssign(0.96);
  }

  public override draw(): void {
    this.drawSpark();
  }

  public override drawLuminous(): void {
    this.drawSpark();
  }

  private drawSpark(): void {
    let ox = this.vel.x;
    let oy = this.vel.y;
    Screen.setColor(this.r, this.g, this.b, 1);
    ox *= 2;
    oy *= 2;
    Screen3D.glVertex3f(this.pos.x - ox, this.pos.y - oy, 0);
    ox *= 0.5;
    oy *= 0.5;
    Screen.setColor(this.r * 0.5, this.g * 0.5, this.b * 0.5, 0);
    Screen3D.glVertex3f(this.pos.x - oy, this.pos.y + ox, 0);
    Screen3D.glVertex3f(this.pos.x + oy, this.pos.y - ox, 0);
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
  private static readonly wakePos = new Vector();

  private field!: FieldLike;
  private wakes: WakePool | null = null;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private type: number = Smoke.SmokeType.FIRE;
  private cnt = 0;
  private startCnt = 1;
  private size = 1;
  private r = 0;
  private g = 0;
  private b = 0;
  private a = 0;

  public static setRandSeed(seed: number): void {
    Smoke.rand.setSeed(seed);
  }

  public override init(args: unknown[] | null): void {
    this.field = (args?.[0] as FieldLike) ?? {
      lastScrollY: 0,
      checkInOuterField: () => true,
      getBlock: () => -1,
    };
    this.wakes = (args?.[1] as WakePool | undefined) ?? null;
  }

  public set(p: Vector, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(p: Vector3, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(x: number, y: number, mx: number, my: number, mz: number, t: number, c?: number, sz?: number): void;
  public set(
    pOrX: Vector | Vector3 | number,
    yOrMx: number,
    mxOrMy: number,
    myOrMz: number,
    mzOrT: number,
    tOrC: number,
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
    const argc = arguments.length;

    if (typeof pOrX === "number") {
      x = pOrX;
      y = yOrMx;
      mx = mxOrMy;
      my = myOrMz;
      mz = mzOrT;
      t = tOrC;
      c = argc >= 7 ? (arguments[6] as number) : 60;
      sz = argc >= 8 ? (arguments[7] as number) : 2;
    } else {
      x = pOrX.x;
      y = pOrX.y;
      z = "z" in pOrX ? (pOrX as Vector3).z : 0;
      mx = yOrMx;
      my = mxOrMy;
      mz = myOrMz;
      t = mzOrT;
      c = argc >= 6 ? (arguments[5] as number) : 60;
      sz = argc >= 7 ? (arguments[6] as number) : 2;
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
        this.r = Smoke.rand.nextFloat(0.1) + 0.9;
        this.g = Smoke.rand.nextFloat(0.2) + 0.2;
        this.b = 0;
        this.a = 1;
        break;
      case Smoke.SmokeType.EXPLOSION:
        this.r = Smoke.rand.nextFloat(0.3) + 0.7;
        this.g = Smoke.rand.nextFloat(0.3) + 0.3;
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
        this.r = Smoke.rand.nextFloat(0.3) + 0.7;
        this.g = Smoke.rand.nextFloat(0.5) + 0.5;
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
        this.r = Smoke.rand.nextFloat(0.1) + 0.1;
        this.g = Smoke.rand.nextFloat(0.1) + 0.1;
        this.b = 0.1;
        this.a = 0.5;
        break;
      case Smoke.SmokeType.LANCE_SPARK:
      default:
        this.r = 0.4;
        this.g = Smoke.rand.nextFloat(0.2) + 0.7;
        this.b = Smoke.rand.nextFloat(0.2) + 0.7;
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

    this.pos.opAddAssign(this.vel);
    this.pos.y -= this.field.lastScrollY;

    switch (this.type) {
      case Smoke.SmokeType.FIRE:
      case Smoke.SmokeType.EXPLOSION:
      case Smoke.SmokeType.SMOKE:
        if (this.cnt < this.startCnt / 2) {
          this.r *= 0.95;
          this.g *= 0.95;
          this.b *= 0.95;
        } else {
          this.a *= 0.97;
        }
        this.size *= 1.01;
        break;
      case Smoke.SmokeType.SAND:
        this.r *= 0.98;
        this.g *= 0.98;
        this.b *= 0.98;
        this.a *= 0.98;
        break;
      case Smoke.SmokeType.SPARK:
        this.r *= 0.92;
        this.g *= 0.92;
        this.a *= 0.95;
        this.vel.opMulAssign(0.9);
        break;
      case Smoke.SmokeType.WAKE:
        this.a *= 0.98;
        this.size *= 1.005;
        break;
      case Smoke.SmokeType.LANCE_SPARK:
        this.a *= 0.95;
        this.size *= 0.97;
        break;
    }

    if (this.size > 5) this.size = 5;

    if (this.type === Smoke.SmokeType.EXPLOSION && this.pos.z < 0.01 && this.wakes) {
      const bl = this.field.getBlock(this.pos.x, this.pos.y);
      if (bl >= 1) this.vel.opMulAssign(0.8);
      if (this.cnt % 3 === 0 && bl < -1) {
        const sp = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
        if (sp > 0.3) {
          const d = Math.atan2(this.vel.x, this.vel.y);

          Smoke.wakePos.x = this.pos.x + Math.sin(d + Math.PI / 2) * this.size * 0.25;
          Smoke.wakePos.y = this.pos.y + Math.cos(d + Math.PI / 2) * this.size * 0.25;
          let w = this.wakes.getInstanceForced();
          w.set(
            Smoke.wakePos,
            d + Math.PI - 0.2 + Smoke.rand.nextSignedFloat(0.1),
            sp * 0.33,
            20 + Smoke.rand.nextInt(12),
            this.size * (7 + Smoke.rand.nextFloat(3)),
          );

          Smoke.wakePos.x = this.pos.x + Math.sin(d - Math.PI / 2) * this.size * 0.25;
          Smoke.wakePos.y = this.pos.y + Math.cos(d - Math.PI / 2) * this.size * 0.25;
          w = this.wakes.getInstanceForced();
          w.set(
            Smoke.wakePos,
            d + Math.PI + 0.2 + Smoke.rand.nextSignedFloat(0.1),
            sp * 0.33,
            20 + Smoke.rand.nextInt(12),
            this.size * (7 + Smoke.rand.nextFloat(3)),
          );
        }
      }
    }
  }

  public override draw(): void {
    const quadSize = this.size / 2;
    Screen.setColor(this.r, this.g, this.b, this.a);
    Screen3D.glVertex3f(this.pos.x - quadSize, this.pos.y - quadSize, this.pos.z);
    Screen3D.glVertex3f(this.pos.x + quadSize, this.pos.y - quadSize, this.pos.z);
    Screen3D.glVertex3f(this.pos.x + quadSize, this.pos.y + quadSize, this.pos.z);
    Screen3D.glVertex3f(this.pos.x - quadSize, this.pos.y + quadSize, this.pos.z);
  }

  public override drawLuminous(): void {
    if (this.r + this.g > 0.8 && this.b < 0.5) {
      const quadSize = this.size / 2;
      Screen.setColor(this.r, this.g, this.b, this.a);
      Screen3D.glVertex3f(this.pos.x - quadSize, this.pos.y - quadSize, this.pos.z);
      Screen3D.glVertex3f(this.pos.x + quadSize, this.pos.y - quadSize, this.pos.z);
      Screen3D.glVertex3f(this.pos.x + quadSize, this.pos.y + quadSize, this.pos.z);
      Screen3D.glVertex3f(this.pos.x - quadSize, this.pos.y + quadSize, this.pos.z);
    }
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
  private static displayList: DisplayList | null = null;
  private static rand = new Rand();

  private field!: FieldLike;
  private smokes!: SmokePool;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private size = 1;
  private d2 = 0;
  private md2 = 0;

  public static init(): void {
    Fragment.rand = new Rand();
    Fragment.displayList = new DisplayList(1);
    Fragment.displayList.beginNewList();
    Screen.setColor(0.7, 0.5, 0.5, 0.5);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(-0.5, -0.25, 0);
    Screen3D.glVertex3f(0.5, -0.25, 0);
    Screen3D.glVertex3f(0.5, 0.25, 0);
    Screen3D.glVertex3f(-0.5, 0.25, 0);
    Screen3D.glEnd();
    Screen.setColor(0.7, 0.5, 0.5, 0.9);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    Screen3D.glVertex3f(-0.5, -0.25, 0);
    Screen3D.glVertex3f(0.5, -0.25, 0);
    Screen3D.glVertex3f(0.5, 0.25, 0);
    Screen3D.glVertex3f(-0.5, 0.25, 0);
    Screen3D.glEnd();
    Fragment.displayList.endNewList();
  }

  public static setRandSeed(seed: number): void {
    Fragment.rand.setSeed(seed);
  }

  public static close(): void {
    Fragment.displayList?.close();
    Fragment.displayList = null;
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
    this.size = sz;
    if (this.size > 5) this.size = 5;
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
    this.pos.opAddAssign(this.vel);

    if (this.pos.z < 0) {
      const s = this.smokes.getInstanceForced();
      if (this.field.getBlock(this.pos.x, this.pos.y) < 0) s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.WAKE, 60, this.size * 0.66);
      else s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.SAND, 60, this.size * 0.75);
      this.exists = false;
      return;
    }

    this.pos.y -= this.field.lastScrollY;
    this.d2 += this.md2;
  }

  public override draw(): void {
    Screen3D.glPushMatrix();
    Screen.glTranslate(this.pos);
    Screen3D.glRotatef(this.d2, 1, 0, 0);
    Screen3D.glScalef(this.size, this.size, 1);
    Fragment.displayList?.call(0);
    Screen3D.glPopMatrix();
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
  private static displayList: DisplayList | null = null;
  private static rand = new Rand();

  private field!: FieldLike;
  private smokes!: SmokePool;
  private readonly pos = new Vector3();
  private readonly vel = new Vector3();
  private size = 1;
  private d2 = 0;
  private md2 = 0;
  private cnt = 0;
  private hasSmoke = false;

  public static init(): void {
    SparkFragment.rand = new Rand();
    SparkFragment.displayList = new DisplayList(1);
    SparkFragment.displayList.beginNewList();
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glVertex3f(-0.25, -0.25, 0);
    Screen3D.glVertex3f(0.25, -0.25, 0);
    Screen3D.glVertex3f(0.25, 0.25, 0);
    Screen3D.glVertex3f(-0.25, 0.25, 0);
    Screen3D.glEnd();
    SparkFragment.displayList.endNewList();
  }

  public static setRandSeed(seed: number): void {
    SparkFragment.rand.setSeed(seed);
  }

  public static close(): void {
    SparkFragment.displayList?.close();
    SparkFragment.displayList = null;
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
    this.size = sz;
    if (this.size > 5) this.size = 5;
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
    this.pos.opAddAssign(this.vel);

    if (this.pos.z < 0) {
      const s = this.smokes.getInstanceForced();
      if (this.field.getBlock(this.pos.x, this.pos.y) < 0) s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.WAKE, 60, this.size * 0.66);
      else s.set(this.pos.x, this.pos.y, 0, 0, 0, Smoke.SmokeType.SAND, 60, this.size * 0.75);
      this.exists = false;
      return;
    }

    this.pos.y -= this.field.lastScrollY;
    this.d2 += this.md2;
    this.cnt++;

    if (this.hasSmoke && this.cnt % 5 === 0) {
      const s = this.smokes.getInstance();
      if (s) s.set(this.pos, 0, 0, 0, Smoke.SmokeType.SMOKE, 90 + SparkFragment.rand.nextInt(60), this.size * 0.5);
    }
  }

  public override draw(): void {
    this.drawFragment();
  }

  public override drawLuminous(): void {
    this.drawFragment();
  }

  private drawFragment(): void {
    Screen3D.glPushMatrix();
    Screen.setColor(1, SparkFragment.rand.nextFloat(1), 0, 0.8);
    Screen.glTranslate(this.pos);
    Screen3D.glRotatef(this.d2, 1, 0, 0);
    Screen3D.glScalef(this.size, this.size, 1);
    SparkFragment.displayList?.call(0);
    Screen3D.glPopMatrix();
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
  private deg = 0;
  private speed = 0;
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
    this.deg = deg;
    this.speed = speed;
    this.vel.x = Math.sin(deg) * speed;
    this.vel.y = Math.cos(deg) * speed;
    this.cnt = c;
    this.size = sz;
    this.revShape = rs;
    this.exists = true;
  }

  public override move(): void {
    this.cnt--;
    if (this.cnt <= 0 || this.vel.size() < 0.005 || !this.field.checkInOuterField(this.pos.x, this.pos.y)) {
      this.exists = false;
      return;
    }

    this.pos.opAddAssign(this.vel);
    this.pos.y -= this.field.lastScrollY;
    this.vel.opMulAssign(0.96);
    this.size *= 1.02;
  }

  public override draw(): void {
    let ox = this.vel.x;
    let oy = this.vel.y;
    Screen.setColor(0.33, 0.33, 1);
    ox *= this.size;
    oy *= this.size;
    if (this.revShape) Screen3D.glVertex3f(this.pos.x + ox, this.pos.y + oy, 0);
    else Screen3D.glVertex3f(this.pos.x - ox, this.pos.y - oy, 0);
    ox *= 0.2;
    oy *= 0.2;
    Screen.setColor(0.2, 0.2, 0.6, 0.5);
    Screen3D.glVertex3f(this.pos.x - oy, this.pos.y + ox, 0);
    Screen3D.glVertex3f(this.pos.x + oy, this.pos.y - ox, 0);
  }
}

export class WakePool extends ActorPool<Wake> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Wake());
  }
}
