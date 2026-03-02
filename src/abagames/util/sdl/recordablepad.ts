/*
 * $Id: recordablepad.d,v 1.1 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { Pad } from "./pad";

/**
 * Pad that can record an input for a replay.
 */
export class RecordablePad extends Pad {
  public static readonly REPLAY_END = -1;
  public padRecord!: PadRecord;

  public startRecord(): void {
    this.padRecord = new PadRecord();
    this.padRecord.clear();
  }

  public record(): void {
    this.padRecord.add(this.lastDirState | this.lastButtonState);
  }

  public startReplay(pr: PadRecord): void {
    this.padRecord = pr;
    this.padRecord.reset();
  }

  public replay(): number {
    if (!this.padRecord.hasNext()) return RecordablePad.REPLAY_END;
    return this.padRecord.next();
  }
}

interface RecordItem {
  series: number;
  data: number;
}

export interface PadRecordFile {
  // Stream-like adapter used by save/load. File/Storage implementation is provided by caller.
  write(value: number): void;
  read(): number;
}

export class PadRecord {
  private record: RecordItem[] = [];
  private idx = 0;
  private series = 0;

  public clear(): void {
    this.record = [];
  }

  public add(d: number): void {
    if (this.record.length > 0 && this.record[this.record.length - 1].data === d) {
      this.record[this.record.length - 1].series++;
    } else {
      this.record.push({ series: 1, data: d });
    }
  }

  public reset(): void {
    this.idx = 0;
    this.series = 0;
  }

  public hasNext(): boolean {
    if (this.idx >= this.record.length) return false;
    return true;
  }

  public next(): number {
    if (this.idx >= this.record.length) throw new Error("No more items");
    if (this.series <= 0) this.series = this.record[this.idx].series;
    const rsl = this.record[this.idx].data;
    this.series--;
    if (this.series <= 0) this.idx++;
    return rsl;
  }

  public save(fd: PadRecordFile): void {
    fd.write(this.record.length);
    for (const r of this.record) {
      fd.write(r.series);
      fd.write(r.data);
    }
  }

  public load(fd: PadRecordFile): void {
    this.clear();
    const l = fd.read();
    for (let i = 0; i < l; i++) {
      const s = fd.read();
      const d = fd.read();
      this.record.push({ series: s, data: d });
    }
  }

  public toJSON(): RecordItem[] {
    return this.record.map((r) => ({ series: r.series, data: r.data }));
  }

  public fromJSON(items: Array<{ series: number; data: number }>): void {
    this.record = items.map((it) => ({
      series: Math.max(1, it.series | 0),
      data: it.data | 0,
    }));
    this.reset();
  }
}
