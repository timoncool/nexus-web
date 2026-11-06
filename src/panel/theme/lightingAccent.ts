import { useEffect, useState } from 'react';
import { fetchLightingDevices } from '../../api/lighting';
import { isTunnelActive } from '../../api/service';
import { useLightingFrames } from '../../hooks/useLightingFrames';
import { subscribeLedFrame } from '../../lib/ledFrameStore';
import type { PanelThemeState } from './panelTheme';

const HUE_BINS = 24;
const FRAME_INDEX_REFRESH_MS = 15_000;
const EMIT_INTERVAL_MS = 100;
const SMOOTHING = 0.2;

type Rgb = [number, number, number];

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

/** The live accent a panel takes from a lighting card, eased so a moving effect does not strobe the screen. */
export function useLightingAccent(deviceId: string | null): string | null {
  const enabled = !!deviceId && !isTunnelActive();
  const { live } = useLightingFrames(enabled);
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [hex, setHex] = useState<string | null>(null);

  useEffect(() => {
    setFrameIndex(null);
    if (!enabled) return undefined;
    let cancelled = false;
    const resolve = () => {
      void fetchLightingDevices().then(res => {
        if (cancelled) return;
        const card = res?.allDevices?.find(d => d.id === deviceId);
        setFrameIndex(card?.frameIndex ?? null);
      });
    };
    resolve();
    const timer = setInterval(resolve, FRAME_INDEX_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, deviceId]);

  useEffect(() => {
    if (!enabled || !live || frameIndex === null) { setHex(null); return undefined; }
    let current: Rgb | null = null;
    let lastEmit = 0;
    let lastHex: string | null = null;
    return subscribeLedFrame(f => {
      const bytes = f.devices?.get(frameIndex);
      if (!bytes) return;
      const target = dominantLedColor(bytes);
      if (!target) return;
      current = current
        ? [current[0] + (target[0] - current[0]) * SMOOTHING, current[1] + (target[1] - current[1]) * SMOOTHING, current[2] + (target[2] - current[2]) * SMOOTHING]
        : target;
      const now = performance.now();
      if (now - lastEmit < EMIT_INTERVAL_MS) return;
      const next = toHex(current);
      if (next === lastHex) return;
      lastEmit = now;
      lastHex = next;
      setHex(next);
    });
  }, [enabled, live, frameIndex]);

  return enabled ? hex : null;
}

/** The theme with the live lighting colour standing in for its accent, once one is known. */
export function withLightingAccent(theme: PanelThemeState, liveHex: string | null): PanelThemeState {
  if (!theme.accentLightingDevice || !liveHex) return theme;
  return { ...theme, accentSyncWithDesktop: false, accentColor: liveHex };
}
