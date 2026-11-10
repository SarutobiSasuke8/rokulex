import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "./analyze.ts";
import { buildLexicon } from "./lexicon.ts";
import { SIZE, emptyBoard, premiumAt, type Placement, type Tile } from "./model.ts";
import { bestMove } from "./search.ts";
import { commitPass, commitPlay, newGame } from "./session.ts";

const lex = buildLexicon(["cat", "hello", "to", "ox", "at", "hat", "quiz", "jazz"]);

function tiles(letters: string): Tile[] {
  return letters.split("").map((letter, i) => ({
    id: `x${i}${letter}`,
    letter: letter === "?" ? "" : letter,
    points: letter === "?" ? 0 : 1,
    blank: letter === "?",
  }));
}

function place(word: string, r: number, c: number, across = true, blanks: number[] = []): Placement[] {
  return word.split("").map((letter, i) => ({
    r: across ? r : r + i,
    c: across ? c + i : c,
    letter,
    blank: blanks.includes(i),
  }));
}

describe("board", () => {
  it("is 15 by 15 and symmetric, with a hearth in the center", () => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        assert.equal(premiumAt(r, c), premiumAt(c, r));
        assert.equal(premiumAt(r, c), premiumAt(SIZE - 1 - r, SIZE - 1 - c));
      }
    }
    assert.equal(premiumAt(7, 7), "hearth");
    assert.equal(premiumAt(0, 0), null);
    assert.equal(premiumAt(0, 7), null);
    assert.equal(premiumAt(0, 6), "tw");
  });
});

describe("analyze", () => {
  it("scores the opening word through the hearth", () => {
    const board = emptyBoard();
    const result = analyze(board, place("CAT", 7, 6), lex);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.score, 10);
  });

  it("rejects a first word that misses the hearth", () => {
    const result = analyze(emptyBoard(), place("CAT", 7, 3), lex);
    assert.equal(result.ok, false);
  });

  it("rejects unknown words and gaps", () => {
    assert.equal(analyze(emptyBoard(), place("DOG", 7, 6), lex).ok, false);
    const gapped = [...place("CA", 7, 6), ...place("T", 7, 9)];
    assert.equal(analyze(emptyBoard(), gapped, lex).ok, false);
  });

  it("scores a crossing word and a double-letter square", () => {
    const board = emptyBoard();
    const first = commitPlay(newGame("hotseat", () => 0), place("CAT", 7, 6), lex);
    // The random bag from () => 0 may not contain C,A,T. Build the board directly.
    void first;
    for (const p of place("CAT", 7, 6)) {
      board[p.r]![p.c]!.tile = { id: p.letter, letter: p.letter, points: p.letter === "C" ? 3 : 1, blank: false };
    }
    // O on the double-letter square under T (8,8) forms TO down.
    const result = analyze(board, place("O", 8, 8), lex);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.words.map((w) => w.word).join(","), "TO");
      assert.equal(result.score, 3);
    }
  });

  it("gives a blank no points and pays the crest for seven tiles", () => {
    const board = emptyBoard();
    const word = place("HELLO", 7, 5);
    word[0]!.blank = true;
    const blanked = analyze(board, word, lex);
    assert.equal(blanked.ok, true);
    if (blanked.ok) {
      // H is blank (0) + E1 + L1 + L1 + O1 = 4, hearth on the second L ×2 = 8
      assert.equal(blanked.score, 8);
    }
    const seven = analyze(emptyBoard(), place("QUIZZED", 7, 4), buildLexicon(["quizzed"]));
    // not checking face values here — crest is included when seven tiles are legal
    assert.equal(seven.ok, true);
    if (seven.ok) assert.equal(seven.bingo, true);
  });
});

describe("search", () => {
  it("finds the opening word", () => {
    const board = emptyBoard();
    const move = bestMove(board, tiles("CATXYZQ"), lex, 1000);
    assert.ok(move);
    assert.ok(move && move.score >= 10);
    assert.equal(analyze(board, move!.placements, lex).ok, true);
  });

  it("hooks a crossing word", () => {
    const board = emptyBoard();
    for (const p of place("CAT", 7, 6)) {
      board[p.r]![p.c]!.tile = { id: p.letter, letter: p.letter, points: 1, blank: false };
    }
    const move = bestMove(board, tiles("OX"), lex, 1000);
    assert.ok(move);
    assert.equal(analyze(board, move!.placements, lex).ok, true);
    assert.ok(move!.words.some((word) => word.word.includes("O") || word.word === "OX" || word.word === "TO" || word.word === "AT"));
  });
});

describe("session", () => {
  it("ends after four passes and subtracts leftover tiles", () => {
    let state = newGame("hotseat", () => 0.5);
    const rackPoints = state.players[0].rack.reduce((s, t) => s + t.points, 0);
    state = commitPass(state);
    state = commitPass(state);
    state = commitPass(state);
    state = commitPass(state);
    assert.equal(state.status, "ended");
    assert.ok(state.players[0].score <= 0);
    assert.ok(state.players[0].score >= -rackPoints - 40);
  });
});

describe("full lexicon", () => {
  it("rival finds a legal opening quickly", () => {
    const text = readFileSync(new URL("../../public/lexicon.txt", import.meta.url), "utf8");
    const full = buildLexicon(text.split("\n"));
    assert.ok(full.size > 20000);
    const state = newGame("rival", () => 0.42);
    const started = performance.now();
    const move = bestMove(state.board, state.players[0].rack, full, 1500);
    const elapsed = performance.now() - started;
    assert.ok(move, "expected an opening");
    assert.equal(analyze(state.board, move!.placements, full).ok, true);
    assert.ok(elapsed < 2000, `search took ${elapsed}ms`);
  });
});
