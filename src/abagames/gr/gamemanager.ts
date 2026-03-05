/*
 * $Id: gamemanager.d,v 1.5 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { GameManager as SDLGameManager } from "../util/sdl/gamemanager";
import { MultipleInputDevice } from "../util/sdl/input";
import { Pad } from "../util/sdl/pad";
import { TwinStick } from "../util/sdl/twinstick";
import { MouseState } from "../util/sdl/mouse";
import { Screen3D } from "../util/sdl/screen3d";
import { Field } from "./field";
import { Ship } from "./ship";
import { BulletPool } from "./bullet";
import { EnemyPool, EnemySpec, EnemyState } from "./enemy";
import { Turret } from "./turret";
import { StageManager } from "./stagemanager";
import { Fragment, FragmentPool, Smoke, SmokePool, Spark, SparkFragment, SparkFragmentPool, SparkPool, WakePool } from "./particle";
import { Shot, ShotPool } from "./shot";
import { Crystal, CrystalPool } from "./crystal";
import { Letter } from "./letter";
import { SoundManager } from "./soundmanager";
import { BaseShape, BulletShape, EnemyShape, TurretShape } from "./shape";
import { Screen } from "./screen";
import { TitleManager } from "./title";
import { ReplayData } from "./replay";
import { NumIndicator, NumIndicatorPool, NumReel, ScoreReel } from "./reel";
import { PrefManager } from "./prefmanager";
import { RecordableMouse } from "./mouse";
import { RecordableMouseAndPad } from "./mouseandpad";
import { Rand } from "../util/rand";

const SDLK_ESCAPE = 27;
const SDLK_P = 80;
const SDL_PRESSED = 1;

/**
 * Manage the game state and actor pools.
 */
export class GameManager extends SDLGameManager {
  public static shipTurnSpeed = 1;
  public static shipReverseFire = false;

  public pad!: Pad;
  public twinStick!: TwinStick;
  public mouse!: RecordableMouse;
  public mouseAndPad!: RecordableMouseAndPad;
  public prefManager!: PrefManager;
  public screen!: Screen;
  public field!: Field;
  public ship!: Ship;
  public shots!: ShotPool;
  public bullets!: BulletPool;
  public enemies!: EnemyPool;
  public sparks!: SparkPool;
  public smokes!: SmokePool;
  public fragments!: FragmentPool;
  public sparkFragments!: SparkFragmentPool;
  public wakes!: WakePool;
  public crystals!: CrystalPool;
  public numIndicators!: NumIndicatorPool;
  public stageManager!: StageManager;
  public titleManager!: TitleManager;
  public scoreReel!: ScoreReel;
  public state!: GameState;
  public titleState!: TitleState;
  public inGameState!: InGameState;

  private escPressed = false;

