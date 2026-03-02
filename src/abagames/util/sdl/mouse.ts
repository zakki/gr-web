import type { Input, SDLEvent } from "./input";
import { InputRecord, NoRecordDataException, type InputState } from "./recordableinput";

const SDL_PRESSED = 1;

export class MouseState implements InputState<MouseState> {
  public static readonly Button = {
    LEFT: 1,
    RIGHT: 2,
  } as const;

  public x = 0;
  public y = 0;
  public button = 0;

  public cloneFrom(src: MouseState): void {
    this.x = src.x;
    this.y = src.y;
    this.button = src.button;
  }

  public equals(src: MouseState): boolean {
    return this.x === src.x && this.y === src.y && this.button === src.button;
  }

  public clear(): void {
    this.button = 0;
  }
}

export class Mouse implements Input {
  protected state = new MouseState();
  private listenersBound = false;
  private buttonMask = 0;

  public init(): void {
    this.bindListeners();
  }

  public handleEvent(_event: SDLEvent): void {}

  public getState(): MouseState {
    this.state.button = this.buttonMask;
    this.adjustPos(this.state);
    return this.state;
  }

  public getNullState(): MouseState {
    this.state.clear();
    return this.state;
  }

  protected adjustPos(_state: MouseState): void {}

  private bindListeners(): void {
    if (this.listenersBound || typeof window === "undefined") return;
    this.listenersBound = true;

    window.addEventListener("mousemove", (e) => {
      this.state.x = e.clientX;
      this.state.y = e.clientY;
    });
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.buttonMask |= MouseState.Button.LEFT;
      if (e.button === 2) this.buttonMask |= MouseState.Button.RIGHT;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.buttonMask &= ~MouseState.Button.LEFT;
      if (e.button === 2) this.buttonMask &= ~MouseState.Button.RIGHT;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => {
      this.buttonMask = 0;
      this.state.button = 0;
    });

    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.state.x = e.clientX;
      this.state.y = e.clientY;
      this.buttonMask = MouseState.Button.LEFT;
      this.state.button = SDL_PRESSED;
    });
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      this.state.x = e.clientX;
      this.state.y = e.clientY;
    });
    const releaseTouch = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      this.buttonMask = 0;
      this.state.button = 0;
    };
    window.addEventListener("pointerup", releaseTouch);
    window.addEventListener("pointercancel", releaseTouch);
  }
}

export class RecordableMouse extends Mouse {
  public inputRecord = new InputRecord<MouseState>(() => new MouseState());

  public startRecord(): void {
    this.inputRecord.clear();
  }

  public record(d: MouseState): void {
    this.inputRecord.add(d);
  }

  public startReplay(pr: InputRecord<MouseState>): void {
    this.inputRecord = pr;
    this.inputRecord.reset();
  }

  public replay(): MouseState {
    if (!this.inputRecord.hasNext()) throw new NoRecordDataException("No record data.");
    return this.inputRecord.next();
  }

  public getState(doRecord = true): MouseState {
    const s = super.getState();
    if (doRecord) this.record(s);
    return s;
  }
}
