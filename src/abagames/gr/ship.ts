/*
 * Simplified typed ship implementation for gr-web.
 */

import { Vector } from "../util/vector";
import { Pad } from "../util/sdl/pad";
import { TwinStick } from "../util/sdl/twinstick";
import { MouseState } from "../util/sdl/mouse";
import { RecordableMouse } from "./mouse";
import { RecordableMouseAndPad } from "./mouseandpad";
import { Field } from "./field";
import { Screen } from "./screen";
import { ShotPool } from "./shot";
import { EnemyPool } from "./enemy";
import { StageManager } from "./stagemanager";
import { FragmentPool, SmokePool, SparkPool, WakePool } from "./particle";
import { SoundManager } from "./soundmanager";

const PI = Math.PI;

type InGameStateLike = {
  clearBullets(): void;
  shrinkScoreReel(): void;
};

class Boat {
  public readonly pos = new Vector();
  public readonly vel = new Vector();
  public hasCollision = true;

  private readonly shotPos = new Vector();
  private shots: ShotPool | null = null;
  private enemies: EnemyPool | null = null;
  private stageManager: StageManager | null = null;
  private gameState: InGameStateLike | null = null;
  private shotCnt = 0;
  private gameMode = 0;

  public constructor(
    private readonly idx: number,
    private readonly pad: Pad,
    private readonly twinStick: TwinStick,
    private readonly mouse: RecordableMouse,
    private readonly mouseAndPad: RecordableMouseAndPad,
    private readonly field: Field,
    private readonly sparks: SparkPool,
    private readonly smokes: SmokePool,
    private readonly fragments: FragmentPool,
    private readonly wakes: WakePool,
  ) {
    void this.sparks;
    void this.smokes;
    void this.fragments;
    void this.wakes;
  }

  public setShots(shots: ShotPool): void {
    this.shots = shots;
  }

  public setEnemies(enemies: EnemyPool): void {
    this.enemies = enemies;
  }

  public setStageManager(stageManager: StageManager): void {
    this.stageManager = stageManager;
  }

  public setGameState(gameState: InGameStateLike): void {
    this.gameState = gameState;
  }

