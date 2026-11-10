import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, RotateCcw, Shuffle, Swords, Undo2, Users, Volume2, VolumeX } from "lucide-react";
import { analyze } from "@/game/analyze";
import { loadLexicon, type Lexicon } from "@/game/lexicon";
import { PREMIUM_LABEL, type Placement, type Premium, type Tile } from "@/game/model";
import { bestMove } from "@/game/search";
import { commitExchange, commitPass, commitPlay, newGame, type GameState } from "@/game/session";
import { setMuted, tone, unlockAudio } from "@/game/sound";

const SAVE = "rokulex/v1";
const BEST = "rokulex/best";

type Draft = Placement & { id: string; points: number };
type Drag = { id: string; x: number; y: number; moved: boolean };

const SAMPLE = [
  "", "", "R", "", "", "", "",
  "", "", "O", "", "", "", "",
  "", "", "K", "", "", "", "",
  "", "L", "E", "X", "", "", "",
  "", "", "U", "", "", "", "",
  "", "", "", "", "", "", "",
  "", "", "", "", "", "", "",
];

function premiumClass(p: Premium | null): string {
  if (!p) return "";
  if (p === "hearth") return "hearth";
  return p;
}

export function Rokulex() {
  const [lex, setLex] = useState<Lexicon | null>(null);
  const [lexError, setLexError] = useState(false);
  const [view, setView] = useState<"menu" | "rules" | "play">("menu");
  const [game, setGame] = useState<GameState | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dir, setDir] = useState<"across" | "down">("across");
  const [exchange, setExchange] = useState(false);
  const [marked, setMarked] = useState<string[]>([]);
  const [blankFor, setBlankFor] = useState<{ id: string; r: number; c: number } | null>(null);
  const [cover, setCover] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState("");
  const [canResume, setCanResume] = useState(false);
  const [best, setBest] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    let live = true;
    loadLexicon()
      .then((next) => {
        if (live) setLex(next);
      })
      .catch(() => {
        if (live) setLexError(true);
      });
    try {
      setCanResume(!!localStorage.getItem(SAVE));
      setBest(Number(localStorage.getItem(BEST) ?? 0) || 0);
      setMutedState(localStorage.getItem("rokulex/mute") === "1");
      setMuted(localStorage.getItem("rokulex/mute") === "1");
    } catch {
      /* private mode */
    }
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!game) return;
    try {
      localStorage.setItem(SAVE, JSON.stringify(game));
      if (game.status === "ended" && game.mode === "rival") {
        const mine = game.players[0].score;
        if (mine > best) {
          setBest(mine);
          localStorage.setItem(BEST, String(mine));
        }
      }
    } catch {
      /* ignore quota */
    }
  }, [game, best]);

  useEffect(() => {
    if (!game || !lex || game.status !== "playing" || cover) return;
    const side = game.players[game.turn];
    if (side.human) return;
    setThinking(true);
    const handle = window.setTimeout(() => {
      const move = bestMove(game.board, side.rack, lex, 240);
      if (move) {
        const next = commitPlay(game, move.placements, lex);
        setGame(next.state);
        setNote(next.error ?? `${side.name} played ${move.words.map((w) => w.word).join(" · ")} for ${move.score}.`);
        tone("turn");
      } else if (game.bag.length > 0) {
        const n = Math.min(game.bag.length, side.rack.length);
        setGame(commitExchange(game, side.rack.slice(0, n).map((tile) => tile.id)).state);
        setNote(`${side.name} swapped tiles.`);
      } else {
        setGame(commitPass(game));
        setNote(`${side.name} passed.`);
      }
      setThinking(false);
    }, 320);
    return () => window.clearTimeout(handle);
  }, [game, lex, cover]);

  const you = game?.players[game.turn];
  const humanTurn = !!you?.human && game?.status === "playing" && !thinking && !cover;

  const projection = useMemo(() => {
    if (!game || !lex || draft.length === 0) return null;
    return analyze(game.board, draft, lex);
  }, [game, lex, draft]);

  const start = (mode: "rival" | "hotseat") => {
    unlockAudio();
    if (!lex) return;
    const next = newGame(mode);
    setGame(next);
    setDraft([]);
    setSelected(null);
    setExchange(false);
    setMarked([]);
    setCover(false);
    setNote(mode === "rival" ? "First word crosses the hearth." : "You start. First word crosses the hearth.");
    setView("play");
  };

  const resume = () => {
    try {
      const raw = localStorage.getItem(SAVE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GameState;
      if (!parsed?.board || !parsed.players) return;
      setGame(parsed);
      setDraft([]);
      setView("play");
      setNote("Picked up where you left off.");
    } catch {
      setCanResume(false);
    }
  };

  const placeAt = useCallback(
    (id: string, r: number, c: number) => {
      if (!game || !humanTurn) return;
      const tile = game.players[game.turn].rack.find((item) => item.id === id);
      if (!tile) return;
      if (game.board[r]?.[c]?.tile) return;
      if (draft.some((item) => item.r === r && item.c === c)) return;
      if (tile.blank) {
        setBlankFor({ id, r, c });
        setSelected(null);
        return;
      }
      setDraft((prev) => prev.filter((item) => item.id !== id).concat({ id, r, c, letter: tile.letter, points: tile.points, blank: false }));
      setSelected(null);
      tone("place");
      setDir((current) => {
        const nextR = current === "down" ? r + 1 : r;
        const nextC = current === "across" ? c + 1 : c;
        if (nextR > 14 || nextC > 14) return current;
        return current;
      });
    },
    [game, humanTurn, draft],
  );

  const recall = () => {
    setDraft([]);
    setSelected(null);
    setBlankFor(null);
  };

  const playDraft = () => {
    if (!game || !lex || !humanTurn) return;
    const next = commitPlay(game, draft, lex);
    if (next.error || !next.state) {
      setNote(next.error ?? "That play doesn't land.");
      tone("bad");
      return;
    }
    const mine = game.players[game.turn].name;
    const score = next.words?.reduce((sum, word) => sum + word.score, 0) ?? 0;
    const bingo = next.words && draft.length === 7 ? " Crest bonus included." : "";
    setNote(`${mine} scored ${next.state.history[0]?.score ?? score}.${bingo}`);
    setDraft([]);
    setSelected(null);
    setExchange(false);
    setGame(next.state);
    tone("play");
    if (next.state.mode === "hotseat" && next.state.status === "playing") setCover(true);
  };

  const pass = () => {
    if (!game || !humanTurn) return;
    if (draft.length) recall();
    const name = game.players[game.turn].name;
    const next = commitPass(game);
    setGame(next);
    setNote(`${name} passed.`);
    if (next.mode === "hotseat" && next.status === "playing") setCover(true);
  };

  const swap = () => {
    if (!game || !humanTurn) return;
    const result = commitExchange(game, marked);
    if (result.error) {
      setNote(result.error);
      tone("bad");
      return;
    }
    setGame(result.state);
    setMarked([]);
    setExchange(false);
    setDraft([]);
    setNote("Tiles swapped.");
    if (result.state.mode === "hotseat" && result.state.status === "playing") setCover(true);
  };

  const shuffle = () => {
    setGame((current) => {
      if (!current || current.status !== "playing" || !current.players[current.turn].human) return current;
      const players = current.players.slice() as GameState["players"];
      const rack = players[current.turn].rack.slice();
      for (let i = rack.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swapTile = rack[i]!;
        rack[i] = rack[j]!;
        rack[j] = swapTile;
      }
      players[current.turn] = { ...players[current.turn], rack };
      return { ...current, players };
    });
  };

  useEffect(() => {
    if (view !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      if (!humanTurn || !game) return;
      if (event.key === "Enter") {
        event.preventDefault();
        playDraft();
      } else if (event.key === "Backspace" || event.key === "Escape") {
        event.preventDefault();
        setDraft((prev) => prev.slice(0, -1));
      } else if (event.key === " ") {
        event.preventDefault();
        setDir((d) => (d === "across" ? "down" : "across"));
      } else if (/^[a-zA-Z]$/.test(event.key) && !event.repeat) {
        const letter = event.key.toUpperCase();
        const rack = game.players[game.turn].rack;
        const tile = rack.find((item) => !item.blank && item.letter === letter && !draft.some((d) => d.id === item.id));
        if (tile) setSelected(tile.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onTilePointerDown = (event: React.PointerEvent, tile: Tile) => {
    if (!humanTurn) return;
    unlockAudio();
    if (exchange) {
      setMarked((prev) => (prev.includes(tile.id) ? prev.filter((id) => id !== tile.id) : prev.concat(tile.id)));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = { id: tile.id, x: event.clientX, y: event.clientY, moved: false };
    dragRef.current = next;
    setDrag(next);
  };

  const onTilePointerMove = (event: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const moved = current.moved || Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8;
    const next = { ...current, x: event.clientX, y: event.clientY, moved };
    dragRef.current = next;
    setDrag(next);
  };

  const onTilePointerUp = (event: React.PointerEvent, tile: Tile) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current || current.id !== tile.id) {
      if (!exchange) setSelected((id) => (id === tile.id ? null : tile.id));
      return;
    }
    if (!current.moved) {
      setSelected((id) => (id === tile.id ? null : tile.id));
      return;
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sq]");
    if (!hit) return;
    const r = Number(hit.dataset.r);
    const c = Number(hit.dataset.c);
    placeAt(tile.id, r, c);
  };

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    try {
      localStorage.setItem("rokulex/mute", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  if (view === "menu" || view === "rules") {
    return (
      <main className="rx">
        {view === "rules" ? (
          <section className="rx-rules">
            <button className="rx-btn ghost" type="button" onClick={() => setView("menu")}>
              Back
            </button>
            <h2>How a game is scored</h2>
            <ul>
              <li>Each player has seven tiles. Build one straight word that touches the tiles already down.</li>
              <li>The first word has to cover the brass hearth in the center. The hearth doubles that word.</li>
              <li>Sage doubles a letter, brass triples a letter, clay doubles a word, indigo triples a word. A bonus counts only on the turn it is covered.</li>
              <li>Every new cross-word scores as well. A blank stands for any letter and scores nothing.</li>
              <li>Using all seven tiles adds a 35-point crest.</li>
              <li>Pass, or swap tiles when the bag can replace them. Four passes in a row ends the game.</li>
              <li>Leftover tiles are subtracted. Play the last tile and you also take whatever your rival is still holding.</li>
            </ul>
            <p>The lexicon is about 46,000 common English words. It is not a trademarked tournament list, so a few everyday words may be missing and a few odd ones may slip in.</p>
          </section>
        ) : (
          <section className="rx-menu">
            <div className="rx-stage">
              <div>
                <div className="rx-brand">
                  <div className="rx-gate" aria-hidden="true">
                    {Array.from({ length: 9 }, (_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                  <p className="rx-kicker">Six gates, one lexicon</p>
                </div>
                <h1>Rokulex</h1>
                <p className="rx-lead">A crossword you build from tiles. Cover the hearth, cross what is already down, and leave the rival holding the bag.</p>
                <div className="rx-actions">
                  <button className="rx-btn primary" type="button" onClick={() => start("rival")} disabled={!lex}>
                    <Swords size={18} /> {lex ? "Play the rival" : lexError ? "Lexicon failed" : "Opening the lexicon"}
                  </button>
                  <button className="rx-btn" type="button" onClick={() => start("hotseat")} disabled={!lex}>
                    <Users size={18} /> Pass and play
                  </button>
                  {canResume ? (
                    <button className="rx-btn" type="button" onClick={resume}>
                      Resume
                    </button>
                  ) : null}
                  <button className="rx-btn ghost" type="button" onClick={() => setView("rules")}>
                    <BookOpen size={18} /> How scoring works
                  </button>
                </div>
                {best > 0 ? <p className="rx-fine">Best table against the rival: {best}</p> : null}
              </div>
              <div>
                <div className="rx-sample" aria-hidden="true">
                  {SAMPLE.map((letter, i) => (
                    <i key={i} className={letter ? "on" : i === 24 ? "hot" : ""}>
                      {letter}
                    </i>
                  ))}
                </div>
                <ul className="rx-notes">
                  <li><b className="rx-swatch dl">2L</b><span><strong>Sage</strong> doubles the letter</span></li>
                  <li><b className="rx-swatch tl">3L</b><span><strong>Brass</strong> triples the letter</span></li>
                  <li><b className="rx-swatch dw">2W</b><span><strong>Clay</strong> doubles the word</span></li>
                  <li><b className="rx-swatch tw">3W</b><span><strong>Indigo</strong> triples the word</span></li>
                </ul>
              </div>
            </div>
            <p className="rx-fine">Rokulex is an original word game. It is not Scrabble, and it is not affiliated with Hasbro or Mattel. The board, tile bag, and bonuses are its own.</p>
          </section>
        )}
      </main>
    );
  }

  if (!game) return null;
  const rack = game.players[game.turn].human ? game.players[game.turn].rack : [];
  const dragTile = drag ? game.players[game.turn].rack.find((tile) => tile.id === drag.id) : null;
  const statusClass = projection && !projection.ok ? "bad" : projection?.ok ? "good" : "";
  const statusText =
    cover
      ? "Rack hidden."
      : thinking
        ? "The rival is choosing a word."
        : projection?.ok
          ? `${projection.words.map((word) => word.word).join(" · ")} would score ${projection.score}${projection.bingo ? " with the crest" : ""}.`
          : projection && !projection.ok
            ? projection.error
            : note || (game.board.every((row) => row.every((cell) => !cell.tile)) ? "First word crosses the hearth." : "Your turn.");

  return (
    <main className="rx rx-play">
      <header className="rx-top">
        <button className="rx-word rx-btn ghost" type="button" onClick={() => setView("menu")}>
          Rokulex
        </button>
        <div className="rx-scores">
          {game.players.map((player, index) => (
            <div key={player.name} className={index === game.turn && game.status === "playing" ? "rx-score on" : "rx-score"}>
              <span>{player.name}</span>
              <b>{player.score}</b>
            </div>
          ))}
        </div>
        <button className="rx-btn ghost rx-icon" type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </header>

      <div className="rx-board-wrap">
        <div className="rx-board" role="grid" aria-label="Board">
          {game.board.map((row, r) =>
            row.map((cell, c) => {
              const fresh = draft.find((item) => item.r === r && item.c === c);
              const locked = cell.tile;
              const shown = fresh
                ? { letter: fresh.letter, points: fresh.points }
                : locked
                  ? { letter: locked.letter, points: locked.points }
                  : null;
              const last = game.lastPlaced.some((spot) => spot.r === r && spot.c === c);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  data-sq=""
                  data-r={r}
                  data-c={c}
                  className={`rx-cell ${premiumClass(cell.premium)} ${last && !fresh ? "last" : ""}`}
                  aria-label={shown ? `${shown.letter} at row ${r + 1} column ${c + 1}` : `Empty ${cell.premium ?? "square"} row ${r + 1} column ${c + 1}`}
                  onClick={() => {
                    if (!humanTurn || exchange) return;
                    if (fresh) {
                      setDraft((prev) => prev.filter((item) => item.id !== fresh.id));
                      return;
                    }
                    if (selected) placeAt(selected, r, c);
                  }}
                >
                  {shown ? (
                    <span className={fresh ? "rx-pip fresh" : "rx-pip"}>
                      <span className="rx-cell-letter">{shown.letter}</span>
                      <span className="rx-pts">{shown.points}</span>
                    </span>
                  ) : cell.premium ? (
                    <span className="tag">{PREMIUM_LABEL[cell.premium]}</span>
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <aside className="rx-side">
        <h2>{game.status === "ended" ? "Table closed" : humanTurn ? "Your tiles" : "Waiting"}</h2>
        <p className={`rx-status ${statusClass}`}>{game.status === "ended" ? game.endNote : statusText}</p>
        <ul className="rx-log">
          {game.history.length === 0 ? <li><span>No words yet.</span></li> : null}
          {game.history.map((entry, index) => (
            <li key={`${entry.name}-${index}`}>
              <span>
                <b>{entry.name}</b> {entry.text}
              </span>
              <b>{entry.score || ""}</b>
            </li>
          ))}
        </ul>
        {game.status === "ended" ? (
          <button className="rx-btn primary" type="button" onClick={() => start(game.mode)}>
            <RotateCcw size={18} /> Play again
          </button>
        ) : null}
        <p className="rx-fine">Space flips direction. Enter plays. Backspace lifts the last tile.</p>
      </aside>

      <footer className="rx-dock">
        <p className={`rx-status ${statusClass}`}>{game.status === "ended" ? game.endNote : statusText}</p>
        <div className="rx-rack" aria-label="Rack">
          {(cover ? [] : rack).map((tile) => {
            const used = draft.some((item) => item.id === tile.id);
            if (used) return <span className="rx-slot" key={tile.id} />;
            return (
              <button
                key={tile.id}
                type="button"
                className={`rx-tile ${selected === tile.id ? "selected" : ""} ${marked.includes(tile.id) ? "marked" : ""}`}
                onPointerDown={(event) => onTilePointerDown(event, tile)}
                onPointerMove={onTilePointerMove}
                onPointerUp={(event) => onTilePointerUp(event, tile)}
                aria-label={tile.blank ? "Blank tile" : `${tile.letter} worth ${tile.points}`}
              >
                <span className={tile.blank ? "rx-blank-face" : "rx-tile-letter"}>{tile.blank ? "" : tile.letter}</span>
                <span className="rx-pts">{tile.blank ? "" : tile.points}</span>
              </button>
            );
          })}
        </div>
        <div className="rx-bar">
          <button className="rx-btn rx-icon" type="button" onClick={() => setDir((d) => (d === "across" ? "down" : "across"))} disabled={!humanTurn}>
            {dir === "across" ? <ArrowRight size={18} /> : <ArrowDown size={18} />} {dir === "across" ? "Across" : "Down"}
          </button>
          <button className="rx-btn rx-icon" type="button" onClick={recall} disabled={!humanTurn || draft.length === 0}>
            <Undo2 size={18} /> Recall
          </button>
          <button className="rx-btn rx-icon" type="button" onClick={shuffle} disabled={!humanTurn}>
            <Shuffle size={18} /> Shuffle
          </button>
          {exchange ? (
            <button className="rx-btn primary rx-icon" type="button" onClick={swap} disabled={!humanTurn || marked.length === 0}>
              Swap {marked.length || ""}
            </button>
          ) : (
            <button className="rx-btn rx-icon" type="button" onClick={() => { setExchange(true); setSelected(null); setDraft([]); }} disabled={!humanTurn}>
              Swap
            </button>
          )}
          {exchange ? (
            <button className="rx-btn ghost rx-icon" type="button" onClick={() => { setExchange(false); setMarked([]); }}>
              Cancel
            </button>
          ) : (
            <button className="rx-btn rx-icon" type="button" onClick={pass} disabled={!humanTurn}>
              Pass
            </button>
          )}
          <button className="rx-btn primary rx-icon" type="button" onClick={playDraft} disabled={!humanTurn || draft.length === 0 || exchange}>
            Play
          </button>
        </div>
      </footer>

      {cover && game.status === "playing" ? (
        <div className="rx-cover">
          <div className="rx-card">
            <p className="rx-kicker">Pass and play</p>
            <h2>Hand the device to {game.players[game.turn].name}</h2>
            <p>The board stays. The rack stays hidden until you continue.</p>
            <button className="rx-btn primary" type="button" onClick={() => setCover(false)}>
              Show {game.players[game.turn].name}'s rack
            </button>
          </div>
        </div>
      ) : null}

      {blankFor ? (
        <div className="rx-modal">
          <div className="rx-card">
            <h2>Blank stands for</h2>
            <div className="rx-letters">
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => {
                    setDraft((prev) =>
                      prev.filter((item) => item.id !== blankFor.id).concat({ id: blankFor.id, r: blankFor.r, c: blankFor.c, letter, points: 0, blank: true }),
                    );
                    setBlankFor(null);
                    tone("place");
                  }}
                >
                  {letter}
                </button>
              ))}
            </div>
            <button className="rx-btn ghost" type="button" onClick={() => setBlankFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {drag?.moved && dragTile ? (
        <div className="rx-drag" style={{ left: drag.x, top: drag.y }}>
          <span>{dragTile.blank ? "" : dragTile.letter}</span>
        </div>
      ) : null}

      {game.status === "ended" ? (
        <div className="rx-cover">
          <div className="rx-card">
            <p className="rx-kicker">Final</p>
            <h2>{game.endNote}</h2>
            <p>
              {game.players[0].name} {game.players[0].score} · {game.players[1].name} {game.players[1].score}
            </p>
            <div className="rx-actions">
              <button className="rx-btn primary" type="button" onClick={() => start(game.mode)}>
                <RotateCcw size={18} /> Play again
              </button>
              <button className="rx-btn" type="button" onClick={() => setView("menu")}>
                Menu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
