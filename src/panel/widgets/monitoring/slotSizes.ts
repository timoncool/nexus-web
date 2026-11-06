import type { CSSProperties } from 'react';
import type { GaugeDesignKey } from './gauges';

/** The parts of a monitoring slot that take their own size, as config key suffixes. */
export const SLOT_SIZE_PARTS = ['valueScale', 'unitScale', 'labelScale', 'strokeScale'] as const;
export type SlotSizePart = typeof SLOT_SIZE_PARTS[number];
export type SlotSizes = Record<SlotSizePart, number>;

export const SLOT_SIZE_MIN = 0.5;
export const SLOT_SIZE_MAX = 2.5;

/** Designs whose ring line weight follows strokeScale. */
export const STROKE_SCALE_DESIGNS: ReadonlySet<GaugeDesignKey> = new Set<GaugeDesignKey>(['caterpillar', 'arc270']);

export function normalizeSlotSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(SLOT_SIZE_MAX, Math.max(SLOT_SIZE_MIN, n));
}

export function readSlotSizes(config: Record<string, unknown> | undefined, slot: number): SlotSizes {
  return {
    valueScale: normalizeSlotSize(config?.[`slot${slot}_valueScale`]),
    unitScale: normalizeSlotSize(config?.[`slot${slot}_unitScale`]),
    labelScale: normalizeSlotSize(config?.[`slot${slot}_labelScale`]),
    strokeScale: normalizeSlotSize(config?.[`slot${slot}_strokeScale`]),
  };
}

export function slotSizeVars(sizes: SlotSizes): CSSProperties | undefined {
  if (sizes.valueScale === 1 && sizes.unitScale === 1 && sizes.labelScale === 1) return undefined;
  return {
    '--mon-value-scale': String(sizes.valueScale),
    '--mon-unit-scale': String(sizes.unitScale),
    '--mon-label-scale': String(sizes.labelScale),
  } as CSSProperties;
}
