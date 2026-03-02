/*
 * $Id: luminous.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { Actor, ActorPool } from "../actor";
import { Screen3D } from "./screen3d";

/**
 * Luminous effect texture.
 */
export class LuminousScreen {
  private luminousTexture = 0;
  private readonly LUMINOUS_TEXTURE_WIDTH_MAX = 64;
  private readonly LUMINOUS_TEXTURE_HEIGHT_MAX = 64;
  private td = new Uint32Array(this.LUMINOUS_TEXTURE_WIDTH_MAX * this.LUMINOUS_TEXTURE_HEIGHT_MAX * 4);
  private luminousTextureWidth = 64;
  private luminousTextureHeight = 64;
  private screenWidth = 0;
  private screenHeight = 0;
  private luminous = 0;
  private lmOfs: number[][] = [
    [-2, -1],
    [2, 1],
  ];
  private readonly lmOfsBs = 3;
  private inLuminousPass = false;

  public init(luminous: number, width: number, height: number): void {
    this.makeLuminousTexture();
    this.luminous = luminous;
    this.resized(width, height);
  }

  private makeLuminousTexture(): void {
    this.td.fill(0);
    this.luminousTexture = 1;
  }

  public resized(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  public close(): void {
    this.luminousTexture = 0;
  }

  public startRender(): void {
    this.inLuminousPass = true;
  }

  public endRender(): void {
    this.inLuminousPass = false;
  }

  private viewOrtho(): void {
    void this.inLuminousPass;
  }

  private viewPerspective(): void {
    void this.inLuminousPass;
  }

  public draw(): void {
    if (this.luminousTexture <= 0 || this.luminous <= 0) return;
    const alpha = Math.max(0.04, Math.min(0.2, this.luminous * 0.18));
    if (Screen3D.gl) {
      Screen3D.glBlendAdditive();
      for (let i = 0; i < 2; i++) {
        const x0 = this.lmOfs[i][0] * this.lmOfsBs;
        const y0 = this.lmOfs[i][1] * this.lmOfsBs;
        if (i === 0) Screen3D.setColor(120 / 255, 220 / 255, 1, alpha);
        else Screen3D.setColor(1, 180 / 255, 120 / 255, alpha);
        Screen3D.glBegin("quads");
        Screen3D.glVertexXYZ(x0, y0, 0);
        Screen3D.glVertexXYZ(x0 + this.screenWidth, y0, 0);
        Screen3D.glVertexXYZ(x0 + this.screenWidth, y0 + this.screenHeight, 0);
        Screen3D.glVertexXYZ(x0, y0 + this.screenHeight, 0);
        Screen3D.glEnd();
      }
      Screen3D.glBlendAlpha();
      this.viewOrtho();
      this.viewPerspective();
      return;
    }

    const ctx = Screen3D.ctx2d;
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2; i++) {
      const x0 = 0 + this.lmOfs[i][0] * this.lmOfsBs;
      const y0 = 0 + this.lmOfs[i][1] * this.lmOfsBs;
      const glow = i === 0 ? "120,220,255" : "255,180,120";
      ctx.fillStyle = `rgba(${glow}, ${alpha})`;
      ctx.fillRect(x0, y0, this.screenWidth, this.screenHeight);
    }
    ctx.restore();
    void this.luminousTextureWidth;
    void this.luminousTextureHeight;
    this.viewOrtho();
    this.viewPerspective();
  }
}

/**
 * Actor with the luminous effect.
 */
export abstract class LuminousActor extends Actor {
  public abstract drawLuminous(): void;
}

/**
 * Actor pool for the LuminousActor.
 */
export class LuminousActorPool<T extends LuminousActor> extends ActorPool<T> {
  public constructor(n: number, args: unknown[], factory: () => T) {
    super(undefined, null, factory);
    this.createActors(n, args);
  }

  public drawLuminous(): void {
    for (let i = 0; i < this.actor.length; i++) {
      if (this.actor[i].exists) this.actor[i].drawLuminous();
    }
  }
}
