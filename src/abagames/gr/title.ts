/*
 * $Id: title.d,v 1.4 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Screen3D } from "../util/sdl/screen3d";

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
    Screen3D.glEnable(Screen3D.GL_TEXTURE_2D);
    this.logo.bind();
    Screen.setColor(1, 1, 1);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen3D.glTexCoord2f(0, 0);
    Screen3D.glVertex3f(0, -63, 0);
    Screen3D.glTexCoord2f(1, 0);
    Screen3D.glVertex3f(255, -63, 0);
    Screen3D.glTexCoord2f(1, 1);
    Screen3D.glVertex3f(255, 0, 0);
    Screen3D.glTexCoord2f(0, 1);
    Screen3D.glVertex3f(0, 0, 0);
    Screen3D.glEnd();

    Screen.lineWidth(3);
    Screen3D.glDisable(Screen3D.GL_TEXTURE_2D);
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(-80, -7, 0);
    Screen3D.glVertex3f(-20, -7, 0);
    Screen3D.glVertex3f(10, -70, 0);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_LINE_STRIP);
    Screen3D.glVertex3f(45, -2, 0);
    Screen3D.glVertex3f(-15, -2, 0);
    Screen3D.glVertex3f(-45, 61, 0);
    Screen3D.glEnd();

    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen.setColor(1, 1, 1);
    Screen3D.glVertex3f(-19, -6, 0);
    Screen.setColor(0, 0, 0);
    Screen3D.glVertex3f(-79, -6, 0);
    Screen3D.glVertex3f(11, -69, 0);
    Screen3D.glEnd();
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Screen.setColor(1, 1, 1);
    Screen3D.glVertex3f(-16, -3, 0);
    Screen.setColor(0, 0, 0);
    Screen3D.glVertex3f(44, -3, 0);
    Screen3D.glVertex3f(-46, 60, 0);
    Screen3D.glEnd();
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
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(80 * ts, 240, 0);
    Screen3D.glScalef(ts, ts, 0);
    this.displayList?.call(0);
    Screen3D.glPopMatrix();

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
