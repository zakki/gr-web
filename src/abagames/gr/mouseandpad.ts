import { Mouse, MouseState } from "../util/sdl/mouse";
import { Pad } from "../util/sdl/pad";
import { InputRecord, NoRecordDataException, type InputState } from "../util/sdl/recordableinput";

export class PadState implements InputState<PadState> {
  public dir = 0;
  public button = 0;

  public cloneFrom(src: PadState): void {
    this.dir = src.dir;
    this.button = src.button;
  }

  public equals(src: PadState): boolean {
    return this.dir === src.dir && this.button === src.button;
  }

  public clear(): void {
    this.dir = 0;
    this.button = 0;
  }
}

export class MouseAndPadState implements InputState<MouseAndPadState> {
  public mouseState = new MouseState();
  public padState = new PadState();

  public cloneFrom(src: MouseAndPadState): void {
    this.mouseState.cloneFrom(src.mouseState);
    this.padState.cloneFrom(src.padState);
  }

  public equals(src: MouseAndPadState): boolean {
    return this.mouseState.equals(src.mouseState) && this.padState.equals(src.padState);
  }

  public clear(): void {
    this.mouseState.clear();
    this.padState.clear();
  }
}

export class RecordableMouseAndPad {
  public inputRecord = new InputRecord<MouseAndPadState>(() => new MouseAndPadState());

  private readonly state = new MouseAndPadState();
  private readonly mouse: Mouse;
  private readonly pad: Pad;

  public constructor(mouse: Mouse, pad: Pad) {
    this.mouse = mouse;
    this.pad = pad;
  }

  public startRecord(): void {
    this.inputRecord.clear();
  }

  public startReplay(record: InputRecord<MouseAndPadState>): void {
    this.inputRecord = record;
    this.inputRecord.reset();
  }

  public replay(): MouseAndPadState {
    if (!this.inputRecord.hasNext()) throw new NoRecordDataException("No record data.");
    return this.inputRecord.next();
  }

  public getState(doRecord = true): MouseAndPadState {
    const mouseState = (this.mouse as unknown as { getState: (doRecord?: boolean) => MouseState }).getState(false);
    this.state.mouseState.cloneFrom(mouseState);
    this.state.padState.dir = this.pad.getDirState();
    this.state.padState.button = this.pad.getButtonState();
    if (doRecord) this.inputRecord.add(this.state);
    return this.state;
  }
}
