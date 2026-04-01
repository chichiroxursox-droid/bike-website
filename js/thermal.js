/**
 * ThermalRenderer — WebGL thermal shader overlay
 * Reads the 2D main canvas as a texture and renders it
 * through a FLIR-style thermal ramp shader.
 *
 * ORYZO-inspired: instantaneous activation, no fade.
 * Color ramp: black → purple → teal → orange → yellow → white
 */
class ThermalRenderer {
  constructor(thermalCanvas, sourceCanvas) {
    this.canvas  = thermalCanvas;
    this.source  = sourceCanvas;
    this.active  = false;
    this._ready  = false;
    this._raf    = null;

    this._gl = thermalCanvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });

    if (!this._gl) {
      console.warn('ThermalRenderer: WebGL not available');
      return;
    }

    this._setup();
    this._ready = true;
  }

  _setup() {
    const gl = this._gl;

    // --- Vertex shader (passthrough quad) ---
    const vertSrc = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        vUv.y = 1.0 - vUv.y; /* flip Y to match canvas coords */
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    // --- Fragment shader (FLIR thermal ramp) ---
    // Thermal palette matching the brief:
    //   0.0 → #0D1418 (near black, site bg)
    //   0.2 → #2A0A4A (dark purple)
    //   0.4 → #4A7C88 (bike teal — thematic echo)
    //   0.6 → #FF6B35 (engineering orange)
    //   0.8 → #FFDD00 (yellow)
    //   1.0 → #FFFFFF (white hot)
    const fragSrc = `
      precision mediump float;
      uniform sampler2D uTexture;
      varying vec2 vUv;

      vec3 thermalRamp(float t) {
        vec3 c0 = vec3(0.051, 0.078, 0.094); /* #0D1418 near-black */
        vec3 c1 = vec3(0.165, 0.039, 0.290); /* #2A0A4A dark purple */
        vec3 c2 = vec3(0.290, 0.486, 0.533); /* #4A7C88 bike teal   */
        vec3 c3 = vec3(1.000, 0.420, 0.208); /* #FF6B35 orange      */
        vec3 c4 = vec3(1.000, 0.867, 0.000); /* #FFDD00 yellow      */
        vec3 c5 = vec3(1.000, 1.000, 1.000); /* white hot           */

        if (t < 0.2) return mix(c0, c1, t / 0.2);
        if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
        if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
        if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
        return mix(c4, c5, (t - 0.8) / 0.2);
      }

      void main() {
        vec4 col  = texture2D(uTexture, vUv);
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(thermalRamp(lum), 1.0);
      }
    `;

    // Compile & link
    this._program = this._buildProgram(vertSrc, fragSrc);
    gl.useProgram(this._program);

    // Full-screen quad (two triangles)
    const positions = new Float32Array([
      -1, -1,   1, -1,   -1,  1,
       1, -1,   1,  1,   -1,  1,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(this._program, 'aPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Texture for source canvas
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uTex = gl.getUniformLocation(this._program, 'uTexture');
    gl.uniform1i(uTex, 0);
  }

  _buildProgram(vertSrc, fragSrc) {
    const gl = this._gl;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(s));
      }
      return s;
    };

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    return prog;
  }

  resize(w, h) {
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this._gl) this._gl.viewport(0, 0, w, h);
  }

  /** Upload the 2D source canvas as a texture and render the thermal quad */
  render() {
    if (!this._ready) return;
    const gl = this._gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    // Upload current source canvas content as texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Activate: show thermal canvas, hide main canvas */
  activate() {
    if (this.active || !this._ready) return;
    this.active = true;
    this.canvas.style.display = 'block';
    this.source.style.display = 'none';
    document.getElementById('thermal-badge').classList.add('active');
    // RAF loop to keep updating while active
    const loop = () => {
      if (!this.active) return;
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Deactivate: show main canvas, hide thermal canvas */
  deactivate() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.canvas.style.display = 'none';
    this.source.style.display = 'block';
    document.getElementById('thermal-badge').classList.remove('active');
  }

  toggle(on) {
    on ? this.activate() : this.deactivate();
  }
}