  public override init(): void {
    Letter.init();
    Shot.init();
    BulletShape.init();
    EnemyShape.init();
    Turret.init();
    TurretShape.init();
    Fragment.init();
    SparkFragment.init();
    Crystal.init();

    this.prefManager = this.abstPrefManager as PrefManager;
    this.screen = this.abstScreen as Screen;

    const input = this.input as MultipleInputDevice;
    this.pad = (input.inputs[0] ?? new Pad()) as Pad;
    this.twinStick = (input.inputs[1] ?? new TwinStick()) as TwinStick;
    this.mouse =
      (input.inputs[2] ??
        new RecordableMouse({
          get width() {
            return Screen3D.width;
          },
          get height() {
            return Screen3D.height;
          },
        })) as RecordableMouse;

    this.pad.openJoystick();
    this.twinStick.openJoystick();
    this.mouse.init();
    this.mouseAndPad = new RecordableMouseAndPad(this.mouse, this.pad);

    this.field = new Field();

    this.sparks = new SparkPool(120, []);
    this.wakes = new WakePool(100, [this.field]);
    this.smokes = new SmokePool(200, [this.field]);
    this.fragments = new FragmentPool(60, [this.field, this.smokes]);
    this.sparkFragments = new SparkFragmentPool(40, [this.field, this.smokes]);

    this.ship = new Ship(
      this.pad,
      this.twinStick,
      this.mouse,
      this.mouseAndPad,
      this.field,
      this.screen,
      this.sparks,
      this.smokes,
      this.fragments,
      this.wakes,
    );

    this.crystals = new CrystalPool(80, [this.ship]);
    this.scoreReel = new ScoreReel();
    this.numIndicators = new NumIndicatorPool(50, [this.scoreReel]);

    this.bullets = new BulletPool(240, [this, this.field, this.ship, this.smokes, this.wakes, this.crystals]);
    this.enemies = new EnemyPool(40, [
      this.field,
      this.screen,
      this.bullets,
      this.ship,
      this.sparks,
      this.smokes,
      this.fragments,
      this.sparkFragments,
      this.numIndicators,
      this.scoreReel,
    ]);
    this.shots = new ShotPool(50, [this.field, this.enemies, this.sparks, this.smokes, this.bullets]);

    this.ship.setShots(this.shots);
    this.ship.setEnemies(this.enemies);

    this.stageManager = new StageManager(
      this.field,
      this.enemies,
      this.ship,
      this.bullets,
      this.sparks,
      this.smokes,
      this.fragments,
      this.wakes,
    );

    this.ship.setStageManager(this.stageManager);
    this.field.setStageManager(this.stageManager);
    this.field.setShip(this.ship);
    this.enemies.setStageManager(this.stageManager);

    SoundManager.loadSounds();

    this.titleManager = new TitleManager(this.prefManager, this.pad, this.mouse, this.field, this);
    this.inGameState = new InGameState(
      this,
      this.screen,
      this.pad,
      this.twinStick,
      this.mouse,
      this.mouseAndPad,
      this.field,
      this.ship,
      this.shots,
      this.bullets,
      this.enemies,
      this.sparks,
      this.smokes,
      this.fragments,
      this.sparkFragments,
      this.wakes,
      this.crystals,
      this.numIndicators,
      this.stageManager,
      this.scoreReel,
      this.prefManager,
    );
    this.titleState = new TitleState(
      this,
      this.screen,
      this.pad,
      this.twinStick,
      this.mouse,
      this.mouseAndPad,
      this.field,
      this.ship,
      this.shots,
      this.bullets,
      this.enemies,
      this.sparks,
      this.smokes,
      this.fragments,
      this.sparkFragments,
      this.wakes,
      this.crystals,
      this.numIndicators,
      this.stageManager,
      this.scoreReel,
      this.titleManager,
      this.inGameState,
    );

    this.ship.setGameState(this.inGameState);
    (globalThis as unknown as { InGameState?: typeof InGameState }).InGameState = InGameState;
  }

  public override close(): void {
    this.ship.close();
    BulletShape.close();
    EnemyShape.close();
    TurretShape.close();
    Fragment.close();
    SparkFragment.close();
    Crystal.close();
    this.titleState.close();
    Letter.close();
  }

  public override start(): void {
    this.loadLastReplay();
    this.startTitle();
  }

  public startTitle(fromGameover = false): void {
    if (fromGameover) this.saveLastReplay();
    this.titleState.replayData = this.inGameState.replayData;
    this.state = this.titleState;
    this.state.start();
  }

  public startInGame(gameMode: number): void {
    this.state = this.inGameState;
    this.inGameState.gameMode = gameMode;
    this.state.start();
  }

  public saveErrorReplay(): void {
    if (this.state === this.inGameState) this.inGameState.saveReplay("error.rpl");
  }

  private saveLastReplay(): void {
    try {
      this.inGameState.saveReplay("last.rpl");
    } catch {
      // ignore
    }
  }

  private loadLastReplay(): void {
    try {
      this.inGameState.loadReplay("last.rpl");
    } catch {
      this.inGameState.resetReplay();
    }
  }

  private loadErrorReplay(): void {
    try {
      this.inGameState.loadReplay("error.rpl");
    } catch {
      this.inGameState.resetReplay();
    }
  }

  public initInterval(): void {
    // mainloop interval control is not exposed in web port.
  }

  public addSlowdownRatio(_sr: number): void {
    // slowdown ratio is intentionally ignored in web port.
  }

