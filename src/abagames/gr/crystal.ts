/*
 * $Id: crystal.d,v 1.2 2005/07/17 11:02:45 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../util/actor";
import { Vector } from "../util/vector";

declare class CrystalShape {
  public draw(): void;
  public close(): void;
}

declare function glPushMatrix(): void;
declare function glTranslatef(x: number, y: number, z: number): void;
declare function glPopMatrix(): void;

/**
 * Bonus crystals.
 */
export class Crystal extends Actor {
  public static readonly COUNT = 60;
  public static readonly PULLIN_COUNT = Math.trunc(Crystal.COUNT * 0.8);

  private static _shape: { draw(): void; close(): void } | null = null;

  private ship: { midstPos: Vector } | null = null;
  private pos: Vector;
  private vel: Vector;
  private cnt = 0;

  public static init(): void {
    Crystal._shape = new CrystalShape();
  }

  public static close(): void {
    Crystal._shape?.close();
    Crystal._shape = null;
  }

  public constructor() {
    super();
    this.pos = new Vector();
    this.vel = new Vector();
  }

  public override init(args: unknown[] | null): void {
    const ship = args?.[0] as { midstPos: Vector } | undefined;
    this.ship = ship ?? null;
  }

  public set(p: Vector): void {
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.cnt = Crystal.COUNT;
    this.vel.x = 0;
    this.vel.y = 0.1;
    this.exists = true;
  }

  public override move(): void {
    if (!this.ship) {
      this.exists = false;
      return;
    }

    this.cnt--;
    let dist = this.pos.dist(this.ship.midstPos);
    if (dist < 0.1) {
      dist = 0.1;
    }
    if (this.cnt < Crystal.PULLIN_COUNT) {
      this.vel.x += ((this.ship.midstPos.x - this.pos.x) / dist) * 0.07;
      this.vel.y += ((this.ship.midstPos.y - this.pos.y) / dist) * 0.07;
      if (this.cnt < 0 || dist < 2) {
        this.exists = false;
        return;
      }
    }
    this.vel.opMulAssign(0.95);
    this.pos.opAddAssign(this.vel);
  }

  public override draw(): void {
    if (!Crystal._shape) {
      return;
    }

    let r = 0.25;
    let d = this.cnt * 0.1;
    if (this.cnt > Crystal.PULLIN_COUNT) {
      r *= (Crystal.COUNT - this.cnt) / (Crystal.COUNT - Crystal.PULLIN_COUNT);
    }
    for (let i = 0; i < 4; i++) {
      glPushMatrix();
      glTranslatef(this.pos.x + Math.sin(d) * r, this.pos.y + Math.cos(d) * r, 0);
      Crystal._shape.draw();
      glPopMatrix();
      d += Math.PI / 2;
    }
  }
}

export class CrystalPool extends ActorPool<Crystal> {
  public constructor(n: number, args: unknown[] | null) {
    super(n, args, () => new Crystal());
  }
}
