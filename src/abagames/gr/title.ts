/*
 * $Id: title.d,v 1.4 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

declare class PrefManager {
  public prefData: { gameMode: number; highScore(gm: number): number };
}
declare class Field {
  public start(): void;
  public move(): void;
  public scroll(speed: number, asTitle?: boolean): void;
}
declare class GameManager {
  public startInGame(gameMode: number): void;
}
declare class DisplayList {
  public constructor(num: number);
  public beginNewList(): void;
  public endNewList(): void;
  public call(i: number): void;
  public close(): void;
}
declare class Texture {
  public constructor(name: string);
  public bind(): void;
  public close(): void;
}
declare class ReplayData {
  public score: number;
}
declare class RecordablePad {
  public getState(doRecord?: boolean): PadState;
}
declare class RecordableMouse {
  public getState(doRecord?: boolean): MouseState;
}
declare class PadState {
  public static readonly Button: { readonly A: number; readonly B: number };
  public static readonly Dir: { readonly UP: number; readonly DOWN: number };
  public button: number;
  public dir: number;
}
declare class MouseState {
  public static readonly Button: { readonly LEFT: number };
  public button: number;
}
declare class InGameState {
  public static readonly GAME_MODE_NUM: number;
  public static readonly gameModeText: string[];
  public static readonly GameMode: { readonly MOUSE: number };
}
declare class SoundManager {
  public static enableBgm(): void;
  public static enableSe(): void;
  public static disableBgm(): void;
  public static disableSe(): void;
  public static fadeBgm(): void;
  public static playCurrentBgm(): void;
}
declare class Screen {
  public static setColor(r: number, g: number, b: number, a?: number): void;
  public static lineWidth(width: number): void;
}
declare class Letter {
  public static readonly Direction: { readonly TO_RIGHT: number };
  public static drawString(
    text: string,
    x: number,
    y: number,
    size: number,
    direction?: number,
    spacing?: number,
  ): void;
  public static drawNum(value: number, x: number, y: number, size: number, minDigit?: number, maxDigit?: number): void;
}

declare const GL_TEXTURE_2D: number;
declare const GL_TRIANGLE_FAN: number;
declare const GL_LINE_STRIP: number;
declare function glEnable(cap: number): void;
declare function glDisable(cap: number): void;
declare function glBegin(mode: number): void;
declare function glEnd(): void;
declare function glTexCoord2(u: number, v: number): void;
declare function glVertex2(x: number, y: number): void;
declare function glPushMatrix(): void;
declare function glPopMatrix(): void;
declare function glTranslatef(x: number, y: number, z: number): void;
declare function glScalef(x: number, y: number, z: number): void;

/**
 * Title screen.
 */
export class TitleManager {
  private static readonly SCROLL_SPEED_BASE = 0.025;

  private readonly prefManager: PrefManager;
  private readonly pad: RecordablePad;
  private readonly mouse: RecordableMouse;
  private readonly field: Field;
  private readonly gameManager: GameManager;
  private displayList: DisplayList | null = null;
  private logo: Texture | null = null;
  private cnt = 0;
  private _replayData: ReplayData | null = null;
  private btnPressedCnt = 0;
  private gameMode = 0;

  public constructor(prefManager: PrefManager, pad: unknown, mouse: unknown, field: Field, gameManager: GameManager) {
    this.prefManager = prefManager;
    this.pad = pad as RecordablePad;
    this.mouse = mouse as RecordableMouse;
    this.field = field;
    this.gameManager = gameManager;
    this.init();
  }

  private init(): void {
    this.logo = new Texture("title.bmp");
    this.displayList = new DisplayList(1);
    this.displayList.beginNewList();
    glEnable(GL_TEXTURE_2D);
    this.logo.bind();
    Screen.setColor(1, 1, 1);
    glBegin(GL_TRIANGLE_FAN);
    glTexCoord2(0, 0);
    glVertex2(0, -63);
    glTexCoord2(1, 0);
    glVertex2(255, -63);
    glTexCoord2(1, 1);
    glVertex2(255, 0);
    glTexCoord2(0, 1);
    glVertex2(0, 0);
    glEnd();

    Screen.lineWidth(3);
    glDisable(GL_TEXTURE_2D);
    glBegin(GL_LINE_STRIP);
    glVertex2(-80, -7);
    glVertex2(-20, -7);
    glVertex2(10, -70);
    glEnd();
    glBegin(GL_LINE_STRIP);
    glVertex2(45, -2);
    glVertex2(-15, -2);
    glVertex2(-45, 61);
    glEnd();

    glBegin(GL_TRIANGLE_FAN);
    Screen.setColor(1, 1, 1);
    glVertex2(-19, -6);
    Screen.setColor(0, 0, 0);
    glVertex2(-79, -6);
    glVertex2(11, -69);
    glEnd();
    glBegin(GL_TRIANGLE_FAN);
    Screen.setColor(1, 1, 1);
    glVertex2(-16, -3);
    Screen.setColor(0, 0, 0);
    glVertex2(44, -3);
    glVertex2(-46, 60);
    glEnd();
    Screen.lineWidth(1);
    this.displayList.endNewList();
    this.gameMode = this.prefManager.prefData.gameMode;
  }

