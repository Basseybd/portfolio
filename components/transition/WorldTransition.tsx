"use client";

// Carries a visitor from one world to the other. go() floods the screen from
// the point they clicked, in that world's material (graphite and chrome for
// Work, the photo's own color for Life, pale silver and chrome for Photos and
// home), pushes the route while covered, then
// lifts the cover off the new page once it has rendered.
//
// Mount WorldTransitionProvider once, high in the tree, so it survives route
// changes. Pages can listen for the "worldtransition:reveal" window event, or
// read `phase` from useWorldTransition(), to start their own entrance as the
// cover lifts. <html data-world-transition="cover|hold|reveal"> is set too.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./WorldTransition.module.css";

export type World = "work" | "life" | "photos" | "home";
export type GoOptions = {
  /** Viewport x of the click. Defaults to the center of the screen. */
  x?: number;
  /** Viewport y of the click. Defaults to the center of the screen. */
  y?: number;
  world: World;
  /** Life only: the accent of the photo that was showing. */
  color?: string;
};
export type TransitionPhase = "idle" | "cover" | "hold" | "reveal";

type ContextValue = {
  go: (href: string, options: GoOptions) => void;
  phase: TransitionPhase;
};

const WorldTransitionContext = createContext<ContextValue | null>(null);

const COVER_MS = 430;
const REVEAL_MS = 400;
const TRAIL_MS = 40;
const SHEEN_MS = 980;
const FADE_IN_MS = 160;
const FADE_OUT_MS = 240;
const SAFETY_MS = 6000;
const RIM_PX = 3;
const START_PX = 14;
const COVER_EASE = "cubic-bezier(0.6, 0.04, 0.3, 1)";
const LIFT_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";
const DEFAULT_LIFE_COLOR = "#2F6FD0";

type Run = {
  from: string;
  to: string;
  reduce: boolean;
  covered: boolean;
  arrived: boolean;
  revealing: boolean;
  timer: number;
  anims: Animation[];
  detail: { world: World; color?: string };
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const nextFrames = (count: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });

