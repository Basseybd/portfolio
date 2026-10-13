// A heading whose words cut up into place one after another, like kinetic type.
// Pure CSS, so it plays before hydration; it waits while a world transition
// still covers the page, and reduced motion shows the words at rest.

type Props = {
  /** One string per line. */
  lines: string[];
};

export default function CutIn({ lines }: Props) {
  let i = 0;
  return (
    <>
      {lines.map((line, l) => (
        <span key={l} className="block">
          {line.split(" ").map((word, w, words) => (
            <span key={w}>
              <span className="cut-word">
                <span style={{ ["--i" as string]: i++ }}>{word}</span>
              </span>
              {w < words.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
