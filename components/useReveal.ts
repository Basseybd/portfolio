"use client";

import { useEffect, useRef, type RefObject } from "react";

// A block in each photo's own color wipes off as it scrolls in (.rv-block in
// globals.css). When `key` changes (a new filter), what it brings into view
// wipes in. With `intro`, the photos on screen when the page opens wipe in too,
// one after another, once they have loaded and any world transition has lifted;
// mark the list with data-rv-intro so they start covered before scripts run.
export function useReveal(list: RefObject<HTMLElement | null>, key?: unknown, intro = false) {
  const loaded = useRef(false);
  useEffect(() => {
    const root = list.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    const opening: HTMLElement[] = [];
    let k = 0;
    const play = (el: HTMLElement) => {
      el.style.setProperty("--rv-delay", `${Math.min(k++, 5) * 90}ms`);
      el.dataset.rv = "in";
    };
    const io = new IntersectionObserver(
      (entries) => {
        k = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          play(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("li"))) {
      if (el.dataset.rv === "in" || el.dataset.rv === "done") continue;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        if (loaded.current) {
          el.dataset.rv = "armed";
          requestAnimationFrame(() => requestAnimationFrame(() => play(el)));
        } else if (intro) {
          el.dataset.rv = "armed";
          opening.push(el);
        } else el.dataset.rv = "done";
        continue;
      }
      el.dataset.rv = "armed";
      io.observe(el);
    }
    loaded.current = true;

    if (opening.length) {
      const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
      const images = Promise.all(opening.map((el) => el.querySelector("img")?.decode().catch(() => undefined)));
      const covered = /^(cover|hold)$/.test(document.documentElement.dataset.worldTransition ?? "");
      const lifted = covered
        ? new Promise<void>((r) => window.addEventListener("worldtransition:reveal", () => r(), { once: true }))
        : Promise.resolve();
      void Promise.all([Promise.race([images, wait(1200)]), Promise.race([lifted, wait(7000)])]).then(() => {
        if (cancelled) return;
        opening.forEach((el, i) => {
          el.style.setProperty("--rv-delay", `${120 + Math.min(i, 8) * 110}ms`);
          el.dataset.rv = "in";
        });
      });
    }
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [list, key, intro]);
}
