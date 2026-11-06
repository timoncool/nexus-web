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
}

/** Designs that draw the lighting pattern, the glow and the halo on their ring. */
export const RING_LIGHTING_DESIGNS: ReadonlySet<GaugeDesignKey> = new Set<GaugeDesignKey>(['caterpillar', 'arc270']);

const reach = (value: unknown): TextReach => (value === 'value' || value === 'all' ? value : 'off');

export function readSlotLighting(config: Record<string, unknown> | undefined, slot: number): SlotLighting {
  const backdrop = Number(config?.[`slot${slot}_backdrop`]);
  return {
    ringStyle: config?.[`slot${slot}_ringStyle`] === 'pattern' ? 'pattern' : 'accent',
    ringGlow: config?.[`slot${slot}_ringGlow`] === true,
    haloRing: config?.[`slot${slot}_haloRing`] === true,
    textColor: reach(config?.[`slot${slot}_textColor`]),
    textGlow: reach(config?.[`slot${slot}_textGlow`]),
    backdrop: Number.isFinite(backdrop) ? Math.min(1, Math.max(0, backdrop)) : 0,
  };
}

