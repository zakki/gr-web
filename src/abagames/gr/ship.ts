/*
 * $Id: ship.d,v 1.4 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Vector } from "../util/vector";
import { Rand } from "../util/rand";
import { MathUtil } from "../util/math";
import { NoRecordDataException } from "../util/sdl/recordableinput";
import { Pad } from "../util/sdl/pad";
import { TwinStick, TwinStickState } from "../util/sdl/twinstick";
import { MouseState } from "../util/sdl/mouse";
import { Screen3D } from "../util/sdl/screen3d";
import { Field } from "./field";
import { Screen } from "./screen";
import { Spark, SparkPool, Smoke, SmokePool, FragmentPool, WakePool } from "./particle";
import { Shot, ShotPool } from "./shot";
import { Enemy, EnemyPool } from "./enemy";
import { StageManager } from "./stagemanager";
import { SoundManager } from "./soundmanager";
import { BaseShape, ShieldShape } from "./shape";
import { RecordableMouse } from "./mouse";
import { MouseAndPadState, PadState, RecordableMouseAndPad } from "./mouseandpad";

const PI = Math.PI;

const GAME_MODE_NORMAL = 0;
const GAME_MODE_TWIN_STICK = 1;
const GAME_MODE_DOUBLE_PLAY = 2;
const GAME_MODE_MOUSE = 3;

type InGameStateLike = {
  isGameOver: boolean;
  shipDestroyed(): void;
  clearBullets(): void;
  shrinkScoreReel(): void;
};

/**
 * Player boat logic.
 */
class Boat {
  public static readonly RESTART_CNT = 300;
  public static readonly INVINCIBLE_CNT = 228;
  public static readonly HIT_WIDTH = 0.02;
  public static readonly FIRE_INTERVAL = 2;
  public static readonly FIRE_INTERVAL_MAX = 4;
  public static readonly FIRE_LANCE_INTERVAL = 15;
  public static readonly SPEED_BASE = 0.15;
  public static readonly TURN_RATIO_BASE = 0.2;
  public static readonly SLOW_TURN_RATIO = 0;
  public static readonly TURN_CHANGE_RATIO = 0.5;

  private static rand = new Rand();
  private static padInput = new PadState();
  private static stickInput = new TwinStickState();
  private static mouseInput = new MouseState();

  private readonly _pos = new Vector();
  private readonly firePos = new Vector();
  private readonly _vel = new Vector();
  private readonly refVel = new Vector();
  private readonly shape: BaseShape;
  private readonly bridgeShape: BaseShape;
  private readonly shieldShape: ShieldShape;

  private shots!: ShotPool;
  private enemies!: EnemyPool;
  private stageManager!: StageManager;
  private gameState!: InGameStateLike;

  private deg = 0;
  private speed = 0;
  private turnRatio = 0;
  private fireCnt = 0;
  private fireSprCnt = 0;
  private fireInterval = Boat.FIRE_INTERVAL;
  private fireSprDeg = 0;
  private fireLanceCnt = 0;
  private fireDeg = 0;
  private aPressed = false;
  private bPressed = false;
  private cnt = 0;
  private onBlock = false;
  private shieldCnt = 0;
  private replayMode_ = false;
  private turnSpeed = 1;
  private reverseFire = false;
  private gameMode = GAME_MODE_NORMAL;
  private vx = 0;
  private vy = 0;

  public static init(): void {
    Boat.rand = new Rand();
  }

  public static setRandSeed(seed: number): void {
    Boat.rand.setSeed(seed);
  }

  public constructor(
    private readonly idx: number,
    private readonly ship: Ship,
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
    if (idx === 0) {
      this.shape = new BaseShape(0.7, 0.6, 0.6, BaseShape.ShapeType.SHIP_ROUNDTAIL, 0.5, 0.7, 0.5);
      this.bridgeShape = new BaseShape(0.3, 0.6, 0.6, BaseShape.ShapeType.BRIDGE, 0.3, 0.7, 0.3);
    } else {
      this.shape = new BaseShape(0.7, 0.6, 0.6, BaseShape.ShapeType.SHIP_ROUNDTAIL, 0.4, 0.3, 0.8);
      this.bridgeShape = new BaseShape(0.3, 0.6, 0.6, BaseShape.ShapeType.BRIDGE, 0.2, 0.3, 0.6);
    }
    this.shieldShape = new ShieldShape();
  }

  public close(): void {
    this.shape.close();
    this.bridgeShape.close();
    this.shieldShape.close();
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
    if (gameMode === GAME_MODE_DOUBLE_PLAY) {
      this._pos.x = this.idx === 0 ? -this.field.size.x * 0.5 : this.field.size.x * 0.5;
    } else {
      this._pos.x = 0;
    }
    this._pos.y = -this.field.size.y * 0.8;
    this.firePos.x = 0;
    this.firePos.y = 0;
    this._vel.x = 0;
    this._vel.y = 0;
    this.deg = 0;
    this.speed = Boat.SPEED_BASE;
    this.turnRatio = Boat.TURN_RATIO_BASE;
    this.cnt = -Boat.INVINCIBLE_CNT;
    this.aPressed = true;
    this.bPressed = true;
    Boat.padInput.clear();
    Boat.stickInput.clear();
    Boat.mouseInput.clear();
  }

