/*
 * $Id: vector.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Vector.
 */
export class Vector {
  public x: number;
  public y: number;

  public constructor();
  public constructor(x: number, y: number);
  public constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  public opMul(v: Vector): number {
    return this.x * v.x + this.y * v.y;
  }

  public getElement(v: Vector): Vector {
    const rsl = new Vector();
    const ll = v.opMul(v);
    if (ll !== 0) {
      const mag = this.opMul(v);
      rsl.x = (mag * v.x) / ll;
      rsl.y = (mag * v.y) / ll;
    } else {
      rsl.x = 0;
      rsl.y = 0;
    }
    return rsl;
  }

  public opAddAssign(v: Vector): void {
    this.x += v.x;
    this.y += v.y;
  }

  public opSubAssign(v: Vector): void {
    this.x -= v.x;
    this.y -= v.y;
  }

  public opMulAssign(a: number): void {
    this.x *= a;
    this.y *= a;
  }

  public opDivAssign(a: number): void {
    this.x /= a;
    this.y /= a;
  }

  public checkSide(pos1: Vector, pos2: Vector, ofs?: Vector): number {
    const xo = pos2.x - pos1.x;
    const yo = pos2.y - pos1.y;
    const mx = ofs ? this.x + ofs.x : this.x;
    const my = ofs ? this.y + ofs.y : this.y;

    if (xo === 0) {
      if (yo === 0) return 0;
      if (yo > 0) return mx - pos1.x;
      return pos1.x - mx;
    }
    if (yo === 0) {
      if (xo > 0) return pos1.y - my;
      return my - pos1.y;
    }
    if (xo * yo > 0) {
      return (mx - pos1.x) / xo - (my - pos1.y) / yo;
    }
    return -(mx - pos1.x) / xo + (my - pos1.y) / yo;
  }

  public checkCross(p: Vector, p1: Vector, p2: Vector, width: number): boolean {
    let a1x: number;
    let a1y: number;
    let a2x: number;
    let a2y: number;
    if (this.x < p.x) {
      a1x = this.x - width;
      a2x = p.x + width;
    } else {
      a1x = p.x - width;
      a2x = this.x + width;
    }
    if (this.y < p.y) {
      a1y = this.y - width;
      a2y = p.y + width;
    } else {
      a1y = p.y - width;
      a2y = this.y + width;
    }

    let b1x: number;
    let b1y: number;
    let b2x: number;
    let b2y: number;
    if (p2.y < p1.y) {
      b1y = p2.y - width;
      b2y = p1.y + width;
    } else {
      b1y = p1.y - width;
      b2y = p2.y + width;
    }
    if (a2y >= b1y && b2y >= a1y) {
      if (p2.x < p1.x) {
        b1x = p2.x - width;
        b2x = p1.x + width;
      } else {
        b1x = p1.x - width;
        b2x = p2.x + width;
      }
      if (a2x >= b1x && b2x >= a1x) {
        const a = this.y - p.y;
        const b = p.x - this.x;
        const c = p.x * this.y - p.y * this.x;
        const d = p2.y - p1.y;
        const e = p1.x - p2.x;
        const f = p1.x * p2.y - p1.y * p2.x;
        const dnm = b * d - a * e;
        if (dnm !== 0) {
          const x = (b * f - c * e) / dnm;
          const y = (c * d - a * f) / dnm;
          if (
            a1x <= x &&
            x <= a2x &&
            a1y <= y &&
            y <= a2y &&
            b1x <= x &&
            x <= b2x &&
            b1y <= y &&
            y <= b2y
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public checkHitDist(p: Vector, pp: Vector, dist: number): boolean {
    let bmvx = pp.x - p.x;
    let bmvy = pp.y - p.y;
    const inaa = bmvx * bmvx + bmvy * bmvy;
    if (inaa > 0.00001) {
      const sofsx = this.x - p.x;
      const sofsy = this.y - p.y;
      const inab = bmvx * sofsx + bmvy * sofsy;
      if (inab >= 0 && inab <= inaa) {
        const hd = sofsx * sofsx + sofsy * sofsy - (inab * inab) / inaa;
        if (hd >= 0 && hd <= dist) return true;
      }
    }
    return false;
  }

  public size(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  public dist(v: Vector): number {
    const ax = Math.abs(this.x - v.x);
    const ay = Math.abs(this.y - v.y);
    if (ax > ay) return ax + ay / 2;
    return ay + ax / 2;
  }

  public toString(): string {
    return `(${this.x}, ${this.y})`;
  }
}

export class Vector3 {
  public x: number;
  public y: number;
  public z: number;

  public constructor();
  public constructor(x: number, y: number, z: number);
  public constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public rollX(d: number): void {
    const ty = this.y * Math.cos(d) - this.z * Math.sin(d);
    this.z = this.y * Math.sin(d) + this.z * Math.cos(d);
    this.y = ty;
  }

  public rollY(d: number): void {
    const tx = this.x * Math.cos(d) - this.z * Math.sin(d);
    this.z = this.x * Math.sin(d) + this.z * Math.cos(d);
    this.x = tx;
  }

  public rollZ(d: number): void {
    const tx = this.x * Math.cos(d) - this.y * Math.sin(d);
    this.y = this.x * Math.sin(d) + this.y * Math.cos(d);
    this.x = tx;
  }

  public blend(v1: Vector3, v2: Vector3, ratio: number): void {
    this.x = v1.x * ratio + v2.x * (1 - ratio);
    this.y = v1.y * ratio + v2.y * (1 - ratio);
    this.z = v1.z * ratio + v2.z * (1 - ratio);
  }

  public opAddAssign(v: Vector3): void {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
  }

  public opSubAssign(v: Vector3): void {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
  }

  public opMulAssign(a: number): void {
    this.x *= a;
    this.y *= a;
    this.z *= a;
  }

  public opDivAssign(a: number): void {
    this.x /= a;
    this.y /= a;
    this.z /= a;
  }
}
