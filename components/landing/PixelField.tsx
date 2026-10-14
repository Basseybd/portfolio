"use client";

// Pixel abstracts for the two doors.
//
// Work: a halftone field of silver squares on graphite. The field is the same
// liquid chrome as the preloader, quantized to a few levels, each level a
// square of a different size. Hovering speeds it up and the cursor lights the
// squares around it.
//
// Life: his photographs, downsampled into a coarse mosaic. Every few seconds
// the board flips to the next photo, cell by cell, like a split-flap sign.
// Hovering flips faster and the cursor presses the cells around it.
//
// Both are canvas 2D, pause offscreen and in background tabs, and hold a still
// frame for reduced motion.
//
// The canvas is sized once, to the door at its widest, and the door shows a
// window onto it (see Doors.module.css). The door's --kl, --kr, --kt and --kb
// say how much of it is clipped on each side, and the canvas stays centered on
// the window, so cells outside it are skipped. While the clip animates, the
// larger of the old and new windows is drawn.

import { useEffect, useRef } from "react";
import { photoSrc, type Photo } from "@/lib/content";

type Common = { active: boolean; className?: string };
export type PixelFieldProps =
  | (Common & { mode: "work" })
  | (Common & { mode: "life"; photos: Photo[]; onPhoto?: (index: number) => void });

type Ripple = { x: number; y: number; t0: number };

const WORK_BG = "#17181a";
const LIFE_BG = "#101113";
// Level 0 draws nothing. Higher levels are bigger and brighter.
const WORK_PALETTE = ["", "#2b2d30", "#3e4145", "#5c6065", "#868b90", "#b6babe", "#e4e6e8", "#fbfbfc"];
const LEVELS = WORK_PALETTE.length - 1;