  public restart(): void {
    switch (this.gameMode) {
      case GAME_MODE_NORMAL:
        this.fireCnt = 99999;
        this.fireInterval = 99999;
        break;
      case GAME_MODE_TWIN_STICK:
      case GAME_MODE_DOUBLE_PLAY:
      case GAME_MODE_MOUSE:
      default:
        this.fireCnt = 0;
        this.fireInterval = Boat.FIRE_INTERVAL;
        break;
    }
    this.fireSprCnt = 0;
    this.fireSprDeg = 0.5;
    this.fireLanceCnt = 0;
    this.onBlock = this.field.getBlock(this._pos) >= 0;
    this.refVel.x = 0;
    this.refVel.y = 0;
    this.shieldCnt = 20 * 60;
  }

  public move(): void {
    const px = this._pos.x;
    const py = this._pos.y;
    this.cnt++;
    this.vx = 0;
    this.vy = 0;

    switch (this.gameMode) {
      case GAME_MODE_NORMAL:
        this.moveNormal();
        break;
      case GAME_MODE_TWIN_STICK:
        this.moveTwinStick();
        break;
      case GAME_MODE_DOUBLE_PLAY:
        this.moveDoublePlay();
        break;
      case GAME_MODE_MOUSE:
        this.moveMouse();
        break;
    }

    if (this.gameState.isGameOver) {
      this.clearBullets();
      if (this.cnt < -Boat.INVINCIBLE_CNT) this.cnt = -Boat.RESTART_CNT;
    } else if (this.cnt < -Boat.INVINCIBLE_CNT) {
      this.clearBullets();
    }

    this.vx *= this.speed;
    this.vy *= this.speed;
    this.vx += this.refVel.x;
    this.vy += this.refVel.y;
    this.refVel.x *= 0.9;
    this.refVel.y *= 0.9;

    if (this.field.checkInField(this._pos.x, this._pos.y - this.field.lastScrollY)) this._pos.y -= this.field.lastScrollY;

    if ((this.onBlock || this.field.getBlock(this._pos.x + this.vx, this._pos.y) < 0) && this.field.checkInField(this._pos.x + this.vx, this._pos.y)) {
      this._pos.x += this.vx;
      this._vel.x = this.vx;
    } else {
      this._vel.x = 0;
      this.refVel.x = 0;
    }

    if ((this.onBlock || this.field.getBlock(px, this._pos.y + this.vy) < 0) && this.field.checkInField(this._pos.x, this._pos.y + this.vy)) {
      this._pos.y += this.vy;
      this._vel.y = this.vy;
    } else {
      this._vel.y = 0;
      this.refVel.y = 0;
    }

    if (this.field.getBlock(this._pos.x, this._pos.y) >= 0) {
      if (!this.onBlock) {
        if (this.cnt <= 0) {
          this.onBlock = true;
        } else if (this.field.checkInField(this._pos.x, this._pos.y - this.field.lastScrollY)) {
          this._pos.x = px;
          this._pos.y = py;
        } else {
          this.destroyed();
        }
      }
    } else {
      this.onBlock = false;
    }

    switch (this.gameMode) {
      case GAME_MODE_NORMAL:
        this.fireNormal();
        break;
      case GAME_MODE_TWIN_STICK:
        this.fireTwinStick();
        break;
      case GAME_MODE_DOUBLE_PLAY:
        this.fireDoublePlay();
        break;
      case GAME_MODE_MOUSE:
        this.fireMouse();
        break;
    }

    if (this.cnt % 3 === 0 && this.cnt >= -Boat.INVINCIBLE_CNT) {
      let sp = this.vx !== 0 || this.vy !== 0 ? 0.4 : 0.2;
      sp *= 1 + Boat.rand.nextSignedFloat(0.33);
      sp *= Boat.SPEED_BASE;
      this.shape.addWake(this.wakes, this._pos, this.deg, sp);
    }

    const hitEnemy = this.enemies.checkHitShip(this._pos.x, this._pos.y);
    if (hitEnemy) {
      let rd = 0;
      if (this._pos.dist(hitEnemy.pos) >= 0.1) rd = Math.atan2(this._pos.x - hitEnemy.pos.x, this._pos.y - hitEnemy.pos.y);
      const sz = hitEnemy.size;
      this.refVel.x = Math.sin(rd) * sz * 0.1;
      this.refVel.y = Math.cos(rd) * sz * 0.1;
      const rs = Math.sqrt(this.refVel.x * this.refVel.x + this.refVel.y * this.refVel.y);
      if (rs > 1) {
        this.refVel.x /= rs;
        this.refVel.y /= rs;
      }
    }

    if (this.shieldCnt > 0) this.shieldCnt--;
  }

