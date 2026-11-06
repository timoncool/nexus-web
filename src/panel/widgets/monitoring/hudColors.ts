import { clampChroma, converter, displayable, formatHex } from 'culori';
import { APCAcontrast, sRGBtoY } from 'apca-w3';
import type { GaugeGradientStop } from '../../theme/gaugeGradient';

/** Hue turns of each colour-wheel scheme, degrees from the LED hue; the first is "harmony 1". */
export const HUD_SCHEMES = {
  complementary: [180],
  split: [150, 210],
  triadic: [120, 240],
  tetradic: [60, 180, 240],
  analogous: [30, -30],
  monochrome: [0],
} as const;
export type HudScheme = keyof typeof HUD_SCHEMES;

/** Where the HUD takes its colour: plain white, one colour from the LEDs' average, or each LED's own. */
export type HudMode = 'white' | 'average' | 'flow';
/** What a HUD piece wears: white, the LED colour itself, or one of the scheme's colours. */
export type HudRole = 'white' | 'base' | 'h1' | 'h2' | 'h3';
export const HUD_PIECES = ['value', 'unit', 'label', 'ring', 'track'] as const;
export type HudPiece = typeof HUD_PIECES[number];

export interface HudSettings {
  mode: HudMode;
  scheme: HudScheme;
  roles: Record<HudPiece, HudRole>;
  /** APCA Lc the text keeps against the glass under it. */
  contrast: number;
  /** Share of the most chroma the screen can show at the chosen lightness, 1 = as vivid as it gets. */
  chroma: number;
}

/** A piece's paint: one colour, or a clockwise sweep of colours for a ring in flow mode. */
export type HudPaint = { color: string } | { sweep: readonly GaugeGradientStop[] };
export type HudColors = Partial<Record<HudPiece, HudPaint>>;

const DEFAULT_ROLES: Record<HudPiece, HudRole> = { value: 'h1', unit: 'h1', label: 'h2', ring: 'h1', track: 'white' };
const ROLES: readonly HudRole[] = ['white', 'base', 'h1', 'h2', 'h3'];
const MODES: readonly HudMode[] = ['white', 'average', 'flow'];
const toOklch = converter('oklch');
const toRgb = converter('rgb');

const num = (value: unknown, fallback: number, lo: number, hi: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function readHudSettings(config: Record<string, unknown> | undefined, slot: number): HudSettings {
  const k = (s: string) => config?.[`slot${slot}_${s}`];
  const mode = MODES.includes(k('hudMode') as HudMode) ? k('hudMode') as HudMode : 'white';
  const scheme = (k('hudScheme') as string) in HUD_SCHEMES ? k('hudScheme') as HudScheme : 'complementary';
  const roles = Object.fromEntries(HUD_PIECES.map(p => {
    const key = `hud${p[0].toUpperCase()}${p.slice(1)}`;
    const v = k(key) as HudRole;
    return [p, ROLES.includes(v) ? v : DEFAULT_ROLES[p]];
  })) as Record<HudPiece, HudRole>;
  return { mode, scheme, roles, contrast: num(k('hudContrast'), 60, 0, 100), chroma: num(k('hudChroma'), 1, 0, 1) };
}

const bytes = (hex: string): [number, number, number] => {
  const c = toRgb(hex)!;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};
const lc = (text: string, bg: string) => Math.abs(APCAcontrast(sRGBtoY(bytes(text)), sRGBtoY(bytes(bg))));

/** The most chroma sRGB holds at this lightness and hue. */
function maxChroma(l: number, hue: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (displayable({ mode: 'oklch', l, c: mid, h: hue })) lo = mid; else hi = mid;
  }
  return lo;
}

const memo = new Map<string, string>();

/**
 * The most colourful colour of `hue` that still reads against `bg`: every
 * lightness that reaches `target` Lc is tried and the one where the screen can
 * hold the most chroma wins (scaled by `share`). With none reaching it, the
 * stronger of white and black.
 */