const LIFE_DWELL = 4600;
const LIFE_DWELL_ACTIVE = 1500;
const FLIP_MS = 1150;
const RIPPLE_MS = 1500;
// A little longer than the door's clip transition.
const CLIP_MS = 1000;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function PixelField(props: PixelFieldProps) {
  const { mode, active, className } = props;
  const photos = props.mode === "life" ? props.photos : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const onPhotoRef = useRef<((i: number) => void) | undefined>(undefined);
  const kickRef = useRef<() => void>(() => undefined);
  activeRef.current = active;
  onPhotoRef.current = props.mode === "life" ? props.onPhoto : undefined;

  // A hover change wakes the loop (it may be idling on a still life frame).
  useEffect(() => {
    kickRef.current();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const host = (canvas.closest("a") as HTMLElement | null) ?? canvas.parentElement ?? canvas;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let cell = 12;
    let cols = 0;
    let rows = 0;
    let ox = 0;
    let oy = 0;
    let levels = new Uint8Array(0);

    // Pointer, in device pixels relative to the canvas.
    const pointer = { x: 0, y: 0, inside: false, k: 0 };
    let ripples: Ripple[] = [];

    // Work clock.
    let clock = 9;
    let speed = 1;

    // Life state.
    const list = photos ?? [];
    const images: (HTMLImageElement | null)[] = list.map(() => null);
    const ready: boolean[] = list.map(() => false);
    let grids: (Uint8ClampedArray | null)[] = list.map(() => null);
    let order = new Float32Array(0);
    let current = 0;
    let flip: { from: number; to: number; t0: number } | null = null;
    let nextAt = 0;

    let raf = 0;
    let last = 0;
    let running = false;
    let visible = true;
    let destroyed = false;

    // The door's window: the fraction clipped across each axis (both sides
    // together), the widest recent one while the clip animates, and the
    // visible cell range it gives (inclusive).
    let kx = Number.NaN;
    let ky = Number.NaN;
    let holdX = 0;
    let holdY = 0;
    let holdUntil = 0;
    let c0 = 0;
    let c1 = 0;
    let r0 = 0;
    let r1 = 0;
    // How much the door hides at rest, across each axis. Photos are framed
    // for the door at rest.
    let restKx = 0;
    let restKy = 0;

    // Read only when something may have changed it (a hover, a resize), never
    // per frame: reading styles mid-transition forces an extra style pass.
    const clipVar = (cs: CSSStyleDeclaration, name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    const readClip = () => {
      const cs = getComputedStyle(host);
      const nx = clipVar(cs, "--kl") + clipVar(cs, "--kr");
      const ny = clipVar(cs, "--kt") + clipVar(cs, "--kb");
      if (nx === kx && ny === ky) return;
      if (!Number.isNaN(kx)) {
        const now = performance.now();
        const holding = now < holdUntil;
        holdX = Math.min(holding ? holdX : kx, kx, nx);
        holdY = Math.min(holding ? holdY : ky, ky, ny);
        holdUntil = now + CLIP_MS;
      }
      kx = nx;
      ky = ny;
    };
    const clipWindow = (now: number, full: boolean) => {
      c0 = 0;
      c1 = cols - 1;
      r0 = 0;
      r1 = rows - 1;
      if (full || Number.isNaN(kx)) return;
      const ex = now < holdUntil ? Math.min(holdX, kx) : kx;
      const ey = now < holdUntil ? Math.min(holdY, ky) : ky;
      // The canvas is the door less its 1.5px bezel on each side, centered on
      // the window, so the hidden margin is the same on both sides.
      const mx = (ex * (W + 3 * dpr)) / 2;
      const my = (ey * (H + 3 * dpr)) / 2;
      c0 = Math.max(0, Math.floor((mx - ox) / cell) - 1);
      c1 = Math.min(cols - 1, Math.floor((W - mx - ox) / cell) + 1);
      r0 = Math.max(0, Math.floor((my - oy) / cell) - 1);
      r1 = Math.min(rows - 1, Math.floor((H - my - oy) / cell) + 1);
    };

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const cw = Math.max(1, rect.width);
      const ch = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(cw * dpr);
      H = Math.round(ch * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      // Sized from the viewport, not the door, so the grid holds steady while
      // a door widens on hover.
      const short = Math.min(window.innerWidth, window.innerHeight * 1.4);
      const cssCell =
        mode === "work"
          ? Math.max(10, Math.min(17, Math.round(short / 36)))
          : Math.max(15, Math.min(28, Math.round(short / 26)));
      cell = Math.max(4, Math.round(cssCell * dpr));
      // Odd counts keep a cell on the center line, so the grid only ever
      // grows by whole cells on each side.
      cols = Math.ceil(W / cell) | 1;
      rows = Math.ceil(H / cell) | 1;
      ox = Math.round((W - cols * cell) / 2);
      oy = Math.round((H - rows * cell) / 2);
      levels = new Uint8Array(cols * rows);
      const cs = getComputedStyle(host);
      restKx = clipVar(cs, "--rest-kx");
      restKy = clipVar(cs, "--rest-ky");
      if (mode === "life") {
        // Flip order: a diagonal sweep from the top left, roughened.
        order = new Float32Array(cols * rows);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const diag = (c / Math.max(1, cols - 1)) * 0.55 + (r / Math.max(1, rows - 1)) * 0.45;
            order[r * cols + c] = clamp01(diag * 0.72 + hash(c, r) * 0.28);
          }
        }
        // Resampled lazily, only for the photos on screen.
        grids = list.map(() => null);
      }
    };

    // Downsample a photo to one color per cell. It is cropped like
    // object-fit: cover against the door at rest, exactly as it would be on a
    // door that size, and the canvas beyond that (shown as the door widens)
    // continues the photo, mirrored at its edges where it runs out.
    const sample = (i: number): Uint8ClampedArray | null => {
      const img = images[i];
      if (!img || !cols || !rows) return null;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      // The grid a door at rest would have: same cell, odd counts, centered.
      const restCols = Math.ceil(((W + 3 * dpr) * (1 - restKx)) / cell) | 1;
      const restRows = Math.ceil(((H + 3 * dpr) * (1 - restKy)) / cell) | 1;
      const ta = restCols / restRows;
      let sx = 0;
      let sy = 0;
      let sw = iw;
      let sh = ih;
      if (iw / ih > ta) {
        sw = sh * ta;
        sx = (iw - sw) / 2;
      } else {
        sh = sw / ta;
        sy = (ih - sh) * 0.36;
      }
      // Photo pixels to canvas pixels.
      const scale = (restCols * cell) / sw;
      const left = W / 2 - (restCols * cell) / 2 - sx * scale;
      const top = H / 2 - (restRows * cell) / 2 - sy * scale;
      // Two steps so the average is a real average, not a nearest pixel.
      const mid = document.createElement("canvas");
      mid.width = cols * 4;
      mid.height = rows * 4;
      const mctx = mid.getContext("2d");
      const out = document.createElement("canvas");
      out.width = cols;
      out.height = rows;
      const octx = out.getContext("2d", { willReadFrequently: true });
      if (!mctx || !octx) return null;
      mctx.imageSmoothingEnabled = true;
      mctx.imageSmoothingQuality = "high";
      const k = 4 / cell;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          mctx.setTransform(k * scale, 0, 0, k * scale, (left - ox) * k, (top - oy) * k);
          // The photo, with mirrored copies around it.
          mctx.transform(dx ? -1 : 1, 0, 0, dy ? -1 : 1, dx > 0 ? 2 * iw : 0, dy > 0 ? 2 * ih : 0);
          mctx.drawImage(img, 0, 0);
        }
      }
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      octx.drawImage(mid, 0, 0, cols, rows);
      try {
        const data = octx.getImageData(0, 0, cols, rows).data;
        // A little extra saturation so the mosaic reads as fields of color.
        for (let p = 0; p < data.length; p += 4) {
          let r = data[p];
          let g = data[p + 1];
          let b = data[p + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          r = l + (r - l) * 1.18;
          g = l + (g - l) * 1.18;
          b = l + (b - l) * 1.18;
          // Lift the shadows so night shots still read as color.
          data[p] = 255 * Math.pow(Math.max(0, r) / 255, 0.86);
          data[p + 1] = 255 * Math.pow(Math.max(0, g) / 255, 0.86);
          data[p + 2] = 255 * Math.pow(Math.max(0, b) / 255, 0.86);
        }
        return data;
      } catch {
        return null;
      }
    };

    const grid = (i: number) => {
      if (!grids[i] && ready[i]) grids[i] = sample(i);
      return grids[i];
    };

    const load = (i: number) => {
      if (images[i] || !list[i]) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (destroyed) return;
        ready[i] = true;
        grids[i] = sample(i);
        if (i === current) {
          onPhotoRef.current?.(current);
          kick();
        }
      };
      img.src = photoSrc(list[i].slug, 640);
      images[i] = img;
    };

    // Work: the preloader's liquid chrome, as pixels. A rippling surface
    // reflects a bright sky over a dark floor; where it folds, the horizon
    // shows as a hard line of white squares.
    const surface = (px: number, py: number, t: number) =>
      0.55 * Math.sin(px * 1.1 + Math.sin(py * 0.9 + t) * 1.4 + t * 0.5) +
      0.5 * Math.sin(py * 1.5 + Math.sin(px * 1.0 - t * 0.6) * 1.3 - t * 0.4) +
      0.28 * Math.sin(px * 2.3 - py * 1.7 + t * 0.9);
    const field = (x: number, y: number, t: number) => {
      const px = (x - 0.5 * (W / H)) * 3.2;
      const py = (y - 0.5) * 3.2;
      const e = 0.01;
      const h = surface(px, py, t);
      const nx = ((h - surface(px + e, py, t)) / e) * 0.7;
      const ny = ((h - surface(px, py + e, t)) / e) * 0.7;
      const len = Math.hypot(nx, ny, 1);
      // y of the reflected view ray off the surface normal (nx, ny, 1) / len.
      const ry = (2 / len) * (ny / len);
      const above = clamp01((ry + 0.02) / 0.04);
      const upper = 1 - 0.74 * Math.pow(clamp01(ry), 0.5);
      const floor = 0.12 * clamp01((ry + 1) / 0.95);
      return floor + (upper - floor) * above + Math.exp(-Math.abs(ry - 0.02) * 60) * 0.45;
    };

    const pointerBoost = (x: number, y: number, now: number, radius: number) => {
      let v = 0;
      if (pointer.k > 0.002) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        v += pointer.k * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
      }
      for (const rp of ripples) {
        const age = now - rp.t0;
        const rad = age * 0.62 * dpr;
        const width = 26 * dpr;
        const d = Math.hypot(x - rp.x, y - rp.y) - rad;
        v += (1 - age / RIPPLE_MS) * Math.exp(-(d * d) / (width * width)) * 0.9;
      }
      return v;
    };

    const drawWork = (now: number, whole = false) => {
      clipWindow(now, whole);
      ctx.fillStyle = WORK_BG;
      ctx.fillRect(0, 0, W, H);
      const t = clock;
      const radius = 120 * dpr;
      for (let r = r0; r <= r1; r++) {
        const cy = oy + r * cell + cell / 2;
        const ny = cy / H;
        for (let c = c0; c <= c1; c++) {
          const cx = ox + c * cell + cell / 2;
          let v = field(cx / H, ny, t);
          v += pointerBoost(cx, cy, now, radius) * 0.55;
          levels[r * cols + c] = Math.round(clamp01(v) * LEVELS);
        }
      }
      // One fillStyle per level.
      for (let L = 1; L <= LEVELS; L++) {
        ctx.fillStyle = WORK_PALETTE[L];
        const size = Math.max(1, Math.round(cell * (0.14 + 0.72 * (L / LEVELS))));
        const inset = Math.round((cell - size) / 2);
        for (let r = r0; r <= r1; r++) {
          const y = oy + r * cell + inset;
          for (let c = c0; c <= c1; c++) {
            if (levels[r * cols + c] !== L) continue;
            ctx.fillRect(ox + c * cell + inset, y, size, size);
          }
        }
      }
    };

    const drawLife = (now: number, whole = false) => {
      clipWindow(now, whole);
      ctx.fillStyle = LIFE_BG;
      ctx.fillRect(0, 0, W, H);
      const gap = Math.max(1, Math.round(dpr));
      const full = cell - gap;
      const radius = 110 * dpr;
      const from = grid(flip ? flip.from : current);
      const to = flip ? grid(flip.to) : null;
      const fp = flip ? (now - flip.t0) / FLIP_MS : 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = r * cols + c;
          let src = from;
          let h = 1;
          if (flip && to) {
            const p = clamp01((fp - order[k] * 0.62) / 0.38);
            src = p < 0.5 ? from : to;
            h = Math.abs(Math.cos(p * Math.PI));
          }
          if (!src) continue;
          const boost = Math.min(1, pointerBoost(ox + c * cell + cell / 2, oy + r * cell + cell / 2, now, radius));
          const s = 1 - boost * 0.38;
          const w = Math.max(1, Math.round(full * s));
          const hh = Math.max(1, Math.round(full * s * h));
          const lift = boost * 0.16;
          const i4 = k * 4;
          const R = src[i4] + (255 - src[i4]) * lift;
          const G = src[i4 + 1] + (255 - src[i4 + 1]) * lift;
          const B = src[i4 + 2] + (255 - src[i4 + 2]) * lift;
          ctx.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
          ctx.fillRect(
            ox + c * cell + Math.round((cell - w) / 2),
            oy + r * cell + Math.round((cell - hh) / 2),
            w,
            hh,
          );
        }
      }
    };

    const startFlip = (now: number) => {
      if (list.length < 2) return;
      const to = (current + 1) % list.length;
      load((to + 1) % list.length);
      if (!grid(to)) {
        load(to);
        nextAt = now + 400;
        return;
      }
      flip = { from: current, to, t0: now };
      onPhotoRef.current?.(to);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!running) return;
      const dt = Math.min(64, last ? now - last : 16);
      // Cap at ~60fps on high refresh screens.
      if (last && now - last < 15) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = now;

      const on = activeRef.current;
      pointer.k += ((on && pointer.inside ? 1 : 0) - pointer.k) * 0.12;
      ripples = ripples.filter((rp) => now - rp.t0 < RIPPLE_MS);

      if (mode === "work") {
        speed += ((on ? 2.6 : 1) - speed) * 0.05;
        clock += (dt / 1000) * 0.4 * speed;
        drawWork(now);
        raf = requestAnimationFrame(frame);
        return;
      }

      // Life
      if (!nextAt) nextAt = now + LIFE_DWELL;
      if (flip && now - flip.t0 >= FLIP_MS) {
        current = flip.to;
        flip = null;
        nextAt = now + (on ? LIFE_DWELL_ACTIVE : LIFE_DWELL);
      }
      if (!flip && on) nextAt = Math.min(nextAt, now + LIFE_DWELL_ACTIVE);
      if (!flip && now >= nextAt) startFlip(now);
      const busy = !!flip || ripples.length > 0 || pointer.k > 0.003 || on;
      // A frame it will sleep on is drawn in full: the window can widen
      // (the other door let go) without waking this loop.
      drawLife(now, !busy);

      if (busy) {
        raf = requestAnimationFrame(frame);
      } else {
        // Nothing moving: sleep until the next flip.
        const wait = Math.max(16, nextAt - now);
        window.setTimeout(() => {
          if (running && !raf) raf = requestAnimationFrame(frame);
        }, wait);
      }
    };

    const canRun = () => !reduce && visible && !document.hidden && !destroyed;
    const update = () => {
      const should = canRun();
      if (should && !running) {
        running = true;
        last = 0;
        if (!raf) raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const kick = () => {
      if (destroyed) return;
      if (reduce) {
        drawStill();
        return;
      }
      if (running && !raf) raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const drawStill = () => {
      const now = performance.now();
      if (mode === "work") drawWork(now, true);
      else drawLife(now, true);
    };

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const p = toLocal(e);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      kick();
    };
    const onEnter = (e: PointerEvent) => {
      if (reduce) return;
      const p = toLocal(e);
      if (e.pointerType === "mouse") {
        pointer.x = p.x;
        pointer.y = p.y;
        pointer.inside = true;
      }
      ripples.push({ x: p.x, y: p.y, t0: performance.now() });
      kick();
    };
    const onLeave = () => {
      pointer.inside = false;
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (reduce) return;
      const p = toLocal(e);
      ripples.push({ x: p.x, y: p.y, t0: performance.now() });
      kick();
    };

    layout();
    readClip();
    if (mode === "life") {
      load(0);
      load(1);
    }
    drawStill();

    const ro = new ResizeObserver(() => {
      layout();
      readClip();
      drawStill();
      kick();
    });
    ro.observe(canvas);
    // The doors change their clip by flipping data-active on an ancestor.
    const mo = new MutationObserver(readClip);
    for (let el = host.parentElement; el; el = el.parentElement) {
      mo.observe(el, { attributes: true, attributeFilter: ["data-active"] });
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", update);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    update();

    return () => {
      destroyed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      kickRef.current = () => undefined;
    };
  }, [mode, photos]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
