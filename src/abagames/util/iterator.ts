/*
 * $Id: iterator.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Simple iterator for array.
 */
export class ArrayIterator<T> {
  protected readonly array: T[];
  protected idx: number;

  public constructor(a: T[]) {
    this.array = a;
    this.idx = 0;
  }

  public hasNext(): boolean {
    if (this.idx >= this.array.length) return false;
    return true;
  }

  public next(): T {
    if (this.idx >= this.array.length) throw new Error("No more items");
    const result = this.array[this.idx];
    this.idx++;
    return result;
  }
}

export type StringIterator = ArrayIterator<string>;
