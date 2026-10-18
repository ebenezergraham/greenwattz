/** Tiny inline markup for blog and glossary text: **bold** and [label](url). Rendered as real elements, never as HTML. */
export type Seg =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; text: string; href: string; external: boolean; fragment?: string };

const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', text: src.slice(last, i) });
    if (m[1] != null) out.push({ kind: 'bold', text: m[1] });
    else {
      const url = m[3];
      const external = /^https?:\/\//i.test(url);
      const [path, fragment] = url.split('#');
      out.push({ kind: 'link', text: m[2], href: external ? url : path || '/', external, fragment: external ? undefined : fragment });
    }
    last = i + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

/** Plain text with the markup removed, for word counts and search. */
export function stripInline(src: string): string {
  return parseInline(src).map((s) => s.text).join('');
}
