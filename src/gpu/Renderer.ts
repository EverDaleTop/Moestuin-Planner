/**
 * A minimal WebGL2 renderer for the garden canvas. It draws filled rectangles
 * (beds/paths) batched into a single draw call, with an orthographic camera
 * (pan x/y + zoom). All geometry is transformed on the CPU into clip space
 * each frame and uploaded once, which is plenty for hundreds of elements.
 *
 * This is the foundation for replacing the DOM nodes with a GPU canvas: a fast,
 * dependency-free module driven from a requestAnimationFrame loop.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GpuTransform {
  /** camera offset in px */
  x: number;
  y: number;
  /** camera scale, > 0 */
  zoom: number;
}

export interface DrawItem {
  rect: Rect;
  color: string;
  selected?: boolean;
}

function hexToRgba(hex: string, a = 1): [number, number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    a,
  ];
}

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec4 a_color;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}`;

const STRIDE = 6; // 2 (pos) + 4 (color) floats
const FLOAT_BYTES = 4;

export class GpuRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buffer: WebGLBuffer;
  private canvas: HTMLCanvasElement;
  private view = { width: 0, height: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.program = this.buildProgram(VERT_SRC, FRAG_SRC);

    this.vao = gl.createVertexArray()!;
    this.buffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    const posLoc = gl.getAttribLocation(this.program, "a_pos");
    const colorLoc = gl.getAttribLocation(this.program, "a_color");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, STRIDE * FLOAT_BYTES, 0);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(
      colorLoc,
      4,
      gl.FLOAT,
      false,
      STRIDE * FLOAT_BYTES,
      2 * FLOAT_BYTES
    );
  }

  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) ?? "shader error");
      }
      return sh;
    };
    const vert = compile(gl.VERTEX_SHADER, vs);
    const frag = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    }
    return prog;
  }

  /**
   * Fit the drawing buffer to the CSS size of the canvas.
   *
   * The buffer is kept 1:1 with CSS pixels (NOT multiplied by devicePixelRatio)
   * so that the WebGL output and the CSS-pixel overlay/hit-testing share exact
   * coordinates. Multiplying by dpr would let the browser resample the buffer
   * to the CSS box at a fractional scale under page zoom, which introduces a
   * cumulative sub-pixel offset. The trade-off is slightly softer edges on
   * HiDPI screens, in exchange for pixel-perfect alignment at any zoom.
   */
  resize(cssWidth: number, cssHeight: number) {
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.view = { width: cssWidth, height: cssHeight };
  }

  /** Render rectangles using an orthographic (px) camera, single batched draw. */
  render(items: DrawItem[], camera: GpuTransform, background = "#ffffff") {
    const gl = this.gl;
    const { width, height } = this.view;
    if (width <= 0 || height <= 0) return;

    const bg = hexToRgba(background, 1);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (items.length === 0) return;

    const zoom = camera.zoom || 1;
    const camX = camera.x || 0;
    const camY = camera.y || 0;
    const data = new Float32Array(items.length * 6 * STRIDE);
    let ptr = 0;

    const toNdc = {
      x: (v: number) => ((v * zoom + camX) / width) * 2 - 1,
      y: (v: number) => 1 - ((v * zoom + camY) / height) * 2,
    };

    for (const item of items) {
      const { x, y, w, h } = item.rect;
      const [r, g, b, a] = item.selected
        ? hexToRgba("#6fd6a4", 1)
        : hexToRgba(item.color, 1);
      const x0 = toNdc.x(x);
      const y0 = toNdc.y(y);
      const x1 = toNdc.x(x + w);
      const y1 = toNdc.y(y + h);
      // two triangles (6 vertices)
      const xs = [x0, x1, x0, x0, x1, x1];
      const ys = [y0, y0, y1, y1, y0, y1];
      for (let i = 0; i < 6; i++) {
        data[ptr++] = xs[i];
        data[ptr++] = ys[i];
        data[ptr++] = r;
        data[ptr++] = g;
        data[ptr++] = b;
        data[ptr++] = a;
      }
    }

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, items.length * 6);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
