"use client";

import { useEffect, useRef, type RefObject } from "react";

// A block in each photo's own color wipes off as it scrolls in (.rv-block in
// globals.css). Items already on screen at first load stay put; when `key`
// changes (a new filter), what it brings into view wipes in.
export function useReveal(list: RefObject<HTMLElement | null>, key?: unknown) {
  const loaded = useRef(false);
  useEffect(() => {
    const root = list.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
        } else el.dataset.rv = "done";
        continue;
      }
      el.dataset.rv = "armed";
      io.observe(el);
    }
    loaded.current = true;
    return () => io.disconnect();
  }, [list, key]);
}
