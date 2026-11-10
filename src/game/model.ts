/** Original crossword-tile rules. Not a copy of any trademarked board, bag, or score chart. */

export const SIZE = 15;
export const RACK = 7;
export const CREST = 35;
export const CENTER = 7;

export type Premium = "dl" | "tl" | "dw" | "tw" | "hearth";

export type Tile = {
  id: string;
  /** Blank tiles keep "" until they are committed as a letter. */
  letter: string;
  points: number;
  blank: boolean;
};

export type Placement = {
  r: number;
  c: number;
  letter: string;
  blank: boolean;
};

export type Square = {
  premium: Premium | null;
  tile: Tile | null;
};

/** Face values differ from the familiar commercial set on purpose. */
export const VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 7, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 8, R: 1, S: 1, T: 1, U: 2, V: 4, W: 4, X: 6, Y: 4, Z: 8,
};

const COUNTS: [string, number][] = [
  ["A", 8], ["B", 2], ["C", 2], ["D", 4], ["E", 11], ["F", 2], ["G", 3], ["H", 2],
  ["I", 8], ["J", 1], ["K", 1], ["L", 4], ["M", 2], ["N", 5], ["O", 7], ["P", 2],
  ["Q", 1], ["R", 5], ["S", 4], ["T", 5], ["U", 3], ["V", 2], ["W", 2], ["X", 1],
  ["Y", 2], ["Z", 1], ["*", 2],
];

/** Diagonally symmetric. Edges stay quiet; triple words sit just off the midlines. */
const PATTERN = [
  "......3.3......",
  "...d.t...t.d...",
  "....2..d..2....",
  ".d....t.t....d.",
  "..2.........2..",
  ".t...2...2...t.",
  "3..t..d.d..t..3",
  "..d....*....d..",
  "3..t..d.d..t..3",
  ".t...2...2...t.",
  "..2.........2..",
  ".d....t.t....d.",
  "....2..d..2....",
  "...d.t...t.d...",
  "......3.3......",
];

const PREMIUM_CHAR: Record<string, Premium> = {
  d: "dl",
  t: "tl",
  "2": "dw",
  "3": "tw",
  "*": "hearth",
};

export function premiumAt(r: number, c: number): Premium | null {
  const ch = PATTERN[r]?.[c];
  if (!ch || ch === ".") return null;
  return PREMIUM_CHAR[ch] ?? null;
}

export function letterPoints(letter: string, blank: boolean): number {
  if (blank) return 0;
  return VALUES[letter] ?? 0;
}

export function emptyBoard(): Square[][] {
  return Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => ({ premium: premiumAt(r, c), tile: null })),
  );
}

export function boardHasTiles(board: Square[][]): boolean {
  for (const row of board) for (const cell of row) if (cell.tile) return true;
  return false;
}

let tileSeq = 1;

export function createBag(random: () => number = Math.random): Tile[] {
  const bag: Tile[] = [];
  for (const [letter, count] of COUNTS) {
    for (let i = 0; i < count; i++) {
      const blank = letter === "*";
      bag.push({
        id: `t${tileSeq++}`,
        letter: blank ? "" : letter,
        points: blank ? 0 : (VALUES[letter] ?? 0),
        blank,
      });
    }
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = swap;
  }
  return bag;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE;
}

export const PREMIUM_LABEL: Record<Premium, string> = {
  dl: "2L",
  tl: "3L",
  dw: "2W",
  tw: "3W",
  hearth: "2W",
};
