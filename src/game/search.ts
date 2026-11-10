import { CENTER, SIZE, boardHasTiles, type Placement, type Square, type Tile } from "./model.ts";
import type { Lexicon } from "./lexicon.ts";
import { analyze, type WordScore } from "./analyze.ts";

export type FoundMove = {
  placements: Placement[];
  score: number;
  words: WordScore[];
  bingo: boolean;
};

type RackCount = { letters: number[]; blanks: number };

function counts(rack: Tile[]): RackCount {
  const letters = Array(26).fill(0) as number[];
  let blanks = 0;
  for (const tile of rack) {
    if (tile.blank) blanks += 1;
    else letters[tile.letter.charCodeAt(0) - 65] = (letters[tile.letter.charCodeAt(0) - 65] ?? 0) + 1;
  }
  return { letters, blanks };
}

/** Best legal play for this rack, or null if none exists inside the time budget. */
export function bestMove(board: Square[][], rack: Tile[], lexicon: Lexicon, budgetMs = 220): FoundMove | null {
  const root = lexicon.root;
  const has = lexicon.has;
  const empty = !boardHasTiles(board);
  const rack0 = counts(rack);
  const deadline = performance.now() + budgetMs;
  const found: { move: FoundMove | null } = { move: null };
  let stop = false;

  const perpOk = (r: number, c: number, letter: string, mainVertical: boolean): boolean => {
    const dr = mainVertical ? 0 : 1;
    const dc = mainVertical ? 1 : 0;
    let sr = r;
    let sc = c;
    while (sr - dr >= 0 && sc - dc >= 0 && sr - dr < SIZE && sc - dc < SIZE && board[sr - dr]![sc - dc]!.tile) {
      sr -= dr;
      sc -= dc;
    }
    let word = "";
    let rr = sr;
    let cc = sc;
    while (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE) {
      if (rr === r && cc === c) word += letter;
      else if (board[rr]![cc]!.tile) word += board[rr]![cc]!.tile!.letter;
      else break;
      rr += dr;
      cc += dc;
    }
    return word.length < 2 || has(word);
  };

  const consider = (vertical: boolean, line: number, placed: { i: number; letter: string; blank: boolean }[]) => {
    const placements: Placement[] = placed.map((p) => ({
      r: vertical ? p.i : line,
      c: vertical ? line : p.i,
      letter: p.letter,
      blank: p.blank,
    }));
    const result = analyze(board, placements, null);
    if (!result.ok) return;
    if (
      !found.move ||
      result.score > found.move.score ||
      (result.score === found.move.score && placements.length > found.move.placements.length)
    ) {
      found.move = { placements, score: result.score, words: result.words, bingo: result.bingo };
    }
  };

  const searchLine = (vertical: boolean, line: number) => {
    const tileAt = (i: number): string | null => {
      if (i < 0 || i >= SIZE) return null;
      const r = vertical ? i : line;
      const c = vertical ? line : i;
      return board[r]![c]!.tile?.letter ?? null;
    };
    const isAnchor = (i: number): boolean => {
      if (tileAt(i)) return false;
      const r = vertical ? i : line;
      const c = vertical ? line : i;
      if (empty) return r === CENTER && c === CENTER;
      return [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].some(([rr, cc]) => rr! >= 0 && cc! >= 0 && rr! < SIZE && cc! < SIZE && !!board[rr!]![cc!]!.tile);
    };

    const cross: (number | null)[] = Array(SIZE).fill(null);
    for (let i = 0; i < SIZE; i++) {
      if (tileAt(i)) continue;
      const r = vertical ? i : line;
      const c = vertical ? line : i;
      const dr = vertical ? 0 : 1;
      const dc = vertical ? 1 : 0;
      const before = r - dr >= 0 && c - dc >= 0 && r - dr < SIZE && c - dc < SIZE && board[r - dr]![c - dc]!.tile;
      const after = r + dr >= 0 && c + dc >= 0 && r + dr < SIZE && c + dc < SIZE && board[r + dr]![c + dc]!.tile;
      if (!before && !after) continue;
      let mask = 0;
      for (let code = 0; code < 26; code++) {
        const ch = String.fromCharCode(65 + code);
        if (perpOk(r, c, ch, vertical)) mask |= 1 << code;
      }
      cross[i] = mask;
    }

    const allows = (i: number, ch: string) => {
      const mask = cross[i];
      if (mask == null) return true;
      return (mask & (1 << (ch.charCodeAt(0) - 65))) !== 0;
    };

    const letters = rack0.letters;
    let blanks = rack0.blanks;
    const placed: { i: number; letter: string; blank: boolean }[] = [];

    const nodeAfterLeft = (anchor: number): typeof root | null => {
      const lefts = placed.filter((p) => p.i < anchor).sort((a, b) => a.i - b.i);
      let node: typeof root | undefined = root;
      for (const part of lefts) {
        node = node?.k[part.letter];
        if (!node) return null;
      }
      return node ?? null;
    };

    const extend = (node: typeof root, i: number, anchor: number) => {
      if (stop) return;
      if (performance.now() > deadline) {
        stop = true;
        return;
      }
      const open = i === SIZE || !tileAt(i);
      if (open && node.e && placed.length > 0 && i > anchor) consider(vertical, line, placed);
      if (i === SIZE || stop) return;
      const existing = tileAt(i);
      if (existing) {
        const next = node.k[existing];
        if (next) extend(next, i + 1, anchor);
        return;
      }
      for (const ch in node.k) {
        if (!allows(i, ch)) continue;
        const next = node.k[ch]!;
        const code = ch.charCodeAt(0) - 65;
        if ((letters[code] ?? 0) > 0) {
          letters[code] = (letters[code] ?? 0) - 1;
          placed.push({ i, letter: ch, blank: false });
          extend(next, i + 1, anchor);
          placed.pop();
          letters[code] = (letters[code] ?? 0) + 1;
        }
        if (blanks > 0) {
          blanks -= 1;
          placed.push({ i, letter: ch, blank: true });
          extend(next, i + 1, anchor);
          placed.pop();
          blanks += 1;
        }
        if (stop) return;
      }
    };

    const spend = (ch: string, blank: boolean, fn: () => void) => {
      const code = ch.charCodeAt(0) - 65;
      if (blank) blanks -= 1;
      else letters[code] = (letters[code] ?? 0) - 1;
      fn();
      if (blank) blanks += 1;
      else letters[code] = (letters[code] ?? 0) + 1;
    };

    const left = (limit: number, anchor: number) => {
      if (stop) return;
      const node = nodeAfterLeft(anchor);
      if (!node) return;
      extend(node, anchor, anchor);
      if (limit <= 0 || stop) return;
      const i = anchor - placed.filter((p) => p.i < anchor).length - 1;
      const attempt = (ch: string, blank: boolean) => {
        if (!allows(i, ch)) return;
        if (blank && blanks <= 0) return;
        if (!blank && (letters[ch.charCodeAt(0) - 65] ?? 0) <= 0) return;
        spend(ch, blank, () => {
          placed.push({ i, letter: ch, blank });
          left(limit - 1, anchor);
          placed.pop();
        });
      };
      for (let code = 0; code < 26; code++) {
        if ((letters[code] ?? 0) > 0) attempt(String.fromCharCode(65 + code), false);
        if (stop) return;
      }
      if (blanks > 0) {
        for (let code = 0; code < 26; code++) {
          attempt(String.fromCharCode(65 + code), true);
          if (stop) return;
        }
      }
    };

    for (let anchor = 0; anchor < SIZE; anchor++) {
      if (!isAnchor(anchor)) continue;
      if (anchor > 0 && tileAt(anchor - 1)) {
        let start = anchor - 1;
        while (start > 0 && tileAt(start - 1)) start -= 1;
        let node: typeof root | undefined = root;
        for (let k = start; k < anchor; k++) {
          node = node?.k[tileAt(k)!];
          if (!node) break;
        }
        if (node) extend(node, anchor, anchor);
      } else {
        let limit = 0;
        let c = anchor - 1;
        while (c >= 0 && !tileAt(c) && !isAnchor(c)) {
          limit += 1;
          c -= 1;
        }
        left(limit, anchor);
      }
      if (stop) return;
    }
  };

  for (const vertical of [false, true]) {
    for (let line = 0; line < SIZE; line++) {
      if (empty && line !== CENTER) continue;
      searchLine(vertical, line);
      if (stop) break;
    }
    if (stop) break;
  }

  const move = found.move;
  if (!move) return null;
  const check = analyze(board, move.placements, lexicon);
  if (!check.ok) return null;
  return { placements: move.placements, score: check.score, words: check.words, bingo: check.bingo };
}