  public start(gameMode: number): void {
    this.gameMode = gameMode;
    this.hasCollision = true;
    this.shotCnt = 0;
    const bx = this.idx === 0 ? -2.2 : 2.2;
    this.pos.x = bx;
    this.pos.y = -6;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  public restart(): void {
    this.hasCollision = true;
    this.pos.y = -6;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  public move(): void {
    let mx = 0;
    let my = 0;

    if (this.gameMode === 3) {
      const ms = this.mouse.getState(false);
      this.moveToMouse(ms);
      this.fireByMouseAndPad(ms);
      return;
    }

    if (this.gameMode === 1 || this.gameMode === 2) {
      const ts = this.twinStick.getState();
      mx = ts.left.x;
      my = ts.left.y;
      this.fireByTwinStick(ts.right.x, ts.right.y);
    } else {
      const dir = this.pad.getDirState();
      if ((dir & Pad.Dir.LEFT) !== 0) mx -= 1;
      if ((dir & Pad.Dir.RIGHT) !== 0) mx += 1;
      if ((dir & Pad.Dir.UP) !== 0) my += 1;
      if ((dir & Pad.Dir.DOWN) !== 0) my -= 1;
      this.fireByPad(this.pad.getButtonState());
    }

    const speed = 0.27;
    this.vel.x = mx * speed;
    this.vel.y = my * speed;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;

    const limX = this.field.size.x * 0.95;
    const limY = this.field.size.y * 0.95;
    this.pos.x = Math.max(-limX, Math.min(limX, this.pos.x));
    this.pos.y = Math.max(-limY, Math.min(limY, this.pos.y));

    if (this.shotCnt > 0) this.shotCnt--;
    this.enemies?.checkHitShip(this.pos.x, this.pos.y, null, false);
    void this.stageManager;
  }

  private moveToMouse(ms: MouseState): void {
    this.vel.x = (ms.x - this.pos.x) * 0.25;
    this.vel.y = (ms.y - this.pos.y) * 0.25;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y - this.field.lastScrollY;
  }

  private fireByPad(button: number): void {
    const fire = (button & Pad.Button.A) !== 0;
    const lance = (button & Pad.Button.B) !== 0;
    this.tryFire(fire, lance, PI);
  }

  private fireByTwinStick(rx: number, ry: number): void {
    const mag = Math.abs(rx) + Math.abs(ry);
    if (mag < 0.2) return;
    const deg = Math.atan2(rx, ry);
    this.tryFire(true, false, deg);
  }

  private fireByMouseAndPad(ms: MouseState): void {
    const mp = this.mouseAndPad.getState(false);
    const fire = (ms.button & MouseState.Button.LEFT) !== 0 || (mp.padState.button & Pad.Button.A) !== 0;
    if (!fire) return;
    const dx = ms.x - this.pos.x;
    const dy = ms.y - this.pos.y;
    const deg = Math.atan2(dx, dy);
    this.tryFire(true, false, deg);
  }

  private tryFire(fire: boolean, lance: boolean, deg: number): void {
    if (!fire || !this.shots || this.shotCnt > 0) return;
    const s = this.shots.getInstance();
    if (!s) return;
    this.shotPos.x = this.pos.x + Math.sin(deg) * 0.5;
    this.shotPos.y = this.pos.y + Math.cos(deg) * 0.5;
    s.set(this.shotPos, deg, lance);
    this.shotCnt = lance ? 20 : 5;
    SoundManager.playSe(lance ? "lance.wav" : "shot.wav");
  }

  public checkBulletHit(p: Vector, pp: Vector): boolean {
    if (!this.hasCollision) return false;
    const dx = p.x - this.pos.x;
    const dy = p.y - this.pos.y;
    if (dx * dx + dy * dy > 0.5 * 0.5) return false;
    this.destroyedBoat();
    return true;
  }

  public destroyedBoat(): void {
    this.hasCollision = false;
    this.gameState?.clearBullets();
    this.gameState?.shrinkScoreReel();
    this.stageManager?.shipDestroyed();
    SoundManager.playSe("ship_destroyed.wav");
    this.restart();
  }

  public draw(): void {}

  public drawFront(): void {}

  public drawShape(): void {}
}

/**
 * Player ship facade used by other systems.
 */
export class Ship {
  public static readonly SCROLL_SPEED_BASE = 0.01;
  public static readonly SCROLL_SPEED_MAX = 0.1;
  public static readonly SCROLL_START_Y = 2.5;

  private readonly boats: Boat[];
  private boatNum = 1;
  private gameMode = 0;
  private shots: ShotPool | null = null;
  private enemies: EnemyPool | null = null;
  private stageManager: StageManager | null = null;
  private gameState: InGameStateLike | null = null;

  private readonly _midstPos = new Vector();
  private readonly _higherPos = new Vector();
  private readonly _lowerPos = new Vector();
  private readonly _nearPos = new Vector();
  private readonly _nearVel = new Vector();

  public scrollSpeed = Ship.SCROLL_SPEED_BASE;
  private _scrollSpeedBase = Ship.SCROLL_SPEED_BASE;
  private replay = false;

  public constructor(
    private readonly pad: Pad,
    private readonly twinStick: TwinStick,
    private readonly mouse: RecordableMouse,
    private readonly mouseAndPad: RecordableMouseAndPad,
    private readonly field: Field,
    private readonly screen: Screen,
    private readonly sparks: SparkPool,
    private readonly smokes: SmokePool,
    private readonly fragments: FragmentPool,
    private readonly wakes: WakePool,
  ) {
    void this.screen;
    this.boats = [
      new Boat(0, pad, twinStick, mouse, mouseAndPad, field, sparks, smokes, fragments, wakes),
      new Boat(1, pad, twinStick, mouse, mouseAndPad, field, sparks, smokes, fragments, wakes),
    ];
  }

  public setRandSeed(_seed: number): void {}

  public close(): void {}

  public setShots(shots: ShotPool): void {
    this.shots = shots;
    for (const b of this.boats) b.setShots(shots);
  }

  public setEnemies(enemies: EnemyPool): void {
    this.enemies = enemies;
    for (const b of this.boats) b.setEnemies(enemies);
  }

  public setStageManager(stageManager: StageManager): void {
    this.stageManager = stageManager;
    for (const b of this.boats) b.setStageManager(stageManager);
  }

  public setGameState(gameState: InGameStateLike): void {
    this.gameState = gameState;
    for (const b of this.boats) b.setGameState(gameState);
  }

  public start(gameMode: number): void {
    this.gameMode = gameMode;
    this.boatNum = gameMode === 2 ? 2 : 1;
    this.scrollSpeed = this._scrollSpeedBase = Ship.SCROLL_SPEED_BASE;
    for (let i = 0; i < this.boatNum; i++) this.boats[i].start(gameMode);
    this.updateCompositePos();
  }

  public restart(): void {
    this.scrollSpeed = this._scrollSpeedBase;
    for (let i = 0; i < this.boatNum; i++) this.boats[i].restart();
  }

  public move(): void {
    this.field.scroll(this.scrollSpeed);
    for (let i = 0; i < this.boatNum; i++) this.boats[i].move();

    this.updateCompositePos();

    if (this._higherPos.y >= Ship.SCROLL_START_Y) {
      this.scrollSpeed += (Ship.SCROLL_SPEED_MAX - this.scrollSpeed) * 0.1;
    } else {
      this.scrollSpeed += (this._scrollSpeedBase - this.scrollSpeed) * 0.1;
    }
    this._scrollSpeedBase += (Ship.SCROLL_SPEED_MAX - this._scrollSpeedBase) * 0.00001;
  }

  public checkBulletHit(p: Vector, pp: Vector): boolean {
    for (let i = 0; i < this.boatNum; i++) {
      if (this.boats[i].checkBulletHit(p, pp)) return true;
    }
    return false;
  }

  public clearBullets(): void {
    this.gameState?.clearBullets();
  }

  public destroyed(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].destroyedBoat();
  }

  public draw(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].draw();
  }