  private moveNormal(): void {
    if (!this.replayMode_) {
      this.readPadState(Boat.padInput);
    } else {
      try {
        this.readReplayPadState(Boat.padInput);
      } catch (e) {
        if (e instanceof NoRecordDataException || e instanceof Error) {
          this.gameState.isGameOver = true;
          Boat.padInput.clear();
        }
      }
    }

    if (this.gameState.isGameOver || this.cnt < -Boat.INVINCIBLE_CNT) Boat.padInput.clear();

    if ((Boat.padInput.dir & Pad.Dir.UP) !== 0) this.vy = 1;
    if ((Boat.padInput.dir & Pad.Dir.DOWN) !== 0) this.vy = -1;
    if ((Boat.padInput.dir & Pad.Dir.RIGHT) !== 0) this.vx = 1;
    if ((Boat.padInput.dir & Pad.Dir.LEFT) !== 0) this.vx = -1;

    if (this.vx !== 0 && this.vy !== 0) {
      this.vx *= 0.7;
      this.vy *= 0.7;
    }

    this.turnTowardVelocity();
  }

  private moveTwinStick(): void {
    if (!this.replayMode_) {
      Boat.stickInput.cloneFrom(this.twinStick.getState());
    } else {
      try {
        this.readReplayTwinStickState(Boat.stickInput);
      } catch (e) {
        if (e instanceof NoRecordDataException || e instanceof Error) {
          this.gameState.isGameOver = true;
          Boat.stickInput.clear();
        }
      }
    }

    if (this.gameState.isGameOver || this.cnt < -Boat.INVINCIBLE_CNT) Boat.stickInput.clear();

    this.vx = Boat.stickInput.left.x;
    this.vy = Boat.stickInput.left.y;
    this.turnTowardVelocity();
  }

  private moveDoublePlay(): void {
    if (this.idx === 0) {
      if (!this.replayMode_) {
        Boat.stickInput.cloneFrom(this.twinStick.getState());
      } else {
        try {
          this.readReplayTwinStickState(Boat.stickInput);
        } catch (e) {
          if (e instanceof NoRecordDataException || e instanceof Error) {
            this.gameState.isGameOver = true;
            Boat.stickInput.clear();
          }
        }
      }
      if (this.gameState.isGameOver || this.cnt < -Boat.INVINCIBLE_CNT) Boat.stickInput.clear();
      this.vx = Boat.stickInput.left.x;
      this.vy = Boat.stickInput.left.y;
    } else {
      this.vx = Boat.stickInput.right.x;
      this.vy = Boat.stickInput.right.y;
    }

    this.turnTowardVelocity();
  }

  private moveMouse(): void {
    if (!this.replayMode_) {
      const mps = this.mouseAndPad.getState();
      Boat.padInput.cloneFrom(mps.padState);
      Boat.mouseInput.cloneFrom(mps.mouseState);
    } else {
      try {
        const mps = this.mouseAndPad.replay();
        Boat.padInput.cloneFrom(mps.padState);
        Boat.mouseInput.cloneFrom(mps.mouseState);
      } catch (e) {
        if (e instanceof NoRecordDataException || e instanceof Error) {
          this.gameState.isGameOver = true;
          Boat.padInput.clear();
          Boat.mouseInput.clear();
        }
      }
    }

    if (this.gameState.isGameOver || this.cnt < -Boat.INVINCIBLE_CNT) {
      Boat.padInput.clear();
      Boat.mouseInput.clear();
    }

    if ((Boat.padInput.dir & Pad.Dir.UP) !== 0) this.vy = 1;
    if ((Boat.padInput.dir & Pad.Dir.DOWN) !== 0) this.vy = -1;
    if ((Boat.padInput.dir & Pad.Dir.RIGHT) !== 0) this.vx = 1;
    if ((Boat.padInput.dir & Pad.Dir.LEFT) !== 0) this.vx = -1;

    if (this.vx !== 0 && this.vy !== 0) {
      this.vx *= 0.7;
      this.vy *= 0.7;
    }

    this.turnTowardVelocity();
  }

  private turnTowardVelocity(): void {
    if (this.vx === 0 && this.vy === 0) return;
    let ad = Math.atan2(this.vx, this.vy);
    ad = MathUtil.normalizeDeg(ad);
    ad = MathUtil.normalizeDeg(ad - this.deg);
    this.deg += ad * this.turnRatio * this.turnSpeed;
    this.deg = MathUtil.normalizeDeg(this.deg);
  }

