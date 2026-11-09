const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Marks words that start with a query term; React text nodes only, so a title can never inject HTML.
export function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (terms.length === 0) {
    return <>{text}</>;
  }
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.join("|")})`, "giu");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        // split() with a capture group puts the matches at the odd indexes.
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-primary/20 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
