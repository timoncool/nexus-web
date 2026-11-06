/** The pieces of a gauge the layout editor can move, scale and turn. */
export const GAUGE_PARTS = ['value', 'unit', 'label', 'ring'] as const;
export type GaugePart = typeof GAUGE_PARTS[number];

/** Offset in percent of the gauge's width/height, scale factor, turn in degrees. */
export interface PartTransform {
  x: number;
  y: number;
  s: number;
  r: number;
}

export type SlotParts = Partial<Record<GaugePart, PartTransform>>;

export const IDENTITY: PartTransform = { x: 0, y: 0, s: 1, r: 0 };
export const PART_SCALE_MIN = 0.2;
export const PART_SCALE_MAX = 4;
const OFFSET_LIMIT = 60;

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizePart(raw: unknown): PartTransform {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    x: Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, num(o.x, 0))),
    y: Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, num(o.y, 0))),
    s: Math.max(PART_SCALE_MIN, Math.min(PART_SCALE_MAX, num(o.s, 1))),
    r: ((num(o.r, 0) % 360) + 540) % 360 - 180,
  };
}

const isIdentity = (p: PartTransform) => p.x === 0 && p.y === 0 && p.s === 1 && p.r === 0;

/** `slotN_parts`: {value|unit|label|ring: {x, y, s, r}}; parts left out sit where the design puts them. */
export function readSlotParts(config: Record<string, unknown> | undefined, slot: number): SlotParts | undefined {
  const raw = config?.[`slot${slot}_parts`];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: SlotParts = {};
  for (const part of GAUGE_PARTS) {
    if (part in (raw as object)) {
      const p = normalizePart((raw as Record<string, unknown>)[part]);
      if (!isIdentity(p)) out[part] = p;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** CSS for an HTML part: offsets are fractions of the gauge box (a size container). */
export function partStyle(p: PartTransform | undefined): string | undefined {
  if (!p) return undefined;
  return `translate(${p.x}cqw, ${p.y}cqh) rotate(${p.r}deg) scale(${p.s})`;
}

/** SVG transform for the ring in the 100x100 gauge figure, turning and scaling about its centre. */
export function ringTransform(p: PartTransform | undefined): string | undefined {
  if (!p) return undefined;
  return `translate(${50 + p.x} ${50 + p.y}) rotate(${p.r}) scale(${p.s}) translate(-50 -50)`;
}
