let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(next: boolean) {
  muted = next;
}

export function isMuted() {
  return muted;
}

export function unlockAudio() {
  if (muted) return;
  const AudioCtx = window.AudioContext;
  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === "suspended") void ctx.resume();
}

export function tone(kind: "place" | "play" | "bad" | "turn") {
  if (muted || !ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const spec = {
    place: [520, 0.05, "triangle"],
    play: [340, 0.12, "sine"],
    bad: [180, 0.1, "square"],
    turn: [660, 0.07, "sine"],
  } as const;
  const [freq, dur, type] = spec[kind];
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (kind === "play") osc.frequency.exponentialRampToValueAtTime(520, now + dur);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}
