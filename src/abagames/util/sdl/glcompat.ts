import type { Vector3 } from "../vector";
import { SDLInitFailedException } from "./sdlexception";

type GL = WebGLRenderingContext;

export type GLCompatPrimitive = "points" | "lines" | "lineStrip" | "lineLoop" | "triangles" | "triangleStrip" | "triangleFan" | "quads";

export interface GLCompatStaticMesh {
  readonly mode: number;
  readonly count: number;
  readonly posBuffer: WebGLBuffer;
  readonly texCoordBuffer: WebGLBuffer;
  readonly colorBuffer: WebGLBuffer;
}

export interface GLCompatRenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

export class GLCompat {
  private readonly gl: GL;
  private program: WebGLProgram;
  private posBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  private colorBuffer: WebGLBuffer;
  private posLoc: number;
  private texCoordLoc: number;
  private colorAttrLoc: number;
  private matrixMode = 0x1700; // GL_MODELVIEW
  private modelView = mat4Identity();
  private projection = mat4Identity();
  private mvp = mat4Identity();
  private mvpDirty = true;
  private modelViewStack: Float32Array[] = [];
  private projectionStack: Float32Array[] = [];
  private drawColor: [number, number, number, number] = [1, 1, 1, 1];
  private clearColor: [number, number, number, number] = [0, 0, 0, 1];
  private width = 1;
  private height = 1;
  private immediateMode: GLCompatPrimitive | null = null;
  private immediateVertices: number[] = [];
  private blendMode: "alpha" | "additive" = "alpha";
  private pointSize = 1;
  private pointSizeLoc: WebGLUniformLocation;
  private mvpLoc: WebGLUniformLocation;
  private useTextureLoc: WebGLUniformLocation;
  private samplerLoc: WebGLUniformLocation;
  private textureEnabled = false;
  private boundTexture: WebGLTexture | null = null;
  private currentTexU = 0;
  private currentTexV = 0;
  private immediateTexCoords: number[] = [];
  private immediateColors: number[] = [];
  private drawVerticesBuffer = new Float32Array(0);
  private drawTexCoordsBuffer = new Float32Array(0);
  private drawColorsBuffer = new Float32Array(0);
  private matrixMulScratch = new Float32Array(16);
  private activeRenderTarget: GLCompatRenderTarget | null = null;

  public static create(canvas: HTMLCanvasElement): GLCompat {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new SDLInitFailedException("Unable to initialize WebGL context");
    return new GLCompat(gl);
  }