  public close(): void {
    this.displayList?.close();
    this.displayList = null;
    this.logo?.close();
    this.logo = null;
  }

  public start(): void {
    this.cnt = 0;
    this.field.start();
    this.btnPressedCnt = 1;
  }

  public move(): void {
    if (!this._replayData) {
      this.field.move();
      this.field.scroll(TitleManager.SCROLL_SPEED_BASE, true);
    }

    const input = this.pad.getState(false);
    const mouseInput = this.mouse.getState(false);

    if (this.btnPressedCnt <= 0) {
      const startPressed =
        (input.button & PadState.Button.A) !== 0 ||
        (this.gameMode === InGameState.GameMode.MOUSE && (mouseInput.button & MouseState.Button.LEFT) !== 0);
      if (startPressed && this.gameMode >= 0) {
        this.gameManager.startInGame(this.gameMode);
      }

      let gmc = 0;
      if ((input.button & PadState.Button.B) !== 0 || (input.dir & PadState.Dir.DOWN) !== 0) {
        gmc = 1;
      } else if ((input.dir & PadState.Dir.UP) !== 0) {
        gmc = -1;
      }
      if (gmc !== 0) {
        this.gameMode += gmc;
        if (this.gameMode >= InGameState.GAME_MODE_NUM) {
          this.gameMode = -1;
        } else if (this.gameMode < -1) {
          this.gameMode = InGameState.GAME_MODE_NUM - 1;
        }
        if (this.gameMode === -1 && this._replayData) {
          SoundManager.enableBgm();
          SoundManager.enableSe();
          SoundManager.playCurrentBgm();
        } else {
          SoundManager.fadeBgm();
          SoundManager.disableBgm();
          SoundManager.disableSe();
        }
      }
    }

    if (
      (input.button & (PadState.Button.A | PadState.Button.B)) !== 0 ||
      (input.dir & (PadState.Dir.UP | PadState.Dir.DOWN)) !== 0 ||
      (mouseInput.button & MouseState.Button.LEFT) !== 0
    ) {
      this.btnPressedCnt = 6;
    } else {
      this.btnPressedCnt--;
    }
    this.cnt++;
  }

  public draw(): void {
    if (this.gameMode < 0) {
      Letter.drawString("REPLAY", 3, 400, 5);
      return;
    }

    let ts = 1;
    if (this.cnt > 120) {
      ts -= (this.cnt - 120) * 0.015;
      if (ts < 0.5) {
        ts = 0.5;
      }
    }
    glPushMatrix();
    glTranslatef(80 * ts, 240, 0);
    glScalef(ts, ts, 0);
    this.displayList?.call(0);
    glPopMatrix();

    if (this.cnt > 150) {
      Letter.drawString("HIGH", 3, 305, 4, Letter.Direction.TO_RIGHT, 1);
      Letter.drawNum(this.prefManager.prefData.highScore(this.gameMode), 80, 320, 4, 0, 9);
    }
    if (this.cnt > 200) {
      Letter.drawString("LAST", 3, 345, 4, Letter.Direction.TO_RIGHT, 1);
      const ls = this._replayData ? this._replayData.score : 0;
      Letter.drawNum(ls, 80, 360, 4, 0, 9);
    }

    const gameModeText = InGameState.gameModeText[this.gameMode] ?? "";
    Letter.drawString(gameModeText, 3, 400, 5);
  }

  public get replayData(): ReplayData | null {
    return this._replayData;
  }

  public set replayData(v: ReplayData | null) {
    this._replayData = v;
  }
}
