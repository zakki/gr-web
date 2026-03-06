/*
 * $Id: title.d,v 1.4 2005/09/11 00:47:40 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Screen3D } from "../util/sdl/screen3d";
import { DisplayList } from "../util/sdl/displaylist";
import { Texture } from "../util/sdl/texture";
import { MouseState } from "../util/sdl/mouse";
import { Pad } from "../util/sdl/pad";
import { RecordablePad } from "../util/sdl/recordablepad";
import { Field } from "./field";
import { GameManager, InGameState } from "./gamemanager";
import { ReplayData } from "./replay";
import { SoundManager } from "./soundmanager";
import { Screen } from "./screen";
import { Letter } from "./letter";
import { PrefManager } from "./prefmanager";
import { RecordableMouse } from "./mouse";


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
    this.logo?.deleteTexture();
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

    const input = {
      button: this.pad.getButtonState(),
      dir: this.pad.getDirState(),
    };
    const mouseInput = this.mouse.getState(false);

    if (this.btnPressedCnt <= 0) {
      const startPressed =
        (input.button & Pad.Button.A) !== 0 ||
        (this.gameMode === InGameState.GameMode.MOUSE && (mouseInput.button & MouseState.Button.LEFT) !== 0);
      if (startPressed && this.gameMode >= 0) {
        this.gameManager.startInGame(this.gameMode);
      }

      let gmc = 0;
      if ((input.button & Pad.Button.B) !== 0 || (input.dir & Pad.Dir.DOWN) !== 0) {
        gmc = 1;
      } else if ((input.dir & Pad.Dir.UP) !== 0) {
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
      (input.button & (Pad.Button.A | Pad.Button.B)) !== 0 ||
      (input.dir & (Pad.Dir.UP | Pad.Dir.DOWN)) !== 0 ||
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
    // In WebGL display-list emulation, Texture.bind() is not captured in the list.
    // Re-bind here so the logo quad always has the current texture bound.
    this.logo?.bind();
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
