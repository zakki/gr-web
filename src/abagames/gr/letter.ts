/*
 * $Id: letter.d,v 1.1.1.1 2005/06/18 00:46:00 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */
// D_MODULE: module abagames.gr.letter;

// D_IMPORT: private import std.math;
// D_IMPORT: private import opengl;
// D_IMPORT: private import abagames.util.sdl.displaylist;
import { DisplayList } from "../util/sdl/displaylist";
// D_IMPORT: private import abagames.gr.screen;
import { Screen3D } from "../util/sdl/screen3d";
import { Screen } from "../util/sdl/screen";

/**
 * Letters.
 */
/*
*/

export class Letter {
  public static displayList: DisplayList;
  public static readonly LETTER_WIDTH = 2.1;
  public static readonly LETTER_HEIGHT = 3.0;
  public static readonly LINE_COLOR = 2;
  public static readonly POLY_COLOR = 3;
  public static readonly COLOR_NUM = 4;
  private static readonly COLOR_RGB: number[][] = [[1, 1, 1], [0.9, 0.7, 0.5]];
  private static readonly LETTER_NUM = 44;
  private static readonly DISPLAY_LIST_NUM = Letter.LETTER_NUM * Letter.COLOR_NUM;

  public static init(): void {
    Letter.displayList = new DisplayList(Letter.DISPLAY_LIST_NUM);
    Letter.displayList.resetList();
    for (let j = 0; j < Letter.COLOR_NUM; j++) {
      for (let i = 0; i < Letter.LETTER_NUM; i++) {
        Letter.displayList.newList();
        Letter.setLetter(i, j);
        Letter.displayList.endList();
      }
    }
  }

  public static close(): void {
    Letter.displayList.close();
  }

  public static getWidth(n: number, s: number): number {
    return n * s * Letter.LETTER_WIDTH;
  }

  public static getHeight(s: number): number {
    return s * Letter.LETTER_HEIGHT;
  }

  public static drawLetter(n: number, c: number): void {
    Letter.displayList.call(n + c * Letter.LETTER_NUM);
  }

  private static drawLetterAt(n: number, x: number, y: number, s: number, d: number, c: number): void {
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(x, y, 0);
    Screen3D.glScalef(s, s, s);
    Screen3D.glRotatef(d, 0, 0, 1);
    Letter.displayList.call(n + c * Letter.LETTER_NUM);
    Screen3D.glPopMatrix();
  }

  private static drawLetterRevAt(n: number, x: number, y: number, s: number, d: number, c: number): void {
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(x, y, 0);
    Screen3D.glScalef(s, -s, s);
    Screen3D.glRotatef(d, 0, 0, 1);
    Letter.displayList.call(n + c * Letter.LETTER_NUM);
    Screen3D.glPopMatrix();
  }

  static readonly Direction = {
    TO_RIGHT: 0,
    TO_DOWN: 1,
    TO_LEFT: 2,
    TO_UP: 3
  } as const;