  public override move(): void {
    if (this.pad.keys[SDLK_ESCAPE] === SDL_PRESSED) {
      if (!this.escPressed) {
        this.escPressed = true;
        if (this.state === this.inGameState) this.startTitle();
        else this.mainLoop.breakLoop();
        return;
      }
    } else {
      this.escPressed = false;
    }
    this.state.move();
  }

  public override draw(): void {
    if (this.screen.startRenderToLuminousScreen()) {
      Screen3D.glPushMatrix();
      this.screen.setEyepos();
      this.state.drawLuminous();
      Screen3D.glPopMatrix();
      this.screen.endRenderToLuminousScreen();
    }

    this.screen.clear();

    Screen3D.glPushMatrix();
    this.screen.setEyepos();
    this.state.draw();
    Screen3D.glPopMatrix();

    this.screen.drawLuminous();

    Screen3D.glPushMatrix();
    this.screen.setEyepos();
    this.field.drawSideWalls();
    this.state.drawFront();
    Screen3D.glPopMatrix();

    Screen.viewOrthoFixed();
    this.state.drawOrtho();
    Screen.viewPerspective();
  }
}

/**
 * Manage the game state.
 */
export abstract class GameState {
  protected readonly gameManager: GameManager;
  protected readonly screen: Screen;
  protected readonly pad: Pad;
  protected readonly twinStick: TwinStick;
  protected readonly mouse: RecordableMouse;
  protected readonly mouseAndPad: RecordableMouseAndPad;
  protected readonly field: Field;
  protected readonly ship: Ship;
  protected readonly shots: ShotPool;
  protected readonly bullets: BulletPool;
  protected readonly enemies: EnemyPool;
  protected readonly sparks: SparkPool;
  protected readonly smokes: SmokePool;
  protected readonly fragments: FragmentPool;
  protected readonly sparkFragments: SparkFragmentPool;
  protected readonly wakes: WakePool;
  protected readonly crystals: CrystalPool;
  protected readonly numIndicators: NumIndicatorPool;
  protected readonly stageManager: StageManager;
  protected readonly scoreReel: ScoreReel;
  protected _replayData: ReplayData | null = null;

  public constructor(
    gameManager: GameManager,
    screen: Screen,
    pad: Pad,
    twinStick: TwinStick,
    mouse: RecordableMouse,
    mouseAndPad: RecordableMouseAndPad,
    field: Field,
    ship: Ship,
    shots: ShotPool,
    bullets: BulletPool,
    enemies: EnemyPool,
    sparks: SparkPool,
    smokes: SmokePool,
    fragments: FragmentPool,
    sparkFragments: SparkFragmentPool,
    wakes: WakePool,
    crystals: CrystalPool,
    numIndicators: NumIndicatorPool,
    stageManager: StageManager,
    scoreReel: ScoreReel,
  ) {
    this.gameManager = gameManager;
    this.screen = screen;
    this.pad = pad;
    this.twinStick = twinStick;
    this.mouse = mouse;
    this.mouseAndPad = mouseAndPad;
    this.field = field;
    this.ship = ship;
    this.shots = shots;
    this.bullets = bullets;
    this.enemies = enemies;
    this.sparks = sparks;
    this.smokes = smokes;
    this.fragments = fragments;
    this.sparkFragments = sparkFragments;
    this.wakes = wakes;
    this.crystals = crystals;
    this.numIndicators = numIndicators;
    this.stageManager = stageManager;
    this.scoreReel = scoreReel;
  }

  public abstract start(): void;
  public abstract move(): void;
  public abstract draw(): void;
  public abstract drawLuminous(): void;
  public abstract drawFront(): void;
  public abstract drawOrtho(): void;

  protected clearAll(): void {
    this.shots.clear();
    this.bullets.clear();
    this.enemies.clear();
    this.sparks.clear();
    this.smokes.clear();
    this.fragments.clear();
    this.sparkFragments.clear();
    this.wakes.clear();
    this.crystals.clear();
    this.numIndicators.clear();
  }

  public get replayData(): ReplayData | null {
    return this._replayData;
  }

  public set replayData(v: ReplayData | null) {
    this._replayData = v;
  }

  public close(): void {}
}

export class InGameState extends GameState {
  public static readonly GameMode = {
    NORMAL: 0,
    TWIN_STICK: 1,
    DOUBLE_PLAY: 2,
    MOUSE: 3,
  } as const;

