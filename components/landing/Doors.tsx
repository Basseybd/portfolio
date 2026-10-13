"use client";

// The landing page body: two doors, Work and Life, each a pixel abstract.
// Hover (or keyboard focus) widens a door, wakes its pixels and lets the other
// recede. A click or tap goes straight in through the world transition.

import { useState, type FocusEvent, type PointerEvent } from "react";
import PixelField from "@/components/landing/PixelField";
import { WorldLink } from "@/components/transition/WorldTransition";
import { favorites, site } from "@/lib/content";
import styles from "./Doors.module.css";

type Side = "work" | "life";

const links = [
  { href: site.instagram, label: "Instagram", title: `Instagram, ${site.instagramHandle}` },
  { href: site.linkedin, label: "LinkedIn", title: "LinkedIn" },
  { href: site.resume, label: "Résumé", title: "Résumé (PDF)" },
];

export type DoorsProps = {
  workHref?: string;
  lifeHref?: string;
  /** False holds the doors back (while the preloader is up). */
  ready?: boolean;
};

export default function Doors({ workHref = "/work", lifeHref = "/life", ready = true }: DoorsProps) {
  const featured = favorites;
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState<Side | null>(null);
  const current = featured[index] ?? featured[0];

  const onEnter = (side: Side) => (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === "mouse") setActive(side);
  };
  const onFocus = (side: Side) => (e: FocusEvent<HTMLAnchorElement>) => {
    let visibleFocus = true;
    try {
      visibleFocus = e.currentTarget.matches(":focus-visible");
    } catch {
      visibleFocus = true;
    }
    if (visibleFocus) setActive(side);
  };
  const onBlur = (side: Side) => () => setActive((a) => (a === side ? null : a));

  return (
    <section
      className={styles.doors}
      data-active={active ?? undefined}
      data-ready={ready ? "" : undefined}
      aria-labelledby="doors-name"
    >
      <div className={styles.top}>
        <h1 id="doors-name" className={styles.name}>
          {site.name}
        </h1>
        <p className={styles.where}>{site.location}</p>
      </div>

      <nav
        className={styles.stage}
        aria-label="Choose a side"
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
      >
        <WorldLink
          href={workHref}
          world="work"
          className={`${styles.door} ${styles.work}`}
          style={{ ["--i" as string]: 0 }}
          onPointerEnter={onEnter("work")}
          onFocus={onFocus("work")}
          onBlur={onBlur("work")}
        >
          <PixelField mode="work" active={active === "work"} className={styles.pixels} />
          <span className={styles.copy}>
            <span className={styles.word}>
              Work <Arrow />
            </span>
            <span className={styles.line}>Software engineer. AI features, production systems.</span>
          </span>
        </WorldLink>

        <WorldLink
          href={lifeHref}
          world="life"
          color={current.accent}
          className={`${styles.door} ${styles.life}`}
          style={{ ["--i" as string]: 1, ["--accent" as string]: current.accent }}
          onPointerEnter={onEnter("life")}
          onFocus={onFocus("life")}
          onBlur={onBlur("life")}
        >
          <PixelField
            mode="life"
            photos={featured}
            active={active === "life"}
            onPhoto={setIndex}
            className={styles.pixels}
          />
          <span className={styles.shade} aria-hidden="true" />
          <span className={styles.meta} aria-hidden="true">
            <span key={current.slug} className={styles.caption}>
              {current.title}
              {current.place ? <span>{current.place}</span> : null}
            </span>
          </span>
          <span className={styles.copy}>
            <span className={styles.word}>
              Life <Arrow />
            </span>
            <span className={styles.line}>Photos on the side. Travel, friends, New York.</span>
          </span>
        </WorldLink>
      </nav>

      <footer className={styles.foot}>
        <ul className={styles.links}>
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" title={l.title}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </section>
  );
}

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
