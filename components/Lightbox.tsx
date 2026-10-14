"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import CutIn from "@/components/CutIn";
import { photoSrc, photoSrcSet, type Photo } from "@/lib/content";

type Props = {
  photos: Photo[];
  index: number | null;
  onClose: () => void;
  onIndex: (i: number) => void;
};

// Full-screen viewer, moving like iOS Photos: the photo grows out of the
// thumbnail you tapped and flies back into it on close; Next and Previous slide
// the photos past each other; on touch the photo follows your finger, sideways
// to change photos and down to close. Arrow keys, Escape and a click outside the
// photo work too. Transforms, opacity and a little blur only; reduced motion
// gets plain cuts.

const OPEN_MS = 560;
const CLOSE_MS = 460;
const SLIDE_MS = 480;
const MORPH = "cubic-bezier(0.32, 0.72, 0, 1)"; // long, soft landing for flights
const OUT = "cubic-bezier(0.23, 1, 0.32, 1)"; // strong ease-out for entrances

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

// The thumbnail for a photo, if one is on screen behind the viewer.
function visibleThumb(slug: string, dlg: HTMLElement) {
  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(`img[src*="/photos/${slug}-"]`))) {
    if (dlg.contains(img) || getComputedStyle(img).visibility === "hidden") continue;
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    return img;
  }
  return null;
}

// A fixed copy of an image where it sits on screen, to fly around.
function ghostOf(img: HTMLImageElement, r: DOMRect) {
  const g = document.createElement("img");
  g.src = img.currentSrc || img.src;
  g.alt = "";
  g.setAttribute("aria-hidden", "true");
  g.dataset.lbGhost = "";
  Object.assign(g.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: "0",
    maxWidth: "none",
    objectFit: "cover",
    transformOrigin: "0 0",
    pointerEvents: "none",
    zIndex: "5",
  });
  return g;
}

// The transform that lands box `from` on box `to` (same shape, centered).
function fly(from: DOMRect, to: DOMRect) {
  const s = to.width / from.width;
  const dy = to.top + to.height / 2 - (from.top + (from.height * s) / 2);
  return `translate3d(${to.left - from.left}px, ${dy}px, 0) scale(${s})`;
}