  private constructor(gl: GL) {
    this.gl = gl;
    this.program = this.createProgram();
    const posBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    if (!posBuffer) throw new SDLInitFailedException("Unable to create WebGL vertex buffer");
    if (!texCoordBuffer) throw new SDLInitFailedException("Unable to create WebGL texture coord buffer");
    if (!colorBuffer) throw new SDLInitFailedException("Unable to create WebGL color buffer");
    this.posBuffer = posBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.colorBuffer = colorBuffer;
    const posLoc = gl.getAttribLocation(this.program, "aPosition");
    const texCoordLoc = gl.getAttribLocation(this.program, "aTexCoord");
    const colorAttrLoc = gl.getAttribLocation(this.program, "aColor");
    if (posLoc < 0) throw new SDLInitFailedException("Unable to resolve shader attribute aPosition");
    if (texCoordLoc < 0) throw new SDLInitFailedException("Unable to resolve shader attribute aTexCoord");
    if (colorAttrLoc < 0) throw new SDLInitFailedException("Unable to resolve shader attribute aColor");
    this.posLoc = posLoc;
    this.texCoordLoc = texCoordLoc;
    this.colorAttrLoc = colorAttrLoc;
    const pointSizeLoc = gl.getUniformLocation(this.program, "uPointSize");
    const mvpLoc = gl.getUniformLocation(this.program, "uMvp");
    const useTextureLoc = gl.getUniformLocation(this.program, "uUseTexture");
    const samplerLoc = gl.getUniformLocation(this.program, "uSampler");
    if (!pointSizeLoc || !mvpLoc || !useTextureLoc || !samplerLoc)
      throw new SDLInitFailedException("Unable to resolve shader uniforms");
    this.pointSizeLoc = pointSizeLoc;
    this.mvpLoc = mvpLoc;
    this.useTextureLoc = useTextureLoc;
    this.samplerLoc = samplerLoc;
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.posLoc);
    gl.enableVertexAttribArray(this.texCoordLoc);
    gl.enableVertexAttribArray(this.colorAttrLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.vertexAttribPointer(this.colorAttrLoc, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.samplerLoc, 0);
    gl.enable(gl.BLEND);
    this.applyBlendMode();
    gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  public setViewport(x: number, y: number, width: number, height: number): void {
    this.gl.viewport(x | 0, y | 0, Math.max(1, width), Math.max(1, height));
  }

  public clear(): void {
    this.gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  public flush(): void {
    this.gl.flush();
  }

  public setDrawColor(r: number, g: number, b: number, a: number): void {
    this.drawColor = [clamp01(r), clamp01(g), clamp01(b), clamp01(a)];
  }

  public setClearColor(r: number, g: number, b: number, a: number): void {
    this.clearColor = [clamp01(r), clamp01(g), clamp01(b), clamp01(a)];
  }

  public setBlendMode(mode: "alpha" | "additive"): void {
    this.blendMode = mode;
    this.applyBlendMode();
  }

  public translate(v: Vector3): void {
    this.translateXYZ(v.x, v.y, v.z);
  }

  public setMatrixMode(mode: number): void {
    if (mode === 0x1700 || mode === 0x1701) this.matrixMode = mode;
  }

  public loadIdentity(): void {
    this.setCurrentMatrix(mat4Identity());
  }

  public pushMatrix(): void {
    if (this.matrixMode === 0x1701) {
      this.projectionStack.push(mat4Clone(this.projection));
      return;
    }
    this.modelViewStack.push(mat4Clone(this.modelView));
  }

  public popMatrix(): void {
    if (this.matrixMode === 0x1701) {
      const m = this.projectionStack.pop();
      if (!m) return;
      this.projection = m;
      this.mvpDirty = true;
      return;
    }
    const m = this.modelViewStack.pop();
    if (!m) return;
    this.modelView = m;
    this.mvpDirty = true;
  }

  public translateXYZ(x: number, y: number, z = 0): void {
    const m = this.getCurrentMatrix();
    mat4TranslateInPlace(m, x, y, z);
    this.mvpDirty = true;
  }

  public scaleXYZ(x: number, y: number, z = 1): void {
    const m = this.getCurrentMatrix();
    mat4ScaleInPlace(m, x, y, z);
    this.mvpDirty = true;
  }

  public rotateDeg(angleDeg: number, x = 0, y = 0, z = 1): void {
    this.mulCurrentMatrix(mat4RotationAxis(angleDeg, x, y, z));
  }

  public frustum(left: number, right: number, bottom: number, top: number, nearVal: number, farVal: number): void {
    this.mulCurrentMatrix(mat4Frustum(left, right, bottom, top, nearVal, farVal));
  }

  public ortho(left: number, right: number, bottom: number, top: number, nearVal: number, farVal: number): void {
    this.mulCurrentMatrix(mat4Ortho(left, right, bottom, top, nearVal, farVal));
  }

  public lookAt(
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
    this.mulCurrentMatrix(mat4LookAt(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ));
  }

  public begin(mode: GLCompatPrimitive): void {
    this.immediateMode = mode;
    this.immediateVertices.length = 0;
    this.immediateTexCoords.length = 0;
    this.immediateColors.length = 0;
  }

  public vertex(v: Vector3): void {
    this.vertexXYZ(v.x, v.y, v.z);
  }

  public vertexXYZ(x: number, y: number, z = 0): void {
    if (!this.immediateMode) {
      this.drawVertex(x, y, z);
      return;
    }
    this.immediateVertices.push(x, y, z, 1);
    this.immediateTexCoords.push(this.currentTexU, this.currentTexV);
    this.immediateColors.push(this.drawColor[0], this.drawColor[1], this.drawColor[2], this.drawColor[3]);
  }

  public end(): void {
    if (!this.immediateMode || this.immediateVertices.length === 0) {
      this.immediateMode = null;
      this.immediateVertices.length = 0;
      this.immediateTexCoords.length = 0;
      this.immediateColors.length = 0;
      return;
    }
    this.drawImmediate(this.immediateMode, this.immediateVertices, this.immediateTexCoords, this.immediateColors);
    this.immediateMode = null;
    this.immediateVertices.length = 0;
    this.immediateTexCoords.length = 0;
    this.immediateColors.length = 0;
  }

  public drawArraysXYZC(mode: GLCompatPrimitive, vertices: number[], colors: number[]): void {
    const draw = this.createPackedDrawCall(mode, vertices, colors);
    if (!draw) return;
    this.drawPacked(draw.mode, draw.count, draw.vertices, draw.texCoords, draw.colors);
  }

  public createStaticMeshXYZC(mode: GLCompatPrimitive, vertices: number[], colors: number[]): GLCompatStaticMesh | null {
    const draw = this.createPackedDrawCall(mode, vertices, colors);
    if (!draw) return null;
    const gl = this.gl;
    const posBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    if (!posBuffer || !texCoordBuffer || !colorBuffer) {
      if (posBuffer) gl.deleteBuffer(posBuffer);
      if (texCoordBuffer) gl.deleteBuffer(texCoordBuffer);
      if (colorBuffer) gl.deleteBuffer(colorBuffer);
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.texCoords, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.colors, gl.STATIC_DRAW);
    return {
      mode: draw.mode,
      count: draw.count,
      posBuffer,
      texCoordBuffer,
      colorBuffer,
    };
  }

  public drawStaticMesh(mesh: GLCompatStaticMesh): void {
    if (mesh.count <= 0) return;
    const gl = this.gl;
    this.prepareDraw();
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.posBuffer);
    gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.texCoordBuffer);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.colorBuffer);
    gl.vertexAttribPointer(this.colorAttrLoc, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(mesh.mode, 0, mesh.count);
  }

