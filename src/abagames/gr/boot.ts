/*
 * $Id: boot.d,v 1.6 2006/03/18 02:42:09 kenta Exp $
 *
 * Copyright 2005 Kenta Cho. Some rights reserved.
 */

import { Logger } from "../util/logger";
import { MainLoop } from "../util/sdl/mainloop";
import { MultipleInputDevice } from "../util/sdl/input";
import { RecordablePad } from "../util/sdl/recordablepad";
import { RecordableTwinStick } from "../util/sdl/twinstick";
import type { GameManager as SDLGameManager } from "../util/sdl/gamemanager";
import { SoundManager } from "../util/sdl/sound";
import { Screen3D } from "../util/sdl/screen3d";
import { Screen } from "./screen";
import { GameManager } from "./gamemanager";
import { PrefManager } from "./prefmanager";
import { RecordableMouse } from "./mouse";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

type RuntimeObjects = {
  screen: Screen;
  input: MultipleInputDevice;
  pad: RecordablePad;
  twinStick: RecordableTwinStick;
  mouse: RecordableMouse;
  gameManager: GameManager;
  prefManager: PrefManager;
  mainLoop: MainLoop;
};

export function main(args: string[]): number {
  return boot(args);
}

export function boot(argsLike: unknown): number {
  const args = normalizeArgs(argsLike);
  const runtime = createRuntime();
  try {
    parseArgs(args, runtime);
  } catch (e) {
    Logger.error(String(e));
    return EXIT_FAILURE;
  }
  try {
    runtime.mainLoop.loop();
  } catch (e) {
    Logger.info(String(e));
    try {
      runtime.gameManager.saveErrorReplay();
    } catch {
      // ignore
    }
    throw e;
  }
  return EXIT_SUCCESS;
}

function createRuntime(): RuntimeObjects {
  const screen = new Screen();
  const input = new MultipleInputDevice();
  const pad = new RecordablePad();
  const twinStick = new RecordableTwinStick();
  const mouse = new RecordableMouse({
    get width() {
      return Screen3D.width;
    },
    get height() {
      return Screen3D.height;
    },
  });
  input.inputs.push(pad, twinStick, mouse);
  const gameManager = new GameManager();
  const prefManager = new PrefManager();
  const mainLoop = new MainLoop(screen, input, gameManager as unknown as SDLGameManager, prefManager);
  return { screen, input, pad, twinStick, mouse, gameManager, prefManager, mainLoop };
}

function normalizeArgs(argsLike: unknown): string[] {
  if (Array.isArray(argsLike)) {
    const out: string[] = [];
    for (const v of argsLike) {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) {
        for (const vv of v) if (typeof vv === "string") out.push(vv);
      }
    }
    if (out.length > 0) return out;
  }
  return ["gr-web"];
}

function parseArgs(args: string[], runtime: RuntimeObjects): void {
  const { screen, pad, twinStick, gameManager, mainLoop } = runtime;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-brightness": {
        const b = parsePercent(args, ++i, a);
        Screen3D.brightness = b;
        break;
      }
      case "-luminosity":
      case "-luminous": {
        const l = parsePercent(args, ++i, a);
        screen.luminosity = l;
        break;
      }
      case "-window":
        Screen3D.windowMode = true;
        break;
      case "-res": {
        if (i >= args.length - 2) throw new Error("Invalid -res option");
        const w = parseIntArg(args[++i], 640);
        const h = parseIntArg(args[++i], 480);
        Screen3D.width = Math.max(1, w);
        Screen3D.height = Math.max(1, h);
        break;
      }
      case "-nosound":
        SoundManager.noSound = true;
        break;
      case "-exchange":
        pad.buttonReversed = true;
        break;
      case "-nowait":
        mainLoop.nowait = true;
        break;
      case "-accframe":
        mainLoop.accframe = 1;
        break;
      case "-turnspeed": {
        if (i >= args.length - 1) throw new Error("Invalid -turnspeed option");
        const s = parseIntArg(args[++i], 100) / 100;
        if (s < 0 || s > 5) throw new Error("Invalid -turnspeed range");
        GameManager.shipTurnSpeed = s;
        break;
      }
      case "-firerear":
        GameManager.shipReverseFire = true;
        break;
      case "-rotatestick2":
      case "-rotaterightstick": {
        if (i >= args.length - 1) throw new Error(`Invalid ${a} option`);
        const deg = parseIntArg(args[++i], 0);
        twinStick.rotate = (deg * Math.PI) / 180.0;
        break;
      }
      case "-reversestick2":
      case "-reverserightstick":
        twinStick.reverse = -1;
        break;
      case "-enableaxis5":
        twinStick.enableAxis5 = true;
        break;
      default:
        usage(args[0] ?? "gr-web");
        throw new Error(`Invalid option: ${a}`);
    }
  }
  void gameManager;
}

function parsePercent(args: string[], index: number, opt: string): number {
  if (index >= args.length) throw new Error(`Invalid ${opt} option`);
  const v = parseIntArg(args[index], 100) / 100;
  if (v < 0 || v > 1) throw new Error(`Invalid ${opt} range`);
  return v;
}

function parseIntArg(v: string, fallback: number): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function usage(progName: string): void {
  Logger.error(
    `Usage: ${progName} [-window] [-res x y] [-brightness [0-100]] [-luminosity [0-100]] [-nosound] [-exchange] ` +
      "[-turnspeed [0-500]] [-firerear] [-rotatestick2 deg] [-reversestick2] [-enableaxis5] [-nowait]",
  );
}
