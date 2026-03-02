/*
 * $Id: screen3d.d,v 1.2 2005/01/01 12:40:28 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import type { Vector3 } from "../vector";
import { GLCompat, type GLCompatPrimitive, type GLCompatStaticMesh } from "./glcompat";
import type { Screen } from "./screen";
import { SDLInitFailedException } from "./sdlexception";

/**
 * SDL screen handler(3D, OpenGL).
 */
export abstract class Screen3D implements Screen {
  public static readonly GL_POINTS = 0x0000;
  public static readonly GL_LINES = 0x0001;
  public static readonly GL_LINE_LOOP = 0x0002;
  public static readonly GL_LINE_STRIP = 0x0003;
  public static readonly GL_TRIANGLES = 0x0004;
  public static readonly GL_TRIANGLE_STRIP = 0x0005;
  public static readonly GL_TRIANGLE_FAN = 0x0006;
  public static readonly GL_QUADS = 0x0007;
  public static readonly GL_BLEND = 0x0be2;
  public static readonly GL_DEPTH_TEST = 0x0b71;
  public static readonly GL_SRC_ALPHA = 0x0302;
  public static readonly GL_ONE = 1;
  public static readonly GL_ONE_MINUS_SRC_ALPHA = 0x0303;
  public static readonly GL_LINE_SMOOTH = 0x0b20;
  public static readonly GL_COLOR_MATERIAL = 0x0b57;
  public static readonly GL_CULL_FACE = 0x0b44;
  public static readonly GL_LIGHTING = 0x0b50;
  public static readonly GL_TEXTURE_2D = 0x0de1;
  public static readonly GL_MODELVIEW = 0x1700;
  public static readonly GL_PROJECTION = 0x1701;
  public static readonly GL_COLOR_BUFFER_BIT = 0x00004000;
  public static brightness = 1;
  public static width = 640;
  public static height = 480;
  public static windowMode = false;
  public static autoResizeToWindow = true;
  public static nearPlane = 0.1;
  public static farPlane = 1000;
  public static canvas: HTMLCanvasElement | null = null;
  public static overlayCanvas: HTMLCanvasElement | null = null;
  public static ctx2d: CanvasRenderingContext2D | null = null;
  public static gl: GLCompat | null = null;
  public static clearColor = "rgba(0, 0, 0, 1)";
  public static drawColor = "rgba(255, 255, 255, 1)";
  private static captureCommands: Array<() => void> | null = null;
  private static captureCommit: ((commands: Array<() => void>) => void) | null = null;
  private onWindowResize: (() => void) | null = null;
  private onVisualViewportResize: (() => void) | null = null;

  protected abstract init(): void;
  protected abstract close(): void;