  private fireNormal(): void {
    if ((Boat.padInput.button & Pad.Button.A) !== 0) {
      this.turnRatio += (Boat.SLOW_TURN_RATIO - this.turnRatio) * Boat.TURN_CHANGE_RATIO;
      this.fireInterval = Boat.FIRE_INTERVAL;
      if (!this.aPressed) {
        this.fireCnt = 0;
        this.aPressed = true;
      }
    } else {
      this.turnRatio += (Boat.TURN_RATIO_BASE - this.turnRatio) * Boat.TURN_CHANGE_RATIO;
      this.aPressed = false;
      this.fireInterval *= 1.033;
      if (this.fireInterval > Boat.FIRE_INTERVAL_MAX) this.fireInterval = 99999;
    }

    this.fireDeg = this.deg;
    if (this.reverseFire) this.fireDeg += PI;

    if (this.fireCnt <= 0) {
      SoundManager.playSe("shot.wav");
      const foc = (this.fireSprCnt % 2) * 2 - 1;
      this.firePos.x = this._pos.x + Math.cos(this.fireDeg + PI) * 0.2 * foc;
      this.firePos.y = this._pos.y - Math.sin(this.fireDeg + PI) * 0.2 * foc;

      let s = this.shots.getInstance();
      if (s) s.set(this.firePos, this.fireDeg);

      this.fireCnt = Math.trunc(this.fireInterval);

      let td = 0;
      if (foc === -1) td = this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;
      else td = -this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;

      this.fireSprCnt++;
      s = this.shots.getInstance();
      if (s) s.set(this.firePos, this.fireDeg + td);

      const sm = this.smokes.getInstanceForced();
      const sd = this.fireDeg + td / 2;
      sm.set(this.firePos, Math.sin(sd) * Shot.SPEED * 0.33, Math.cos(sd) * Shot.SPEED * 0.33, 0, Smoke.SmokeType.SPARK, 10, 0.33);
    }
    this.fireCnt--;

    if ((Boat.padInput.button & Pad.Button.B) !== 0) {
      if (!this.bPressed && this.fireLanceCnt <= 0 && !this.shots.existsLance()) {
        SoundManager.playSe("lance.wav");
        let fd = this.deg;
        if (this.reverseFire) fd += PI;

        const s = this.shots.getInstance();
        if (s) s.set(this.pos, fd, true);

        for (let i = 0; i < 4; i++) {
          const sm = this.smokes.getInstanceForced();
          const sd = fd + Boat.rand.nextSignedFloat(1);
          sm.set(
            this.pos,
            Math.sin(sd) * Shot.LANCE_SPEED * i * 0.2,
            Math.cos(sd) * Shot.LANCE_SPEED * i * 0.2,
            0,
            Smoke.SmokeType.SPARK,
            15,
            0.5,
          );
        }
        this.fireLanceCnt = Boat.FIRE_LANCE_INTERVAL;
      }
      this.bPressed = true;
    } else {
      this.bPressed = false;
    }
    this.fireLanceCnt--;
  }

  private fireTwinStick(): void {
    if (Math.abs(Boat.stickInput.right.x) + Math.abs(Boat.stickInput.right.y) > 0.01) {
      this.fireDeg = Math.atan2(Boat.stickInput.right.x, Boat.stickInput.right.y);
      if (this.fireCnt <= 0) {
        SoundManager.playSe("shot.wav");
        const foc = (this.fireSprCnt % 2) * 2 - 1;

        let rsd = Math.sqrt(Boat.stickInput.right.x * Boat.stickInput.right.x + Boat.stickInput.right.y * Boat.stickInput.right.y);
        if (rsd > 1) rsd = 1;
        this.fireSprDeg = 1 - rsd + 0.05;

        this.firePos.x = this._pos.x + Math.cos(this.fireDeg + PI) * 0.2 * foc;
        this.firePos.y = this._pos.y - Math.sin(this.fireDeg + PI) * 0.2 * foc;
        this.fireCnt = Math.trunc(this.fireInterval);

        let td = 0;
        if (foc === -1) td = this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;
        else td = -this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;
        this.fireSprCnt++;

        let s = this.shots.getInstance();
        if (s) s.set(this.firePos, this.fireDeg + td / 2, false, 2);
        s = this.shots.getInstance();
        if (s) s.set(this.firePos, this.fireDeg + td, false, 2);

        const sm = this.smokes.getInstanceForced();
        const sd = this.fireDeg + td / 2;
        sm.set(this.firePos, Math.sin(sd) * Shot.SPEED * 0.33, Math.cos(sd) * Shot.SPEED * 0.33, 0, Smoke.SmokeType.SPARK, 10, 0.33);
      }
    } else {
      this.fireDeg = 99999;
    }
    this.fireCnt--;
  }

