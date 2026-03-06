/*
 * $Id: rand.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UMASK = 0x80000000;
const LMASK = 0x7fffffff;

function mixbits(u: number, v: number): number {
  return ((u & UMASK) | (v & LMASK)) >>> 0;
}

function twist(u: number, v: number): number {
  return ((mixbits(u, v) >>> 1) ^ ((v & 1) !== 0 ? MATRIX_A : 0)) >>> 0;
}

/**
 * Random number generator.
 */
export class Rand {
  private readonly state = new Uint32Array(N);
  private left = 1;
  private initf = 0;
  private nextIndex = 0;

  public constructor() {
    this.initGenrand(Date.now());
  }

  public setSeed(n: number): void {
    this.initGenrand(n);
  }

  public nextInt32(): number {
    return this.genrandInt32();
  }

  public nextInt(n: number): number {
    if (n === 0) return 0;
    return this.genrandInt32() % n;
  }

  public nextSignedInt(n: number): number {
    if (n === 0) return 0;
    return this.genrandInt32() % (n * 2 + 1) - n;
  }

  public nextFloat(n: number): number {
    return this.genrandReal1() * n;
  }

  public nextSignedFloat(n: number): number {
    return this.genrandReal1() * (n * 2) - n;
  }

  private initGenrand(s: number): void {
    this.state[0] = s >>> 0;
    for (let j = 1; j < N; j++) {
      this.state[j] = (Math.imul(1812433253, this.state[j - 1] ^ (this.state[j - 1] >>> 30)) + j) >>> 0;
    }
    this.left = 1;
    this.initf = 1;
  }

  private nextState(): void {
    if (this.initf === 0) this.initGenrand(5489);

    this.left = N;
    this.nextIndex = 0;

    for (let j = N - M + 1; j > 0; j--) {
      const p = N - M + 1 - j;
      this.state[p] = (this.state[p + M] ^ twist(this.state[p], this.state[p + 1])) >>> 0;
    }

    for (let j = M; j > 0; j--) {
      const p = N - M + 1 + (M - j);
      this.state[p] = (this.state[p + M - N] ^ twist(this.state[p], this.state[p + 1])) >>> 0;
    }

    const p = N - 1;
    this.state[p] = (this.state[p + M - N] ^ twist(this.state[p], this.state[0])) >>> 0;
  }

  private genrandInt32(): number {
    if (--this.left === 0) this.nextState();
    let y = this.state[this.nextIndex++];

    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  private genrandReal1(): number {
    return this.genrandInt32() * (1.0 / 4294967295.0);
  }
}
