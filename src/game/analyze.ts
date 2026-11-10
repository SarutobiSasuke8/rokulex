import {
  CENTER,
  CREST,
  SIZE,
  boardHasTiles,
  inBounds,
  letterPoints,
  type Placement,
  type Square,
} from "./model.ts";
import type { Lexicon } from "./lexicon.ts";

export type WordScore = { word: string; score: number; r: number; c: number; dir: "across" | "down" };

export type Analysis =
  | { ok: true; score: number; words: WordScore[]; bingo: boolean }
  | { ok: false; error: string };

type Fresh = Placement & { points: number };

function key(r: number, c: number): string {
  return `${r},${c}`;
}

export function analyze(board: Square[][], placements: Placement[], lexicon: Lexicon | null): Analysis {
  if (placements.length === 0) return { ok: false, error: "Place at least one tile." };

  const seen = new Set<string>();
  const fresh = new Map<string, Fresh>();
  for (const p of placements) {
    if (!inBounds(p.r, p.c)) return { ok: false, error: "That square is off the board." };
    if (!/^[A-Z]$/.test(p.letter)) return { ok: false, error: "Choose a letter for the blank." };
    const id = key(p.r, p.c);
    if (seen.has(id)) return { ok: false, error: "Two tiles can't share a square." };
    seen.add(id);
    if (board[p.r]![p.c]!.tile) return { ok: false, error: "That square is already filled." };
    fresh.set(id, { ...p, points: letterPoints(p.letter, p.blank) });
  }

  const rows = new Set(placements.map((p) => p.r));
  const cols = new Set(placements.map((p) => p.c));
  let across: boolean;
  if (placements.length === 1) across = true;
  else if (rows.size === 1) across = true;
  else if (cols.size === 1) across = false;
  else return { ok: false, error: "Tiles have to share one row or one column." };

  const fixed = across ? placements[0]!.r : placements[0]!.c;
  const along = placements.map((p) => (across ? p.c : p.r));
  const min = Math.min(...along);
  const max = Math.max(...along);

  const at = (i: number): { letter: string; points: number; fresh: boolean; premium: Square["premium"] } | null => {
    const r = across ? fixed : i;
    const c = across ? i : fixed;
    const cell = board[r]![c]!;
    const placed = fresh.get(key(r, c));
    if (placed) return { letter: placed.letter, points: placed.points, fresh: true, premium: cell.premium };
    if (cell.tile) return { letter: cell.tile.letter, points: cell.tile.points, fresh: false, premium: cell.premium };
    return null;
  };

  for (let i = min; i <= max; i++) {
    if (!at(i)) return { ok: false, error: "Leave no gaps in the word." };
  }

  let start = min;
  let end = max;
  while (start > 0 && at(start - 1)) start--;
  while (end < SIZE - 1 && at(end + 1)) end++;

  const empty = !boardHasTiles(board);
  if (empty) {
    const covers = placements.some((p) => p.r === CENTER && p.c === CENTER);
    if (!covers) return { ok: false, error: "The first word has to cover the hearth." };
  } else {
    let connected = false;
    for (const p of placements) {
      const neighbors: [number, number][] = [
        [p.r - 1, p.c],
        [p.r + 1, p.c],
        [p.r, p.c - 1],
        [p.r, p.c + 1],
      ];
      for (const [r, c] of neighbors) {
        if (inBounds(r, c) && board[r]![c]!.tile) connected = true;
      }
    }
    for (let i = min; i <= max; i++) {
      const info = at(i);
      if (info && !info.fresh) connected = true;
    }
    if (!connected) return { ok: false, error: "Connect the word to a tile already on the board." };
  }

  const words: WordScore[] = [];
  let total = 0;

  const scoreRun = (
    letters: { letter: string; points: number; fresh: boolean; premium: Square["premium"] }[],
    r: number,
    c: number,
    dir: "across" | "down",
  ): string | null => {
    if (letters.length < 2) return null;
    const word = letters.map((l) => l.letter).join("");
    if (lexicon && !lexicon.has(word)) return word;
    let sum = 0;
    let mult = 1;
    for (const letter of letters) {
      let pts = letter.points;
      if (letter.fresh) {
        if (letter.premium === "dl") pts *= 2;
        if (letter.premium === "tl") pts *= 3;
        if (letter.premium === "dw" || letter.premium === "hearth") mult *= 2;
        if (letter.premium === "tw") mult *= 3;
      }
      sum += pts;
    }
    const score = sum * mult;
    words.push({ word, score, r, c, dir });
    total += score;
    return null;
  };

  const mainLetters = [];
  for (let i = start; i <= end; i++) mainLetters.push(at(i)!);
  const mainR = across ? fixed : start;
  const mainC = across ? start : fixed;
  const unknownMain = scoreRun(mainLetters, mainR, mainC, across ? "across" : "down");
  if (unknownMain) return { ok: false, error: `${unknownMain} isn't in the lexicon.` };
  if (placements.length > 1 && mainLetters.length < 2) {
    return { ok: false, error: "That isn't a long enough word." };
  }

  for (const p of placements) {
    const dr = across ? 1 : 0;
    const dc = across ? 0 : 1;
    let r = p.r;
    let c = p.c;
    while (inBounds(r - dr, c - dc) && (board[r - dr]![c - dc]!.tile || fresh.has(key(r - dr, c - dc)))) {
      r -= dr;
      c -= dc;
    }
    const run = [];
    let rr = r;
    let cc = c;
    const originR = r;
    const originC = c;
    while (inBounds(rr, cc)) {
      const cell = board[rr]![cc]!;
      const placed = fresh.get(key(rr, cc));
      if (!cell.tile && !placed) break;
      if (placed) run.push({ letter: placed.letter, points: placed.points, fresh: true, premium: cell.premium });
      else if (cell.tile) run.push({ letter: cell.tile.letter, points: cell.tile.points, fresh: false, premium: cell.premium });
      rr += dr;
      cc += dc;
    }
    const unknown = scoreRun(run, originR, originC, across ? "down" : "across");
    if (unknown) return { ok: false, error: `${unknown} isn't in the lexicon.` };
  }

  if (words.length === 0) return { ok: false, error: "That tile doesn't form a word." };

  const bingo = placements.length === 7;
  if (bingo) total += CREST;
  return { ok: true, score: total, words, bingo };
}