export function readableAt(hue: number, share: number, bg: string, target: number): string {
  const q = bytes(bg).map(v => v >> 4).join('.');
  const key = `${Math.round(hue / 2)}|${share.toFixed(2)}|${q}|${Math.round(target)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  let best: { hex: string; c: number; lc: number } | null = null;
  for (let l = 0.03; l <= 0.99; l += 0.02) {
    const c = maxChroma(l, hue) * share;
    const hex = formatHex(clampChroma({ mode: 'oklch', l, c, h: hue }, 'oklch'));
    const contrast = lc(hex, bg);
    if (contrast < target) continue;
    if (!best || c > best.c + 0.002 || (Math.abs(c - best.c) <= 0.002 && contrast > best.lc)) best = { hex, c, lc: contrast };
  }
  const out = best?.hex ?? (lc('#ffffff', bg) >= lc('#000000', bg) ? '#ffffff' : '#000000');
  if (memo.size > 4000) memo.clear();
  memo.set(key, out);
  return out;
}

/** The LEDs' average, mixed in OKLab so a red-and-blue strip averages to purple, not grey. */
export function averageColor(stops: readonly GaugeGradientStop[]): string | null {
  if (stops.length === 0) return null;
  const lab = converter('oklab');
  let l = 0; let a = 0; let b = 0;
  for (const s of stops) {
    const c = lab(s.color)!;
    l += c.l; a += c.a; b += c.b;
  }
  const n = stops.length;
  return formatHex({ mode: 'oklab', l: l / n, a: a / n, b: b / n });
}

/** Brightens a glass colour the way the glow layer's brightness filter does, for the contrast test. */
function glass(hex: string, brightness: number): string {
  const c = toRgb(hex)!;
  const k = (v: number) => Math.min(1, v * brightness);
  return formatHex({ mode: 'rgb', r: k(c.r), g: k(c.g), b: k(c.b) });
}

/** APCA asks less of big bold glyphs and strokes than of small text: the number and ring get 15 Lc off the caption's target. */
const LARGE_PIECE_RELIEF = 15;
const targetFor = (piece: HudPiece, contrast: number) => (piece === 'label' ? contrast : Math.max(0, contrast - LARGE_PIECE_RELIEF));

function roleColor(role: HudRole, base: string, s: HudSettings, bg: string, piece: HudPiece): string | null {
  if (role === 'white') return null;
  const lch = toOklch(base);
  const hue = lch?.h ?? 0;
  const target = targetFor(piece, s.contrast);
  if (role === 'base') return readableAt(hue, s.chroma, bg, target);
  const turns = HUD_SCHEMES[s.scheme];
  const turn = turns[Math.min(turns.length - 1, Number(role.slice(1)) - 1)];
  return readableAt((hue + turn + 360) % 360, s.chroma, bg, target);
}

/** In flow mode the text reads as one block: number, unit and caption all take the LED colour at the top of the glass. */
const TEXT_ANGLE = 0;

function stopAt(stops: readonly GaugeGradientStop[], at: number): string {
  let best = stops[0];
  for (const s of stops) if (Math.abs(s.at - at) < Math.abs(best.at - at)) best = s;
  return best.color;
}

/** The HUD's colours for the live LED stops; empty in white mode or with no live colour. */
export function hudColors(stops: readonly GaugeGradientStop[] | null | undefined, s: HudSettings, brightness: number): HudColors {
  if (s.mode === 'white' || !stops || stops.length === 0) return {};
  const out: HudColors = {};
  if (s.mode === 'average') {
    const base = averageColor(stops)!;
    const bg = glass(base, brightness);
    for (const piece of HUD_PIECES) {
      const color = roleColor(s.roles[piece], base, s, bg, piece);
      if (color) out[piece] = { color };
    }
    return out;
  }
  const memo = new Map<string, string | null>();
  const colorFor = (role: HudRole, led: string, piece: HudPiece) => {
    const key = `${role}|${piece === 'label' ? 'small' : 'large'}|${led}`;
    if (!memo.has(key)) memo.set(key, roleColor(role, led, s, glass(led, brightness), piece));
    return memo.get(key)!;
  };
  for (const piece of HUD_PIECES) {
    const role = s.roles[piece];
    if (role === 'white') continue;
    if (piece === 'ring' || piece === 'track') {
      out[piece] = { sweep: stops.map(st => ({ at: st.at, color: colorFor(role, st.color, piece) ?? '#ffffff' })) };
    } else {
      const color = colorFor(role, stopAt(stops, TEXT_ANGLE), piece);
      if (color) out[piece] = { color };
    }
  }
  return out;
}