  public static readonly GAME_MODE_NUM = 4;
  public static readonly gameModeText = ["NORMAL", "TWIN STICK", "DOUBLE PLAY", "MOUSE"];
  public static readonly GameModeValues = [
    InGameState.GameMode.NORMAL,
    InGameState.GameMode.TWIN_STICK,
    InGameState.GameMode.DOUBLE_PLAY,
    InGameState.GameMode.MOUSE,
  ] as const;
  public static normalizeGameMode(mode: number): (typeof InGameState.GameModeValues)[number] {
    if (mode === InGameState.GameMode.TWIN_STICK) return InGameState.GameMode.TWIN_STICK;
    if (mode === InGameState.GameMode.DOUBLE_PLAY) return InGameState.GameMode.DOUBLE_PLAY;
    if (mode === InGameState.GameMode.MOUSE) return InGameState.GameMode.MOUSE;
    return InGameState.GameMode.NORMAL;
  }

  public isGameOver = false;

  private static readonly SCORE_REEL_SIZE_DEFAULT = 0.5;
  private static readonly SCORE_REEL_SIZE_SMALL = 0.01;

  private readonly rand = new Rand();
  private readonly prefManager: PrefManager;
  private left = 0;
  private time = 0;
  private gameOverCnt = 0;
  private btnPressed = false;
  private pauseCnt = 0;
  private pausePressed = false;
  private scoreReelSize = InGameState.SCORE_REEL_SIZE_DEFAULT;
  private _gameMode: (typeof InGameState.GameModeValues)[number] = InGameState.GameMode.NORMAL;

  public constructor(
    gameManager: GameManager,
    screen: Screen,
    pad: Pad,
    twinStick: TwinStick,
    mouse: RecordableMouse,
    mouseAndPad: RecordableMouseAndPad,
    field: Field,
    ship: Ship,
    shots: ShotPool,
    bullets: BulletPool,
    enemies: EnemyPool,
    sparks: SparkPool,
    smokes: SmokePool,
    fragments: FragmentPool,
    sparkFragments: SparkFragmentPool,
    wakes: WakePool,
    crystals: CrystalPool,
    numIndicators: NumIndicatorPool,
    stageManager: StageManager,
    scoreReel: ScoreReel,
    prefManager: PrefManager,
  ) {
    super(
      gameManager,
      screen,
      pad,
      twinStick,
      mouse,
      mouseAndPad,
      field,
      ship,
      shots,
      bullets,
      enemies,
      sparks,
      smokes,
      fragments,
      sparkFragments,
      wakes,
      crystals,
      numIndicators,
      stageManager,
      scoreReel,
    );
    this.prefManager = prefManager;
  }

  public override start(): void {
    this.ship.unsetReplayMode();

    this._replayData = new ReplayData();
    this.prefManager.prefData.recordGameMode(this._gameMode);

    this._replayData.seed = this.rand.nextInt32();
    this._replayData.shipTurnSpeed = GameManager.shipTurnSpeed;
    this._replayData.shipReverseFire = GameManager.shipReverseFire;
    this._replayData.gameMode = this._gameMode;

    SoundManager.enableBgm();
    SoundManager.enableSe();
    this.startInGame();
  }

  public startInGame(): void {
    this.clearAll();
    const seed = this._replayData?.seed ?? this.rand.nextInt32();

    this.field.setRandSeed(seed);
    EnemyState.setRandSeed(seed);
    EnemySpec.setRandSeed(seed);
    Turret.setRandSeed(seed);
    Spark.setRandSeed(seed);
    Smoke.setRandSeed(seed);
    Fragment.setRandSeed(seed);
    SparkFragment.setRandSeed(seed);
    Screen.setRandSeed(seed);
    BaseShape.setRandSeed(seed);
    this.ship.setRandSeed(seed);
    Shot.setRandSeed(seed);
    this.stageManager.setRandSeed(seed);
    NumReel.setRandSeed(seed);
    NumIndicator.setRandSeed(seed);
    SoundManager.setRandSeed(seed);

    this.stageManager.start(1);
    this.field.start();
    this.ship.start(this._gameMode);
    this.initGameState();
    this.screen.setScreenShake(0, 0);
    this.gameOverCnt = 0;
    this.pauseCnt = 0;
    this.scoreReelSize = InGameState.SCORE_REEL_SIZE_DEFAULT;
    this.isGameOver = false;
    SoundManager.playBgm();
  }

