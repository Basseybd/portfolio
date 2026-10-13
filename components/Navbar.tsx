"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WorldLink, type WorldLinkProps } from "@/components/transition/WorldTransition";
import { favorites, site } from "@/lib/content";

const links = [
  { href: "/work#work", label: "Work" },
  { href: "/work#experience", label: "Experience" },
  { href: "/work#focus", label: "Focus" },
  { href: "/work#contact", label: "Contact" },
];
const lifeColor = favorites[0]?.accent;

// On /work a section link glides there; from any other page it floods over to
// /work and lands on the section under the cover. Never a hard jump.
function SectionLink({ onWork, ...props }: Omit<WorldLinkProps, "world"> & { onWork: boolean }) {
  return onWork ? <Link {...props} /> : <WorldLink world="work" {...props} />;
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const onWork = usePathname() === "/work";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-ground">
      <nav className="page flex h-16 items-center justify-between" aria-label="Main">
        <WorldLink href="/" world="home" className="font-display text-[1.3rem] font-medium tracking-[-0.01em]">
          Bassey Duke
        </WorldLink>

        <ul className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <SectionLink onWork={onWork} href={l.href} className="text-[0.975rem] text-stone transition-colors duration-200 hover:text-ink">
                {l.label}
              </SectionLink>
            </li>
          ))}
          <li>
            <WorldLink
              href="/life"
              world="life"
              color={lifeColor}
              className="text-[0.975rem] text-stone transition-colors duration-200 hover:text-ink"
            >
              Life
            </WorldLink>
          </li>
          <li>
            <a
              href={site.resume}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-ink/80 px-4 py-1.5 text-[0.975rem] transition-colors duration-200 hover:bg-ink hover:text-paper"
            >
              Résumé
            </a>
          </li>
        </ul>

        <button
          type="button"
          className="-mr-2 px-2 py-2 text-[0.95rem] font-medium md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </nav>

      <div
        aria-hidden
        className={`chrome h-px w-full transition-opacity duration-300 ${scrolled || open ? "opacity-100" : "opacity-0"}`}
      />

      {open && (
        <ul id="mobile-menu" className="page pb-6 md:hidden">
          {links.map((l) => (
            <li key={l.href} className="border-b border-rule">
              <SectionLink
                onWork={onWork}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-3.5 font-display text-[1.5rem] font-medium"
              >
                {l.label}
              </SectionLink>
            </li>
          ))}
          <li className="border-b border-rule">
            <WorldLink
              href="/life"
              world="life"
              color={lifeColor}
              onClick={() => setOpen(false)}
              className="block py-3.5 font-display text-[1.5rem] font-medium"
            >
              Life
            </WorldLink>
          </li>
          <li className="border-b border-rule">
            <a
              href={site.resume}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block py-3.5 font-display text-[1.5rem] font-medium"
            >
              Résumé
            </a>
          </li>
        </ul>
      )}
    </header>
  );
}
