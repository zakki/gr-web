/*
 * $Id: actor.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Actor in the game that has the interface to move and draw.
 */
export abstract class Actor {
  private _exists = false;

  public get exists(): boolean {
    return this._exists;
  }

  public set exists(value: boolean) {
    this._exists = value;
  }

  public abstract init(args: unknown[] | null): void;
  public abstract move(): void;
  public abstract draw(): void;
}

/**
 * Object pooling for actors.
 */
export class ActorPool<T extends Actor> {
  public actor: T[] = [];
  protected actorIdx = 0;
  protected readonly factory: () => T;

  public constructor(n?: number, args?: unknown[] | null, factory?: () => T);
  public constructor(n?: number, args: unknown[] | null = null, factory?: () => T) {
    // Note: TypeScript cannot instantiate generic type parameters directly, so factory injection is required.
    this.factory =
      factory ??
      (() => {
        throw new Error("ActorPool factory is required in TypeScript port");
      });
    if (typeof n === "number") this.createActors(n, args);
  }

  protected createActors(n: number, args: unknown[] | null = null): void {
    this.actor = [];
    for (let i = 0; i < n; i++) {
      const a = this.factory();
      a.exists = false;
      a.init(args);
      this.actor.push(a);
    }
    this.actorIdx = 0;
  }

  public getInstance(): T | null {
    for (let i = 0; i < this.actor.length; i++) {
      this.actorIdx--;
      if (this.actorIdx < 0) this.actorIdx = this.actor.length - 1;
      if (!this.actor[this.actorIdx].exists) return this.actor[this.actorIdx];
    }
    return null;
  }

  public getInstanceForced(): T {
    this.actorIdx--;
    if (this.actorIdx < 0) this.actorIdx = this.actor.length - 1;
    return this.actor[this.actorIdx];
  }

  public getMultipleInstances(n: number): T[] | null {
    const rsl: T[] = [];
    for (let i = 0; i < n; i++) {
      const inst = this.getInstance();
      if (!inst) {
        for (const r of rsl) r.exists = false;
        return null;
      }
      inst.exists = true;
      rsl.push(inst);
    }
    for (const r of rsl) r.exists = false;
    return rsl;
  }

  public move(): void {
    for (const ac of this.actor) if (ac.exists) ac.move();
  }

  public draw(): void {
    for (const ac of this.actor) if (ac.exists) ac.draw();
  }

  public clear(): void {
    for (const ac of this.actor) ac.exists = false;
    this.actorIdx = 0;
  }
}
