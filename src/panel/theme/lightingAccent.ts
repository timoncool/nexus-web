import { useEffect, useState } from 'react';
import { fetchLightingDevices, type LightingDevice } from '../../api/lighting';
import { isTunnelActive } from '../../api/service';
import { useLightingFrames } from '../../hooks/useLightingFrames';
import { subscribeLedFrame } from '../../lib/ledFrameStore';
import type { GaugeGradientStop } from './gaugeGradient';
import type { PanelThemeState } from './panelTheme';

const HUE_BINS = 24;
const CARD_CACHE_MS = 15_000;
// Each repaint is a video frame to a fan screen, and those frames share the 2.4 GHz air with fan control.
const EMIT_INTERVAL_MS = 100;
const SMOOTHING = 0.25;
// Per-LED colours only bridge the stream's frame gaps; the glass shows what the LEDs show.
const LED_SMOOTHING = 0.7;
/** Logical size of the lighting canvas the card rects are laid out in (LightingEngine.CanvasUnitsW/H). */
const CANVAS_UNITS_W = 1000;
const CANVAS_UNITS_H = 600;

type Rgb = [number, number, number];

/** "cardId" or "cardId@from-to": a lighting card, optionally narrowed to an inclusive LED range (one fan of a chain). */
export interface LightingSpec {
  id: string;
  from: number | null;
  to: number | null;
}

export function parseLightingSpec(spec: string | null | undefined): LightingSpec | null {
  if (!spec) return null;
  const at = spec.lastIndexOf('@');
  if (at < 0) return { id: spec, from: null, to: null };
  const match = /^(\d+)-(\d+)$/.exec(spec.slice(at + 1));
  if (!match) return { id: spec, from: null, to: null };
  const from = Number(match[1]);
  const to = Number(match[2]);
  return { id: spec.slice(0, at), from: Math.min(from, to), to: Math.max(from, to) };
}

function sliceLeds(bytes: Uint8Array, spec: LightingSpec): Uint8Array {
  if (spec.from === null || spec.to === null) return bytes;
  return bytes.subarray(spec.from * 3, Math.min(bytes.length, (spec.to + 1) * 3));
}

let cardCache: { at: number; cards: Promise<LightingDevice[]> } | null = null;

function lightingCards(): Promise<LightingDevice[]> {
  const now = Date.now();
  if (!cardCache || now - cardCache.at > CARD_CACHE_MS) {
    cardCache = { at: now, cards: fetchLightingDevices().then(res => res?.allDevices ?? []) };
  }
  return cardCache.cards;
}