  private fireDoublePlay(): void {
    if (this.gameState.isGameOver || this.cnt < -Boat.INVINCIBLE_CNT) return;

    const dist = this.ship.distAmongBoats();
    this.fireInterval = Boat.FIRE_INTERVAL + 10 / (dist + 0.005);
    if (dist < 2) this.fireInterval = 99999;
    else if (dist < 4) this.fireInterval *= 3;
    else if (dist < 6) this.fireInterval *= 1.6;

    if (this.fireCnt > this.fireInterval) this.fireCnt = Math.trunc(this.fireInterval);

    if (this.fireCnt <= 0) {
      SoundManager.playSe("shot.wav");
      const foc = (this.fireSprCnt % 2) * 2 - 1;

      this.fireDeg = 0;
      this.firePos.x = this._pos.x + Math.cos(this.fireDeg + PI) * 0.2 * foc;
      this.firePos.y = this._pos.y - Math.sin(this.fireDeg + PI) * 0.2 * foc;

      let s = this.shots.getInstance();
      if (s) s.set(this.firePos, this.fireDeg, false, 2);

      this.fireCnt = Math.trunc(this.fireInterval);

      let sm = this.smokes.getInstanceForced();
      sm.set(this.firePos, Math.sin(this.fireDeg) * Shot.SPEED * 0.33, Math.cos(this.fireDeg) * Shot.SPEED * 0.33, 0, Smoke.SmokeType.SPARK, 10, 0.33);

      if (this.idx === 0) {
        const fd = this.ship.degAmongBoats() + PI / 2;
        let td = 0;
        if (foc === -1) td = this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.15;
        else td = -this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.15;

        const mp = this.ship.midstPos;
        this.firePos.x = mp.x + Math.cos(fd + PI) * 0.2 * foc;
        this.firePos.y = mp.y - Math.sin(fd + PI) * 0.2 * foc;

        s = this.shots.getInstance();
        if (s) s.set(this.firePos, fd, false, 2);
        s = this.shots.getInstance();
        if (s) s.set(this.firePos, fd + td, false, 2);

        sm = this.smokes.getInstanceForced();
        sm.set(this.firePos, Math.sin(fd + td / 2) * Shot.SPEED * 0.33, Math.cos(fd + td / 2) * Shot.SPEED * 0.33, 0, Smoke.SmokeType.SPARK, 10, 0.33);
      }

      this.fireSprCnt++;
    }

    this.fireCnt--;
  }

  private fireMouse(): void {
    let fox = Boat.mouseInput.x - this._pos.x;
    let foy = Boat.mouseInput.y - this._pos.y;
    if (Math.abs(fox) < 0.01) fox = 0.01;
    if (Math.abs(foy) < 0.01) foy = 0.01;

    this.fireDeg = Math.atan2(fox, foy);

    if ((Boat.mouseInput.button & (MouseState.Button.LEFT | MouseState.Button.RIGHT)) !== 0) {
      if (this.fireCnt <= 0) {
        SoundManager.playSe("shot.wav");
        const foc = (this.fireSprCnt % 2) * 2 - 1;

        let fstd = 0.05;
        if ((Boat.mouseInput.button & MouseState.Button.RIGHT) !== 0) fstd += 0.5;
        this.fireSprDeg += (fstd - this.fireSprDeg) * 0.16;

        this.firePos.x = this._pos.x + Math.cos(this.fireDeg + PI) * 0.2 * foc;
        this.firePos.y = this._pos.y - Math.sin(this.fireDeg + PI) * 0.2 * foc;
        this.fireCnt = Math.trunc(this.fireInterval);

        let td = 0;
        if (foc === -1) td = this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;
        else td = -this.fireSprDeg * ((Math.trunc(this.fireSprCnt / 2) % 4) + 1) * 0.2;
        this.fireSprCnt++;

        let s = this.shots.getInstance();
        if (s) s.set(this.firePos, this.fireDeg + td / 2, false, 2);
        s = this.shots.getInstance();
        if (s) s.set(this.firePos, this.fireDeg + td, false, 2);

        const sm = this.smokes.getInstanceForced();
        const sd = this.fireDeg + td / 2;
        sm.set(this.firePos, Math.sin(sd) * Shot.SPEED * 0.33, Math.cos(sd) * Shot.SPEED * 0.33, 0, Smoke.SmokeType.SPARK, 10, 0.33);
      }
    }

    this.fireCnt--;
  }

  public checkBulletHit(p: Vector, pp: Vector): boolean {
    if (this.cnt <= 0) return false;

    let bmvx = pp.x - p.x;
    let bmvy = pp.y - p.y;
    const inaa = bmvx * bmvx + bmvy * bmvy;
    if (inaa > 0.00001) {
      const sofsx = this._pos.x - p.x;
      const sofsy = this._pos.y - p.y;
      const inab = bmvx * sofsx + bmvy * sofsy;
      if (inab >= 0 && inab <= inaa) {
        const hd = sofsx * sofsx + sofsy * sofsy - (inab * inab) / inaa;
        if (hd >= 0 && hd <= Boat.HIT_WIDTH) {
          this.destroyed();
          return true;
        }
      }
    }

    return false;
  }

  private destroyed(): void {
    if (this.cnt <= 0) return;
    if (this.shieldCnt > 0) {
      this.destroyedBoatShield();
      return;
    }
    this.ship.destroyed();
    this.gameState.shipDestroyed();
  }