  public static convertCharToInt(c: string): number {
    const code = c.charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 65 && code <= 90) return code - 65 + 10;
    if (code >= 97 && code <= 122) return code - 97 + 10;
    if (c === ".") return 36;
    if (c === "_") return 37;
    if (c === "-") return 38;
    if (c === "+") return 39;
    if (c === "!") return 42;
    if (c === "/") return 43;
    return 0;
  }

  public static drawString(
    str: string,
    lx: number,
    y: number,
    s: number,
    d: number = Letter.Direction.TO_RIGHT,
    cl = 0,
    rev = false,
    od = 0,
  ): void {
    lx += Letter.LETTER_WIDTH * s / 2;
    y += Letter.LETTER_HEIGHT * s / 2;
    let x: number = lx;
    let ld = 0;
    switch (d) {
    case Letter.Direction.TO_RIGHT:
      ld = 0;
      break;
    case Letter.Direction.TO_DOWN:
      ld = 90;
      break;
    case Letter.Direction.TO_LEFT:
      ld = 180;
      break;
    case Letter.Direction.TO_UP:
      ld = 270;
      break;
    }
    ld += od;
    for (const c of str) {
      if (c !== " ") {
        const idx = Letter.convertCharToInt(c);
        if (rev)
          Letter.drawLetterRevAt(idx, x, y, s, ld, cl);
        else
          Letter.drawLetterAt(idx, x, y, s, ld, cl);
      }
      if (od == 0) {
        switch(d) {
        case Letter.Direction.TO_RIGHT:
          x += s * Letter.LETTER_WIDTH;
          break;
        case Letter.Direction.TO_DOWN:
          y += s * Letter.LETTER_WIDTH;
          break;
        case Letter.Direction.TO_LEFT:
          x -= s * Letter.LETTER_WIDTH;
          break;
        case Letter.Direction.TO_UP:
          y -= s * Letter.LETTER_WIDTH;
          break;
        }
      } else {
        x += Math.cos(ld * Math.PI / 180) * s * Letter.LETTER_WIDTH;
        y += Math.sin(ld * Math.PI / 180) * s * Letter.LETTER_WIDTH;
      }
    }
  }

  public static drawNum(num: number, lx: number, y: number, s: number, cl = 0, dg = 0, headChar = -1, floatDigit = -1): void {
    lx += Letter.LETTER_WIDTH * s / 2;
    y += Letter.LETTER_HEIGHT * s / 2;
    let n: number = num;
    let x: number = lx;
    const ld: number = 0;
    let digit: number = dg;
    let fd: number = floatDigit;
    for (;;) {
      if (fd <= 0) {
        Letter.drawLetterAt(n % 10, x, y, s, ld, cl);
        x -= s * Letter.LETTER_WIDTH;
      } else {
        Letter.drawLetterAt(n % 10, x, y + s * Letter.LETTER_WIDTH * 0.25, s * 0.5, ld, cl);
        x -= s * Letter.LETTER_WIDTH * 0.5;
      }
      n = Math.trunc(n / 10);
      digit--;
      fd--;
      if (n <= 0 && digit <= 0 && fd < 0)
        break;
      if (fd == 0) {
        Letter.drawLetterAt(36, x, y + s * Letter.LETTER_WIDTH * 0.25, s * 0.5, ld, cl);
        x -= s * Letter.LETTER_WIDTH * 0.5;
      }
    }
    if (headChar >= 0)
      Letter.drawLetterAt(headChar, x + s * Letter.LETTER_WIDTH * 0.2, y + s * Letter.LETTER_WIDTH * 0.2,
                 s * 0.6, ld, cl);
  }

  public static drawNumSign(num: number, lx: number, ly: number, s: number, cl = 0, headChar = -1, floatDigit = -1): void {
    let x: number = lx;
    let y: number = ly;
    let n: number = num;
    let fd: number = floatDigit;
    for (;;) {
      if (fd <= 0) {
        Letter.drawLetterRevAt(n % 10, x, y, s, 0, cl);
        x -= s * Letter.LETTER_WIDTH;
      } else {
        Letter.drawLetterRevAt(n % 10, x, y - s * Letter.LETTER_WIDTH * 0.25, s * 0.5, 0, cl);
        x -= s * Letter.LETTER_WIDTH * 0.5;
      }
      n = Math.trunc(n / 10);
      if (n <= 0)
        break;
      fd--;
      if (fd == 0) {
        Letter.drawLetterRevAt(36, x, y - s * Letter.LETTER_WIDTH * 0.25, s * 0.5, 0, cl);
        x -= s * Letter.LETTER_WIDTH * 0.5;
      }
    }
    if (headChar >= 0)
      Letter.drawLetterRevAt(headChar, x + s * Letter.LETTER_WIDTH * 0.2, y - s * Letter.LETTER_WIDTH * 0.2,
                    s * 0.6, 0, cl);
  }

  public static drawTime(time: number, lx: number, y: number, s: number, cl = 0): void {
    let n: number = time;
    if (n < 0)
      n = 0;
    let x: number = lx;
    for (let i = 0; i < 7; i++) {
      if (i != 4) {
        Letter.drawLetterAt(n % 10, x, y, s, Letter.Direction.TO_RIGHT, cl);
        n = Math.trunc(n / 10);
      } else {
        Letter.drawLetterAt(n % 6, x, y, s, Letter.Direction.TO_RIGHT, cl);
        n = Math.trunc(n / 6);
      }
      if ((i & 1) == 1 || i == 0) {
        switch (i) {
        case 3:
          Letter.drawLetterAt(41, x + s * 1.16, y, s, Letter.Direction.TO_RIGHT, cl);
          break;
        case 5:
          Letter.drawLetterAt(40, x + s * 1.16, y, s, Letter.Direction.TO_RIGHT, cl);
          break;
        default:
          break;
        }
        x -= s * Letter.LETTER_WIDTH;
      } else {
        x -= s * Letter.LETTER_WIDTH * 1.3;
      }
      if (n <= 0)
        break;
    }
  }

  private static setLetter(idx: number, c: number): void {
    let x: number;
    let y: number;
    let length: number;
    let size: number;
    let deg: number;
    for (let i = 0;; i++) {
      deg = Math.trunc(Letter.spData[idx][i][4]);
      if (deg > 99990) break;
      x = -Letter.spData[idx][i][0];
      y = -Letter.spData[idx][i][1];
      size = Letter.spData[idx][i][2];
      length = Letter.spData[idx][i][3];
      y *= 0.9;
      size *= 1.4;
      length *= 1.05;
      x = -x;
      y = y;
      deg %= 180;
      if (c == Letter.LINE_COLOR)
        Letter.setBoxLine(x, y, size, length, deg);
      else if (c == Letter.POLY_COLOR)
        Letter.setBoxPoly(x, y, size, length, deg);
      else
        Letter.setBox(x, y, size, length, deg,
                Letter.COLOR_RGB[c][0], Letter.COLOR_RGB[c][1], Letter.COLOR_RGB[c][2]);
    }
  }

  private static setBox(x: number, y: number, width: number, height: number, deg: number, r: number, g: number, b: number): void {
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(x - width / 2, y - height / 2, 0);
    Screen3D.glRotatef(deg, 0, 0, 1);
    Screen3D.setColor(r, g, b, 0.5);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Letter.setBoxPart(width, height);
    Screen3D.glEnd();
    Screen3D.setColor(r, g, b);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    Letter.setBoxPart(width, height);
    Screen3D.glEnd();
    Screen3D.glPopMatrix();
  }

  private static setBoxLine(x: number, y: number, width: number, height: number, deg: number): void {
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(x - width / 2, y - height / 2, 0);
    Screen3D.glRotatef(deg, 0, 0, 1);
    Screen3D.glBegin(Screen3D.GL_LINE_LOOP);
    Letter.setBoxPart(width, height);
    Screen3D.glEnd();
    Screen3D.glPopMatrix();
  }

  private static setBoxPoly(x: number, y: number, width: number, height: number, deg: number): void {
    Screen3D.glPushMatrix();
    Screen3D.glTranslatef(x - width / 2, y - height / 2, 0);
    Screen3D.glRotatef(deg, 0, 0, 1);
    Screen3D.glBegin(Screen3D.GL_TRIANGLE_FAN);
    Letter.setBoxPart(width, height);
    Screen3D.glEnd();
    Screen3D.glPopMatrix();
  }

  private static setBoxPart(width: number, height: number): void {
    Screen3D.glVertexXYZ(-width / 2, 0, 0);
    Screen3D.glVertexXYZ(-width / 3 * 1, -height / 2, 0);
    Screen3D.glVertexXYZ( width / 3 * 1, -height / 2, 0);
    Screen3D.glVertexXYZ( width / 2, 0, 0);
    Screen3D.glVertexXYZ( width / 3 * 1,  height / 2, 0);
    Screen3D.glVertexXYZ(-width / 3 * 1,  height / 2, 0);
  }
  
  private static spData: number[][][] =
    [[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.6, 0.55, 0.65, 0.3, 90], [0.6, 0.55, 0.65, 0.3, 90],
     [-0.6, -0.55, 0.65, 0.3, 90], [0.6, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0.5, 0.55, 0.65, 0.3, 90],
     [0.5, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [0.65, 0.55, 0.65, 0.3, 90],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//A
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.18, 1.15, 0.45, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.45, 0.55, 0.65, 0.3, 90],
     [-0.18, 0, 0.45, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.15, 1.15, 0.45, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.45, 0.45, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//F
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0.05, 0, 0.3, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 0.55, 0.65, 0.3, 90],
     [0, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0.65, 0.55, 0.65, 0.3, 90],
     [0.65, -0.55, 0.65, 0.3, 90], [-0.7, -0.7, 0.3, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//K
     [-0.65, 0.55, 0.65, 0.3, 90], [0.4, 0.55, 0.65, 0.3, 100],
     [-0.25, 0, 0.45, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.6, -0.55, 0.65, 0.3, 80],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.5, 1.15, 0.3, 0.3, 0], [0.1, 1.15, 0.3, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0.55, 0.65, 0.3, 90],
     [0, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//P
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0.05, -0.55, 0.45, 0.3, 60],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.2, 0, 0.45, 0.3, 0],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.45, -0.55, 0.65, 0.3, 80],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [-0.65, 0.55, 0.65, 0.3, 90],
     [0, 0, 0.65, 0.3, 0],
     [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.5, 1.15, 0.55, 0.3, 0], [0.5, 1.15, 0.55, 0.3, 0],
     [0.1, 0.55, 0.65, 0.3, 90],
     [0.1, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[//U
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.5, -0.55, 0.65, 0.3, 90], [0.5, -0.55, 0.65, 0.3, 90],
     [-0.1, -1.15, 0.45, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.65, 0.55, 0.65, 0.3, 90], [0.65, 0.55, 0.65, 0.3, 90],
     [-0.65, -0.55, 0.65, 0.3, 90], [0.65, -0.55, 0.65, 0.3, 90],
     [-0.5, -1.15, 0.3, 0.3, 0], [0.1, -1.15, 0.3, 0.3, 0],
     [0, 0.55, 0.65, 0.3, 90],
     [0, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.4, 0.6, 0.85, 0.3, 360-120],
     [0.4, 0.6, 0.85, 0.3, 360-60],
     [-0.4, -0.6, 0.85, 0.3, 360-240],
     [0.4, -0.6, 0.85, 0.3, 360-300],
     [0, 0, 0, 0, 99999],
    ],[
     [-0.4, 0.6, 0.85, 0.3, 360-120],
     [0.4, 0.6, 0.85, 0.3, 360-60],
     [-0.1, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[
     [0, 1.15, 0.65, 0.3, 0],
     [0.3, 0.4, 0.65, 0.3, 120],
     [-0.3, -0.4, 0.65, 0.3, 120],
     [0, -1.15, 0.65, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//.
     [0, -1.15, 0.3, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//_
     [0, -1.15, 0.8, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//-
     [0, 0, 0.9, 0.3, 0],
     [0, 0, 0, 0, 99999],
    ],[//+
     [-0.5, 0, 0.45, 0.3, 0], [0.45, 0, 0.45, 0.3, 0],
     [0.1, 0.55, 0.65, 0.3, 90],
     [0.1, -0.55, 0.65, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[//'
     [0, 1.0, 0.4, 0.2, 90],
     [0, 0, 0, 0, 99999],
    ],[//''
     [-0.19, 1.0, 0.4, 0.2, 90],
     [0.2, 1.0, 0.4, 0.2, 90],
     [0, 0, 0, 0, 99999],
    ],[//!
     [0.56, 0.25, 1.1, 0.3, 90],
     [0, -1.0, 0.3, 0.3, 90],
     [0, 0, 0, 0, 99999],
    ],[// /
     [0.8, 0, 1.75, 0.3, 120],
     [0, 0, 0, 0, 99999],
    ]];
}

Letter.init();
