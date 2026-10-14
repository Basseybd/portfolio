"use client";

// Chroma Glitch Preloader, adapted from 21st.dev for basseyduke.io.
// A word tumbles through a 3D cube one letter per face while a counter runs
// to 100%. Behind it, liquid chrome, split at the edges by a touch of
// chromatic aberration, with grain and a faint raster. Then the gate lifts.

import * as React from "react";

export interface ChromaGlitchGrade {
  /** Chromatic aberration strength (0 = none, ~3 = heavy glitch) */
  chroma: number;
  /** Film grain intensity (0 to ~0.5) */
  grain: number;
  /** Scanline strength (0 = none, 1 = full raster) */
  scanlines: number;
  /** Contrast multiplier around mid-grey (1 = untouched) */
  contrast: number;
}

const DEFAULT_GRADE: ChromaGlitchGrade = { chroma: 0.4, grain: 0.14, scanlines: 0.3, contrast: 1.15 };

export interface ChromaGlitchPreloaderProps {
  /** Word tumbled through the cube, one letter per face. */
  word?: string;
  /** Optional reel behind the type. Must be same-origin (or send CORS headers). */
  videoSrc?: string;
  grade?: Partial<ChromaGlitchGrade>;
  /** Choreography multiplier. 2 runs twice as fast. */
  speed?: number;
  /** Cube edge length, and so the letter size. Drops to 64px under 840px wide. */
  cubeSize?: string;
  /** Run forever (demo only). onComplete never fires. */
  loop?: boolean;
  /** Fired once, when the gate has finished lifting. */
  onComplete?: () => void;
  /** Fired when the exit starts, so the page underneath can begin its entrance. */
  onExit?: () => void;
  className?: string;
}

const TUMBLE_CLASSES = [
  "tcp-firstChar",
  "tcp-fromBottomOutRight",
  "tcp-fromLeftOutTop",
  "tcp-fromBottomOutLeft",
  "tcp-fromRightOutTop",
] as const;

const STEP_DELAY_MS = 600;
const CHAR_DURATION_MS = 1200;
const EXIT_MS = 750;

/** Fast rise, a stall in the 42 to 48% band, then a surge to 100. Never ticks backwards. */
export function preloaderProgress(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  if (p < 0.35) return Math.round(42 * (1 - Math.pow(1 - p / 0.35, 2.2)));
  if (p < 0.75) return Math.round(42 + 6 * ((p - 0.35) / 0.4));
  const s = (p - 0.75) / 0.25;
  return Math.round(48 + 52 * (s * s * (3 - 2 * s)));
}

export function preloaderDuration(wordLength: number, speed = 1): number {
  return Math.max(3200, wordLength * STEP_DELAY_MS + STEP_DELAY_MS) / speed;
}

const VERTEX_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// WebGL1 so it runs everywhere, including older iOS and in-app browsers.
const FRAGMENT_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_video;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_videoSize;
uniform float u_chroma;
uniform float u_grain;
uniform float u_scanlines;
uniform float u_contrast;
uniform float u_hasVideo;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031 + fract(u_time * 0.37));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Liquid chrome: a slow rippling surface that reflects a bright sky over a
// dark floor. Where the surface folds, the horizon shows as a hard silver edge.
float surface(vec2 p, float t) {
  return 0.55 * sin(p.x * 1.1 + sin(p.y * 0.9 + t) * 1.4 + t * 0.5)
       + 0.5 * sin(p.y * 1.5 + sin(p.x * 1.0 - t * 0.6) * 1.3 - t * 0.4)
       + 0.28 * sin(p.x * 2.3 - p.y * 1.7 + t * 0.9)
       + 0.22 * sin(length(p - vec2(1.7, -1.1)) * 2.6 - t);
}

vec3 sky(vec3 r) {
  float y = r.y;
  float above = smoothstep(-0.01, 0.01, y);
  float upper = mix(0.95, 0.30, pow(clamp(y, 0.0, 1.0), 0.6));
  float floor_ = 0.02 + 0.16 * smoothstep(-1.0, -0.05, y);
  float l = mix(floor_, upper, above) + exp(-abs(y - 0.02) * 60.0) * 0.4;
  return vec3(l * 0.93, l * 0.955, l);
}

