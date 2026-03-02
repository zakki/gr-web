import { Logger } from "../util/logger";
import { MainLoop } from "../util/sdl/mainloop";
import { MultipleInputDevice } from "../util/sdl/input";
import { RecordablePad } from "../util/sdl/recordablepad";
import { Screen3D } from "../util/sdl/screen3d";
import { SoundManager } from "../util/sdl/sound";
import { RecordableTwinStick } from "../util/sdl/twinstick";
import { GrGameManager } from "./gamemanager";
import { GrRecordableMouse } from "./mouse";
import { GrPrefManager } from "./prefmanager";
import { GrScreen } from "./screen";

let screen: GrScreen | null = null;
let input: MultipleInputDevice | null = null;
let pad: RecordablePad | null = null;
let twinStick: RecordableTwinStick | null = null;
let mouse: GrRecordableMouse | null = null;
let gameManager: GrGameManager | null = null;
let prefManager: GrPrefManager | null = null;
let mainLoop: MainLoop | null = null;

export function boot(args: string[]): number {
  screen = new GrScreen();
  input = new MultipleInputDevice();
  pad = new RecordablePad();
  twinStick = new RecordableTwinStick();
  mouse = new GrRecordableMouse(screen);
  input.inputs.push(pad, twinStick, mouse);
  try {
    pad.openJoystick();
  } catch {
    // optional in browser environments
  }
  try {
    twinStick.openJoystick();
  } catch {
    // optional in browser environments
  }
  mouse.init();

  gameManager = new GrGameManager();
  prefManager = new GrPrefManager();
  mainLoop = new MainLoop(screen, input, gameManager, prefManager);

  try {
    parseArgs(args);
  } catch {
    return 1;
  }

  try {
    mainLoop.loop();
  } catch (e) {
    Logger.info(String(e));
    gameManager.saveErrorReplay();
    throw e;
  }
  return 0;
}

function parseArgs(commandArgs: string[]): void {
  const progName = commandArgs[0] ?? "gr-web";
  for (let i = 1; i < commandArgs.length; i++) {
    switch (commandArgs[i]) {
      case "-brightness": {
        if (i >= commandArgs.length - 1) throwInvalidOptions(progName);
        i++;
        const b = Number.parseInt(commandArgs[i], 10) / 100;
        if (!(b >= 0 && b <= 1)) throwInvalidOptions(progName);
        Screen3D.brightness = b;
        break;
      }
      case "-luminosity":
      case "-luminous": {
        if (i >= commandArgs.length - 1) throwInvalidOptions(progName);
        i++;
        const l = Number.parseInt(commandArgs[i], 10) / 100;
        if (!(l >= 0 && l <= 1)) throwInvalidOptions(progName);
        if (screen) screen.luminosity = l;
        break;
      }
      case "-window":
        Screen3D.windowMode = true;
        break;
      case "-res": {
        if (i >= commandArgs.length - 2) throwInvalidOptions(progName);
        i++;
        Screen3D.width = Number.parseInt(commandArgs[i], 10);
        i++;
        Screen3D.height = Number.parseInt(commandArgs[i], 10);
        break;
      }
      case "-nosound":
        SoundManager.noSound = true;
        break;
      case "-exchange":
        if (pad) pad.buttonReversed = true;
        break;
      case "-nowait":
        if (mainLoop) mainLoop.nowait = true;
        break;
      case "-accframe":
        if (mainLoop) mainLoop.accframe = 1;
        break;
      case "-turnspeed": {
        if (i >= commandArgs.length - 1) throwInvalidOptions(progName);
        i++;
        const s = Number.parseInt(commandArgs[i], 10) / 100;
        if (!(s >= 0 && s <= 5)) throwInvalidOptions(progName);
        GrGameManager.shipTurnSpeed = s;
        break;
      }
      case "-firerear":
        GrGameManager.shipReverseFire = true;
        break;
      case "-rotatestick2":
      case "-rotaterightstick": {
        if (i >= commandArgs.length - 1) throwInvalidOptions(progName);
        i++;
        if (twinStick) twinStick.rotate = (Number.parseInt(commandArgs[i], 10) * Math.PI) / 180;
        break;
      }
      case "-reversestick2":
      case "-reverserightstick":
        if (twinStick) twinStick.reverse = -1;
        break;
      case "-enableaxis5":
        if (twinStick) twinStick.enableAxis5 = true;
        break;
      default:
        throwInvalidOptions(progName);
    }
  }
}

function usage(progName: string): void {
  Logger.error(
    `Usage: ${progName} [-window] [-res x y] [-brightness [0-100]] [-luminosity [0-100]] [-nosound] [-exchange] [-turnspeed [0-500]] [-firerear] [-rotatestick2 deg] [-reversestick2] [-enableaxis5] [-nowait]`,
  );
}

function throwInvalidOptions(progName: string): never {
  usage(progName);
  throw new Error("Invalid options");
}
