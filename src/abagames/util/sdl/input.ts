/*
 * $Id: input.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

export type SDLEvent =
  | { type: number }
  | { type: number; keyCode: number; pressed: boolean }
  | { type: number; gamepadIndex: number; connected: boolean };

/**
 * Input device interface.
 */
export interface Input {
  handleEvent(event: SDLEvent): void;
}

export class MultipleInputDevice implements Input {
  public inputs: Input[] = [];

  public handleEvent(event: SDLEvent): void {
    for (const input of this.inputs) input.handleEvent(event);
  }

  public drawTouchGuide(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    for (const input of this.inputs) {
      const guideInput = input as Input & {
        drawTouchGuide?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
      };
      guideInput.drawTouchGuide?.(ctx, width, height);
    }
  }
}
