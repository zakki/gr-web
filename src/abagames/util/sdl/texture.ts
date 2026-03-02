/*
 * $Id: texture.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import { SDLInitFailedException } from "./sdlexception";
import { Screen3D } from "./screen3d";

/**
 * Manage OpenGL textures.
 */
export class Texture {
  public static imagesDir = "images/";
  private num = 0;
  private readonly fileName: string;
  private image: HTMLImageElement | null = null;
  private texture: WebGLTexture | null = null;
  private loaded = false;
  private failed = false;
  private readonly loadPromise: Promise<boolean>;
  private settleLoadPromise: ((ok: boolean) => void) | null = null;
  private loadPromiseSettled = false;

  public constructor(name: string) {
    this.fileName = `${Texture.imagesDir}${name}`;
    if (!this.fileName) throw new SDLInitFailedException(`Unable to load: ${this.fileName}`);
    this.loadPromise = new Promise<boolean>((resolve) => {
      this.settleLoadPromise = resolve;
    });
    this.loadImage();
  }

  public deleteTexture(): void {
    if (this.texture) Screen3D.gl?.deleteTexture(this.texture);
    this.texture = null;
    this.image = null;
    this.loaded = false;
    this.failed = false;
    this.num = 0;
  }

  public bind(): void {
    if (this.failed) throw new SDLInitFailedException(`Unable to load: ${this.fileName}`);
    if (!this.loaded) return;
    if (!this.texture && this.image) this.texture = Screen3D.gl?.createTextureFromImage(this.image) ?? null;
    if (this.texture) {
      Screen3D.gl?.bindTexture(this.texture);
      this.num = 1;
    }
  }

  public get src(): string {
    return this.fileName;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  public get isFailed(): boolean {
    return this.failed;
  }

  public getImage(): HTMLImageElement | null {
    return this.image;
  }

  public waitForLoad(): Promise<boolean> {
    return this.loadPromise;
  }

  private loadImage(): void {
    if (typeof Image === "undefined") {
      this.failed = true;
      this.loaded = false;
      this.resolveLoadPromise(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.loaded = true;
      this.failed = false;
      this.num = 1;
      this.resolveLoadPromise(true);
    };
    img.onerror = () => {
      this.failed = true;
      this.loaded = false;
      this.image = null;
      this.num = 0;
      this.resolveLoadPromise(false);
    };
    img.src = this.fileName;
  }

  private resolveLoadPromise(ok: boolean): void {
    if (this.loadPromiseSettled) return;
    this.loadPromiseSettled = true;
    this.settleLoadPromise?.(ok);
  }
}
