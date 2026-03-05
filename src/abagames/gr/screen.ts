/*
 * $Id: screen.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Rand } from "../util/rand";
import { LuminousScreen } from "../util/sdl/luminous";
import { Screen3D } from "../util/sdl/screen3d";

/**
 * Initialize an OpenGL and set the caption.
 * Handle a luminous screen and a viewpoint.
 */
export class Screen extends Screen3D {
  private static readonly CAPTION = "Gunroar";
  private static readonly rand = new Rand();
  private static lineWidthBase = 1;

  private luminousScreen: LuminousScreen | null = null;
  private _luminosity = 0;
  private screenShakeCnt = 0;
  private screenShakeIntense = 0;

  public static setRandSeed(seed: number): void {
    Screen.rand.setSeed(seed);
  }

  protected override init(): void {
    this.setCaption(Screen.CAPTION);
    Screen3D.glLineWidth(1);
    Screen3D.glBlendFunc(Screen3D.GL_SRC_ALPHA, Screen3D.GL_ONE);
    Screen3D.glEnable(Screen3D.GL_BLEND);
    Screen3D.glEnable(Screen3D.GL_LINE_SMOOTH);
    Screen3D.glDisable(Screen3D.GL_TEXTURE_2D);
    Screen3D.glDisable(Screen3D.GL_COLOR_MATERIAL);
    Screen3D.glDisable(Screen3D.GL_CULL_FACE);
    Screen3D.glDisable(Screen3D.GL_DEPTH_TEST);
    Screen3D.glDisable(Screen3D.GL_LIGHTING);
    Screen3D.setClearColor(0, 0, 0, 1);

    if (this._luminosity > 0) {
      this.luminousScreen = new LuminousScreen();
      this.luminousScreen.init(this._luminosity, Screen3D.width, Screen3D.height);
    } else {
      this.luminousScreen = null;
    }
    this.screenResized();
  }

  protected override close(): void {
    this.luminousScreen?.close();
    this.luminousScreen = null;
  }

  public startRenderToLuminousScreen(): boolean {
    if (!this.luminousScreen) {
      return false;
    }
    this.luminousScreen.startRender();
    return true;
  }

  public endRenderToLuminousScreen(): void {
    this.luminousScreen?.endRender();
  }

  public drawLuminous(): void {
    this.luminousScreen?.draw();
  }

  public override resized(width: number, height: number): void {
    this.luminousScreen?.resized(width, height);
    super.resized(width, height);
  }

  public override screenResized(): void {
    super.screenResized();
    let lw = (Screen3D.width / 640 + Screen3D.height / 480) / 2;
    if (lw < 1) {
      lw = 1;
    } else if (lw > 4) {
      lw = 4;
    }
    Screen.lineWidthBase = lw;
    Screen.lineWidth(1);
  }

  public static lineWidth(w: number): void {
    Screen3D.glLineWidth(Screen.lineWidthBase * w);
  }

  public override clear(): void {
    Screen3D.glClear(Screen3D.GL_COLOR_BUFFER_BIT);
  }

  public static viewOrthoFixed(): void {
    Screen3D.glMatrixMode(Screen3D.GL_PROJECTION);
    Screen3D.glPushMatrix();
    Screen3D.glLoadIdentity();
    Screen3D.glOrtho(0, 640, 480, 0, -1, 1);
    Screen3D.glMatrixMode(Screen3D.GL_MODELVIEW);
    Screen3D.glPushMatrix();
    Screen3D.glLoadIdentity();
  }

  public static viewPerspective(): void {
    Screen3D.glMatrixMode(Screen3D.GL_PROJECTION);
    Screen3D.glPopMatrix();
    Screen3D.glMatrixMode(Screen3D.GL_MODELVIEW);
    Screen3D.glPopMatrix();
  }

  public setEyepos(): void {
    let ex = 0;
    let ey = 0;
    let ez = 13.0;
    let lx = 0;
    let ly = 0;
    const lz = 0;

    if (this.screenShakeCnt > 0) {
      const mag = this.screenShakeIntense * (this.screenShakeCnt + 4);
      const mx = Screen.rand.nextSignedFloat(mag);
      const my = Screen.rand.nextSignedFloat(mag);
      ex += mx;
      ey += my;
      lx += mx;
      ly += my;
    }
    Screen3D.gluLookAt(ex, ey, ez, lx, ly, lz, 0, 1, 0);
  }

  public setScreenShake(cnt: number, intense: number): void {
    this.screenShakeCnt = cnt;
    this.screenShakeIntense = intense;
  }

  public move(): void {
    if (this.screenShakeCnt > 0) {
      this.screenShakeCnt--;
    }
  }

  public get luminosity(): number {
    return this._luminosity;
  }

  public set luminosity(v: number) {
    this._luminosity = v;
  }

  public static setColorForced(r: number, g: number, b: number, a = 1): void {
    Screen3D.setColor(r, g, b, a);
  }
}
