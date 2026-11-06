import { useEffect, useState } from 'react';
import type { DeviceKey } from './perfSlots';

/** One reading a slot shows in turn: its sensor, an optional caption, and how long it stays. */
export interface SlotCycleEntry {
  device: DeviceKey;
  sensor: string;
  label?: string;
  seconds: number;
  /** Slot keys this reading sets for itself, without the `slotN_` prefix (valueScale, design, degreeOnly...). */
  config?: Record<string, unknown>;
}

export const CYCLE_MIN_SECONDS = 2;
export const CYCLE_MAX_SECONDS = 3600;
export const CYCLE_DEFAULT_SECONDS = 6;

const seconds = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(CYCLE_MAX_SECONDS, Math.max(CYCLE_MIN_SECONDS, n)) : CYCLE_DEFAULT_SECONDS;
};

/**
 * `slotN_cycle`: a list of {device, sensor, label?, seconds?, config?}. Fewer than two
 * usable entries is no cycle - the slot keeps its own sensor.
 */
export function readSlotCycle(config: Record<string, unknown> | undefined, slot: number): SlotCycleEntry[] | null {
  const raw = config?.[`slot${slot}_cycle`];
  if (!Array.isArray(raw)) return null;
  const entries = raw.flatMap((item): SlotCycleEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const { device, sensor, label, config } = item as Record<string, unknown>;
    if (typeof device !== 'string' || typeof sensor !== 'string' || !sensor) return [];
    return [{
      device: device as DeviceKey,
      sensor,
      label: typeof label === 'string' && label.trim() ? label : undefined,
      seconds: seconds((item as Record<string, unknown>).seconds),
      ...(config && typeof config === 'object' && !Array.isArray(config) ? { config: config as Record<string, unknown> } : {}),
    }];
  });
  return entries.length >= 2 ? entries : null;
}

/** The widget config as this reading sees it: its sensor, caption and own keys laid over the slot's. */
export function cycleEntryConfig(config: Record<string, unknown> | undefined, slot: number, entry: SlotCycleEntry): Record<string, unknown> {
  const own = Object.fromEntries(Object.entries(entry.config ?? {}).map(([key, value]) => [`slot${slot}_${key}`, value]));
  return {
    ...config,
    ...own,
    [`slot${slot}_device`]: entry.device,
    [`slot${slot}_sensor`]: entry.sensor,
    [`slot${slot}_label`]: entry.label,
    [`slot${slot}_labelMode`]: entry.label ? 'custom' : undefined,
  };
}

/** The entry on screen now; each one stays for its own seconds before the next. */
export function useSlotCycle(entries: readonly SlotCycleEntry[], hold?: number | null): SlotCycleEntry {
  const [index, setIndex] = useState(0);
  const held = hold != null && hold >= 0 && hold < entries.length ? hold : null;
  const at = held ?? index % entries.length;
  const stay = entries[at].seconds;
  useEffect(() => {
    if (held !== null) return undefined;
    const timer = setTimeout(() => setIndex(i => (i + 1) % entries.length), stay * 1000);
    return () => clearTimeout(timer);
  }, [at, stay, entries.length, held]);
  return entries[at];
}
