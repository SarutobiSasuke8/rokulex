import { analyze, type WordScore } from "./analyze.ts";
import type { Lexicon } from "./lexicon.ts";
import {
  RACK,
  createBag,
  emptyBoard,
  type Placement,
  type Square,
  type Tile,
} from "./model.ts";

export type Side = {
  name: string;
  human: boolean;
  score: number;
  rack: Tile[];
};

export type HistoryEntry = {
  name: string;
  text: string;
  score: number;
};

export type GameState = {
  mode: "rival" | "hotseat";
  board: Square[][];
  bag: Tile[];
  players: [Side, Side];
  turn: 0 | 1;
  passes: number;
  history: HistoryEntry[];
  status: "playing" | "ended";
  endNote: string;
  lastPlaced: { r: number; c: number }[];
};

function draw(bag: Tile[], n: number): { bag: Tile[]; tiles: Tile[] } {
  return { tiles: bag.slice(0, n), bag: bag.slice(n) };
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}

export function newGame(mode: "rival" | "hotseat", random: () => number = Math.random): GameState {
  let bag = createBag(random);
  const first = draw(bag, RACK);
  bag = first.bag;
  const second = draw(bag, RACK);
  bag = second.bag;
  return {
    mode,
    board: emptyBoard(),
    bag,
    players: [
      { name: "You", human: true, score: 0, rack: first.tiles },
      { name: mode === "rival" ? "Rival" : "Guest", human: mode === "hotseat", score: 0, rack: second.tiles },
    ],
    turn: 0,
    passes: 0,
    history: [],
    status: "playing",
    endNote: "",
    lastPlaced: [],
  };
}

function leftover(rack: Tile[]): number {
  return rack.reduce((sum, tile) => sum + tile.points, 0);
}

function finish(state: GameState, reason: string): GameState {
  const hold = state.players.map((p) => leftover(p.rack)) as [number, number];
  const gone = state.players.findIndex((p) => p.rack.length === 0);
  const players = state.players.map((p, i) => {
    let score = p.score - hold[i]!;
    if (gone === i) score += hold[1 - i]!;
    return { ...p, score };
  }) as [Side, Side];
  const winner =
    players[0].score === players[1].score
      ? "Drawn game."
      : `${players[0].score > players[1].score ? players[0].name : players[1].name} takes the table.`;
  return {
    ...state,
    players,
    status: "ended",
    endNote: `${reason} ${winner}`,
    passes: state.passes,
  };
}

function cloneBoard(board: Square[][]): Square[][] {
  return board.map((row) => row.map((cell) => ({ premium: cell.premium, tile: cell.tile })));
}

export function commitPlay(
  state: GameState,
  placements: Placement[],
  lexicon: Lexicon,
): { state: GameState; error?: string; words?: WordScore[] } {
  if (state.status !== "playing") return { state, error: "The game is over." };
  const result = analyze(state.board, placements, lexicon);
  if (!result.ok) return { state, error: result.error };
  const player = state.players[state.turn];
  const pool = player.rack.slice();
  const board = cloneBoard(state.board);
  for (const place of placements) {
    const idx = pool.findIndex((tile) => (place.blank ? tile.blank : !tile.blank && tile.letter === place.letter));
    if (idx < 0) return { state, error: "Those tiles aren't on your rack." };
    const source = pool[idx]!;
    pool.splice(idx, 1);
    board[place.r]![place.c] = {
      premium: board[place.r]![place.c]!.premium,
      tile: {
        id: source.id,
        letter: place.letter,
        points: place.blank ? 0 : source.points,
        blank: place.blank,
      },
    };
  }
  const drawn = draw(state.bag, RACK - pool.length);
  const rack = pool.concat(drawn.tiles);
  const players = state.players.slice() as [Side, Side];
  players[state.turn] = { ...player, rack, score: player.score + result.score };
  const text = result.words.map((word) => word.word).join(" · ");
  const crest = result.bingo ? " · crest +35" : "";
  const next: GameState = {
    ...state,
    board,
    bag: drawn.bag,
    players,
    turn: state.turn === 0 ? 1 : 0,
    passes: 0,
    lastPlaced: placements.map((p) => ({ r: p.r, c: p.c })),
    history: [{ name: player.name, text: `${text}${crest}`, score: result.score }, ...state.history].slice(0, 12),
  };
  if (rack.length === 0) return { state: finish(next, `${player.name} played out.`), words: result.words };
  return { state: next, words: result.words };
}

export function commitPass(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const player = state.players[state.turn];
  const passes = state.passes + 1;
  const next: GameState = {
    ...state,
    turn: state.turn === 0 ? 1 : 0,
    passes,
    lastPlaced: [],
    history: [{ name: player.name, text: "Passed", score: 0 }, ...state.history].slice(0, 12),
  };
  if (passes >= 4) return finish(next, "Four passes in a row.");
  return next;
}

export function commitExchange(state: GameState, ids: string[], random: () => number = Math.random): { state: GameState; error?: string } {
  if (state.status !== "playing") return { state, error: "The game is over." };
  if (ids.length === 0) return { state, error: "Select tiles to swap." };
  const player = state.players[state.turn];
  if (state.bag.length < ids.length) return { state, error: "Not enough tiles left in the bag to swap." };
  const giving = player.rack.filter((tile) => ids.includes(tile.id));
  if (giving.length !== ids.length) return { state, error: "Those tiles aren't on your rack." };
  const kept = player.rack.filter((tile) => !ids.includes(tile.id));
  const drawn = draw(state.bag, giving.length);
  const players = state.players.slice() as [Side, Side];
  players[state.turn] = { ...player, rack: kept.concat(drawn.tiles) };
  return {
    state: {
      ...state,
      bag: shuffle(drawn.bag.concat(giving.map((tile) => ({ ...tile, letter: tile.blank ? "" : tile.letter }))), random),
      players,
      turn: state.turn === 0 ? 1 : 0,
      passes: 0,
      lastPlaced: [],
      history: [{ name: player.name, text: `Swapped ${giving.length}`, score: 0 }, ...state.history].slice(0, 12),
    },
  };
}