export default function Lightbox({ photos, index, onClose, onIndex }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLImageElement>(null);
  const reduce = useRef(false);
  const closing = useRef(false);
  const dir = useRef(0); // the way the last step went: 1 next, -1 previous
  const hidden = useRef<HTMLImageElement | null>(null); // thumbnail hidden under a flight
  const drag = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null; dx: number; dy: number } | null>(null);
  const dragged = useRef(false);

  const current = index === null ? null : photos[index];
  const slug = current?.slug;
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const open = index !== null;

  const parts = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-lb-ui]") ?? []);
  const showThumb = () => {
    if (hidden.current) hidden.current.style.visibility = "";
    hidden.current = null;
  };
  // Settle any flight still in the air: the real photo takes over.
  const land = () => {
    ref.current?.querySelectorAll("[data-lb-ghost]").forEach((g) => g.remove());
    if (shot.current) shot.current.style.opacity = "";
    showThumb();
  };

  // Open: the photo grows out of its thumbnail while the dark comes up behind it.
  useLayoutEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!open) {
      if (dlg.open) dlg.close();
      return;
    }
    if (dlg.open) return;
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closing.current = false;
    dir.current = 0;
    dlg.showModal();
    if (reduce.current) return;

    const img = shot.current;
    veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 340, easing: OUT, fill: "backwards" });
    parts().forEach((p) =>
      // `translate`, not `transform`, so the side buttons keep their own centering.
      p.animate([{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], {
        duration: 380,
        delay: 180,
        easing: OUT,
        fill: "backwards",
      }),
    );
    if (!img) return;
    const thumb = slugRef.current ? visibleThumb(slugRef.current, dlg) : null;
    if (!thumb) {
      img.animate(
        [
          { opacity: 0, transform: "scale(0.96)", filter: "blur(8px)" },
          { opacity: 1, transform: "none", filter: "blur(0px)" },
        ],
        { duration: 440, easing: OUT, fill: "backwards" },
      );
      return;
    }
    const from = thumb.getBoundingClientRect();
    const g = ghostOf(thumb, from);
    dlg.appendChild(g);
    thumb.style.visibility = "hidden";
    hidden.current = thumb;
    img.style.opacity = "0";
    g.animate([{ transform: "none" }, { transform: fly(from, img.getBoundingClientRect()) }], {
      duration: OPEN_MS,
      easing: MORPH,
      fill: "forwards",
    })
      .finished.then(async () => {
        // Swap in the sharp photo once it's decoded; the copy fades off it.
        await Promise.race([img.decode().catch(() => undefined), wait(700)]);
        img.style.opacity = "";
        showThumb();
        await g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out", fill: "forwards" }).finished;
        g.remove();
      })
      .catch(() => g.remove());
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handle = () => onClose();
    dlg.addEventListener("close", handle);
    return () => dlg.removeEventListener("close", handle);
  }, [onClose]);

  // Close: the photo flies back into its thumbnail (or sinks away if that's off
  // screen) and the page comes back up around it.
  const close = () => {
    const dlg = ref.current;
    if (!dlg?.open || closing.current) return;
    closing.current = true;
    const img = shot.current;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dlg.querySelectorAll("[data-lb-ghost]").forEach((g) => g.remove());
      dlg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      [img, veil.current, ...parts()].forEach((el) => el?.removeAttribute("style"));
      showThumb();
      dlg.close();
    };
    if (reduce.current || !img) return finish();
    land();

    const from = img.getBoundingClientRect(); // includes any drag
    const v = veil.current;
    v?.animate([{ opacity: v.style.opacity || 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: OUT, fill: "forwards" });
    parts().forEach((p) => p.animate([{ opacity: p.style.opacity || 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" }));
    const g = ghostOf(img, from);
    dlg.appendChild(g);
    img.style.opacity = "0";
    const thumb = slugRef.current ? visibleThumb(slugRef.current, dlg) : null;
    let flight: Animation;
    if (thumb) {
      thumb.style.visibility = "hidden";
      hidden.current = thumb;
      flight = g.animate([{ transform: "none" }, { transform: fly(from, thumb.getBoundingClientRect()) }], {
        duration: CLOSE_MS,
        easing: MORPH,
        fill: "forwards",
      });
    } else {
      g.style.transformOrigin = "50% 50%";
      flight = g.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translate3d(0, 24px, 0) scale(0.94)" },
        ],
        { duration: 320, easing: OUT, fill: "forwards" },
      );
    }
    flight.finished.then(finish, finish);
    // A hidden tab never runs the flight; close anyway.
    window.setTimeout(finish, CLOSE_MS + 400);
  };

  // Next and Previous: the photo slides off the way you're going and the next
  // one comes in from the other side, softened by a little blur.
  const step = (delta: number) => {
    const dlg = ref.current;
    const img = shot.current;
    if (index === null || photos.length < 2 || closing.current) return;
    land();
    if (dlg && img && !reduce.current) {
      const r = img.getBoundingClientRect(); // starts where a swipe left it
      const g = ghostOf(img, r);
      g.style.transformOrigin = "50% 50%";
      dlg.appendChild(g);
      const shift = Math.min(240, r.width * 0.35);
      g.animate(
        [
          { opacity: 1, transform: "none", filter: "blur(0px)" },
          { opacity: 0, transform: `translate3d(${-delta * shift}px, 0, 0) scale(0.96)`, filter: "blur(6px)" },
        ],
        { duration: 340, easing: OUT, fill: "forwards" },
      ).finished.then(
        () => g.remove(),
        () => g.remove(),
      );
    }
    dir.current = delta;
    onIndex((index + delta + photos.length) % photos.length);
  };

  useLayoutEffect(() => {
    const img = shot.current;
    const d = dir.current;
    if (!img || !d) return;
    dir.current = 0;
    if (reduce.current) return;
    const shift = Math.min(240, img.getBoundingClientRect().width * 0.35);
    img.animate(
      [
        { opacity: 0, transform: `translate3d(${d * shift}px, 0, 0) scale(0.98)`, filter: "blur(6px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" },
      ],
      { duration: SLIDE_MS, delay: 40, easing: OUT, fill: "backwards" },
    );
  }, [slug]);

  // Touch: the photo follows the finger. Sideways changes photos; down closes.
  const onPointerDown = (e: React.PointerEvent) => {
    dragged.current = false;
    if (e.pointerType !== "touch" || closing.current) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const img = shot.current;
    if (!d || !img) return;
    d.dx = e.clientX - d.x;
    d.dy = e.clientY - d.y;
    if (!d.axis && Math.hypot(d.dx, d.dy) > 8) d.axis = Math.abs(d.dx) > Math.abs(d.dy) ? "x" : "y";
    if (d.axis === "x") img.style.transform = `translate3d(${d.dx}px, 0, 0)`;
    if (d.axis === "y") {
      const down = Math.max(0, d.dy);
      const k = Math.min(1, down / window.innerHeight);
      img.style.transform = `translate3d(${d.dx * 0.6}px, ${down}px, 0) scale(${1 - k * 0.35})`;
      if (veil.current) veil.current.style.opacity = String(Math.max(0, 1 - k * 1.6));
      parts().forEach((p) => (p.style.opacity = String(Math.max(0, 1 - k * 4))));
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    const img = shot.current;
    drag.current = null;
    if (!d || !d.axis || !img) return;
    dragged.current = true;
    const ms = Math.max(1, performance.now() - d.t);
    if (d.axis === "x" && (Math.abs(d.dx) > 60 || Math.abs(d.dx / ms) > 0.45)) return step(d.dx < 0 ? 1 : -1);
    if (d.axis === "y" && (d.dy > 110 || d.dy / ms > 0.5)) return close();
    // Not far enough: settle back.
    img.animate([{ transform: img.style.transform || "none" }, { transform: "none" }], { duration: 320, easing: OUT });
    img.style.transform = "";
    const v = veil.current;
    if (v?.style.opacity) {
      v.animate([{ opacity: v.style.opacity }, { opacity: 1 }], { duration: 320, easing: OUT });
      v.style.opacity = "";
    }
    parts().forEach((p) => (p.style.opacity = ""));
  };
  // A swipe that ends on the background shouldn't count as a click outside.
  const clickedOutside = (e: React.MouseEvent) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (e.target === e.currentTarget) close();
  };

  const prev = index === null || photos.length < 2 ? null : photos[(index - 1 + photos.length) % photos.length];
  const next = index === null || photos.length < 2 ? null : photos[(index + 1) % photos.length];
  // Ask for the size the photo really shows at, so the next ones are already cached at that size.
  const sizes = (p: Photo) => {
    if (typeof window === "undefined") return "100vw";
    const wide = window.innerWidth >= 640;
    const w = Math.min(window.innerWidth - (wide ? 192 : 32), (window.innerHeight - 150) * (p.width / p.height));
    return `${Math.max(320, Math.ceil(w))}px`;
  };

  return (
    <dialog
      ref={ref}
      aria-label="Photo viewer"
      className="on-dark m-0 h-[100dvh] max-h-none w-screen max-w-none bg-transparent p-0 text-rice backdrop:bg-transparent"
      style={{ overscrollBehavior: "contain" }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={clickedOutside}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      }}
    >
      <div ref={veil} aria-hidden className="pointer-events-none absolute inset-0 bg-graphite" />
      {current && index !== null && (
        <div className="relative flex h-full flex-col">
          <div data-lb-ui className="page flex h-16 shrink-0 items-center justify-between">
            <span className="label text-silver">
              <span key={index} className="cut-word">
                <span>{index + 1}</span>
              </span>{" "}
              / {photos.length}
            </span>
            <button
              type="button"
              onClick={close}
              className="min-h-11 px-2 py-3 text-[0.95rem] font-medium text-rice transition-colors duration-200 hover:text-chrome-light"
              autoFocus
            >
              Close
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-24"
            style={{ touchAction: "none" }}
            onClick={clickedOutside}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={shot}
              key={current.slug}
              src={photoSrc(current.slug, 1200)}
              srcSet={photoSrcSet(current)}
              sizes={sizes(current)}
              width={current.width}
              height={current.height}
              alt={current.alt}
              draggable={false}
              className="block max-h-full w-auto max-w-full select-none object-contain"
            />
            {[prev, next].map((p, i) =>
              p ? (
                // Warm the cache for the photos either side.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${p.slug}-${i}`} src={photoSrc(p.slug, 1200)} srcSet={photoSrcSet(p)} sizes={sizes(p)} alt="" aria-hidden className="hidden" />
              ) : null,
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  data-lb-ui
                  onClick={() => step(-1)}
                  className="absolute left-3 top-1/2 hidden -translate-y-1/2 px-3 py-3 text-[0.95rem] text-silver transition-colors duration-200 hover:text-rice sm:block"
                >
                  Previous
                </button>
                <button
                  type="button"
                  data-lb-ui
                  onClick={() => step(1)}
                  className="absolute right-3 top-1/2 hidden -translate-y-1/2 px-3 py-3 text-[0.95rem] text-silver transition-colors duration-200 hover:text-rice sm:block"
                >
                  Next
                </button>
              </>
            )}
          </div>

          <div data-lb-ui className="page flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-5">
            <span key={current.slug} className="font-display text-[1.15rem] font-medium">
              <CutIn lines={[current.title]} />
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9rem] text-silver">
              <span>{current.place}</span>
              <span className="label whitespace-nowrap">{current.settings}</span>
            </span>
          </div>
          {/* Phones: Previous and Next where the thumb is; swiping still works. */}
          {photos.length > 1 && (
            <div data-lb-ui className="page flex shrink-0 items-center justify-between pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
              <button type="button" onClick={() => step(-1)} className="min-h-11 px-1 text-[0.95rem] font-medium text-rice">
                Previous
              </button>
              <button type="button" onClick={() => step(1)} className="min-h-11 px-1 text-[0.95rem] font-medium text-rice">
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
