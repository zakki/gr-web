/*
 * $Id: pad.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import type { Input, SDLEvent } from "./input";
import { getTouchLayout, isTouchEnvironment } from "./touchlayout";

const SDL_PRESSED = 1;
const SDLK_RIGHT = 39;
const SDLK_LEFT = 37;
const SDLK_DOWN = 40;
const SDLK_UP = 38;
const SDLK_KP6 = 102;
const SDLK_KP4 = 100;
const SDLK_KP2 = 98;
const SDLK_KP8 = 104;
const SDLK_d = 68;
const SDLK_a = 65;
const SDLK_s = 83;
const SDLK_w = 87;
const SDLK_z = 90;
const SDLK_PERIOD = 190;
const SDLK_LCTRL = 17;
const SDLK_x = 88;
const SDLK_SLASH = 191;
const SDLK_LALT = 18;
const SDLK_LSHIFT = 16;
const SDLK_p = 80;

type TouchRole = "move" | "fire" | "charge" | "pause";
type TouchGuideLayout = {
  move: { x: number; y: number; radius: number };
  fire: { x: number; y: number; radius: number };
  charge: { x: number; y: number; radius: number };
  pause: { x: number; y: number; radius: number };
};

/**
 * Joystick and keyboard input.
 */
export class Pad implements Input {
  public static readonly Dir = {
    UP: 1,
    DOWN: 2,
    LEFT: 4,
    RIGHT: 8,
  } as const;

  public static readonly Button = {
    A: 16,
    B: 32,
    ANY: 48,
  } as const;

  public keys: Record<number, number> = {};
  public buttonReversed = false;
  protected lastDirState = 0;
  protected lastButtonState = 0;
  private stickIndex = -1;
  private readonly JOYSTICK_AXIS = 16384;
  private listenersBound = false;
  private readonly touchRoles = new Map<number, TouchRole>();
  private touchMovePointerId: number | null = null;
  private touchMoveOriginX = 0;
  private touchMoveOriginY = 0;
  private touchMoveCurrentX = 0;
  private touchMoveCurrentY = 0;
  private touchGuideEnabled = false;
  private touchFireToggled = false;
  private touchGestureGuardBound = false;

  public openJoystick(): void {
    if (typeof window === "undefined") return;
    this.bindKeyboardListeners();
    this.bindGamepadListeners();
    this.bindTouchListeners();
    this.touchGuideEnabled = this.detectTouchScreen();
  }

  public handleEvent(_event: SDLEvent): void {
    this.refreshGamepad();
  }

  public getDirState(): number {
    let x = 0;
    let y = 0;
    let dir = 0;
    const gp = this.getActiveGamepad();
    if (gp) {
      x = ((gp.axes[0] ?? 0) * 32767) | 0;
      y = ((gp.axes[1] ?? 0) * 32767) | 0;
    }
    if (
      this.keys[SDLK_RIGHT] === SDL_PRESSED ||
      this.keys[SDLK_KP6] === SDL_PRESSED ||
      this.keys[SDLK_d] === SDL_PRESSED ||
      x > this.JOYSTICK_AXIS
    ) {
      dir |= Pad.Dir.RIGHT;
    }
    if (
      this.keys[SDLK_LEFT] === SDL_PRESSED ||
      this.keys[SDLK_KP4] === SDL_PRESSED ||
      this.keys[SDLK_a] === SDL_PRESSED ||
      x < -this.JOYSTICK_AXIS
    ) {
      dir |= Pad.Dir.LEFT;
    }
    if (
      this.keys[SDLK_DOWN] === SDL_PRESSED ||
      this.keys[SDLK_KP2] === SDL_PRESSED ||
      this.keys[SDLK_s] === SDL_PRESSED ||
      y > this.JOYSTICK_AXIS
    ) {
      dir |= Pad.Dir.DOWN;
    }
    if (
      this.keys[SDLK_UP] === SDL_PRESSED ||
      this.keys[SDLK_KP8] === SDL_PRESSED ||
      this.keys[SDLK_w] === SDL_PRESSED ||
      y < -this.JOYSTICK_AXIS
    ) {
      dir |= Pad.Dir.UP;
    }
    this.lastDirState = dir;
    return dir;
  }