  public initSDL(): void {
    if (typeof document !== "undefined") {
      let root = document.getElementById("tt-screen-root") as HTMLDivElement | null;
      if (!root) {
        root = document.createElement("div");
        root.id = "tt-screen-root";
        root.style.position = "relative";
        root.style.display = "inline-block";
        document.body.appendChild(root);
      }
      root.style.touchAction = "none";
      root.style.userSelect = "none";
      root.style.webkitUserSelect = "none";
      root.style.setProperty("-webkit-touch-callout", "none");
      if (Screen3D.autoResizeToWindow) {
        document.body.style.margin = "0";
        document.body.style.overflow = "hidden";
      }
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
      document.body.style.setProperty("-webkit-touch-callout", "none");
      let canvas = document.getElementById("tt-screen") as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = "tt-screen";
        canvas.style.display = "block";
        root.appendChild(canvas);
      }
      canvas.style.touchAction = "none";
      canvas.style.userSelect = "none";
      canvas.style.webkitUserSelect = "none";
      canvas.style.setProperty("-webkit-touch-callout", "none");
      canvas.width = Screen3D.width;
      canvas.height = Screen3D.height;
      canvas.style.width = `${Screen3D.width}px`;
      canvas.style.height = `${Screen3D.height}px`;
      Screen3D.canvas = canvas;
      Screen3D.gl = GLCompat.create(canvas);

      let overlay = document.getElementById("tt-screen-overlay") as HTMLCanvasElement | null;
      if (!overlay) {
        overlay = document.createElement("canvas");
        overlay.id = "tt-screen-overlay";
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.pointerEvents = "none";
        root.appendChild(overlay);
      }
      overlay.style.touchAction = "none";
      overlay.style.userSelect = "none";
      overlay.style.webkitUserSelect = "none";
      overlay.style.setProperty("-webkit-touch-callout", "none");
      overlay.width = Screen3D.width;
      overlay.height = Screen3D.height;
      overlay.style.width = `${Screen3D.width}px`;
      overlay.style.height = `${Screen3D.height}px`;
      Screen3D.overlayCanvas = overlay;
      Screen3D.ctx2d = overlay.getContext("2d");
    }
    if (typeof window !== "undefined" && Screen3D.autoResizeToWindow) {
      this.onWindowResize = () => {
        const vp = this.getViewportSize();
        this.resized(vp.width, vp.height);
      };
      window.addEventListener("resize", this.onWindowResize);
      if (window.visualViewport) {
        this.onVisualViewportResize = () => {
          const vp = this.getViewportSize();
          this.resized(vp.width, vp.height);
        };
        window.visualViewport.addEventListener("resize", this.onVisualViewportResize);
        window.visualViewport.addEventListener("scroll", this.onVisualViewportResize);
      }
      this.onWindowResize();
    } else {
      this.resized(Screen3D.width, Screen3D.height);
    }
    this.init();
  }

  public screenResized(): void {}

  public resized(width: number, height: number): void {
    Screen3D.width = width;
    Screen3D.height = height;
    if (Screen3D.canvas) {
      Screen3D.canvas.width = width;
      Screen3D.canvas.height = height;
      Screen3D.canvas.style.width = `${width}px`;
      Screen3D.canvas.style.height = `${height}px`;
    }
    if (Screen3D.overlayCanvas) {
      Screen3D.overlayCanvas.width = width;
      Screen3D.overlayCanvas.height = height;
      Screen3D.overlayCanvas.style.width = `${width}px`;
      Screen3D.overlayCanvas.style.height = `${height}px`;
    }
    Screen3D.gl?.resize(width, height);
    this.resetProjectionForResize();
    this.screenResized();
  }

  private resetProjectionForResize(): void {
    const near = Screen3D.nearPlane;
    const far = Screen3D.farPlane;
    const w = Math.max(1, Screen3D.width);
    const h = Math.max(1, Screen3D.height);
    const top = (near * h) / w;
    const bottom = -top;
    const left = -near;
    const right = near;
    Screen3D.glMatrixMode(Screen3D.GL_PROJECTION);
    Screen3D.glLoadIdentity();
    Screen3D.glFrustum(left, right, bottom, top, 0.1, far);
    Screen3D.glMatrixMode(Screen3D.GL_MODELVIEW);
  }

  public closeSDL(): void {
    if (typeof window !== "undefined" && this.onWindowResize) {
      window.removeEventListener("resize", this.onWindowResize);
      this.onWindowResize = null;
    }
    if (typeof window !== "undefined" && window.visualViewport && this.onVisualViewportResize) {
      window.visualViewport.removeEventListener("resize", this.onVisualViewportResize);
      window.visualViewport.removeEventListener("scroll", this.onVisualViewportResize);
      this.onVisualViewportResize = null;
    }
    this.close();
    Screen3D.gl?.close();
    Screen3D.gl = null;
    Screen3D.ctx2d = null;
    Screen3D.overlayCanvas = null;
    Screen3D.canvas = null;
  }

  public flip(): void {
    Screen3D.gl?.flush();
    this.handleError();
  }

  public clear(): void {
    Screen3D.gl?.clear();
    if (!Screen3D.ctx2d) return;
    Screen3D.ctx2d.clearRect(0, 0, Screen3D.width, Screen3D.height);
  }

  public handleError(): void {}

  protected setCaption(name: string): void {
    if (typeof document !== "undefined") document.title = name;
  }

  private getViewportSize(): { width: number; height: number } {
    if (typeof window === "undefined") {
      return { width: Screen3D.width, height: Screen3D.height };
    }
    const vv = window.visualViewport;
    if (vv) {
      return {
        width: Math.max(1, Math.round(vv.width)),
        height: Math.max(1, Math.round(vv.height)),
      };
    }
    return {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    };
  }

  public static setColor(r: number, g: number, b: number, a = 1): void {
    Screen3D.drawColor = rgba(r, g, b, a);
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setDrawColor(r, g, b, a);
    });
  }

  public static setClearColor(r: number, g: number, b: number, a = 1): void {
    Screen3D.clearColor = rgba(r, g, b, a);
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setClearColor(r, g, b, a);
    });
  }

  public static glVertex(v: Vector3): void {
    Screen3D.glVertexXYZ(v.x, v.y, v.z);
  }

  public static glVertexXYZ(x: number, y: number, z = 0): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.vertexXYZ(x, y, z);
    });
  }

  public static glVertex3f(x: number, y: number, z: number): void {
    Screen3D.glVertexXYZ(x, y, z);
  }

  public static glTranslate(v: Vector3): void {
    Screen3D.glTranslatef(v.x, v.y, v.z);
  }

  public static glTranslatef(x: number, y: number, z: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.translateXYZ(x, y, z);
    });
  }

  public static glScalef(x: number, y: number, z: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.scaleXYZ(x, y, z);
    });
  }

  public static glRotatef(angleDeg: number, x: number, y: number, z: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.rotateDeg(angleDeg, x, y, z);
    });
  }

  public static glBegin(mode: GLCompatPrimitive | number): void {
    const p = mapPrimitive(mode);
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.begin(p);
    });
  }

  public static glEnd(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.end();
    });
  }

  public static glDrawArrays(mode: GLCompatPrimitive | number, vertices: number[], colors: number[]): void {
    const p = mapPrimitive(mode);
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.drawArraysXYZC(p, vertices, colors);
    });
  }

  public static glCreateStaticMesh(mode: GLCompatPrimitive | number, vertices: number[], colors: number[]): GLCompatStaticMesh | null {
    const p = mapPrimitive(mode);
    return Screen3D.gl?.createStaticMeshXYZC(p, vertices, colors) ?? null;
  }

  public static glDrawStaticMesh(mesh: GLCompatStaticMesh): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.drawStaticMesh(mesh);
    });
  }

  public static glDeleteStaticMesh(mesh: GLCompatStaticMesh): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.deleteStaticMesh(mesh);
    });
  }

  public static glLoadIdentity(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.loadIdentity();
    });
  }

  public static glPushMatrix(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.pushMatrix();
    });
  }

  public static glPopMatrix(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.popMatrix();
    });
  }

  public static glBlendAdditive(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setBlendMode("additive");
    });
  }

  public static glBlendAlpha(): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setBlendMode("alpha");
    });
  }

  public static glPointSize(size: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setPointSize(size);
    });
  }

  public static glEnable(cap: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.enable(cap);
    });
  }

  public static glDisable(cap: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.disable(cap);
    });
  }

  public static glBlendFunc(sfactor: number, dfactor: number): void {
    Screen3D.captureOrRun(() => {
      if (sfactor === Screen3D.GL_SRC_ALPHA && dfactor === Screen3D.GL_ONE) {
        Screen3D.gl?.setBlendMode("additive");
        return;
      }
      if (sfactor === Screen3D.GL_SRC_ALPHA && dfactor === Screen3D.GL_ONE_MINUS_SRC_ALPHA) {
        Screen3D.gl?.setBlendMode("alpha");
      }
    });
  }

  public static glMatrixMode(mode: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setMatrixMode(mode);
    });
  }

  public static glViewport(x: number, y: number, width: number, height: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.setViewport(x, y, width, height);
    });
  }

  public static glFrustum(
    left: number,
    right: number,
    bottom: number,
    top: number,
    nearVal: number,
    farVal: number,
  ): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.frustum(left, right, bottom, top, nearVal, farVal);
    });
  }

  public static glClear(mask: number): void {
    if ((mask & Screen3D.GL_COLOR_BUFFER_BIT) !== 0) Screen3D.gl?.clear();
  }

  public static glLineWidth(_width: number): void {
    // WebGL1の線幅は実行環境依存のため、互換レイヤーでは受理のみ行う。
  }

  public static glOrtho(left: number, right: number, bottom: number, top: number, nearVal: number, farVal: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.ortho(left, right, bottom, top, nearVal, farVal);
    });
  }

  public static glTexCoord2f(u: number, v: number): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.texCoord2f(u, v);
    });
  }

  public static gluLookAt(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    centerX: number,
    centerY: number,
    centerZ: number,
    upX: number,
    upY: number,
    upZ: number,
  ): void {
    Screen3D.captureOrRun(() => {
      Screen3D.gl?.lookAt(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ);
    });
  }

  public static beginDisplayListCapture(commit: (commands: Array<() => void>) => void): void {
    Screen3D.captureCommands = [];
    Screen3D.captureCommit = commit;
  }

  public static endDisplayListCapture(): void {
    if (!Screen3D.captureCommands || !Screen3D.captureCommit) {
      Screen3D.captureCommands = null;
      Screen3D.captureCommit = null;
      return;
    }
    const commands = Screen3D.captureCommands.slice();
    Screen3D.captureCommands = null;
    const commit = Screen3D.captureCommit;
    Screen3D.captureCommit = null;
    commit(commands);
  }

  private static captureOrRun(fn: () => void): void {
    if (Screen3D.captureCommands) {
      Screen3D.captureCommands.push(fn);
      return;
    }
    fn();
  }
}

function rgba(r: number, g: number, b: number, a: number): string {
  const rr = Math.max(0, Math.min(1, r));
  const gg = Math.max(0, Math.min(1, g));
  const bb = Math.max(0, Math.min(1, b));
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(rr * 255)}, ${Math.round(gg * 255)}, ${Math.round(bb * 255)}, ${aa})`;
}

function mapPrimitive(mode: GLCompatPrimitive | number): GLCompatPrimitive {
  if (typeof mode === "string") return mode;
  switch (mode) {
    case Screen3D.GL_POINTS:
      return "points";
    case Screen3D.GL_LINES:
      return "lines";
    case Screen3D.GL_LINE_LOOP:
      return "lineLoop";
    case Screen3D.GL_LINE_STRIP:
      return "lineStrip";
    case Screen3D.GL_TRIANGLES:
      return "triangles";
    case Screen3D.GL_TRIANGLE_STRIP:
      return "triangleStrip";
    case Screen3D.GL_TRIANGLE_FAN:
      return "triangleFan";
    case Screen3D.GL_QUADS:
      return "quads";
    default:
      return "triangles";
  }
}
