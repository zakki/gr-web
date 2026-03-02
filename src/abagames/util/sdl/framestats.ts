export type FrameStatsSnapshot = {
  frames: number;
  updates: number;
  droppedFrames: number;
  avgFrameMs: number;
  worstFrameMs: number;
  avgFps: number;
  updatedAtMs: number;
};

/**
 * Runtime frame metrics for Phase4/Phase4.5 gate evidence.
 */
export class FrameStats {
  private frameCount = 0;
  private updateCount = 0;
  private droppedFrameCount = 0;
  private totalFrameMs = 0;
  private worstFrameMs = 0;
  private lastUpdatedMs = 0;

  public reset(nowMs: number): void {
    this.frameCount = 0;
    this.updateCount = 0;
    this.droppedFrameCount = 0;
    this.totalFrameMs = 0;
    this.worstFrameMs = 0;
    this.lastUpdatedMs = nowMs;
  }

  public recordFrame(frameMs: number, updatesThisFrame: number, nowMs: number): void {
    const safeMs = Number.isFinite(frameMs) ? Math.max(0, frameMs) : 0;
    const safeUpdates = Math.max(0, updatesThisFrame | 0);
    this.frameCount++;
    this.updateCount += safeUpdates;
    if (safeUpdates > 1) this.droppedFrameCount += safeUpdates - 1;
    this.totalFrameMs += safeMs;
    if (safeMs > this.worstFrameMs) this.worstFrameMs = safeMs;
    this.lastUpdatedMs = nowMs;
  }

  public getSnapshot(): FrameStatsSnapshot {
    const avgFrameMs = this.frameCount > 0 ? this.totalFrameMs / this.frameCount : 0;
    const avgFps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
    return {
      frames: this.frameCount,
      updates: this.updateCount,
      droppedFrames: this.droppedFrameCount,
      avgFrameMs,
      worstFrameMs: this.worstFrameMs,
      avgFps,
      updatedAtMs: this.lastUpdatedMs,
    };
  }
}