  public deleteStaticMesh(mesh: GLCompatStaticMesh): void {
    const gl = this.gl;
    gl.deleteBuffer(mesh.posBuffer);
    gl.deleteBuffer(mesh.texCoordBuffer);
    gl.deleteBuffer(mesh.colorBuffer);
  }

  public drawVertex(x: number, y: number, z = 0): void {
    this.begin("points");
    this.vertexXYZ(x, y, z);
    this.end();
  }

  public setPointSize(size: number): void {
    this.pointSize = Math.max(1, size);
  }

  public enable(cap: number): void {
    const gl = this.gl;
    if (cap === gl.BLEND) {
      gl.enable(gl.BLEND);
      return;
    }
    if (cap === gl.DEPTH_TEST) {
      gl.enable(gl.DEPTH_TEST);
      return;
    }
    if (cap === gl.TEXTURE_2D) {
      this.textureEnabled = true;
      return;
    }
  }

  public disable(cap: number): void {
    const gl = this.gl;
    if (cap === gl.BLEND) {
      gl.disable(gl.BLEND);
      return;
    }
    if (cap === gl.DEPTH_TEST) {
      gl.disable(gl.DEPTH_TEST);
      return;
    }
    if (cap === gl.TEXTURE_2D) {
      this.textureEnabled = false;
      return;
    }
  }

  public createTextureFromImage(image: TexImageSource): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  public bindTexture(texture: WebGLTexture): void {
    this.boundTexture = texture;
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  }

  public texCoord2f(u: number, v: number): void {
    this.currentTexU = u;
    this.currentTexV = v;
  }

  public deleteTexture(texture: WebGLTexture): void {
    if (this.boundTexture === texture) this.boundTexture = null;
    this.gl.deleteTexture(texture);
  }

  public close(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.posBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteBuffer(this.colorBuffer);
    gl.deleteProgram(this.program);
  }

