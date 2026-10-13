"use client";

import { useEffect, useRef, useState } from "react";
import CutIn from "@/components/CutIn";
import Lightbox from "@/components/Lightbox";
import { WorldLink } from "@/components/transition/WorldTransition";
import { photoSrc, photoSrcSet, type Photo } from "@/lib/content";

// The favorites as a stack of flat prints, on wide screens (phones get LifeFeed).
// Scroll picks the photo; the change itself plays on its own clock and always
// finishes, so the stack never rests halfway between two photos. A band in the
// next photo's own color rises from the bottom, the photo wipes in behind it,
// and the one underneath settles back into the dark. It reads page scroll and
// never takes it over; transforms and opacity only. While you scroll, the photo
// drifts gently inside its frame and a hairline fills with your progress, so
// every bit of scroll shows, but nothing ever rests halfway.

const PER = 0.36; // scroll per photo, in screen heights
const NUDGE = 0.22; // share of that scroll that moves on to the next photo, or back (about one wheel notch)
const DRIFT = 5; // how far the photo drifts inside its frame as you scroll, in % of its height
const STEP_MS = 1000; // one photo to the next
const LEAD = 0.2; // how far the color band runs ahead of the photo

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Same curve as the /photos color blocks: a gentle start, a long soft landing.
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

type SeeAll = { href: string; label: string };

