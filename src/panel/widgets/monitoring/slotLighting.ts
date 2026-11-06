import type { GaugeDesignKey } from './gauges';

export type RingStyle = 'accent' | 'pattern';
export type TextReach = 'off' | 'value' | 'all';

/** How a slot ties itself to the panel's lighting card, read from slot{n}_* config keys. */
export interface SlotLighting {
  ringStyle: RingStyle;
  ringGlow: boolean;
  haloRing: boolean;
  textColor: TextReach;
  textGlow: TextReach;
  /** Opacity of the card's lighting texture behind the gauge; 0 is off. */
  backdrop: number;
  /** Ambient Glow brightness and saturation multipliers; 1 shows the LEDs' colours as sent. */
  glowBrightness: number;
  glowSaturation: number;
  /** Row-major 3x3 colour correction in linear light, from the camera calibration; null leaves colours as sent. */
  glowMatrix: readonly number[] | null;
}

export const GLOW_MIN = 0.5;
export const GLOW_MAX = 2.5;

const glowFactor = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(GLOW_MAX, Math.max(GLOW_MIN, n)) : 1;
};

/** Designs that draw the lighting pattern, the glow and the halo on their ring. */
export const RING_LIGHTING_DESIGNS: ReadonlySet<GaugeDesignKey> = new Set<GaugeDesignKey>(['caterpillar', 'arc270']);

const reach = (value: unknown): TextReach => (value === 'value' || value === 'all' ? value : 'off');

function parseMatrix(value: unknown): readonly number[] | null {
  if (typeof value !== 'string') return null;
  const m = value.split(',').map(Number);
  return m.length === 9 && m.every(Number.isFinite) ? m : null;
}

export function readSlotLighting(config: Record<string, unknown> | undefined, slot: number): SlotLighting {
  const backdrop = Number(config?.[`slot${slot}_backdrop`]);
  return {
    ringStyle: config?.[`slot${slot}_ringStyle`] === 'pattern' ? 'pattern' : 'accent',
    ringGlow: config?.[`slot${slot}_ringGlow`] === true,
    haloRing: config?.[`slot${slot}_haloRing`] === true,
    textColor: reach(config?.[`slot${slot}_textColor`]),
    textGlow: reach(config?.[`slot${slot}_textGlow`]),
    backdrop: Number.isFinite(backdrop) ? Math.min(1, Math.max(0, backdrop)) : 0,
    glowBrightness: glowFactor(config?.[`slot${slot}_glowBrightness`]),
    glowSaturation: glowFactor(config?.[`slot${slot}_glowSaturation`]),
    glowMatrix: parseMatrix(config?.[`slot${slot}_glowMatrix`]),
  };
}