  public createRenderTarget(width: number, height: number): GLCompatRenderTarget | null {
    const gl = this.gl;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }
    return { texture, framebuffer, width: w, height: h };
  }

  public beginRenderTarget(target: GLCompatRenderTarget): void {
    const gl = this.gl;
    this.activeRenderTarget = target;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
  }

  public endRenderTarget(): void {
    const gl = this.gl;
    this.activeRenderTarget = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
  }

  public deleteRenderTarget(target: GLCompatRenderTarget): void {
    const gl = this.gl;
    if (this.activeRenderTarget === target) {
      this.endRenderTarget();
    }
    if (this.boundTexture === target.texture) this.boundTexture = null;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  }

  private createProgram(): WebGLProgram {
    const gl = this.gl;
    const vertexSrc = `
attribute vec4 aPosition;
attribute vec2 aTexCoord;
attribute vec4 aColor;
uniform float uPointSize;
uniform mat4 uMvp;
varying vec2 vTexCoord;
varying vec4 vColor;
void main() {
  gl_Position = uMvp * aPosition;
  gl_PointSize = uPointSize;
  vTexCoord = aTexCoord;
  vColor = aColor;
}`;
    const fragmentSrc = `
precision mediump float;
uniform bool uUseTexture;
uniform sampler2D uSampler;
varying vec2 vTexCoord;
varying vec4 vColor;
void main() {
  vec4 color = vColor;
  if (uUseTexture) {
    color *= texture2D(uSampler, vTexCoord);
  }
  gl_FragColor = color;
}`;
    const v = this.compileShader(gl.VERTEX_SHADER, vertexSrc);
    const f = this.compileShader(gl.FRAGMENT_SHADER, fragmentSrc);
    const p = gl.createProgram();
    if (!p) throw new SDLInitFailedException("Unable to create WebGL program");
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(p) ?? "unknown link error";
      gl.deleteProgram(p);
      throw new SDLInitFailedException(`Unable to link WebGL program: ${err}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new SDLInitFailedException("Unable to create shader");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader) ?? "unknown compile error";
      gl.deleteShader(shader);
      throw new SDLInitFailedException(`Unable to compile shader: ${err}`);
    }
    return shader;
  }

  private drawImmediate(
    mode: GLCompatPrimitive,
    vertices: number[],
    texCoords: number[],
    colors: number[],
  ): void {
    const gl = this.gl;
    const draw = this.getDrawCall(mode, vertices, texCoords, colors);
    if (!draw) return;
    this.prepareDraw();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.vertices, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.texCoords, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, draw.colors, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.colorAttrLoc, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(draw.mode, 0, draw.count);
  }

  private drawPacked(mode: number, count: number, vertices: Float32Array, texCoords: Float32Array, colors: Float32Array): void {
    if (count <= 0) return;
    const gl = this.gl;
    this.prepareDraw();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.posLoc, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STREAM_DRAW);
    gl.vertexAttribPointer(this.colorAttrLoc, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(mode, 0, count);
  }

  private ensureDrawBuffers(vertexCount: number): void {
    const vLen = vertexCount * 4;
    if (this.drawVerticesBuffer.length < vLen) {
      this.drawVerticesBuffer = new Float32Array(nextPow2(vLen));
    }
    const tLen = vertexCount * 2;
    if (this.drawTexCoordsBuffer.length < tLen) {
      this.drawTexCoordsBuffer = new Float32Array(nextPow2(tLen));
    }
    const cLen = vertexCount * 4;
    if (this.drawColorsBuffer.length < cLen) {
      this.drawColorsBuffer = new Float32Array(nextPow2(cLen));
    }
  }

  private createPackedDrawCall(
    mode: GLCompatPrimitive,
    vertices: number[],
    colors: number[],
  ): {
    mode: number;
    count: number;
    vertices: Float32Array;
    texCoords: Float32Array;
    colors: Float32Array;
  } | null {
    if (mode === "quads") {
      return this.createPackedQuadDrawCall(vertices, colors);
    }
    const vertexCount = Math.floor(vertices.length / 3);
    if (vertexCount <= 0) return null;
    this.ensureDrawBuffers(vertexCount);
    const hasPerVertexColor = colors.length >= vertexCount * 4;
    let vPtr = 0;
    let tPtr = 0;
    let cPtr = 0;
    for (let i = 0; i < vertexCount; i++) {
      const vIdx = i * 3;
      this.drawVerticesBuffer[vPtr++] = vertices[vIdx];
      this.drawVerticesBuffer[vPtr++] = vertices[vIdx + 1];
      this.drawVerticesBuffer[vPtr++] = vertices[vIdx + 2];
      this.drawVerticesBuffer[vPtr++] = 1;
      this.drawTexCoordsBuffer[tPtr++] = 0;
      this.drawTexCoordsBuffer[tPtr++] = 0;
      if (hasPerVertexColor) {
        const cIdx = i * 4;
        this.drawColorsBuffer[cPtr++] = colors[cIdx];
        this.drawColorsBuffer[cPtr++] = colors[cIdx + 1];
        this.drawColorsBuffer[cPtr++] = colors[cIdx + 2];
        this.drawColorsBuffer[cPtr++] = colors[cIdx + 3];
      } else {
        this.drawColorsBuffer[cPtr++] = this.drawColor[0];
        this.drawColorsBuffer[cPtr++] = this.drawColor[1];
        this.drawColorsBuffer[cPtr++] = this.drawColor[2];
        this.drawColorsBuffer[cPtr++] = this.drawColor[3];
      }
    }
    const glMode = this.mapPrimitiveToDrawMode(mode);
    if (glMode !== null) {
      return {
        mode: glMode,
        count: vertexCount,
        vertices: this.drawVerticesBuffer.subarray(0, vertexCount * 4),
        texCoords: this.drawTexCoordsBuffer.subarray(0, vertexCount * 2),
        colors: this.drawColorsBuffer.subarray(0, vertexCount * 4),
      };
    }
    const transformed = Array.from(this.drawVerticesBuffer.subarray(0, vertexCount * 4));
    const texCoords = Array.from(this.drawTexCoordsBuffer.subarray(0, vertexCount * 2));
    const drawColors = Array.from(this.drawColorsBuffer.subarray(0, vertexCount * 4));
    const draw = this.getDrawCall(mode, transformed, texCoords, drawColors);
    if (!draw) return null;
    return draw;
  }

  private mapPrimitiveToDrawMode(mode: GLCompatPrimitive): number | null {
    const gl = this.gl;
    switch (mode) {
      case "points":
        return gl.POINTS;
      case "lines":
        return gl.LINES;
      case "lineStrip":
        return gl.LINE_STRIP;
      case "lineLoop":
        return gl.LINE_LOOP;
      case "triangles":
        return gl.TRIANGLES;
      case "triangleStrip":
        return gl.TRIANGLE_STRIP;
      case "triangleFan":
        return gl.TRIANGLE_FAN;
      default:
        return null;
    }
  }

  private createPackedQuadDrawCall(
    vertices: number[],
    colors: number[],
  ): {
    mode: number;
    count: number;
    vertices: Float32Array;
    texCoords: Float32Array;
    colors: Float32Array;
  } | null {
    const rawCount = Math.floor(vertices.length / 3);
    const quadCount = Math.floor(rawCount / 4);
    const triCount = quadCount * 6;
    if (triCount <= 0) return null;
    this.ensureDrawBuffers(triCount);
    const hasPerVertexColor = colors.length >= rawCount * 4;
    const triPattern = [0, 1, 2, 0, 2, 3];
    let vPtr = 0;
    let tPtr = 0;
    let cPtr = 0;
    for (let q = 0; q < quadCount; q++) {
      const base = q * 4;
      for (let i = 0; i < 6; i++) {
        const idx = base + triPattern[i];
        const vIdx = idx * 3;
        this.drawVerticesBuffer[vPtr++] = vertices[vIdx];
        this.drawVerticesBuffer[vPtr++] = vertices[vIdx + 1];
        this.drawVerticesBuffer[vPtr++] = vertices[vIdx + 2];
        this.drawVerticesBuffer[vPtr++] = 1;
        this.drawTexCoordsBuffer[tPtr++] = 0;
        this.drawTexCoordsBuffer[tPtr++] = 0;
        if (hasPerVertexColor) {
          const cIdx = idx * 4;
          this.drawColorsBuffer[cPtr++] = colors[cIdx];
          this.drawColorsBuffer[cPtr++] = colors[cIdx + 1];
          this.drawColorsBuffer[cPtr++] = colors[cIdx + 2];
          this.drawColorsBuffer[cPtr++] = colors[cIdx + 3];
        } else {
          this.drawColorsBuffer[cPtr++] = this.drawColor[0];
          this.drawColorsBuffer[cPtr++] = this.drawColor[1];
          this.drawColorsBuffer[cPtr++] = this.drawColor[2];
          this.drawColorsBuffer[cPtr++] = this.drawColor[3];
        }
      }
    }
    return {
      mode: this.gl.TRIANGLES,
      count: triCount,
      vertices: this.drawVerticesBuffer.subarray(0, triCount * 4),
      texCoords: this.drawTexCoordsBuffer.subarray(0, triCount * 2),
      colors: this.drawColorsBuffer.subarray(0, triCount * 4),
    };
  }

  private applyBlendMode(): void {
    const gl = this.gl;
    if (this.blendMode === "additive") {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      return;
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private prepareDraw(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1f(this.pointSizeLoc, this.pointSize);
    gl.uniformMatrix4fv(this.mvpLoc, false, this.getCurrentMvp());
    const useTexture = this.textureEnabled && this.boundTexture !== null;
    gl.uniform1i(this.useTextureLoc, useTexture ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    if (useTexture && this.boundTexture) gl.bindTexture(gl.TEXTURE_2D, this.boundTexture);
  }

  private getDrawCall(
    mode: GLCompatPrimitive,
    vertices: number[],
    texCoords: number[],
    colors: number[],
  ): {
    mode: number;
    vertices: Float32Array;
    texCoords: Float32Array;
    colors: Float32Array;
    count: number;
  } | null {
    const gl = this.gl;
    if (vertices.length < 4) return null;
    if (texCoords.length < 2) return null;
    if (colors.length < 4) return null;
    const vertexCount = Math.floor(vertices.length / 4);
    const texCount = Math.floor(texCoords.length / 2);
    const colorCount = Math.floor(colors.length / 4);
    const rawCount = Math.min(vertexCount, texCount, colorCount);
    if (rawCount <= 0) return null;
    const rawVertices = vertices.slice(0, rawCount * 4);
    const rawTexCoords = texCoords.slice(0, rawCount * 2);
    const rawColors = colors.slice(0, rawCount * 4);
    switch (mode) {
      case "points":
        return {
          mode: gl.POINTS,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount,
        };
      case "lines":
        return {
          mode: gl.LINES,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount - (rawCount % 2),
        };
      case "lineStrip":
        return {
          mode: gl.LINE_STRIP,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount,
        };
      case "lineLoop": {
        if (rawCount < 2) return null;
        const closedVertices = rawVertices.slice();
        const closedTexCoords = rawTexCoords.slice();
        const closedColors = rawColors.slice();
        closedVertices.push(rawVertices[0], rawVertices[1], rawVertices[2], rawVertices[3]);
        closedTexCoords.push(rawTexCoords[0], rawTexCoords[1]);
        closedColors.push(rawColors[0], rawColors[1], rawColors[2], rawColors[3]);
        return {
          mode: gl.LINE_STRIP,
          vertices: new Float32Array(closedVertices),
          texCoords: new Float32Array(closedTexCoords),
          colors: new Float32Array(closedColors),
          count: rawCount + 1,
        };
      }
      case "triangles":
        return {
          mode: gl.TRIANGLES,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount - (rawCount % 3),
        };
      case "triangleStrip":
        return {
          mode: gl.TRIANGLE_STRIP,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount,
        };
      case "triangleFan":
        return {
          mode: gl.TRIANGLE_FAN,
          vertices: new Float32Array(rawVertices),
          texCoords: new Float32Array(rawTexCoords),
          colors: new Float32Array(rawColors),
          count: rawCount,
        };
      case "quads": {
        if (rawCount < 4) return null;
        const tri: number[] = [];
        const triTex: number[] = [];
        const triColor: number[] = [];
        for (let i = 0; i + 3 < rawCount; i += 4) {
          const i0 = i * 4;
          const i1 = (i + 1) * 4;
          const i2 = (i + 2) * 4;
          const i3 = (i + 3) * 4;
          const t0 = i * 2;
          const t1 = (i + 1) * 2;
          const t2 = (i + 2) * 2;
          const t3 = (i + 3) * 2;
          const c0 = i * 4;
          const c1 = (i + 1) * 4;
          const c2 = (i + 2) * 4;
          const c3 = (i + 3) * 4;
          tri.push(
            rawVertices[i0],
            rawVertices[i0 + 1],
            rawVertices[i0 + 2],
            rawVertices[i0 + 3],
            rawVertices[i1],
            rawVertices[i1 + 1],
            rawVertices[i1 + 2],
            rawVertices[i1 + 3],
            rawVertices[i2],
            rawVertices[i2 + 1],
            rawVertices[i2 + 2],
            rawVertices[i2 + 3],
            rawVertices[i0],
            rawVertices[i0 + 1],
            rawVertices[i0 + 2],
            rawVertices[i0 + 3],
            rawVertices[i2],
            rawVertices[i2 + 1],
            rawVertices[i2 + 2],
            rawVertices[i2 + 3],
            rawVertices[i3],
            rawVertices[i3 + 1],
            rawVertices[i3 + 2],
            rawVertices[i3 + 3],
          );
          triTex.push(
            rawTexCoords[t0],
            rawTexCoords[t0 + 1],
            rawTexCoords[t1],
            rawTexCoords[t1 + 1],
            rawTexCoords[t2],
            rawTexCoords[t2 + 1],
            rawTexCoords[t0],
            rawTexCoords[t0 + 1],
            rawTexCoords[t2],
            rawTexCoords[t2 + 1],
            rawTexCoords[t3],
            rawTexCoords[t3 + 1],
          );
          triColor.push(
            rawColors[c0],
            rawColors[c0 + 1],
            rawColors[c0 + 2],
            rawColors[c0 + 3],
            rawColors[c1],
            rawColors[c1 + 1],
            rawColors[c1 + 2],
            rawColors[c1 + 3],
            rawColors[c2],
            rawColors[c2 + 1],
            rawColors[c2 + 2],
            rawColors[c2 + 3],
            rawColors[c0],
            rawColors[c0 + 1],
            rawColors[c0 + 2],
            rawColors[c0 + 3],
            rawColors[c2],
            rawColors[c2 + 1],
            rawColors[c2 + 2],
            rawColors[c2 + 3],
            rawColors[c3],
            rawColors[c3 + 1],
            rawColors[c3 + 2],
            rawColors[c3 + 3],
          );
        }
        return {
          mode: gl.TRIANGLES,
          vertices: new Float32Array(tri),
          texCoords: new Float32Array(triTex),
          colors: new Float32Array(triColor),
          count: tri.length / 4,
        };
      }
      default:
        return null;
    }
  }

  private getCurrentMatrix(): Float32Array {
    return this.matrixMode === 0x1701 ? this.projection : this.modelView;
  }

  private setCurrentMatrix(m: Float32Array): void {
    if (this.matrixMode === 0x1701) this.projection = m;
    else this.modelView = m;
    this.mvpDirty = true;
  }

  private mulCurrentMatrix(m: Float32Array): void {
    const current = this.getCurrentMatrix();
    mat4MulInto(this.matrixMulScratch, current, m);
    current.set(this.matrixMulScratch);
    this.mvpDirty = true;
  }

  private getCurrentMvp(): Float32Array {
    if (this.mvpDirty) {
      mat4MulInto(this.mvp, this.projection, this.modelView);
      this.mvpDirty = false;
    }
    return this.mvp;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function nextPow2(v: number): number {
  let n = 1;
  while (n < v) n <<= 1;
  return n;
}

function mat4Identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Clone(m: Float32Array): Float32Array {
  return new Float32Array(m);
}

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  mat4MulInto(out, a, b);
  return out;
}

function mat4MulInto(out: Float32Array, a: Float32Array, b: Float32Array): void {
  // OpenGL-style column-major matrix multiplication: out = a * b
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

function mat4TranslateInPlace(m: Float32Array, x: number, y: number, z: number): void {
  m[12] += m[0] * x + m[4] * y + m[8] * z;
  m[13] += m[1] * x + m[5] * y + m[9] * z;
  m[14] += m[2] * x + m[6] * y + m[10] * z;
  m[15] += m[3] * x + m[7] * y + m[11] * z;
}

function mat4ScaleInPlace(m: Float32Array, x: number, y: number, z: number): void {
  m[0] *= x;
  m[1] *= x;
  m[2] *= x;
  m[3] *= x;
  m[4] *= y;
  m[5] *= y;
  m[6] *= y;
  m[7] *= y;
  m[8] *= z;
  m[9] *= z;
  m[10] *= z;
  m[11] *= z;
}

function mat4Translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function mat4Scaling(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

function mat4RotationAxis(angleDeg: number, x: number, y: number, z: number): Float32Array {
  const len = Math.hypot(x, y, z);
  if (len <= 0) return mat4Identity();
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return new Float32Array([
    nx * nx * t + c,
    ny * nx * t + nz * s,
    nz * nx * t - ny * s,
    0,
    nx * ny * t - nz * s,
    ny * ny * t + c,
    nz * ny * t + nx * s,
    0,
    nx * nz * t + ny * s,
    ny * nz * t - nx * s,
    nz * nz * t + c,
    0,
    0,
    0,
    0,
    1,
  ]);
}

function mat4Frustum(left: number, right: number, bottom: number, top: number, nearVal: number, farVal: number): Float32Array {
  const rl = right - left;
  const tb = top - bottom;
  const fn = farVal - nearVal;
  if (rl === 0 || tb === 0 || fn === 0 || nearVal === 0) return mat4Identity();
  return new Float32Array([
    (2 * nearVal) / rl,
    0,
    0,
    0,
    0,
    (2 * nearVal) / tb,
    0,
    0,
    (right + left) / rl,
    (top + bottom) / tb,
    -(farVal + nearVal) / fn,
    -1,
    0,
    0,
    (-2 * farVal * nearVal) / fn,
    0,
  ]);
}

function mat4Ortho(left: number, right: number, bottom: number, top: number, nearVal: number, farVal: number): Float32Array {
  const rl = right - left;
  const tb = top - bottom;
  const fn = farVal - nearVal;
  if (rl === 0 || tb === 0 || fn === 0) return mat4Identity();
  return new Float32Array([
    2 / rl,
    0,
    0,
    0,
    0,
    2 / tb,
    0,
    0,
    0,
    0,
    -2 / fn,
    0,
    -(right + left) / rl,
    -(top + bottom) / tb,
    -(farVal + nearVal) / fn,
    1,
  ]);
}

function mat4LookAt(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  centerX: number,
  centerY: number,
  centerZ: number,
  upX: number,
  upY: number,
  upZ: number,
): Float32Array {
  let fx = centerX - eyeX;
  let fy = centerY - eyeY;
  let fz = centerZ - eyeZ;
  const fl = Math.hypot(fx, fy, fz);
  if (fl === 0) return mat4Identity();
  fx /= fl;
  fy /= fl;
  fz /= fl;

  let sx = fy * upZ - fz * upY;
  let sy = fz * upX - fx * upZ;
  let sz = fx * upY - fy * upX;
  const sl = Math.hypot(sx, sy, sz);
  if (sl === 0) return mat4Identity();
  sx /= sl;
  sy /= sl;
  sz /= sl;

  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;

  const rot = new Float32Array([sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, 0, 0, 0, 1]);
  return mat4Mul(rot, mat4Translation(-eyeX, -eyeY, -eyeZ));
}
