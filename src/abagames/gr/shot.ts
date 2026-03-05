/*
 * $Id: shot.d,v 1.2 2005/07/03 07:05:22 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector } from "../util/vector";
import { Rand } from "../util/rand";

declare class Collidable {}
declare class CollidableDrawable extends Collidable {}
declare class Field {
  public static readonly ON_BLOCK_THRESHOLD: number;
  public lastScrollY: number;
  public getBlock(v: Vector): number;
  public checkInOuterField(v: Vector): boolean;
  public checkInOuterFieldExceptTop(v: Vector): boolean;
  public size: Vector;
}
declare class EnemyPool {
  public checkShotHit(pos: Vector, shape: Collidable, shot: Shot): void;
}
declare class BulletPool {
  public checkShotHit(pos: Vector, shape: Collidable, shot: Shot): void;
}
declare class Spark {
  public set(pos: Vector, vx: number, vy: number, r: number, g: number, b: number, cnt: number): void;
}
declare class SparkPool {
  public getInstanceForced(): Spark;
}
declare class Smoke {
  public static readonly SmokeType: {
    readonly LANCE_SPARK: number;
    readonly SPARK: number;
  };
  public set(pos: Vector, vx: number, vy: number, vz: number, type: number, cnt: number, size: number): void;
}
declare class SmokePool {
  public getInstanceForced(): Smoke;
}
declare class SoundManager {
  public static playSe(name: string): void;
}
declare class Screen {
  public static setColor(r: number, g: number, b: number, a?: number): void;
  public static glTranslate(v: Vector): void;
}
declare class ShotShape extends CollidableDrawable {
  public draw(): void;
}
declare class LanceShape extends Collidable {
  public draw?(): void;
}

declare const PI: number;
declare const GL_LINE_LOOP: number;
declare const GL_TRIANGLE_FAN: number;
declare function sin(v: number): number;
declare function cos(v: number): number;
declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glTranslatef(x: number, y: number, z: number): void;
declare function glRotatef(angleDeg: number, x: number, y: number, z: number): void;
declare function glBegin(mode: number): void;
declare function glEnd(): void;
declare function glVertex3(x: number, y: number, z: number): void;

/**
 * Player's shot.
 */
export class Shot extends Actor {
  public static readonly SPEED = 0.6;
  public static readonly LANCE_SPEED = 0.5;

  private static shape: ShotShape;
  private static lanceShape: LanceShape;
  private static rand: Rand;

  private field!: Field;
  private enemies!: EnemyPool;
  private sparks!: SparkPool;
  private smokes!: SmokePool;
  private bullets!: BulletPool;
  private readonly pos: Vector;
  private cnt = 0;
  private hitCnt = 0;
  private _deg = 0;
  private _damage = 1;
  public lance = false;

  public static init(): void {
    Shot.shape = new ShotShape();
    Shot.lanceShape = new LanceShape();
    Shot.rand = new Rand();
  }

  public static setRandSeed(seed: number): void {
    Shot.rand.setSeed(seed);
  }

  public static close(): void {}

  public constructor() {
    super();
    this.pos = new Vector();
  }

  public override init(args: unknown[] | null): void {
    this.field = args?.[0] as Field;
    this.enemies = args?.[1] as EnemyPool;
    this.sparks = args?.[2] as SparkPool;
    this.smokes = args?.[3] as SmokePool;
    this.bullets = args?.[4] as BulletPool;
  }

  public set(p: Vector, d: number, lance = false, dmg = -1): void {
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.cnt = 0;
    this.hitCnt = 0;
    this._deg = d;
    this.lance = lance;
    this._damage = lance ? 10 : 1;
    if (dmg >= 0) this._damage = dmg;
    this.exists = true;
  }

  public override move(): void {
    this.cnt++;
    if (this.hitCnt > 0) {
      this.hitCnt++;
      if (this.hitCnt > 30) this.remove();
      return;
    }

    let sp = Shot.SPEED;
    if (this.lance) {
      if (this.cnt < 10) sp = (Shot.LANCE_SPEED * this.cnt) / 10;
      else sp = Shot.LANCE_SPEED;
    }

    this.pos.x += sin(this._deg) * sp;
    this.pos.y += cos(this._deg) * sp;
    this.pos.y -= this.field.lastScrollY;

    if (
      this.field.getBlock(this.pos) >= Field.ON_BLOCK_THRESHOLD ||
      !this.field.checkInOuterField(this.pos) ||
      this.pos.y > this.field.size.y
    ) {
      this.remove();
    }

    if (this.lance) {
      this.enemies.checkShotHit(this.pos, Shot.lanceShape, this);
    } else {
      this.bullets.checkShotHit(this.pos, Shot.shape, this);
      this.enemies.checkShotHit(this.pos, Shot.shape, this);
    }
  }