export function WorldTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const rootRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const run = useRef<Run | null>(null);
  const [phase, setPhaseState] = useState<TransitionPhase>("idle");

  const setPhase = useCallback((next: TransitionPhase) => {
    const root = rootRef.current;
    if (root) {
      if (next === "idle") root.removeAttribute("data-phase");
      else root.dataset.phase = next;
    }
    const html = document.documentElement;
    if (next === "idle") html.removeAttribute("data-world-transition");
    else html.dataset.worldTransition = next;
    setPhaseState(next);
  }, []);

  const reset = useCallback(() => {
    const r = run.current;
    if (r) {
      window.clearTimeout(r.timer);
      r.anims.forEach((a) => a.cancel());
    }
    run.current = null;
    const root = rootRef.current;
    if (root) root.removeAttribute("data-reduce");
    if (frontRef.current) frontRef.current.style.removeProperty("opacity");
    setPhase("idle");
  }, [setPhase]);

  const reveal = useCallback(async () => {
    const r = run.current;
    const front = frontRef.current;
    const back = backRef.current;
    if (!r || r.revealing || !front || !back) return;
    r.revealing = true;
    window.clearTimeout(r.timer);
    // Give the new page two frames to paint before the cover moves.
    await nextFrames(2);
    if (run.current !== r) return;
    setPhase("reveal");
    window.dispatchEvent(new CustomEvent("worldtransition:reveal", { detail: r.detail }));

    let anims: Animation[];
    if (r.reduce) {
      anims = [front.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: "ease-out", fill: "forwards" })];
    } else {
      const lift = [{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(0, -100%, 0)" }];
      anims = [
        front.animate(lift, { duration: REVEAL_MS, easing: LIFT_EASE, fill: "forwards" }),
        back.animate(lift, { duration: REVEAL_MS, delay: TRAIL_MS, easing: LIFT_EASE, fill: "forwards" }),
      ];
    }
    r.anims.push(...anims);
    await Promise.all(anims.map((a) => a.finished)).catch(() => undefined);
    if (run.current === r) {
      window.dispatchEvent(new CustomEvent("worldtransition:done", { detail: r.detail }));
      reset();
    }
  }, [reset, setPhase]);

  const covered = useCallback(
    (href: string) => {
      const r = run.current;
      if (!r) return;
      r.covered = true;
      setPhase("hold");
      // CSS takes over (no clip while holding); the cover animations can go.
      r.anims.forEach((a) => {
        if ((a.effect as KeyframeEffect | null)?.target !== sheenRef.current) a.cancel();
      });
      router.push(href);
      // Same route (only the query or hash changed): nothing will re-render the path.
      if (r.to === r.from) r.arrived = true;
      if (r.arrived) void reveal();
      else r.timer = window.setTimeout(() => void reveal(), SAFETY_MS);
    },
    [reveal, router, setPhase],
  );

  const go = useCallback(
    (href: string, options: GoOptions) => {
      if (run.current) return;
      const root = rootRef.current;
      const front = frontRef.current;
      const field = fieldRef.current;
      const rim = rimRef.current;
      const sheen = sheenRef.current;
      const target = new URL(href, window.location.href);
      if (target.origin !== window.location.origin) {
        window.location.assign(target.href);
        return;
      }
      if (!root || !front || !field || !rim || !sheen) {
        router.push(href);
        return;
      }
      router.prefetch(href);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const r: Run = {
        from: pathRef.current,
        to: target.pathname,
        reduce,
        covered: false,
        arrived: false,
        revealing: false,
        timer: 0,
        anims: [],
        detail: { world: options.world, color: options.world === "life" ? options.color || DEFAULT_LIFE_COLOR : undefined },
      };
      run.current = r;

      const box = root.getBoundingClientRect();
      const w = box.width || window.innerWidth;
      const h = box.height || window.innerHeight;
      const x = options.x ?? w / 2;
      const y = options.y ?? h / 2;

      root.dataset.world = options.world;
      root.style.setProperty("--wt-x", `${x}px`);
      root.style.setProperty("--wt-y", `${y}px`);
      if (options.world === "life") {
        // The photo's color, taken a little toward graphite so it reads rich, not loud.
        const c = mix(options.color || DEFAULT_LIFE_COLOR, "#17181a", 0.3);
        root.style.setProperty("--wt-color", c);
        root.style.setProperty("--wt-light", mix(c, "#ffffff", 0.16));
        root.style.setProperty("--wt-deep", mix(c, "#000000", 0.22));
        root.style.setProperty("--wt-tint", mix(c, "#ffffff", 0.3));
        root.style.setProperty("--wt-tint-deep", mix(c, "#ffffff", 0.12));
      }

      if (reduce) {
        root.dataset.reduce = "";
        setPhase("cover");
        const a = front.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: "ease-in", fill: "forwards" });
        r.anims.push(a);
        a.finished.then(() => run.current === r && covered(href)).catch(() => undefined);
        return;
      }

      root.removeAttribute("data-reduce");
      setPhase("cover");

      const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + RIM_PX + 2;
      const timing: KeyframeAnimationOptions = { duration: COVER_MS, easing: COVER_EASE, fill: "forwards" };
      const circle = (rad: number, at: string) => {
        const v = `circle(${rad.toFixed(1)}px at ${at})`;
        return { clipPath: v, webkitClipPath: v };
      };
      const at = `${x}px ${y}px`;
      const cover = field.animate([circle(START_PX, at), circle(R, at)], timing);
      r.anims.push(cover);

      if (options.world !== "life") {
        // The rim is a square centered on the click, so it can turn in place
        // and its glints travel around the edge as it grows.
        const S = Math.ceil(R + RIM_PX + 4);
        rim.style.left = `${x - S}px`;
        rim.style.top = `${y - S}px`;
        rim.style.width = rim.style.height = `${S * 2}px`;
        r.anims.push(
          rim.animate(
            [
              { ...circle(START_PX + RIM_PX, "50% 50%"), transform: "rotate(0deg)" },
              { ...circle(R + RIM_PX, "50% 50%"), transform: "rotate(150deg)" },
            ],
            timing,
          ),
        );
      }
      if (options.world === "work") {
        r.anims.push(
          sheen.animate(
            [
              { transform: "translate3d(-110%, 0, 0) skewX(-16deg)" },
              { transform: `translate3d(${Math.round(w * 1.15)}px, 0, 0) skewX(-16deg)` },
            ],
            { duration: SHEEN_MS, easing: "cubic-bezier(0.3, 0.1, 0.25, 1)", fill: "forwards" },
          ),
        );
      }

      cover.finished
        .then(() => {
          if (run.current !== r) return;
          covered(href);
        })
        .catch(() => undefined);
    },
    [covered, router, setPhase],
  );

  // The new route has rendered once the pathname moves off where we started.
  useEffect(() => {
    const r = run.current;
    if (!r || pathname === r.from) return;
    r.arrived = true;
    if (r.covered) void reveal();
  }, [pathname, reveal]);

  useEffect(() => () => reset(), [reset]);

  const value = useMemo(() => ({ go, phase }), [go, phase]);

  return (
    <WorldTransitionContext.Provider value={value}>
      {children}
      <div ref={rootRef} className={styles.root} aria-hidden="true">
        <div ref={backRef} className={styles.back} />
        <div ref={frontRef} className={styles.front}>
          <div ref={rimRef} className={styles.rim} />
          <div ref={fieldRef} className={styles.field}>
            <div ref={sheenRef} className={styles.sheen} />
          </div>
          <div className={styles.edge} />
        </div>
      </div>
    </WorldTransitionContext.Provider>
  );
}

/**
 * Returns { go, phase }. go(href, { x, y, world, color }) runs the transition.
 * Outside the provider, go falls back to a plain client navigation.
 */
export function useWorldTransition(): ContextValue {
  const ctx = useContext(WorldTransitionContext);
  const router = useRouter();
  const fallback = useMemo<ContextValue>(() => ({ go: (href) => router.push(href), phase: "idle" }), [router]);
  return ctx ?? fallback;
}

export type WorldLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  world: World;
  /** Life only: the color the flood should be. */
  color?: string;
  prefetch?: boolean;
};

/**
 * A link that crosses worlds. Plain clicks and taps run the transition from
 * the pointer (or from the link's center for keyboard). Modified clicks, other
 * targets, and no-JS visits behave like a normal link.
 */
export const WorldLink = forwardRef<HTMLAnchorElement, WorldLinkProps>(function WorldLink(
  { href, world, color, onClick, target, prefetch, ...rest },
  ref,
) {
  const { go } = useWorldTransition();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== "_self") return;
    e.preventDefault();
    let x = e.clientX;
    let y = e.clientY;
    if (e.detail === 0 || (x === 0 && y === 0)) {
      const b = e.currentTarget.getBoundingClientRect();
      x = b.left + b.width / 2;
      y = b.top + b.height / 2;
    }
    go(href, { x, y, world, color });
  };

  return <Link ref={ref} href={href} target={target} prefetch={prefetch} onClick={handleClick} {...rest} />;
});