vec3 plate(vec2 uv) {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 3.0;
  float t = u_time * 0.45;
  float e = 0.004;
  float h = surface(p, t);
  float hx = surface(p + vec2(e, 0.0), t);
  float hy = surface(p + vec2(0.0, e), t);
  vec3 n = normalize(vec3((h - hx) / e * 0.7, (h - hy) / e * 0.7, 1.0));
  vec3 c = sky(reflect(vec3(0.0, 0.0, -1.0), n));
  // A soft pool of shadow behind the type keeps the letters crisp.
  float r = length((uv - 0.5) * u_resolution) / min(u_resolution.x, u_resolution.y);
  return c * mix(0.12, 1.0, smoothstep(0.05, 0.34, r));
}

vec3 sampleSource(vec2 uv) {
  if (u_hasVideo > 0.5) return texture2D(u_video, uv).rgb;
  return plate(uv);
}

void main() {
  vec2 uv = v_uv;
  float screenAspect = u_resolution.x / max(u_resolution.y, 1.0);
  float videoAspect = u_videoSize.x / max(u_videoSize.y, 1.0);
  vec2 uvCover = uv;
  if (screenAspect > videoAspect) {
    uvCover.y = (uv.y - 0.5) * (videoAspect / screenAspect) + 0.5;
  } else {
    uvCover.x = (uv.x - 0.5) * (screenAspect / videoAspect) + 0.5;
  }

  vec2 d = uvCover - 0.5;
  float dist = dot(d, d);
  vec2 off = d * (u_chroma * (0.015 + dist * 0.035));
  vec3 color = vec3(
    sampleSource(uvCover + off).r,
    sampleSource(uvCover).g,
    sampleSource(uvCover - off).b
  );
  color = (color - 0.5) * u_contrast + 0.5;

  if (u_scanlines > 0.0) {
    float scan = sin(uv.y * u_resolution.y * 0.75) * 0.5 + 0.5;
    color *= 1.0 - u_scanlines * 0.25 * scan;
  }
  color += (hash(uv * u_resolution.xy) - 0.5) * u_grain;
  color *= 1.0 - smoothstep(0.4, 1.4, length(d) * 1.5);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const TCP_CSS = `
.tcp-root, .tcp-root * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
.tcp-root { position: fixed; inset: 0; z-index: 100; user-select: none; -webkit-user-select: none; background: #0b0c0d; color: #ecedeb; opacity: 1; transition: opacity 0.75s cubic-bezier(0.87, 0, 0.13, 1); cursor: default; }
.tcp-root[data-exited="true"] { opacity: 0; pointer-events: none; }
.tcp-root video, .tcp-root canvas { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; display: block; }
.tcp-root video { z-index: 5; }
.tcp-root canvas { z-index: 10; pointer-events: none; }
.tcp-root video[data-textured="true"] { opacity: 0; }
.tcp-fallback { position: absolute; inset: 0; z-index: 4; background:
  radial-gradient(60% 50% at 50% 46%, rgba(236,237,235,0.16), transparent 70%),
  linear-gradient(115deg, #0b0c0d 0%, #2a2c2f 38%, #8d9398 50%, #2a2c2f 62%, #0b0c0d 100%);
  background-size: 100% 100%, 260% 100%; animation: tcp-sheen 3.2s ease-in-out infinite alternate; }
@keyframes tcp-sheen { from { background-position: 0 0, 0% 0; } to { background-position: 0 0, 100% 0; } }
.tcp-wrapper { position: absolute; inset: 0; z-index: 30; pointer-events: none; }
.tcp-scene { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: var(--tcp-cube); height: var(--tcp-cube); perspective: 800px; display: flex; align-items: center; justify-content: center; z-index: 35; }
.tcp-cube { position: relative; width: 100%; height: 100%; font-family: "Saira Extra Condensed", "Arial Narrow", sans-serif; font-size: var(--tcp-cube); font-weight: 800; color: #f4f5f3; transform-style: preserve-3d; transform: scaleY(1.3); transform-origin: center; }
.tcp-char { position: absolute; inset: 0; width: 100%; height: 100%; line-height: 1; display: flex; align-items: center; justify-content: center; opacity: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.tcp-char span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: block; line-height: 0.8; }
@keyframes tcpFirstChar { 0% { opacity: 0; transform: translateX(100%) rotateY(90deg); } 50% { opacity: 1; transform: translateX(0) rotateY(0deg); } 100% { opacity: 0.5; transform: translateY(-100%) rotateX(90deg); } }
@keyframes tcpFromBottomOutRight { 0% { opacity: 0; transform: translateY(100%) rotateX(-90deg); } 50% { opacity: 1; transform: translateY(0) rotateX(0deg); } 100% { opacity: 0.5; transform: translateX(100%) rotateY(90deg); } }
@keyframes tcpFromLeftOutTop { 0% { opacity: 0; transform: translateX(-100%) rotateY(-90deg); } 50% { opacity: 1; transform: translateX(0) rotateY(0deg); } 100% { opacity: 0.5; transform: translateY(-100%) rotateX(90deg); } }
@keyframes tcpFromBottomOutLeft { 0% { opacity: 0; transform: translateY(100%) rotateX(-90deg); } 50% { opacity: 1; transform: translateY(0) rotateX(0deg); } 100% { opacity: 0.5; transform: translateX(-100%) rotateY(-90deg); } }
@keyframes tcpFromRightOutTop { 0% { opacity: 0; transform: translateX(100%) rotateY(90deg); } 50% { opacity: 1; transform: translateX(0) rotateY(0deg); } 100% { opacity: 0.5; transform: translateY(-100%) rotateX(90deg); } }
.tcp-firstChar { animation-name: tcpFirstChar; transform-origin: left bottom; }
.tcp-fromBottomOutRight { animation-name: tcpFromBottomOutRight; transform-origin: left top; }
.tcp-fromLeftOutTop { animation-name: tcpFromLeftOutTop; transform-origin: right bottom; }
.tcp-fromBottomOutLeft { animation-name: tcpFromBottomOutLeft; transform-origin: right top; }
.tcp-fromRightOutTop { animation-name: tcpFromRightOutTop; transform-origin: left bottom; }
.tcp-perc { position: absolute; top: calc(50% + var(--tcp-cube) * 0.82 + 8px); left: 0; width: 100%; display: flex; justify-content: center; align-items: center; font-family: "Fragment Mono", ui-monospace, monospace; font-size: 13px; letter-spacing: 0.04em; color: #f4f5f3; z-index: 40; font-variant-numeric: tabular-nums; transition: opacity 0.25s ease; }
.tcp-perc[data-exiting="true"] { opacity: 0; transition: opacity 0.8s cubic-bezier(0.87, 0, 0.13, 1); }
.tcp-perc-mask { display: inline-flex; overflow: hidden; }
.tcp-perc-inner { display: inline-block; transition: transform 0.25s ease; }
.tcp-perc[data-exiting="true"] .tcp-perc-inner { transform: translate3d(0, 110%, 0); transition: transform 0.8s cubic-bezier(0.87, 0, 0.13, 1); }
.tcp-perc-value { min-width: 26px; text-align: right; }
.tcp-skip { position: absolute; z-index: 45; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); min-height: 44px; padding: 0 12px; border: 0; background: transparent; color: rgba(236,237,235,0.55); font: 12px/1 "Zen Kaku Gothic New", system-ui, sans-serif; letter-spacing: 0.02em; cursor: pointer; }
.tcp-skip:hover, .tcp-skip:focus-visible { color: #ecedeb; }
.tcp-skip:focus-visible { outline: 2px solid #c9cdd1; outline-offset: 2px; }
@media (max-width: 840px) { .tcp-scene { --tcp-cube: 64px; } }
`;

export default function ChromaGlitchPreloader({
  word = "BASSEY",
  videoSrc,
  grade,
  speed = 1.25,
  cubeSize = "96px",
  loop = false,
  onComplete,
  onExit,
  className = "",
}: ChromaGlitchPreloaderProps) {
  const [progress, setProgress] = React.useState(0);
  const [phase, setPhase] = React.useState<"loading" | "exiting" | "done">("loading");
  const [cycle, setCycle] = React.useState(0);
  const [glReady, setGlReady] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = React.useRef(onComplete);
  const onExitRef = React.useRef(onExit);
  onCompleteRef.current = onComplete;
  onExitRef.current = onExit;
  const gradeRef = React.useRef<ChromaGlitchGrade>({ ...DEFAULT_GRADE, ...grade });
  gradeRef.current = { ...DEFAULT_GRADE, ...grade };

  const letters = React.useMemo(() => word.toUpperCase().split(""), [word]);
  const runtime = preloaderDuration(letters.length, speed);
  const skippedRef = React.useRef(false);

  const finish = React.useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setProgress(100);
    setPhase("exiting");
    onExitRef.current?.();
    window.setTimeout(() => {
      setPhase("done");
      onCompleteRef.current?.();
    }, EXIT_MS);
  }, []);

  // WebGL plate. Falls back to a CSS chrome sheen when unavailable. Starts a
  // frame late, so a preloader that is unmounted straight away (a returning
  // visitor) never creates a context.
  React.useEffect(() => {
    let cleanup: (() => void) | undefined;
    const id = requestAnimationFrame(() => {
      cleanup = startGL();
    });
    return () => {
      cancelAnimationFrame(id);
      cleanup?.();
    };
    // startGL only touches refs and a stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startGL(): (() => void) | undefined {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const posAttr = gl.getAttribLocation(prog, "a_position");
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const loc = {
      video: u("u_video"),
      time: u("u_time"),
      res: u("u_resolution"),
      videoSize: u("u_videoSize"),
      chroma: u("u_chroma"),
      grain: u("u_grain"),
      scanlines: u("u_scanlines"),
      contrast: u("u_contrast"),
      hasVideo: u("u_hasVideo"),
    };

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Rendered a touch under full resolution; grain and aberration hide it.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    let destroyed = false;
    let textured = false;
    let started = false;
    const t0 = performance.now();

    const render = (now: number) => {
      if (destroyed) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          textured = true;
        } catch {
          textured = false;
        }
      }
      const g = gradeRef.current;
      gl.uniform1i(loc.video, 0);
      gl.uniform1f(loc.time, (now - t0) / 1000 + 6);
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform2f(
        loc.videoSize,
        textured && video ? video.videoWidth : canvas.width,
        textured && video ? video.videoHeight : canvas.height,
      );
      gl.uniform1f(loc.chroma, g.chroma);
      gl.uniform1f(loc.grain, g.grain);
      gl.uniform1f(loc.scanlines, g.scanlines);
      gl.uniform1f(loc.contrast, g.contrast);
      gl.uniform1f(loc.hasVideo, textured ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!started) {
        started = true;
        setGlReady(true);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteTexture(texture);
      gl.deleteBuffer(posBuf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }

  React.useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, [videoSrc]);

  // Counter, then the exit (or the next loop).
  React.useEffect(() => {
    setProgress(0);
    setPhase("loading");
    skippedRef.current = false;
    const start = performance.now();
    let raf = 0;
    const timers: number[] = [];
    const update = (now: number) => {
      if (skippedRef.current) return;
      const t = Math.min(1, (now - start) / runtime);
      setProgress(preloaderProgress(t));
      if (t < 1) {
        raf = requestAnimationFrame(update);
        return;
      }
      if (loop) {
        timers.push(window.setTimeout(() => setPhase("exiting"), 250));
        timers.push(window.setTimeout(() => setCycle((c) => c + 1), 1150));
        return;
      }
      timers.push(window.setTimeout(finish, 250 / speed));
    };
    raf = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [runtime, speed, loop, cycle, finish]);

  // Any key skips.
  React.useEffect(() => {
    if (loop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, loop]);

  if (phase === "done") return null;

  const charDurationSec = CHAR_DURATION_MS / speed / 1000;
  const stepDelaySec = STEP_DELAY_MS / speed / 1000;
  const exiting = phase !== "loading";

  return (
    <div
      className={"tcp-root " + className}
      data-exited={!loop && exiting}
      onPointerDown={loop ? undefined : finish}
      style={{ ["--tcp-cube" as string]: cubeSize } as React.CSSProperties}
    >
      <style>{TCP_CSS}</style>
      {!glReady && <div className="tcp-fallback" aria-hidden="true" />}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          data-textured={glReady}
        />
      ) : null}
      <canvas ref={canvasRef} aria-hidden="true" />

      <div
        className="tcp-wrapper"
        role="progressbar"
        aria-label={`Loading ${word}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="tcp-scene">
          <div className="tcp-cube" key={cycle}>
            {letters.map((char, i) => (
              <div
                key={String(i) + char}
                className={"tcp-char " + TUMBLE_CLASSES[i % TUMBLE_CLASSES.length]}
                style={{
                  animationDuration: charDurationSec.toFixed(2) + "s",
                  animationDelay: (i * stepDelaySec).toFixed(2) + "s",
                  animationTimingFunction: "cubic-bezier(0.83, 0, 0.17, 1)",
                  animationFillMode: i === letters.length - 1 ? "forwards" : "both",
                }}
              >
                <span>{char}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="tcp-perc" data-exiting={exiting}>
          <span className="tcp-perc-mask">
            <span className="tcp-perc-inner tcp-perc-value">{progress}</span>
          </span>
          <span className="tcp-perc-mask">
            <span className="tcp-perc-inner">%</span>
          </span>
        </div>
      </div>

      {!loop && (
        <button type="button" className="tcp-skip" onClick={finish}>
          Skip intro
        </button>
      )}
    </div>
  );
}
