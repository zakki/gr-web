/*
 * $Id: displaylist.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { SDLException } from "./sdlexception";
import { Screen3D } from "./screen3d";

export type DisplayListCommand = () => void;

/**
 * Manage the display list.
 */
export class DisplayList {
  private readonly num: number;
  private idx: number;
  private enumIdx: number;
  private lists: Array<DisplayListCommand | null>;
  private draft: DisplayListCommand | null = null;

  public constructor(num: number) {
    this.num = num;
    this.idx = 0;
    this.enumIdx = this.idx;
    this.lists = Array.from({ length: num }, () => null);
  }

  public beginNewList(): void {
    this.resetList();
    this.newList();
  }

  public nextNewList(): void {
    this.endList();
    if (this.enumIdx >= this.idx + this.num || this.enumIdx < this.idx) {
      throw new SDLException("Can't create new list. Index out of bound.");
    }
    this.newList();
  }

  public endNewList(): void {
    this.endList();
  }

  public resetList(): void {
    this.enumIdx = this.idx;
  }

  public newList(): void {
    this.draft = null;
    Screen3D.beginDisplayListCapture((commands) => {
      this.setCurrentCommands(commands);
    });
  }

  public endList(): void {
    Screen3D.endDisplayListCapture();
    const listIndex = this.enumIdx - this.idx;
    if (listIndex >= 0 && listIndex < this.lists.length) this.lists[listIndex] = this.draft;
    this.enumIdx++;
  }

  public call(i: number): void {
    const fn = this.lists[i];
    if (fn) fn();
  }

  public setCurrentList(fn: (() => void) | null): void {
    this.draft = fn;
  }

  public setCurrentCommands(commands: DisplayListCommand[]): void {
    this.draft = () => {
      for (let i = 0; i < commands.length; i++) commands[i]();
    };
  }

  public close(): void {
    this.lists.fill(null);
    this.draft = null;
  }
}
