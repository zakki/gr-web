export interface InputState<T> {
  cloneFrom(src: T): void;
  equals(src: T): boolean;
}

interface RecordItem<T> {
  series: number;
  data: T;
}

export class NoRecordDataException extends Error {}

export class InputRecord<T extends InputState<T>> {
  private readonly factory: () => T;
  private record: Array<RecordItem<T>> = [];
  private idx = 0;
  private series = 0;
  private replayData: T;

  public constructor(factory: () => T) {
    this.factory = factory;
    this.replayData = factory();
  }

  public clear(): void {
    this.record = [];
  }

  public add(d: T): void {
    const last = this.record[this.record.length - 1];
    if (last && last.data.equals(d)) {
      last.series++;
      return;
    }
    const copy = this.factory();
    copy.cloneFrom(d);
    this.record.push({ series: 1, data: copy });
  }

  public reset(): void {
    this.idx = 0;
    this.series = 0;
  }

  public hasNext(): boolean {
    return this.idx < this.record.length;
  }

  public next(): T {
    if (!this.hasNext()) throw new NoRecordDataException("No more items");
    if (this.series <= 0) this.series = this.record[this.idx].series;
    this.replayData.cloneFrom(this.record[this.idx].data);
    this.series--;
    if (this.series <= 0) this.idx++;
    return this.replayData;
  }
}