export default function PhotoStack({ photos, seeAll }: { photos: Photo[]; seeAll?: SeeAll }) {
  const section = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [front, setFront] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const n = photos.length;
  // Where the stage pins: just under the sticky header.
  const pinTop = () => (pin.current ? parseFloat(getComputedStyle(pin.current).top) || 0 : 0);

  // Sized for a 2:3 print; a wider photo gets shorter instead of making every print smaller.
  const cardH = size.h ? Math.min(size.h * 0.8, size.w / (2 / 3)) : 0;
  const dims = (p: Photo) => {
    const r = p.width / p.height;
    const h = Math.min(cardH, size.w / r);
    return { w: h * r, h };
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!cardH) return;
    let pos = 0; // what's drawn, in photos
    let from = 0;
    let to = 0; // the photo scroll has picked
    let start = 0;
    let dur = 0;
    let raf = 0;
    let raw = 0; // where the scroll is, in photos

    // The hint's letters break apart and drift off over the first half stop of scroll.
    const letters = Array.from(hint.current?.querySelectorAll<HTMLElement>("[data-l]") ?? []);
    const arrow = hint.current?.querySelector<SVGElement>("svg");
    const scatter = (k: number) => {
      const e = 1 - Math.pow(1 - k, 3);
      letters.forEach((el, i) => {
        const s = Math.sin(i * 12.9898) * 43758.5453;
        const r1 = s - Math.floor(s);
        const r2 = Math.abs(Math.sin(i * 78.233) * 9.7) % 1;
        const x = (r1 - 0.5) * 90 * e;
        const y = -(18 + r2 * 70) * e;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${(r1 - 0.5) * 70 * e}deg)`;
        el.style.opacity = String(1 - Math.min(1, e * 1.25));
      });
      if (arrow) arrow.style.opacity = String(1 - Math.min(1, k * 2));
    };

    // Move on once a little way into the next photo's stretch, and back once a
    // little way into the last one's, so it never flickers at a boundary.
    const pick = () => {
      const r = section.current?.getBoundingClientRect();
      if (!r) return to;
      raw = clamp((pinTop() - r.top) / (window.innerHeight * PER), 0, n - 1);
      scatter(clamp(raw / 0.55, 0, 1));
      if (raw > to + NUDGE) return Math.min(n - 1, Math.floor(raw + 1 - NUDGE));
      if (raw < to - NUDGE) return Math.max(0, Math.ceil(raw - 1 + NUDGE));
      return to;
    };

    const paint = () => {
      for (let i = 0; i < n; i++) {
        const card = cards.current[i];
        if (!card) continue;
        // in: how far this print has been laid down; out: how far the next one covers it.
        const t = i === 0 ? 1 : clamp(pos - (i - 1), 0, 1);
        const out = clamp(pos - i, 0, 1);
        const block = clamp(t / (1 - LEAD), 0, 1);
        const img = clamp((t - LEAD) / (1 - LEAD), 0, 1);
        const show = t > 0 && out < 1;
        card.style.visibility = show ? "visible" : "hidden";
        if (!show) continue;
        card.style.transform = `scale(${1 - out * 0.06})`;
        const [band, win, shade] = Array.from(card.children) as HTMLElement[];
        const inner = win.firstElementChild as HTMLElement;
        band.style.transform = `translate3d(0, ${(1 - block) * 100}%, 0)`;
        win.style.transform = `translate3d(0, ${(1 - img) * 100}%, 0)`;
        // Drift: a little parallax that follows the scroll, inside the photo's own frame.
        const drift = -clamp(raw - i, -0.5, 0.5) * DRIFT;
        inner.style.transform = `translate3d(0, ${-(1 - img) * 100 + drift}%, 0) scale(${1.14 - img * 0.08})`;
        shade.style.opacity = String(out * 0.6);
      }
      setFront(clamp(Math.round(pos), 0, n - 1));
    };

    const draw = (now: number) => {
      raf = 0;
      const k = dur ? clamp((now - start) / dur, 0, 1) : 1;
      pos = from + (to - from) * ease(k);
      paint();
      if (k < 1) raf = requestAnimationFrame(draw);
    };

    const onScroll = () => {
      const next = pick();
      if (bar.current) bar.current.style.transform = `scaleX(${n > 1 ? raw / (n - 1) : 1})`;
      if (next === to) {
        if (!raf) raf = requestAnimationFrame(draw);
        return;
      }
      // A change of mind mid-move starts from wherever the stack is now.
      from = pos;
      to = next;
      start = performance.now();
      dur = STEP_MS * (0.75 + 0.25 * Math.min(Math.abs(to - from), 3));
      if (!raf) raf = requestAnimationFrame(draw);
    };

    // Arriving mid-section (a reload, a back button) starts on that photo, no animation.
    const r0 = section.current?.getBoundingClientRect().top ?? 0;
    to = Math.round(clamp((pinTop() - r0) / (window.innerHeight * PER), 0, n - 1));
    pos = from = to;
    pick();
    if (bar.current) bar.current.style.transform = `scaleX(${n > 1 ? raw / (n - 1) : 1})`;
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [cardH, n]);

  // Previous and Next scroll the page to that photo's stop, so scroll stays the only driver.
  const go = (i: number) => {
    const el = section.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top - pinTop() + clamp(i, 0, n - 1) * window.innerHeight * PER, behavior: smooth ? "smooth" : "auto" });
  };

  const current = photos[front];
  const last = front === n - 1;

  return (
    <div ref={section} style={{ height: `calc(100svh - 4rem + ${(n - 1) * PER * 100}svh)` }}>
      <div ref={pin} className="sticky top-16 h-[calc(100svh-4rem)]">
        <div ref={stage} className="absolute inset-x-0 top-0 bottom-[6.5rem] overflow-hidden">
          {cardH > 0 &&
            photos.map((p, i) => {
              const { w, h } = dims(p);
              const isFront = i === front;
              return (
                <button
                  key={p.slug}
                  ref={(node) => {
                    cards.current[i] = node;
                  }}
                  type="button"
                  tabIndex={isFront ? 0 : -1}
                  aria-hidden={!isFront}
                  aria-label={`View larger: ${p.title}`}
                  onClick={() => setViewing(i)}
                  className="absolute left-1/2 top-1/2 block cursor-zoom-in overflow-hidden"
                  style={{
                    width: w,
                    height: h,
                    marginLeft: -w / 2,
                    marginTop: -h / 2,
                    zIndex: i + 1,
                    pointerEvents: isFront ? "auto" : "none",
                    visibility: i === 0 ? "visible" : "hidden",
                  }}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: `color-mix(in srgb, ${p.accent} 70%, #17181a)` }}
                  />
                  <span className="absolute inset-0 overflow-hidden">
                    <span className="absolute inset-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoSrc(p.slug, 1200)}
                        srcSet={photoSrcSet(p)}
                        sizes={`${Math.round(w)}px`}
                        width={p.width}
                        height={p.height}
                        alt={p.alt}
                        loading={i < 2 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        className="h-full w-full select-none object-cover"
                      />
                    </span>
                  </span>
                  <span aria-hidden className="absolute inset-0 bg-graphite" style={{ opacity: 0 }} />
                </button>
              );
            })}
          {/* Tells people the photos change with scroll; gone once they start. */}
          <div
            aria-hidden
            ref={hint}
            className="stack-hint pointer-events-none absolute bottom-3 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-1.5 text-[0.8rem] text-silver"
            style={{ opacity: cardH > 0 ? 1 : 0 }}
          >
            <span className="whitespace-pre">
              {"Scroll to see more".split("").map((c, i) => (
                <span key={i} data-l className="inline-block will-change-transform">
                  {c}
                </span>
              ))}
            </span>
            <svg viewBox="0 0 14 22" className="h-[22px] w-[14px]" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1v19M1.5 14.5 7 20l5.5-5.5" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-[6.5rem] flex-col justify-end gap-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          {/* How far through the set you are; fills as you scroll. */}
          <div aria-hidden className="absolute inset-x-0 top-5 h-px bg-graphite-rule">
            <div ref={bar} className="h-full origin-left bg-silver/80" style={{ transform: "scaleX(0)" }} />
          </div>
          <p aria-live="polite" className="min-w-0">
            <span key={current?.slug} className="block font-display text-[1.2rem] font-medium leading-tight text-rice">
              {current ? <CutIn lines={[current.title]} /> : null}
            </span>
            <span className="mt-1 block text-[0.9rem] text-silver">{current?.place}</span>
          </p>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={() => go(front - 1)}
              disabled={front === 0}
              className="min-h-11 px-1 text-[0.95rem] font-medium text-rice transition-colors duration-200 hover:text-chrome-light disabled:text-silver/50"
            >
              Previous
            </button>
            <span aria-hidden className="label text-silver">
              {String(front + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
            </span>
            {/* At the last print, Next becomes the way into the full set. */}
            {last && seeAll ? (
              <WorldLink
                href={seeAll.href}
                world="photos"
                className="link flex min-h-11 items-center px-1 text-[0.95rem] font-medium text-rice decoration-rice/50 hover:decoration-rice"
              >
                {seeAll.label}
              </WorldLink>
            ) : (
              <button
                type="button"
                onClick={() => go(front + 1)}
                disabled={last}
                className="min-h-11 px-1 text-[0.95rem] font-medium text-rice transition-colors duration-200 hover:text-chrome-light disabled:text-silver/50"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>

      <Lightbox photos={photos} index={viewing} onClose={() => setViewing(null)} onIndex={setViewing} />
    </div>
  );
}