  public drawFront(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].drawFront();
  }

  public drawShape(): void {
    this.boats[0].drawShape();
  }

  public nearPos(p: Vector): Vector {
    const a = this.boats[0].pos;
    const b = this.boatNum > 1 ? this.boats[1].pos : a;
    const da = a.dist(p);
    const db = b.dist(p);
    const n = da <= db ? a : b;
    this._nearPos.x = n.x;
    this._nearPos.y = n.y;
    return this._nearPos;
  }

  public nearVel(p: Vector): Vector {
    const a = this.boats[0];
    const b = this.boatNum > 1 ? this.boats[1] : a;
    const da = a.pos.dist(p);
    const db = b.pos.dist(p);
    const n = da <= db ? a : b;
    this._nearVel.x = n.vel.x;
    this._nearVel.y = n.vel.y;
    return this._nearVel;
  }

  public setReplayMode(_turnSpeed: number, _reverseFire: boolean): void {
    this.replay = true;
  }

  public unsetReplayMode(): void {
    this.replay = false;
  }

  public replayMode(): boolean {
    return this.replay;
  }

  public get midstPos(): Vector {
    return this._midstPos;
  }

  public get higherPos(): Vector {
    return this._higherPos;
  }

  public get lowerPos(): Vector {
    return this._lowerPos;
  }

  public get scrollSpeedBase(): number {
    return this._scrollSpeedBase;
  }

  private updateCompositePos(): void {
    const p0 = this.boats[0].pos;
    if (this.boatNum <= 1) {
      this._midstPos.x = p0.x;
      this._midstPos.y = p0.y;
      this._higherPos.x = p0.x;
      this._higherPos.y = p0.y;
      this._lowerPos.x = p0.x;
      this._lowerPos.y = p0.y;
      return;
    }
    const p1 = this.boats[1].pos;
    this._midstPos.x = (p0.x + p1.x) / 2;
    this._midstPos.y = (p0.y + p1.y) / 2;
    const hi = p0.y >= p1.y ? p0 : p1;
    const lo = p0.y < p1.y ? p0 : p1;
    this._higherPos.x = hi.x;
    this._higherPos.y = hi.y;
    this._lowerPos.x = lo.x;
    this._lowerPos.y = lo.y;
  }
}
