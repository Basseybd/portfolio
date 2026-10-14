"use client";

// The home page: the chroma preloader on the first visit of a session, then
// the two doors. The inline script in the root layout marks a session's first
// page load with html[data-intro] before anything paints, so returning
// visitors never see a flash of the preloader.

import { useCallback, useEffect, useState } from "react";
import ChromaGlitchPreloader from "@/components/ui/chroma-glitch-preloader";
import Doors from "@/components/landing/Doors";

// Once per page load. Client navigations back to "/" skip straight to the doors.
let introDone = false;

export default function Landing() {
  const [intro, setIntro] = useState(() => !introDone);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (introDone || !html.hasAttribute("data-intro") || reduce) {
      introDone = true;
      setIntro(false);
      setReady(true);
    }
  }, []);

  const onExit = useCallback(() => setReady(true), []);
  const onComplete = useCallback(() => {
    introDone = true;
    setIntro(false);
  }, []);

  return (
    <>
      <Doors ready={ready} />
      {intro && (
        <div data-preloader="">
          <ChromaGlitchPreloader word="BASSEY" speed={2.8} onExit={onExit} onComplete={onComplete} />
        </div>
      )}
    </>
  );
}
