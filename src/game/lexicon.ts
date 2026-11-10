type Node = { e: boolean; k: Record<string, Node> };

export type Lexicon = {
  has: (word: string) => boolean;
  root: Node;
  size: number;
};

function makeNode(): Node {
  return { e: false, k: Object.create(null) as Record<string, Node> };
}

export function buildLexicon(words: Iterable<string>): Lexicon {
  const root = makeNode();
  const set = new Set<string>();
  for (const raw of words) {
    const word = raw.trim().toUpperCase();
    if (!/^[A-Z]{2,15}$/.test(word)) continue;
    set.add(word);
    let node = root;
    for (const ch of word) {
      let next = node.k[ch];
      if (!next) {
        next = makeNode();
        node.k[ch] = next;
      }
      node = next;
    }
    node.e = true;
  }
  return {
    root,
    size: set.size,
    has: (word: string) => set.has(word.toUpperCase()),
  };
}

let pending: Promise<Lexicon> | null = null;

export function loadLexicon(): Promise<Lexicon> {
  if (!pending) {
    pending = fetch("/lexicon.txt")
      .then((res) => {
        if (!res.ok) throw new Error("lexicon");
        return res.text();
      })
      .then((text) => buildLexicon(text.split("\n")));
  }
  return pending;
}
