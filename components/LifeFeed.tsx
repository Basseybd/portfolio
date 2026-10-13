"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Lightbox from "@/components/Lightbox";
import { useReveal } from "@/components/useReveal";
import { photoSrc, photoSrcSet, type Photo } from "@/lib/content";

// The favorites on phones and tablets: a plain feed that scrolls like any page,
// so the thumb never feels stuck. Each photo arrives behind a block in its own
// color, the same reveal as /photos, and the feed ends on the full set.

type SeeAll = { href: string; label: string };

export default function LifeFeed({ photos, seeAll }: { photos: Photo[]; seeAll?: SeeAll }) {
  const list = useRef<HTMLUListElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  useReveal(list);

  return (
    <>
      <ul ref={list} className="grid gap-y-12 sm:grid-cols-2 sm:gap-x-8">
        {photos.map((p, i) => (
          <li key={p.slug}>
            <figure>
              <button
                type="button"
                onClick={() => setViewing(i)}
                aria-label={`View larger: ${p.title}`}
                className="relative block w-full cursor-zoom-in overflow-hidden bg-graphite-rule"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(p.slug, 1200)}
                  srcSet={photoSrcSet(p)}
                  sizes="(min-width: 640px) 46vw, 92vw"
                  width={p.width}
                  height={p.height}
                  alt={p.alt}
                  loading="lazy"
                  decoding="async"
                  className="rv-img block h-auto w-full"
                />
                <span aria-hidden className="rv-block" style={{ ["--accent" as string]: p.accent }} />
              </button>
              <figcaption className="mt-3 flex items-baseline justify-between gap-4">
                <span className="font-display text-[1.1rem] font-medium leading-snug text-rice">{p.title}</span>
                <span className="shrink-0 text-[0.85rem] text-silver">{p.place}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      {seeAll ? (
        <Link href={seeAll.href} className="btn-chrome mt-12 inline-block px-6 py-3.5 text-[1rem] font-medium">
          {seeAll.label}
        </Link>
      ) : null}
      <Lightbox photos={photos} index={viewing} onClose={() => setViewing(null)} onIndex={setViewing} />
    </>
  );
}
