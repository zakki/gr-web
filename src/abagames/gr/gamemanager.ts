/*
 * Simplified typed game manager for gr-web.
 */

import { GameManager as SDLGameManager } from "../util/sdl/gamemanager";
import { MultipleInputDevice } from "../util/sdl/input";
import { Pad } from "../util/sdl/pad";
import { TwinStick } from "../util/sdl/twinstick";
import { Mouse } from "../util/sdl/mouse";
import { Screen3D } from "../util/sdl/screen3d";
import { Field } from "./field";
import { Ship } from "./ship";
import { BulletPool } from "./bullet";
import { EnemyPool } from "./enemy";
import { Turret } from "./turret";
import { StageManager } from "./stagemanager";
import { Fragment, FragmentPool, SmokePool, SparkFragment, SparkFragmentPool, SparkPool, WakePool } from "./particle";
import { Shot, ShotPool } from "./shot";
import { Crystal, CrystalPool } from "./crystal";
import { Letter } from "./letter";
import { SoundManager } from "./soundmanager";
import { BulletShape, EnemyShape, TurretShape } from "./shape";
import { Screen } from "./screen";
import { TitleManager } from "./title";
import { ReplayData } from "./replay";
import { NumIndicator, NumIndicatorPool, NumReel, ScoreReel } from "./reel";
import { PrefManager } from "./prefmanager";
import { RecordableMouse } from "./mouse";
import { RecordableMouseAndPad } from "./mouseandpad";

const SDLK_ESCAPE = 27;
const SDL_PRESSED = 1;

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
    this.sparks = new SparkPool(120, null);
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
    this.titleState = new TitleState(this, this.field, this.titleManager, this.inGameState);
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

  public initInterval(): void {}

  public addSlowdownRatio(_sr: number): void {}

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
    this.state.draw();
  }
}

export abstract class GameState {
  protected readonly gameManager: GameManager;
  protected readonly field: Field;

  public constructor(gameManager: GameManager, field: Field) {
    this.gameManager = gameManager;
    this.field = field;
  }

  public abstract start(): void;
  public abstract move(): void;
  public abstract draw(): void;

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

  private static readonly SCORE_REEL_SIZE_DEFAULT = 0.8;
  private static readonly SCORE_REEL_SIZE_SMALL = 0.45;

  public replayData: ReplayData | null = null;
  private _gameMode: number = InGameState.GameMode.NORMAL;
  private seed = 0;
  private scoreReelSize = InGameState.SCORE_REEL_SIZE_DEFAULT;

  public constructor(
    gameManager: GameManager,
    private readonly screen: Screen,
    field: Field,
    private readonly ship: Ship,
    private readonly shots: ShotPool,
    private readonly bullets: BulletPool,
    private readonly enemies: EnemyPool,
    private readonly sparks: SparkPool,
    private readonly smokes: SmokePool,
    private readonly fragments: FragmentPool,
    private readonly sparkFragments: SparkFragmentPool,
    private readonly wakes: WakePool,
    private readonly crystals: CrystalPool,
    private readonly numIndicators: NumIndicatorPool,
    private readonly stageManager: StageManager,
    private readonly scoreReel: ScoreReel,
    private readonly prefManager: PrefManager,
  ) {
    super(gameManager, field);
  }

  public start(): void {
    this.seed = (Date.now() & 0x7fffffff) >>> 0;

    this.field.start();
    this.ship.setReplayMode(GameManager.shipTurnSpeed, GameManager.shipReverseFire);
    this.ship.start(this._gameMode);
    this.stageManager.start(1);

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
    this.scoreReel.clear(9);
    NumIndicator.initTargetY();

    this.scoreReelSize = InGameState.SCORE_REEL_SIZE_DEFAULT;
    this.replayData = new ReplayData();
    this.replayData.gameMode = this._gameMode;
    this.replayData.seed = this.seed;
    this.replayData.shipTurnSpeed = GameManager.shipTurnSpeed;
    this.replayData.shipReverseFire = GameManager.shipReverseFire;
  }

  public move(): void {
    this.screen.move();
    this.stageManager.move();
    this.ship.move();

    this.shots.move();
    this.bullets.move();
    this.enemies.move();
    this.crystals.move();
    this.sparks.move();
    this.smokes.move();
    this.fragments.move();
    this.sparkFragments.move();
    this.wakes.move();
    this.numIndicators.move();

    this.scoreReel.move();
    this.scoreReelSize += (InGameState.SCORE_REEL_SIZE_DEFAULT - this.scoreReelSize) * 0.05;

    SoundManager.playMarkedSe();

    const score = this.scoreReel.actualScore;
    if (score > this.prefManager.prefData.highScore(this._gameMode)) {
      this.prefManager.prefData.recordResult(score, this._gameMode);
    }
  }

  public draw(): void {
    this.screen.setEyepos();
    this.field.drawSideWalls();
    this.field.draw();

    this.wakes.draw();
    this.smokes.draw();
    this.fragments.draw();
    this.sparkFragments.draw();
    this.sparks.draw();

    this.crystals.draw();
    this.bullets.draw();
    this.enemies.draw();
    this.shots.draw();

    this.ship.draw();
    this.ship.drawFront();
    this.numIndicators.draw();
    this.scoreReel.draw(11.5, -8.2, this.scoreReelSize);
  }

  public clearBullets(): void {
    this.bullets.clear();
  }

  public shrinkScoreReel(): void {
    this.scoreReelSize += (InGameState.SCORE_REEL_SIZE_SMALL - this.scoreReelSize) * 0.08;
  }

  public saveReplay(name: string): void {
    if (!this.replayData) this.replayData = new ReplayData();
    this.replayData.seed = this.seed;
    this.replayData.score = this.scoreReel.actualScore;
    this.replayData.gameMode = this._gameMode;
    this.replayData.shipTurnSpeed = GameManager.shipTurnSpeed;
    this.replayData.shipReverseFire = GameManager.shipReverseFire;
    this.replayData.save(name);
  }

  public loadReplay(name: string): void {
    const rd = new ReplayData();
    rd.load(name);
    this.replayData = rd;
  }

  public resetReplay(): void {
    this.replayData = null;
  }

  public get gameMode(): number {
    return this._gameMode;
  }

  public set gameMode(v: number) {
    if (v < 0) this._gameMode = 0;
    else if (v >= InGameState.GAME_MODE_NUM) this._gameMode = InGameState.GAME_MODE_NUM - 1;
    else this._gameMode = v;
  }
}

export class TitleState extends GameState {
  private _replayData: ReplayData | null = null;

  public constructor(
    gameManager: GameManager,
    field: Field,
    private readonly titleManager: TitleManager,
    private readonly inGameState: InGameState,
  ) {
    super(gameManager, field);
  }

  public start(): void {
    this.titleManager.replayData = this._replayData;
    this.titleManager.start();
  }

  public move(): void {
    this.titleManager.move();
  }

  public draw(): void {
    this.gameManager.screen.setEyepos();
    this.field.drawSideWalls();
    this.field.draw();
    this.titleManager.draw();
  }

  public override close(): void {
    this.titleManager.close();
  }

  public get replayData(): ReplayData | null {
    return this._replayData;
  }

  public set replayData(v: ReplayData | null) {
    this._replayData = v;
    this.inGameState.replayData = v;
  }
}