  public remove(): void {
    if (this.lance && this.hitCnt <= 0) {
      this.hitCnt = 1;
      return;
    }
    this.exists = false;
  }

  public removeHitToBullet(): void {
    this.removeHit();
  }

  public removeHitToEnemy(isSmallEnemy = false): void {
    if (isSmallEnemy && this.lance) return;
    SoundManager.playSe("hit.wav");
    this.removeHit();
  }

  private removeHit(): void {
    this.remove();
    if (this.lance) {
      for (let i = 0; i < 10; i++) {
        let s = this.smokes.getInstanceForced();
        let d = this._deg + Shot.rand.nextSignedFloat(0.1);
        let sp = Shot.rand.nextFloat(Shot.LANCE_SPEED);
        s.set(this.pos, sin(d) * sp, cos(d) * sp, 0, Smoke.SmokeType.LANCE_SPARK, 30 + Shot.rand.nextInt(30), 1);
        s = this.smokes.getInstanceForced();
        d = this._deg + Shot.rand.nextSignedFloat(0.1);
        sp = Shot.rand.nextFloat(Shot.LANCE_SPEED);
        s.set(this.pos, -sin(d) * sp, -cos(d) * sp, 0, Smoke.SmokeType.LANCE_SPARK, 30 + Shot.rand.nextInt(30), 1);
      }
    } else {
      let s = this.sparks.getInstanceForced();
      let d = this._deg + Shot.rand.nextSignedFloat(0.5);
      s.set(
        this.pos,
        sin(d) * Shot.SPEED,
        cos(d) * Shot.SPEED,
        0.6 + Shot.rand.nextSignedFloat(0.4),
        0.6 + Shot.rand.nextSignedFloat(0.4),
        0.1,
        20,
      );
      s = this.sparks.getInstanceForced();
      d = this._deg + Shot.rand.nextSignedFloat(0.5);
      s.set(
        this.pos,
        -sin(d) * Shot.SPEED,
        -cos(d) * Shot.SPEED,
        0.6 + Shot.rand.nextSignedFloat(0.4),
        0.6 + Shot.rand.nextSignedFloat(0.4),
        0.1,
        20,
      );
    }
  }

  public override draw(): void {
    if (this.lance) {
      let x = this.pos.x;
      let y = this.pos.y;
      let size = 0.25;
      let a = 0.6;
      let hc = this.hitCnt;
      for (let i = 0; i < this.cnt / 4 + 1; i++) {
        size *= 0.9;
        a *= 0.8;
        if (hc > 0) {
          hc--;
          continue;
        }
        let d = i * 13 + this.cnt * 3;
        for (let j = 0; j < 6; j++) {
          glPushMatrix();
          glTranslatef(x, y, 0);
          glRotatef((-this._deg * 180) / PI, 0, 0, 1);
          glRotatef(d, 0, 1, 0);
          Screen.setColor(0.4, 0.8, 0.8, a);
          glBegin(GL_LINE_LOOP);
          glVertex3(-size, Shot.LANCE_SPEED, size / 2);
          glVertex3(size, Shot.LANCE_SPEED, size / 2);
          glVertex3(size, -Shot.LANCE_SPEED, size / 2);
          glVertex3(-size, -Shot.LANCE_SPEED, size / 2);
          glEnd();
          Screen.setColor(0.2, 0.5, 0.5, a / 2);
          glBegin(GL_TRIANGLE_FAN);
          glVertex3(-size, Shot.LANCE_SPEED, size / 2);
          glVertex3(size, Shot.LANCE_SPEED, size / 2);
          glVertex3(size, -Shot.LANCE_SPEED, size / 2);
          glVertex3(-size, -Shot.LANCE_SPEED, size / 2);
          glEnd();
          glPopMatrix();
          d += 60;
        }
        x -= sin(this._deg) * Shot.LANCE_SPEED * 2;
        y -= cos(this._deg) * Shot.LANCE_SPEED * 2;
      }
    } else {
      glPushMatrix();
      Screen.glTranslate(this.pos);
      glRotatef((-this._deg * 180) / PI, 0, 0, 1);
      glRotatef(this.cnt * 31, 0, 1, 0);
      Shot.shape.draw();
      glPopMatrix();
    }
  }

  public get deg(): number {
    return this._deg;
  }

  public get damage(): number {
    return this._damage;
  }

  public get removed(): boolean {
    return this.hitCnt > 0;
  }
}

export class ShotPool extends ActorPool<Shot> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Shot());
  }

  public existsLance(): boolean {
    for (const s of this.actor) {
      if (s.exists && s.lance && !s.removed) return true;
    }
    return false;
  }
}
