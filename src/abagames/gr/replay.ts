import { InputRecord, type InputState } from "../util/sdl/recordableinput";
import { TwinStickState } from "../util/sdl/twinstick";
import { MouseAndPadState, PadState } from "./mouseandpad";

type SerializedPadState = {
  dir: number;
  button: number;
};

type SerializedTwinStickState = {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
};

type SerializedMouseAndPadState = {
  mx: number;
  my: number;
  mb: number;
  pd: number;
  pb: number;
};

type SerializedItem<T> = {
  series: number;
  data: T;
};

type SerializedReplayData = {
  version: number;
  seed: number;
  score: number;
  shipTurnSpeed: number;
  shipReverseFire: boolean;
  gameMode: number;
  padInputRecord?: SerializedItem<SerializedPadState>[];
  twinStickInputRecord?: SerializedItem<SerializedTwinStickState>[];
  mouseAndPadInputRecord?: SerializedItem<SerializedMouseAndPadState>[];
};

/**
 * Save/Load replay data for web runtime.
 */
export class ReplayData {
  public static readonly dir = "replay";
  public static readonly VERSION_NUM = 11;

  public padInputRecord!: InputRecord<PadState>;
  public twinStickInputRecord!: InputRecord<TwinStickState>;
  public mouseAndPadInputRecord!: InputRecord<MouseAndPadState>;
  public seed = 0;
  public score = 0;
  public shipTurnSpeed = 1;
  public shipReverseFire = false;
  public gameMode = 0;

  public save(fileName: string | string[]): void {
    const key = this.storageKey(fileName);
    const payload: SerializedReplayData = {
      version: ReplayData.VERSION_NUM,
      seed: this.seed,
      score: this.score,
      shipTurnSpeed: this.shipTurnSpeed,
      shipReverseFire: this.shipReverseFire,
      gameMode: this.gameMode,
    };
    if (this.gameMode === 0 && this.padInputRecord) {
      payload.padInputRecord = serializeInputRecord(this.padInputRecord, serializePadState);
    } else if ((this.gameMode === 1 || this.gameMode === 2) && this.twinStickInputRecord) {
      payload.twinStickInputRecord = serializeInputRecord(this.twinStickInputRecord, serializeTwinStickState);
    } else if (this.gameMode === 3 && this.mouseAndPadInputRecord) {
      payload.mouseAndPadInputRecord = serializeInputRecord(this.mouseAndPadInputRecord, serializeMouseAndPadState);
    }
    if (typeof localStorage === "undefined") throw new Error("localStorage is not available");
    localStorage.setItem(key, JSON.stringify(payload));
  }

  public load(fileName: string | string[]): void {
    const key = this.storageKey(fileName);
    if (typeof localStorage === "undefined") throw new Error("localStorage is not available");
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error(`Replay not found: ${key}`);
    const data = JSON.parse(raw) as SerializedReplayData;
    if (data.version !== ReplayData.VERSION_NUM) throw new Error("Wrong version num");

    this.seed = data.seed;
    this.score = data.score;
    this.shipTurnSpeed = data.shipTurnSpeed;
    this.shipReverseFire = data.shipReverseFire;
    this.gameMode = data.gameMode;

    if (this.gameMode === 0 && data.padInputRecord) {
      this.padInputRecord = deserializeInputRecord(
        () => new PadState(),
        data.padInputRecord,
        deserializePadState,
      );
    } else if ((this.gameMode === 1 || this.gameMode === 2) && data.twinStickInputRecord) {
      this.twinStickInputRecord = deserializeInputRecord(
        () => new TwinStickState(),
        data.twinStickInputRecord,
        deserializeTwinStickState,
      );
    } else if (this.gameMode === 3 && data.mouseAndPadInputRecord) {
      this.mouseAndPadInputRecord = deserializeInputRecord(
        () => new MouseAndPadState(),
        data.mouseAndPadInputRecord,
        deserializeMouseAndPadState,
      );
    }
  }

  private storageKey(fileName: string | string[]): string {
    const file = Array.isArray(fileName) ? fileName.join("") : fileName;
    return `${ReplayData.dir}/${file}`;
  }
}

function serializeInputRecord<T extends InputState<T>, S>(
  record: InputRecord<T>,
  serializeData: (src: T) => S,
): SerializedItem<S>[] {
  const raw = ((record as unknown as { record?: Array<{ series: number; data: T }> }).record ?? []);
  return raw.map((it) => ({
    series: Math.max(1, it.series | 0),
    data: serializeData(it.data),
  }));
}

function deserializeInputRecord<T extends InputState<T>, S>(
  factory: () => T,
  items: SerializedItem<S>[],
  deserializeData: (src: S) => T,
): InputRecord<T> {
  const record = new InputRecord<T>(factory);
  record.clear();
  for (const it of items) {
    const series = Math.max(1, it.series | 0);
    for (let i = 0; i < series; i++) {
      record.add(deserializeData(it.data));
    }
  }
  record.reset();
  return record;
}

function serializePadState(src: PadState): SerializedPadState {
  return { dir: src.dir, button: src.button };
}

function deserializePadState(src: SerializedPadState): PadState {
  const s = new PadState();
  s.dir = src.dir;
  s.button = src.button;
  return s;
}

function serializeTwinStickState(src: TwinStickState): SerializedTwinStickState {
  return {
    lx: src.left.x,
    ly: src.left.y,
    rx: src.right.x,
    ry: src.right.y,
  };
}

function deserializeTwinStickState(src: SerializedTwinStickState): TwinStickState {
  const s = new TwinStickState();
  s.left.x = src.lx;
  s.left.y = src.ly;
  s.right.x = src.rx;
  s.right.y = src.ry;
  return s;
}

function serializeMouseAndPadState(src: MouseAndPadState): SerializedMouseAndPadState {
  return {
    mx: src.mouseState.x,
    my: src.mouseState.y,
    mb: src.mouseState.button,
    pd: src.padState.dir,
    pb: src.padState.button,
  };
}

function deserializeMouseAndPadState(src: SerializedMouseAndPadState): MouseAndPadState {
  const s = new MouseAndPadState();
  s.mouseState.x = src.mx;
  s.mouseState.y = src.my;
  s.mouseState.button = src.mb;
  s.padState.dir = src.pd;
  s.padState.button = src.pb;
  return s;
}