  private destroyedBoatShield(): void {
    for (let i = 0; i < 100; i++) {
      const sp = this.sparks.getInstanceForced();
      sp.set(
        this.pos,
        Boat.rand.nextSignedFloat(1),
        Boat.rand.nextSignedFloat(1),
        0.5 + Boat.rand.nextFloat(0.5),
        0.5 + Boat.rand.nextFloat(0.5),
        0,
        40 + Boat.rand.nextInt(40),
      );
    }
    SoundManager.playSe("ship_shield_lost.wav");
    this.screen.setScreenShake(30, 0.02);
    this.shieldCnt = 0;
    this.cnt = -Math.trunc(Boat.INVINCIBLE_CNT / 2);
  }

  public destroyedBoat(): void {
    for (let i = 0; i < 128; i++) {
      const sp = this.sparks.getInstanceForced();
      sp.set(
        this.pos,
        Boat.rand.nextSignedFloat(1),
        Boat.rand.nextSignedFloat(1),
        0.5 + Boat.rand.nextFloat(0.5),
        0.5 + Boat.rand.nextFloat(0.5),
        0,
        40 + Boat.rand.nextInt(40),
      );
    }
    SoundManager.playSe("ship_destroyed.wav");

    for (let i = 0; i < 64; i++) {
      const s = this.smokes.getInstanceForced();
      s.set(
        this.pos,
        Boat.rand.nextSignedFloat(0.2),
        Boat.rand.nextSignedFloat(0.2),
        Boat.rand.nextFloat(0.1),
        Smoke.SmokeType.EXPLOSION,
        50 + Boat.rand.nextInt(30),
        1,
      );
    }

    this.screen.setScreenShake(60, 0.05);
    this.restart();
    this.cnt = -Boat.RESTART_CNT;
  }

  public hasCollision(): boolean {
    return this.cnt >= -Boat.INVINCIBLE_CNT;
  }

  public draw(): void {
    if (this.cnt < -Boat.INVINCIBLE_CNT) return;

    if (this.fireDeg < 99999) {
      Screen.setColor(0.5, 0.9, 0.7, 0.4);
      Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
      Screen3D.glVertex3f(this._pos.x, this._pos.y, 0);
      Screen.setColor(0.5, 0.9, 0.7, 0.8);
      Screen3D.glVertex3f(this._pos.x + Math.sin(this.fireDeg) * 20, this._pos.y + Math.cos(this.fireDeg) * 20, 0);
      Screen3D.glEnd();
    }

    if (this.cnt < 0 && (-this.cnt % 32) < 16) return;

    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(this.pos.x, this.pos.y, 0);
    Screen3D.glRotatef((-this.deg * 180) / PI, 0, 0, 1);
    this.shape.draw();
    this.bridgeShape.draw();

    if (this.shieldCnt > 0) {
      let ss = 0.66;
      if (this.shieldCnt < 120) ss *= this.shieldCnt / 120;
      Screen3D.glScalef(ss, ss, ss);
      Screen3D.glRotatef(this.shieldCnt * 5, 0, 0, 1);
      this.shieldShape.draw();
    }

    Screen3D.glPopMatrix();
  }

  public drawFront(): void {
    if (this.cnt < -Boat.INVINCIBLE_CNT) return;

    if (this.gameMode === GAME_MODE_MOUSE) {
      Screen.setColor(0.7, 0.9, 0.8, 1);
      Screen.lineWidth(2);
      this.drawSight(Boat.mouseInput.x, Boat.mouseInput.y, 0.3);

      const ss = 0.9 - (0.8 * ((this.cnt + 1024) % 32)) / 32;
      Screen.setColor(0.5, 0.9, 0.7, 0.8);
      this.drawSight(Boat.mouseInput.x, Boat.mouseInput.y, ss);
      Screen.lineWidth(1);
    }
  }

  private drawSight(x: number, y: number, size: number): void {
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(x - size, y - size * 0.5, 0);
    Screen3D.glVertex3f(x - size, y - size, 0);
    Screen3D.glVertex3f(x - size * 0.5, y - size, 0);
    Screen3D.glEnd();

    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(x + size, y - size * 0.5, 0);
    Screen3D.glVertex3f(x + size, y - size, 0);
    Screen3D.glVertex3f(x + size * 0.5, y - size, 0);
    Screen3D.glEnd();

    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(x + size, y + size * 0.5, 0);
    Screen3D.glVertex3f(x + size, y + size, 0);
    Screen3D.glVertex3f(x + size * 0.5, y + size, 0);
    Screen3D.glEnd();

    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(x - size, y + size * 0.5, 0);
    Screen3D.glVertex3f(x - size, y + size, 0);
    Screen3D.glVertex3f(x - size * 0.5, y + size, 0);
    Screen3D.glEnd();
  }

  public drawShape(): void {
    this.shape.draw();
    this.bridgeShape.draw();
  }