  private initGameState(): void {
    this.time = 0;
    this.left = 2;
    this.scoreReel.clear(9);
    NumIndicator.initTargetY();
  }

  public override move(): void {
    if (this.pad.keys[SDLK_P] === SDL_PRESSED) {
      if (!this.pausePressed) {
        if (this.pauseCnt <= 0 && !this.isGameOver) this.pauseCnt = 1;
        else this.pauseCnt = 0;
      }
      this.pausePressed = true;
    } else {
      this.pausePressed = false;
    }

    if (this.pauseCnt > 0) {
      this.pauseCnt++;
      return;
    }

    this.moveInGame();

    if (this.isGameOver) {
      this.gameOverCnt++;
      const btn = this.pad.getButtonState();
      const ms = this.mouse.getState(false);
      const pressed = (btn & Pad.Button.A) !== 0 || (this._gameMode === InGameState.GameMode.MOUSE && (ms.button & MouseState.Button.LEFT) !== 0);
      if (pressed) {
        if (this.gameOverCnt > 60 && !this.btnPressed) this.gameManager.startTitle(true);
        this.btnPressed = true;
      } else {
        this.btnPressed = false;
      }

      if (this.gameOverCnt === 120) {
        SoundManager.fadeBgm();
        SoundManager.disableBgm();
      }
      if (this.gameOverCnt > 1200) this.gameManager.startTitle(true);
    }
  }

  public moveInGame(): void {
    this.field.move();
    this.ship.move();
    this.stageManager.move();
    this.enemies.move();
    this.shots.move();
    this.bullets.move();
    this.crystals.move();
    this.numIndicators.move();
    this.sparks.move();
    this.smokes.move();
    this.fragments.move();
    this.sparkFragments.move();
    this.wakes.move();
    this.screen.move();

    this.scoreReelSize += (InGameState.SCORE_REEL_SIZE_DEFAULT - this.scoreReelSize) * 0.05;
    this.scoreReel.move();
    if (!this.isGameOver) this.time += 17;

    SoundManager.playMarkedSe();
  }

  public override draw(): void {
    this.field.draw();

    Screen3D.glBegin(Screen3D.GL_TRIANGLES);
    this.wakes.draw();
    this.sparks.draw();
    Screen3D.glEnd();

    Screen3D.glBlendAlpha();
    Screen3D.glBegin(Screen3D.GL_QUADS);
    this.smokes.draw();
    Screen3D.glEnd();

    this.fragments.draw();
    this.sparkFragments.draw();
    this.crystals.draw();

    Screen3D.glBlendAdditive();
    this.enemies.draw();
    this.shots.draw();
    this.ship.draw();
    this.bullets.draw();
  }

  public override drawFront(): void {
    this.ship.drawFront();
    this.scoreReel.draw(
      11.5 + (InGameState.SCORE_REEL_SIZE_DEFAULT - this.scoreReelSize) * 3,
      -8.2 - (InGameState.SCORE_REEL_SIZE_DEFAULT - this.scoreReelSize) * 3,
      this.scoreReelSize,
    );

    let x = -12;
    for (let i = 0; i < this.left; i++) {
      Screen3D.glPushMatrix();
      Screen3D.glTranslatef(x, -9, 0);
      Screen3D.glScalef(0.7, 0.7, 0.7);
      this.ship.drawShape();
      Screen3D.glPopMatrix();
      x += 0.7;
    }
    this.numIndicators.draw();
  }

  public drawGameParams(): void {
    this.stageManager.draw();
  }

  public override drawOrtho(): void {
    this.drawGameParams();
    if (this.isGameOver) Letter.drawString("GAME OVER", 190, 180, 15);
    if (this.pauseCnt > 0 && this.pauseCnt % 64 < 32) Letter.drawString("PAUSE", 265, 210, 12);
  }

