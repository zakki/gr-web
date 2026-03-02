/*
 * $Id: mainloop.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { Logger } from "../logger";
import type { PrefManager } from "../prefmanager";
import type { GameManager } from "./gamemanager";
import type { Screen } from "./screen";
import type { Input, SDLEvent } from "./input";
import { SoundManager } from "./sound";
import { SDLInitFailedException } from "./sdlexception";
import { FrameStats } from "./framestats";
import { Screen3D } from "./screen3d";

const SDL_USEREVENT = 24;

/**
 * SDL main loop.
 */
export class MainLoop {
  public readonly INTERVAL_BASE = 16;
  public interval = this.INTERVAL_BASE;
  public accframe = 0;
  public nowait = false;
  public maxSkipFrame = 5;
  public event: SDLEvent = { type: 0 };

  private readonly screen: Screen;
  private readonly input: Input;
  private readonly gameManager: GameManager;
  private readonly prefManager: PrefManager;
  private done = false;
  private rafId: number | null = null;
  private running = false;
  private finalized = false;
  private lastTickMs = 0;
  private accumulatorMs = 0;
  private frameStats = new FrameStats();
  private lastStatsPublishMs = 0;
  private lastStatsSnapshot: ReturnType<FrameStats["getSnapshot"]> | null = null;

  public constructor(screen: Screen, input: Input, gameManager: GameManager, prefManager: PrefManager) {
    this.screen = screen;
    this.input = input;
    gameManager.setMainLoop(this);
    gameManager.setUIs(screen, input);
    gameManager.setPrefManager(prefManager);
    this.gameManager = gameManager;
    this.prefManager = prefManager;
  }

  // Initialize and load preference.
  private initFirst(): void {
    this.prefManager.load();
    try {
      SoundManager.init();
    } catch (e) {
      if (e instanceof SDLInitFailedException) Logger.error(e);
      else throw e;
    }
    this.gameManager.init();
  }

  // Quit and save preference.
  private quitLast(): void {
    this.gameManager.close();
    SoundManager.close();
    this.prefManager.save();
    this.screen.closeSDL();
    SDL_Quit();
  }

  public breakLoop(): void {
    this.done = true;
    if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.running) this.finalizeOnce();
    this.running = false;
  }

  public loop(): void {
    this.done = false;
    this.running = true;
    this.finalized = false;
    const now = this.nowMs();
    this.frameStats.reset(now);
    this.lastStatsPublishMs = now;

    this.screen.initSDL();
    this.initFirst();
    this.gameManager.start();

    if (typeof requestAnimationFrame === "function") {
      this.startBrowserLoop();
      return;
    }
    this.startFallbackLoop();
  }

  private startBrowserLoop(): void {
    this.accumulatorMs = 0;
    this.lastTickMs = this.nowMs();
    const frameStep = (now: number): void => {
      if (this.done) return;
      const elapsed = now - this.lastTickMs;
      this.lastTickMs = now;
      this.accumulatorMs += Math.max(0, elapsed);

      this.input.handleEvent({ type: SDL_USEREVENT });
      let frame = 0;
      while (this.accumulatorMs >= this.interval && frame < this.maxSkipFrame) {
        this.gameManager.move();
        this.accumulatorMs -= this.interval;
        frame++;
      }
      if (frame >= this.maxSkipFrame && this.accumulatorMs >= this.interval) {
        this.accumulatorMs = 0;
      }
      this.screen.clear();
      this.gameManager.draw();
      this.drawOverlay();
      this.screen.flip();
      this.frameStats.recordFrame(elapsed, frame, now);
      this.publishStats(now);

      this.rafId = requestAnimationFrame(frameStep);
    };
    this.rafId = requestAnimationFrame(frameStep);
  }

  private startFallbackLoop(): void {
    let prvTickCount = 0;
    let nowTick: number;
    let frame: number;

    while (!this.done) {
      const frameStart = this.nowMs();
      this.input.handleEvent({ type: SDL_USEREVENT });

      nowTick = this.nowMs();
      frame = ((nowTick - prvTickCount) / this.interval) | 0;
      if (frame <= 0) {
        frame = 1;
        sleepMs(prvTickCount + this.interval - nowTick);
        if (this.accframe) {
          prvTickCount = this.nowMs();
        } else {
          prvTickCount += this.interval;
        }
      } else if (frame > this.maxSkipFrame) {
        frame = this.maxSkipFrame;
        prvTickCount = nowTick;
      } else {
        prvTickCount += frame * this.interval;
      }

      for (let i = 0; i < frame; i++) this.gameManager.move();
      this.screen.clear();
      this.gameManager.draw();
      this.drawOverlay();
      this.screen.flip();
      const frameEnd = this.nowMs();
      this.frameStats.recordFrame(frameEnd - frameStart, frame, frameEnd);
      this.publishStats(frameEnd);
    }
    this.running = false;
    this.finalizeOnce();
  }

  private nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  private finalizeOnce(): void {
    if (this.finalized) return;
    this.finalized = true;
    this.quitLast();
  }

  private publishStats(nowMs: number): void {
    if (typeof globalThis === "undefined") return;
    if (!this.lastStatsSnapshot) {
      this.lastStatsSnapshot = this.frameStats.getSnapshot();
    }
    if (nowMs - this.lastStatsPublishMs < 1000) return;
    this.lastStatsPublishMs = nowMs;
    const g = globalThis as unknown as { __ttFrameStats?: ReturnType<FrameStats["getSnapshot"]> };
    this.lastStatsSnapshot = this.frameStats.getSnapshot();
    g.__ttFrameStats = this.lastStatsSnapshot;
  }

  private drawOverlay(): void {
    const ctx = Screen3D.ctx2d;
    if (!ctx) return;
    ctx.clearRect(0, 0, Screen3D.width, Screen3D.height);
    const input = this.input as Input & {
      drawTouchGuide?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
    };
    input.drawTouchGuide?.(ctx, Screen3D.width, Screen3D.height);
    if (this.lastStatsSnapshot) this.drawStatsOverlay(this.lastStatsSnapshot);
  }

  private drawStatsOverlay(stats: ReturnType<FrameStats["getSnapshot"]>): void {
    const g = globalThis as unknown as { __ttShowFrameStats?: boolean };
    if (!g.__ttShowFrameStats) return;
    const ctx = Screen3D.ctx2d;
    if (!ctx) return;
    const text = `FPS ${stats.avgFps.toFixed(1)} / AVG ${stats.avgFrameMs.toFixed(2)}ms / WORST ${stats.worstFrameMs.toFixed(
      2,
    )}ms / DROP ${stats.droppedFrames}`;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 8, Math.min(Screen3D.width - 16, 520), 20);
    ctx.fillStyle = "rgba(180,255,180,0.95)";
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(text, 12, 12);
    ctx.restore();
  }
}

function SDL_Quit(): void {}

function sleepMs(ms: number): void {
  const t = Date.now() + Math.max(0, ms);
  while (Date.now() < t) {
    // busy wait fallback for non-browser execution environments.
  }
}