  public clearBullets(): void {
    this.gameState.clearBullets();
  }

  public get pos(): Vector {
    return this._pos;
  }

  public get vel(): Vector {
    return this._vel;
  }

  public setReplayMode(turnSpeed: number, reverseFire: boolean): void {
    this.replayMode_ = true;
    this.turnSpeed = turnSpeed;
    this.reverseFire = reverseFire;
  }

  public unsetReplayMode(): void {
    this.replayMode_ = false;
    this.turnSpeed = 1;
    this.reverseFire = false;
  }

  public replayMode(): boolean {
    return this.replayMode_;
  }

  private readPadState(out: PadState): void {
    out.dir = this.pad.getDirState();
    out.button = this.pad.getButtonState();
  }

  private readReplayPadState(out: PadState): void {
    const r = this.pad as unknown as { replay?: () => number };
    if (!r.replay) {
      this.readPadState(out);
      return;
    }
    const d = r.replay();
    if (d < 0) throw new NoRecordDataException("No record data.");
    out.dir = d & 0x0f;
    out.button = d & (Pad.Button.A | Pad.Button.B);
  }

  private readReplayTwinStickState(out: TwinStickState): void {
    const r = this.twinStick as unknown as { replay?: () => TwinStickState };
    if (!r.replay) {
      out.cloneFrom(this.twinStick.getState());
      return;
    }
    out.cloneFrom(r.replay());
  }
}

/**
 * Player's ship.
 */
export class Ship {
  public static readonly SCROLL_SPEED_BASE = 0.01;
  public static readonly SCROLL_SPEED_MAX = 0.1;
  public static readonly SCROLL_START_Y = 2.5;

  private readonly boats: Boat[];
  private gameMode = GAME_MODE_NORMAL;
  private boatNum = 1;
  private gameState!: InGameStateLike;
  public scrollSpeed = Ship.SCROLL_SPEED_BASE;
  private _scrollSpeedBase = Ship.SCROLL_SPEED_BASE;

  private readonly _midstPos = new Vector();
  private readonly _higherPos = new Vector();
  private readonly _lowerPos = new Vector();
  private readonly _nearPos = new Vector();
  private readonly _nearVel = new Vector();
  private readonly bridgeShape: BaseShape;

  public constructor(
    pad: Pad,
    twinStick: TwinStick,
    mouse: RecordableMouse,
    mouseAndPad: RecordableMouseAndPad,
    private readonly field: Field,
    screen: Screen,
    sparks: SparkPool,
    smokes: SmokePool,
    fragments: FragmentPool,
    wakes: WakePool,
  ) {
    Boat.init();
    this.boats = [
      new Boat(0, this, pad, twinStick, mouse, mouseAndPad, field, screen, sparks, smokes, fragments, wakes),
      new Boat(1, this, pad, twinStick, mouse, mouseAndPad, field, screen, sparks, smokes, fragments, wakes),
    ];
    this.bridgeShape = new BaseShape(0.3, 0.2, 0.1, BaseShape.ShapeType.BRIDGE, 0.3, 0.7, 0.7);
  }

  public setRandSeed(seed: number): void {
    Boat.setRandSeed(seed);
  }

  public close(): void {
    for (const b of this.boats) b.close();
    this.bridgeShape.close();
  }

  public setShots(shots: ShotPool): void {
    for (const b of this.boats) b.setShots(shots);
  }

  public setEnemies(enemies: EnemyPool): void {
    for (const b of this.boats) b.setEnemies(enemies);
  }

  public setStageManager(stageManager: StageManager): void {
    for (const b of this.boats) b.setStageManager(stageManager);
  }

  public setGameState(gameState: InGameStateLike): void {
    this.gameState = gameState;
    for (const b of this.boats) b.setGameState(gameState);
  }

  public start(gameMode: number): void {
    this.gameMode = gameMode;
    this.boatNum = gameMode === GAME_MODE_DOUBLE_PLAY ? 2 : 1;
    this._scrollSpeedBase = Ship.SCROLL_SPEED_BASE;

    for (let i = 0; i < this.boatNum; i++) this.boats[i].start(gameMode);

    this._midstPos.x = 0;
    this._midstPos.y = 0;
    this._higherPos.x = 0;
    this._higherPos.y = 0;
    this._lowerPos.x = 0;
    this._lowerPos.y = 0;
    this._nearPos.x = 0;
    this._nearPos.y = 0;
    this._nearVel.x = 0;
    this._nearVel.y = 0;

    this.restart();
  }

  public restart(): void {
    this.scrollSpeed = this._scrollSpeedBase;
    for (let i = 0; i < this.boatNum; i++) this.boats[i].restart();
  }

