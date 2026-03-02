/*
 * $Id: rand.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Random number generator.
 */
export class Rand {
  public constructor() {
    init_genrand(Date.now());
  }

  public setSeed(n: number): void {
    init_genrand(n);
  }

  public nextInt32(): number {
    return genrand_int32();
  }

  public nextInt(n: number): number {
    if (n === 0) return 0;
    return genrand_int32() % n;
  }

  public nextSignedInt(n: number): number {
    if (n === 0) return 0;
    return genrand_int32() % (n * 2) - n;
  }

  public nextFloat(n: number): number {
    return genrand_real1() * n;
  }

  public nextSignedFloat(n: number): number {
    return genrand_real1() * (n * 2) - n;
  }
}

/* Period parameters */
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UMASK = 0x80000000;
const LMASK = 0x7fffffff;

function MIXBITS(u: number, v: number): number {
  return ((u & UMASK) | (v & LMASK)) >>> 0;
}

function TWIST(u: number, v: number): number {
  return ((MIXBITS(u, v) >>> 1) ^ ((v & 1) !== 0 ? MATRIX_A : 0)) >>> 0;
}

const state = new Uint32Array(N);
let left = 1;
let initf = 0;
let nextIndex = 0;

/* initializes state[N] with a seed */
function init_genrand(s: number): void {
  state[0] = s >>> 0;
  for (let j = 1; j < N; j++) {
    state[j] = (Math.imul(1812433253, state[j - 1] ^ (state[j - 1] >>> 30)) + j) >>> 0;
  }
  left = 1;
  initf = 1;
}

/* initialize by an array with array-length */
function init_by_array(init_key: number[], key_length: number): void {
  let i: number;
  let j: number;
  let k: number;
  init_genrand(19650218);
  i = 1;
  j = 0;
  k = N > key_length ? N : key_length;
  for (; k > 0; k--) {
    state[i] = (
      (state[i] ^ Math.imul(state[i - 1] ^ (state[i - 1] >>> 30), 1664525)) +
      init_key[j] +
      j
    ) >>> 0;
    i++;
    j++;
    if (i >= N) {
      state[0] = state[N - 1];
      i = 1;
    }
    if (j >= key_length) j = 0;
  }
  for (k = N - 1; k > 0; k--) {
    state[i] = (
      (state[i] ^ Math.imul(state[i - 1] ^ (state[i - 1] >>> 30), 1566083941)) -
      i
    ) >>> 0;
    i++;
    if (i >= N) {
      state[0] = state[N - 1];
      i = 1;
    }
  }

  state[0] = 0x80000000;
  left = 1;
  initf = 1;
}

function next_state(): void {
  if (initf === 0) init_genrand(5489);

  left = N;
  nextIndex = 0;

  for (let j = N - M + 1; j > 0; j--) {
    const p = N - M + 1 - j;
    state[p] = (state[p + M] ^ TWIST(state[p], state[p + 1])) >>> 0;
  }

  for (let j = M; j > 0; j--) {
    const p = N - M + 1 + (M - j);
    state[p] = (state[p + M - N] ^ TWIST(state[p], state[p + 1])) >>> 0;
  }

  const p = N - 1;
  state[p] = (state[p + M - N] ^ TWIST(state[p], state[0])) >>> 0;
}

/* generates a random number on [0,0xffffffff]-interval */
function genrand_int32(): number {
  if (--left === 0) next_state();
  let y = state[nextIndex++];

  /* Tempering */
  y ^= y >>> 11;
  y ^= (y << 7) & 0x9d2c5680;
  y ^= (y << 15) & 0xefc60000;
  y ^= y >>> 18;

  return y >>> 0;
}

/* generates a random number on [0,0x7fffffff]-interval */
function genrand_int31(): number {
  return genrand_int32() >>> 1;
}

/* generates a random number on [0,1]-real-interval */
function genrand_real1(): number {
  return genrand_int32() * (1.0 / 4294967295.0);
}

/* generates a random number on [0,1)-real-interval */
function genrand_real2(): number {
  return genrand_int32() * (1.0 / 4294967296.0);
}

/* generates a random number on (0,1)-real-interval */
function genrand_real3(): number {
  return (genrand_int32() + 0.5) * (1.0 / 4294967296.0);
}

/* generates a random number on [0,1) with 53-bit resolution */
function genrand_res53(): number {
  const a = genrand_int32() >>> 5;
  const b = genrand_int32() >>> 6;
  return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
}

export const __randInternal = {
  init_by_array,
  genrand_int31,
  genrand_real2,
  genrand_real3,
  genrand_res53,
};
