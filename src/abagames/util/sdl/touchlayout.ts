export type TouchLayoutMode = "default" | "portraitPad" | "landscapeUltraWide";

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TouchLayout {
  mode: TouchLayoutMode;
  gameViewport: LayoutRect;
}

const PORTRAIT_GAME_RATIO = 0.67;
const LANDSCAPE_ULTRAWIDE_ASPECT = 1.9;
const TARGET_GAME_ASPECT = 16 / 9;

export function isTouchEnvironment(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  if ("ontouchstart" in window) return true;
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) return true;
  return false;
}

export function getTouchLayout(width: number, height: number, touchEnabled = isTouchEnvironment()): TouchLayout {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  if (!touchEnabled) {
    return {
      mode: "default",
      gameViewport: { x: 0, y: 0, width: w, height: h },
    };
  }
  const aspect = w / h;
  if (aspect < 1) {
    const gameHeight = Math.max(1, Math.round(h * PORTRAIT_GAME_RATIO));
    return {
      mode: "portraitPad",
      gameViewport: { x: 0, y: 0, width: w, height: gameHeight },
    };
  }
  if (aspect >= LANDSCAPE_ULTRAWIDE_ASPECT) {
    const gameWidth = Math.max(1, Math.min(w, Math.round(h * TARGET_GAME_ASPECT)));
    const gameX = ((w - gameWidth) / 2) | 0;
    return {
      mode: "landscapeUltraWide",
      gameViewport: { x: gameX, y: 0, width: gameWidth, height: h },
    };
  }
  return {
    mode: "default",
    gameViewport: { x: 0, y: 0, width: w, height: h },
  };
}

export function toGLViewport(rect: LayoutRect, screenHeight: number): LayoutRect {
  return {
    x: rect.x,
    y: Math.max(0, screenHeight - (rect.y + rect.height)),
    width: rect.width,
    height: rect.height,
  };
}
