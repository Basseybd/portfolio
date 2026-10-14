import { sideBuilds } from "@/lib/content";

// Side builds. The section hides itself when there are none.
export default function SideBuilds() {
  const hasBuilds = sideBuilds.length > 0;
  if (!hasBuilds) return null;
  return (
    <section id="side-builds" aria-labelledby="side-title">
      <div className="page py-24 sm:py-28">
        {hasBuilds && (
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-12">
            <h2 id="side-title" className="font-display text-[2.2rem] font-medium leading-tight lg:col-span-4">
              Side builds
            </h2>
            <ul className="grid gap-x-12 gap-y-12 md:grid-cols-2 lg:col-span-7 lg:col-start-6">
              {sideBuilds.map((b) => (
                <li key={b.title}>
                  <h3 className="font-display text-[1.5rem] font-medium">{b.title}</h3>
                  <p className="mt-2 text-[1.0625rem] leading-relaxed text-stone">{b.body}</p>
                  <p className="label mt-3 text-stone">{b.stack}</p>
                  <p className="mt-2 flex flex-wrap gap-x-6 text-[1rem]">
                    <a href={b.live} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 items-center decoration-ink hover:text-steel">
                      {b.liveLabel}
                    </a>
                    <a href={b.code} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 items-center decoration-rule hover:decoration-ink">
                      Source on GitHub
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