  public getButtonState(): number {
    let btn = 0;
    const gp = this.getActiveGamepad();
    const btn1 = gp?.buttons[0]?.pressed ? 1 : 0;
    const btn2 = gp?.buttons[1]?.pressed ? 1 : 0;
    const btn3 = gp?.buttons[2]?.pressed ? 1 : 0;
    const btn4 = gp?.buttons[3]?.pressed ? 1 : 0;
    const btn5 = gp?.buttons[4]?.pressed ? 1 : 0;
    const btn6 = gp?.buttons[5]?.pressed ? 1 : 0;
    const btn7 = gp?.buttons[6]?.pressed ? 1 : 0;
    const btn8 = gp?.buttons[7]?.pressed ? 1 : 0;
    if (
      this.keys[SDLK_z] === SDL_PRESSED ||
      this.keys[SDLK_PERIOD] === SDL_PRESSED ||
      this.keys[SDLK_LCTRL] === SDL_PRESSED ||
      btn1 ||
      btn4 ||
      btn5 ||
      btn8
    ) {
      if (!this.buttonReversed) btn |= Pad.Button.A;
      else btn |= Pad.Button.B;
    }
    if (
      this.keys[SDLK_x] === SDL_PRESSED ||
      this.keys[SDLK_SLASH] === SDL_PRESSED ||
      this.keys[SDLK_LALT] === SDL_PRESSED ||
      this.keys[SDLK_LSHIFT] === SDL_PRESSED ||
      btn2 ||
      btn3 ||
      btn6 ||
      btn7
    ) {
      if (!this.buttonReversed) btn |= Pad.Button.B;
      else btn |= Pad.Button.A;
    }
    this.lastButtonState = btn;
    return btn;
  }

