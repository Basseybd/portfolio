"use client";

import { useEffect, useRef, useState } from "react";
import CutIn from "@/components/CutIn";

// CutIn for headings further down a page: the words wait until the heading
// scrolls into view. Server-rendered it simply plays on load, so it still works
// without scripts; reduced motion shows the words at rest.
export default function CutInView({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setArmed(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setArmed(false);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className={armed ? "cut-armed" : undefined}>
      <CutIn lines={lines} />
    </span>
  );
}
