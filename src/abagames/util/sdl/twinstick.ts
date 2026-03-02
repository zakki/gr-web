import { Vector } from "../vector";
import type { Input, SDLEvent } from "./input";
import { InputRecord, NoRecordDataException, type InputState } from "./recordableinput";

const SDL_PRESSED = 1;
const SDLK_d = 68;
const SDLK_a = 65;
const SDLK_s = 83;
const SDLK_w = 87;
const SDLK_l = 76;
const SDLK_j = 74;
const SDLK_k = 75;
const SDLK_i = 73;

export class TwinStickState implements InputState<TwinStickState> {
  public left = new Vector();
  public right = new Vector();

  public cloneFrom(src: TwinStickState): void {
    this.left.x = src.left.x;
    this.left.y = src.left.y;
    this.right.x = src.right.x;
    this.right.y = src.right.y;
  }

  public equals(src: TwinStickState): boolean {
    return (
      this.left.x === src.left.x &&
      this.left.y === src.left.y &&
      this.right.x === src.right.x &&
      this.right.y === src.right.y
    );
  }

  public clear(): void {
    this.left.x = 0;
    this.left.y = 0;
    this.right.x = 0;
    this.right.y = 0;
  }
}

export class TwinStick implements Input {
  public rotate = 0;
  public reverse = 1;
  public enableAxis5 = false;
  public keys: Record<number, number> = {};

  private readonly JOYSTICK_AXIS_MAX = 32768;
  private state = new TwinStickState();
  private stickIndex = -1;
  private listenersBound = false;

  public openJoystick(): void {
    if (typeof window === "undefined") return;
    this.bindListeners();
    this.refreshGamepad();
  }

  public handleEvent(_event: SDLEvent): void {
    this.refreshGamepad();
  }

  public getState(): TwinStickState {
    const gp = this.getActiveGamepad();
    if (gp) {
      this.state.left.x = this.adjustAxis(((gp.axes[0] ?? 0) * this.JOYSTICK_AXIS_MAX) | 0);
      this.state.left.y = -this.adjustAxis(((gp.axes[1] ?? 0) * this.JOYSTICK_AXIS_MAX) | 0);

      const rxIdx = this.enableAxis5 ? 4 : 2;
      let rx = ((gp.axes[rxIdx] ?? 0) * this.JOYSTICK_AXIS_MAX) | 0;
      let ry = ((gp.axes[3] ?? 0) * this.JOYSTICK_AXIS_MAX) | 0;
      if (rx === 0 && ry === 0) {
        this.state.right.x = 0;
        this.state.right.y = 0;
      } else {
        ry = -ry;
        const rd = Math.atan2(rx, ry) * this.reverse + this.rotate;
        const rl = Math.sqrt(rx * rx + ry * ry);
        rx = (Math.sin(rd) * rl) | 0;
        ry = (Math.cos(rd) * rl) | 0;
        this.state.right.x = this.adjustAxis(rx);
        this.state.right.y = this.adjustAxis(ry);
      }
    } else {
      this.state.clear();
    }

    if (this.keys[SDLK_d] === SDL_PRESSED) this.state.left.x = 1;
    if (this.keys[SDLK_l] === SDL_PRESSED) this.state.right.x = 1;
    if (this.keys[SDLK_a] === SDL_PRESSED) this.state.left.x = -1;
    if (this.keys[SDLK_j] === SDL_PRESSED) this.state.right.x = -1;
    if (this.keys[SDLK_s] === SDL_PRESSED) this.state.left.y = -1;
    if (this.keys[SDLK_k] === SDL_PRESSED) this.state.right.y = -1;
    if (this.keys[SDLK_w] === SDL_PRESSED) this.state.left.y = 1;
    if (this.keys[SDLK_i] === SDL_PRESSED) this.state.right.y = 1;

    return this.state;
  }

  public getNullState(): TwinStickState {
    this.state.clear();
    return this.state;
  }

  private adjustAxis(v: number): number {
    const dead = this.JOYSTICK_AXIS_MAX / 3;
    if (v > dead) return Math.min(1, (v - dead) / (this.JOYSTICK_AXIS_MAX - dead));
    if (v < -dead) return Math.max(-1, (v + dead) / (this.JOYSTICK_AXIS_MAX - dead));
    return 0;
  }

  private bindListeners(): void {
    if (this.listenersBound || typeof window === "undefined") return;
    this.listenersBound = true;
    window.addEventListener("keydown", (e) => {
      this.keys[e.keyCode] = SDL_PRESSED;
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.keyCode] = 0;
    });
    window.addEventListener("blur", () => {
      this.keys = {};
    });
    window.addEventListener("gamepadconnected", (e) => {
      if (this.stickIndex < 0) this.stickIndex = e.gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.stickIndex) this.stickIndex = -1;
    });
  }

  private refreshGamepad(): void {
    if (this.stickIndex >= 0) return;
    const pads = this.safeGamepads();
    for (const gp of pads) {
      if (gp) {
        this.stickIndex = gp.index;
        break;
      }
    }
  }

  private getActiveGamepad(): Gamepad | null {
    const pads = this.safeGamepads();
    if (this.stickIndex >= 0) {
      const gp = pads[this.stickIndex] ?? null;
      if (gp) return gp;
      this.stickIndex = -1;
    }
    for (const gp of pads) {
      if (gp) {
        this.stickIndex = gp.index;
        return gp;
      }
    }
    return null;
  }

  private safeGamepads(): ReadonlyArray<Gamepad | null> {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
    return navigator.getGamepads();
  }
}

export class RecordableTwinStick extends TwinStick {
  public inputRecord = new InputRecord<TwinStickState>(() => new TwinStickState());

  public startRecord(): void {
    this.inputRecord.clear();
  }

  public record(d: TwinStickState): void {
    this.inputRecord.add(d);
  }

  public startReplay(pr: InputRecord<TwinStickState>): void {
    this.inputRecord = pr;
    this.inputRecord.reset();
  }

  public replay(): TwinStickState {
    if (!this.inputRecord.hasNext()) throw new NoRecordDataException("No record data.");
    return this.inputRecord.next();
  }

  public getState(doRecord = true): TwinStickState {
    const s = super.getState();
    if (doRecord) this.record(s);
    return s;
  }
}