  public move(): void {
    this.field.scroll(this.scrollSpeed);

    let shrink = false;
    for (let i = 0; i < this.boatNum; i++) {
      this.boats[i].move();
      if (this.boats[i].hasCollision() && this.boats[i].pos.x > this.field.size.x / 3 && this.boats[i].pos.y < (-this.field.size.y / 4) * 3) {
        shrink = true;
      }
    }

    if (shrink) this.gameState.shrinkScoreReel();

    if (this.higherPos.y >= Ship.SCROLL_START_Y) this.scrollSpeed += (Ship.SCROLL_SPEED_MAX - this.scrollSpeed) * 0.1;
    else this.scrollSpeed += (this._scrollSpeedBase - this.scrollSpeed) * 0.1;

    this._scrollSpeedBase += (Ship.SCROLL_SPEED_MAX - this._scrollSpeedBase) * 0.00001;
  }

  public checkBulletHit(p: Vector, pp: Vector): boolean {
    for (let i = 0; i < this.boatNum; i++) {
      if (this.boats[i].checkBulletHit(p, pp)) return true;
    }
    return false;
  }

  public clearBullets(): void {
    this.gameState.clearBullets();
  }

  public destroyed(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].destroyedBoat();
  }

  public draw(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].draw();

    if (this.gameMode === GAME_MODE_DOUBLE_PLAY && this.boats[0].hasCollision()) {
      Screen.setColor(0.5, 0.5, 0.9, 0.8);
      Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
      Screen3D.glVertex3f(this.boats[0].pos.x, this.boats[0].pos.y, 0);
      Screen.setColor(0.5, 0.5, 0.9, 0.3);
      Screen3D.glVertex3f(this.midstPos.x, this.midstPos.y, 0);
      Screen.setColor(0.5, 0.5, 0.9, 0.8);
      Screen3D.glVertex3f(this.boats[1].pos.x, this.boats[1].pos.y, 0);
      Screen3D.glEnd();

      Screen3D.glPushMatrix();
      Screen3D.glTranslatef(this.midstPos.x, this.midstPos.y, 0);
      Screen3D.glRotatef((-this.degAmongBoats() * 180) / PI, 0, 0, 1);
      this.bridgeShape.draw();
      Screen3D.glPopMatrix();
    }
  }

  public drawFront(): void {
    for (let i = 0; i < this.boatNum; i++) this.boats[i].drawFront();
  }

  public drawShape(): void {
    this.boats[0].drawShape();
  }

  public get scrollSpeedBase(): number {
    return this._scrollSpeedBase;
  }

  public setReplayMode(turnSpeed: number, reverseFire: boolean): void {
    for (const b of this.boats) b.setReplayMode(turnSpeed, reverseFire);
  }

  public unsetReplayMode(): void {
    for (const b of this.boats) b.unsetReplayMode();
  }

  public replayMode(): boolean {
    return this.boats[0].replayMode();
  }

  public get midstPos(): Vector {
    this._midstPos.x = 0;
    this._midstPos.y = 0;
    for (let i = 0; i < this.boatNum; i++) {
      this._midstPos.x += this.boats[i].pos.x;
      this._midstPos.y += this.boats[i].pos.y;
    }
    this._midstPos.x /= this.boatNum;
    this._midstPos.y /= this.boatNum;
    return this._midstPos;
  }

  public get higherPos(): Vector {
    this._higherPos.y = -99999;
    for (let i = 0; i < this.boatNum; i++) {
      if (this.boats[i].pos.y > this._higherPos.y) {
        this._higherPos.x = this.boats[i].pos.x;
        this._higherPos.y = this.boats[i].pos.y;
      }
    }
    return this._higherPos;
  }

  public get lowerPos(): Vector {
    this._lowerPos.y = 99999;
    for (let i = 0; i < this.boatNum; i++) {
      if (this.boats[i].pos.y < this._lowerPos.y) {
        this._lowerPos.x = this.boats[i].pos.x;
        this._lowerPos.y = this.boats[i].pos.y;
      }
    }
    return this._lowerPos;
  }

  public nearPos(p: Vector): Vector {
    let dist = 99999;
    for (let i = 0; i < this.boatNum; i++) {
      const d = this.boats[i].pos.dist(p);
      if (d < dist) {
        dist = d;
        this._nearPos.x = this.boats[i].pos.x;
        this._nearPos.y = this.boats[i].pos.y;
      }
    }
    return this._nearPos;
  }

  public nearVel(p: Vector): Vector {
    let dist = 99999;
    for (let i = 0; i < this.boatNum; i++) {
      const d = this.boats[i].pos.dist(p);
      if (d < dist) {
        dist = d;
        this._nearVel.x = this.boats[i].vel.x;
        this._nearVel.y = this.boats[i].vel.y;
      }
    }
    return this._nearVel;
  }

  public distAmongBoats(): number {
    return this.boats[0].pos.dist(this.boats[1].pos);
  }

  public degAmongBoats(): number {
    if (this.distAmongBoats() < 0.1) return 0;
    return Math.atan2(this.boats[0].pos.x - this.boats[1].pos.x, this.boats[0].pos.y - this.boats[1].pos.y);
  }
}