  public drawTouchGuide(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.touchGuideEnabled) return;
    const layout = this.getTouchGuideLayout(width, height);
    this.drawTouchCircle(ctx, layout.move.x, layout.move.y, layout.move.radius, "MOVE");
    this.drawTouchMoveInputCircle(ctx, layout.move.x, layout.move.y, layout.move.radius);
    this.drawTouchCircle(ctx, layout.fire.x, layout.fire.y, layout.fire.radius, "SHOT");
    this.drawTouchCircle(ctx, layout.charge.x, layout.charge.y, layout.charge.radius, "CHARGE");
    this.drawTouchCircle(ctx, layout.pause.x, layout.pause.y, layout.pause.radius, "II");
  }

  private bindKeyboardListeners(): void {
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
      this.clearTouchState();
    });
  }

  private bindGamepadListeners(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("gamepadconnected", (e) => {
      const gp = e.gamepad;
      if (this.stickIndex < 0) this.stickIndex = gp.index;
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.stickIndex) this.stickIndex = -1;
    });
    this.refreshGamepad();
  }

  private bindTouchListeners(): void {
    if (typeof window === "undefined") return;
    if (!this.touchGestureGuardBound) {
      this.touchGestureGuardBound = true;
      const preventDefault = (e: Event) => {
        if (e.cancelable) e.preventDefault();
      };
      window.addEventListener("touchstart", preventDefault, { passive: false });
      window.addEventListener("touchmove", preventDefault, { passive: false });
      window.addEventListener("gesturestart", preventDefault, { passive: false });
      window.addEventListener("gesturechange", preventDefault, { passive: false });
      window.addEventListener("gestureend", preventDefault, { passive: false });
    }
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      const role = this.resolveTouchRole(e.clientX, e.clientY);
      this.touchRoles.set(e.pointerId, role);
      if (role === "move") {
        this.touchMovePointerId = e.pointerId;
        this.touchMoveOriginX = e.clientX;
        this.touchMoveOriginY = e.clientY;
        this.touchMoveCurrentX = e.clientX;
        this.touchMoveCurrentY = e.clientY;
        this.updateTouchMoveKeys();
      }
      if (role === "fire") this.toggleTouchFire();
      if (role === "charge") this.keys[SDLK_x] = SDL_PRESSED;
      if (role === "pause") this.keys[SDLK_p] = SDL_PRESSED;
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const role = this.touchRoles.get(e.pointerId);
      if (role !== "move" || this.touchMovePointerId !== e.pointerId) return;
      e.preventDefault();
      this.touchMoveCurrentX = e.clientX;
      this.touchMoveCurrentY = e.clientY;
      this.updateTouchMoveKeys();
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      this.releaseTouchPointer(e.pointerId);
    };
    window.addEventListener("pointerdown", handlePointerDown, { passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerUp, { passive: false });
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") this.clearTouchState();
    });
  }

  private detectTouchScreen(): boolean {
    return isTouchEnvironment();
  }

  private resolveTouchRole(clientX: number, clientY: number): TouchRole {
    if (typeof window === "undefined") return "fire";
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const layout = this.getTouchGuideLayout(width, height);
    if (this.isInsideCircle(clientX, clientY, layout.pause.x, layout.pause.y, layout.pause.radius)) return "pause";
    if (this.isInsideCircle(clientX, clientY, layout.fire.x, layout.fire.y, layout.fire.radius)) return "fire";
    if (this.isInsideCircle(clientX, clientY, layout.charge.x, layout.charge.y, layout.charge.radius)) return "charge";
    if (this.isInsideCircle(clientX, clientY, layout.move.x, layout.move.y, layout.move.radius * 1.35)) return "move";
    return clientX < width * 0.5 ? "move" : clientY < height * 0.5 ? "fire" : "charge";
  }

  private updateTouchMoveKeys(): void {
    const threshold = 24;
    const dx = this.touchMoveCurrentX - this.touchMoveOriginX;
    const dy = this.touchMoveCurrentY - this.touchMoveOriginY;
    this.keys[SDLK_LEFT] = dx < -threshold ? SDL_PRESSED : 0;
    this.keys[SDLK_RIGHT] = dx > threshold ? SDL_PRESSED : 0;
    this.keys[SDLK_UP] = dy < -threshold ? SDL_PRESSED : 0;
    this.keys[SDLK_DOWN] = dy > threshold ? SDL_PRESSED : 0;
  }

  private releaseTouchPointer(pointerId: number): void {
    const role = this.touchRoles.get(pointerId);
    if (!role) return;
    this.touchRoles.delete(pointerId);
    if (role === "move" && this.touchMovePointerId === pointerId) {
      this.touchMovePointerId = null;
      this.keys[SDLK_LEFT] = 0;
      this.keys[SDLK_RIGHT] = 0;
      this.keys[SDLK_UP] = 0;
      this.keys[SDLK_DOWN] = 0;
    }
    if (role === "charge" && !this.hasTouchRole("charge")) this.keys[SDLK_x] = 0;
    if (role === "pause" && !this.hasTouchRole("pause")) this.keys[SDLK_p] = 0;
  }

  private hasTouchRole(role: TouchRole): boolean {
    for (const activeRole of this.touchRoles.values()) {
      if (activeRole === role) return true;
    }
    return false;
  }

  private clearTouchState(): void {
    this.touchRoles.clear();
    this.touchMovePointerId = null;
    this.touchFireToggled = false;
    this.keys[SDLK_LEFT] = 0;
    this.keys[SDLK_RIGHT] = 0;
    this.keys[SDLK_UP] = 0;
    this.keys[SDLK_DOWN] = 0;
    this.keys[SDLK_z] = 0;
    this.keys[SDLK_x] = 0;
    this.keys[SDLK_p] = 0;
  }

  private toggleTouchFire(): void {
    this.touchFireToggled = !this.touchFireToggled;
    this.keys[SDLK_z] = this.touchFireToggled ? SDL_PRESSED : 0;
  }

  private getTouchGuideLayout(width: number, height: number): TouchGuideLayout {
    const layout = getTouchLayout(width, height, this.touchGuideEnabled);
    if (layout.mode === "portraitPad") {
      const minSize = Math.min(width, height);
      const moveRadius = Math.max(36, minSize * 0.11);
      const btnRadius = Math.max(30, minSize * 0.085);
      const pauseRadius = Math.max(20, minSize * 0.05);
      const gameBottom = layout.gameViewport.y + layout.gameViewport.height;
      const padHeight = Math.max(1, height - gameBottom);
      return {
        move: { x: width * 0.22, y: gameBottom + padHeight * 0.5, radius: moveRadius },
        fire: { x: width * 0.84, y: gameBottom + padHeight * 0.44, radius: btnRadius },
        charge: { x: width * 0.78, y: gameBottom + padHeight * 0.76, radius: btnRadius },
        pause: { x: width * 0.92, y: Math.max(pauseRadius + 6, layout.gameViewport.y + pauseRadius + 6), radius: pauseRadius },
      };
    }
    if (layout.mode === "landscapeUltraWide") {
      const minSize = Math.min(width, height);
      const moveRadius = Math.max(36, minSize * 0.11);
      const btnRadius = Math.max(30, minSize * 0.085);
      const pauseRadius = Math.max(20, minSize * 0.05);
      const leftGutter = layout.gameViewport.x;
      const rightStart = layout.gameViewport.x + layout.gameViewport.width;
      const rightGutter = Math.max(0, width - rightStart);
      const leftX = leftGutter >= moveRadius * 1.6 ? leftGutter * 0.5 : layout.gameViewport.x + moveRadius * 0.85;
      const rightX = rightGutter >= btnRadius * 2 ? rightStart + rightGutter * 0.55 : rightStart - btnRadius * 1.1;
      return {
        move: { x: leftX, y: height * 0.62, radius: moveRadius },
        fire: { x: rightX, y: height * 0.58, radius: btnRadius },
        charge: { x: rightX, y: height * 0.8, radius: btnRadius },
        pause: { x: rightStart + Math.max(pauseRadius * 1.2, rightGutter * 0.4), y: pauseRadius + 10, radius: pauseRadius },
      };
    }
    const minSize = Math.min(width, height);
    const moveRadius = Math.max(36, minSize * 0.11);
    const btnRadius = Math.max(30, minSize * 0.085);
    const pauseRadius = Math.max(20, minSize * 0.05);
    return {
      move: { x: width * 0.20, y: height * 0.64, radius: moveRadius },
      fire: { x: width * 0.86, y: height * 0.64, radius: btnRadius },
      charge: { x: width * 0.80, y: height * 0.82, radius: btnRadius },
      pause: { x: width * 0.92, y: height * 0.1, radius: pauseRadius },
    };
  }

  private isInsideCircle(px: number, py: number, cx: number, cy: number, radius: number): boolean {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  private drawTouchCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, label: string): void {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(200, 245, 255, 0.09)";
    ctx.strokeStyle = "rgba(210, 245, 255, 0.34)";
    ctx.lineWidth = Math.max(1.5, radius * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(210, 245, 255, 0.5)";
    ctx.font = `${Math.max(10, Math.round(radius * 0.38))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  private drawTouchMoveInputCircle(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, moveRadius: number): void {
    if (this.touchMovePointerId == null) return;
    const threshold = 24;
    const dx = this.touchMoveCurrentX - this.touchMoveOriginX;
    const dy = this.touchMoveCurrentY - this.touchMoveOriginY;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    const maxOffset = moveRadius * 0.78;
    const len = Math.hypot(dx, dy);
    const scale = len > maxOffset ? maxOffset / len : 1;
    const ox = dx * scale;
    const oy = dy * scale;
    const knobR = Math.max(12, moveRadius * 0.32);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(210, 245, 255, 0.28)";
    ctx.strokeStyle = "rgba(220, 250, 255, 0.78)";
    ctx.lineWidth = Math.max(1.5, moveRadius * 0.06);
    ctx.beginPath();
    ctx.arc(centerX + ox, centerY + oy, knobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private refreshGamepad(): void {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    const pads = navigator.getGamepads();
    if (this.stickIndex >= 0 && pads[this.stickIndex]) return;
    this.stickIndex = -1;
    for (const gp of pads) {
      if (gp) {
        this.stickIndex = gp.index;
        break;
      }
    }
  }

  private getActiveGamepad(): Gamepad | null {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
    const pads = navigator.getGamepads();
    if (this.stickIndex >= 0) return pads[this.stickIndex] ?? null;
    for (const gp of pads) {
      if (gp) return gp;
    }
    return null;
  }
}