/** The card a spec names, re-read on the card cache's cadence so a re-indexed frame keeps resolving. */
function useLightingCard(id: string | null, enabled: boolean): LightingDevice | null {
  const [card, setCard] = useState<LightingDevice | null>(null);
  useEffect(() => {
    setCard(null);
    if (!enabled || !id) return undefined;
    let cancelled = false;
    const resolve = () => {
      void lightingCards().then(cards => {
        if (!cancelled) setCard(cards.find(c => c.id === id) ?? null);
      });
    };
    resolve();
    const timer = setInterval(resolve, CARD_CACHE_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id, enabled]);
  return card;
}

/**
 * The colour a lighting card shows most: LEDs vote for their hue weighted by
 * saturation and brightness, and the winning hue's LEDs average into one colour
 * lifted to full brightness. Null when the card is dark.
 */
export function dominantLedColor(bytes: Uint8Array): Rgb | null {
  const bins = new Float64Array(HUE_BINS);
  const ledCount = Math.floor(bytes.length / 3);
  const hues = new Int16Array(ledCount);
  const weights = new Float64Array(ledCount);
  let sumR = 0; let sumG = 0; let sumB = 0; let lit = 0;
  for (let i = 0; i < ledCount; i++) {
    const r = bytes[i * 3]; const g = bytes[i * 3 + 1]; const b = bytes[i * 3 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    hues[i] = -1;
    if (max < 8) continue;
    sumR += r; sumG += g; sumB += b; lit++;
    const delta = max - min;
    if (delta === 0) continue;
    let h: number;
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    const bin = Math.min(HUE_BINS - 1, Math.floor((h / 6) * HUE_BINS));
    const weight = (delta / max) * (max / 255);
    hues[i] = bin;
    weights[i] = weight;
    bins[bin] += weight;
  }
  if (lit === 0) return null;

  let best = 0; let bestScore = -1;
  for (let b = 0; b < HUE_BINS; b++) {
    const score = bins[(b + HUE_BINS - 1) % HUE_BINS] + bins[b] + bins[(b + 1) % HUE_BINS];
    if (score > bestScore) { bestScore = score; best = b; }
  }
  let r = 0; let g = 0; let b = 0;
  if (bestScore > 0.05) {
    for (let i = 0; i < ledCount; i++) {
      const bin = hues[i];
      if (bin < 0) continue;
      const distance = Math.min((bin - best + HUE_BINS) % HUE_BINS, (best - bin + HUE_BINS) % HUE_BINS);
      if (distance > 1) continue;
      r += bytes[i * 3] * weights[i]; g += bytes[i * 3 + 1] * weights[i]; b += bytes[i * 3 + 2] * weights[i];
    }
  } else {
    r = sumR; g = sumG; b = sumB;
  }
  const peak = Math.max(r, g, b);
  if (peak <= 0) return null;
  return [r / peak * 255, g / peak * 255, b / peak * 255];
}

function toHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}


export interface LightingLive {
  /** The card's dominant colour, eased. */
  accent: string | null;
  /** One stop per LED in strip order, eased; the ring paints them clockwise from its start. */
  stops: readonly GaugeGradientStop[] | null;
}

const NO_LIVE: LightingLive = { accent: null, stops: null };

/** Live colours of a lighting card (or one fan of it), eased so a moving effect does not strobe the screen. */
export function useLightingLive(spec: string | null): LightingLive {
  const parsed = parseLightingSpec(spec);
  const enabled = !!parsed && !isTunnelActive();
  const { live } = useLightingFrames(enabled);
  const card = useLightingCard(parsed?.id ?? null, enabled);
  const frameIndex = card?.frameIndex ?? null;
  const [state, setState] = useState<LightingLive>(NO_LIVE);
  const from = parsed?.from ?? null;
  const to = parsed?.to ?? null;

  useEffect(() => {
    if (!enabled || !live || frameIndex === null) { setState(NO_LIVE); return undefined; }
    const range: LightingSpec = { id: '', from, to };
    let accent: Rgb | null = null;
    let leds: Rgb[] = [];
    let lastEmit = 0;
    let lastKey = '';
    return subscribeLedFrame(f => {
      const all = f.devices?.get(frameIndex);
      if (!all) return;
      const bytes = sliceLeds(all, range);
      const count = Math.floor(bytes.length / 3);
      if (count === 0) return;
      const target = dominantLedColor(bytes);
      if (target) {
        accent = accent
          ? [accent[0] + (target[0] - accent[0]) * SMOOTHING, accent[1] + (target[1] - accent[1]) * SMOOTHING, accent[2] + (target[2] - accent[2]) * SMOOTHING]
          : target;
      }
      if (leds.length !== count) leds = Array.from({ length: count }, (_, i) => [bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]] as Rgb);
      for (let i = 0; i < count; i++) {
        const led = leds[i];
        led[0] += (bytes[i * 3] - led[0]) * LED_SMOOTHING;
        led[1] += (bytes[i * 3 + 1] - led[1]) * LED_SMOOTHING;
        led[2] += (bytes[i * 3 + 2] - led[2]) * LED_SMOOTHING;
      }
      const now = performance.now();
      if (now - lastEmit < EMIT_INTERVAL_MS) return;
      lastEmit = now;
      const stops: GaugeGradientStop[] = leds.map((led, i) => ({
        at: count === 1 ? 0 : i / (count - 1),
        color: toHex(led),
      }));
      const accentHex = accent ? toHex(accent) : null;
      const key = `${accentHex}|${stops.map(st => st.color).join(',')}`;
      if (key === lastKey) return;
      lastKey = key;
      setState({ accent: accentHex, stops });
    });
  }, [enabled, live, frameIndex, from, to]);

  return enabled ? state : NO_LIVE;
}

/** The live accent alone, for hosts that only recolour the theme. */
export function useLightingAccent(spec: string | null): string | null {
  return useLightingLive(spec).accent;
}

/** Stands in while a followed card has no live colour (lighting off, dongle stalled), instead of the desktop accent. */
const LIGHTING_PENDING_ACCENT = '#3a3a46';

/** The theme with the live lighting colour standing in for its accent. */
export function withLightingAccent(theme: PanelThemeState, liveHex: string | null): PanelThemeState {
  if (!theme.accentLightingDevice) return theme;
  return { ...theme, accentSyncWithDesktop: false, accentColor: liveHex ?? LIGHTING_PENDING_ACCENT };
}

/** Paints the part of the lighting canvas a card covers onto `canvas`, so the screen shows the same texture its LEDs sample. */
export function useLightingTexture(spec: string | null, canvas: HTMLCanvasElement | null): boolean {
  const parsed = parseLightingSpec(spec);
  const enabled = !!parsed && !!canvas && !isTunnelActive();
  const { live } = useLightingFrames(enabled);
  const card = useLightingCard(parsed?.id ?? null, enabled);

  useEffect(() => {
    if (!enabled || !live || !card || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    return subscribeLedFrame(f => {
      if (!f.pixels || f.w === 0 || f.h === 0) return;
      const x0 = Math.max(0, Math.floor(card.canvasX / CANVAS_UNITS_W * f.w));
      const y0 = Math.max(0, Math.floor(card.canvasY / CANVAS_UNITS_H * f.h));
      const x1 = Math.min(f.w, Math.ceil((card.canvasX + card.canvasW) / CANVAS_UNITS_W * f.w));
      const y1 = Math.min(f.h, Math.ceil((card.canvasY + card.canvasH) / CANVAS_UNITS_H * f.h));
      const w = Math.max(1, x1 - x0);
      const h = Math.max(1, y1 - y0);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = ((y0 + y) * f.w + (x0 + x)) * 3;
          const o = (y * w + x) * 4;
          d[o] = f.pixels[s]; d[o + 1] = f.pixels[s + 1]; d[o + 2] = f.pixels[s + 2]; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }, [enabled, live, card, canvas]);

  return enabled && live && !!card;
}