  public override drawLuminous(): void {
    Screen3D.glBegin(Screen3D.GL_TRIANGLES);
    this.sparks.drawLuminous();
    Screen3D.glEnd();

    this.sparkFragments.drawLuminous();

    Screen3D.glBegin(Screen3D.GL_QUADS);
    this.smokes.drawLuminous();
    Screen3D.glEnd();
  }

  public shipDestroyed(): void {
    this.clearBullets();
    this.stageManager.shipDestroyed();
    this.gameManager.initInterval();
    this.left--;

    if (this.left < 0) {
      this.isGameOver = true;
      this.btnPressed = true;
      SoundManager.fadeBgm();
      this.scoreReel.accelerate();
      if (!this.ship.replayMode()) {
        SoundManager.disableSe();
        this.prefManager.prefData.recordResult(this.scoreReel.actualScore, this._gameMode);
        if (this._replayData) this._replayData.score = this.scoreReel.actualScore;
      }
    }
  }

  public clearBullets(): void {
    this.bullets.clear();
  }

  public shrinkScoreReel(): void {
    this.scoreReelSize += (InGameState.SCORE_REEL_SIZE_SMALL - this.scoreReelSize) * 0.08;
  }

  public saveReplay(fileName: string): void {
    this._replayData?.save(fileName);
  }

  public loadReplay(fileName: string): void {
    this._replayData = new ReplayData();
    this._replayData.load(fileName);
  }

  public resetReplay(): void {
    this._replayData = null;
  }

  public get gameMode(): (typeof InGameState.GameModeValues)[number] {
    return this._gameMode;
  }

  public set gameMode(v: number) {
    this._gameMode = InGameState.normalizeGameMode(v);
  }
}

export class TitleState extends GameState {
  private readonly titleManager: TitleManager;
  private readonly inGameState: InGameState;
  private gameOverCnt = 0;

  public constructor(
    gameManager: GameManager,
    screen: Screen,
    pad: Pad,
    twinStick: TwinStick,
    mouse: RecordableMouse,
    mouseAndPad: RecordableMouseAndPad,
    field: Field,
    ship: Ship,
    shots: ShotPool,
    bullets: BulletPool,
    enemies: EnemyPool,
    sparks: SparkPool,
    smokes: SmokePool,
    fragments: FragmentPool,
    sparkFragments: SparkFragmentPool,
    wakes: WakePool,
    crystals: CrystalPool,
    numIndicators: NumIndicatorPool,
    stageManager: StageManager,
    scoreReel: ScoreReel,
    titleManager: TitleManager,
    inGameState: InGameState,
  ) {
    super(
      gameManager,
      screen,
      pad,
      twinStick,
      mouse,
      mouseAndPad,
      field,
      ship,
      shots,
      bullets,
      enemies,
      sparks,
      smokes,
      fragments,
      sparkFragments,
      wakes,
      crystals,
      numIndicators,
      stageManager,
      scoreReel,
    );
    this.titleManager = titleManager;
    this.inGameState = inGameState;
  }

  public override close(): void {
    this.titleManager.close();
  }

  public override start(): void {
    SoundManager.haltBgm();
    SoundManager.disableBgm();
    SoundManager.disableSe();
    this.titleManager.start();

    if (this._replayData) this.startReplay();
    else this.titleManager.replayData = null;
  }

  private startReplay(): void {
    if (!this._replayData) return;
    this.ship.setReplayMode(this._replayData.shipTurnSpeed, this._replayData.shipReverseFire);
    this.titleManager.replayData = this._replayData;
    this.inGameState.gameMode = this._replayData.gameMode;
    this.inGameState.startInGame();
    this.gameOverCnt = 0;
  }

  public override move(): void {
    if (this._replayData) {
      if (this.inGameState.isGameOver) {
        this.gameOverCnt++;
        if (this.gameOverCnt > 120) this.startReplay();
      }
      this.inGameState.moveInGame();
    }
    this.titleManager.move();
  }

  public override draw(): void {
    if (this._replayData) this.inGameState.draw();
    else this.field.draw();
  }

  public override drawFront(): void {
    if (this._replayData) this.inGameState.drawFront();
  }

  public override drawOrtho(): void {
    if (this._replayData) this.inGameState.drawGameParams();
    this.titleManager.draw();
  }

  public override drawLuminous(): void {
    this.inGameState.drawLuminous();
  }
}
