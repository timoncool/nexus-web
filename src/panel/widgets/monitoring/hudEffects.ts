import type { CSSProperties } from 'react';

/** Static looks of the Ambient glass; none animates, so a still reading costs the screen no frames. */
export interface HudEffects {
  /** Blur of the LED light layer, px at the design size. */
  lightBlur: number;
  lightOpacity: number;
  /** Opacity of the ring's unfilled track. */
  trackOpacity: number;
  /** Glow around the ring's filled arc, 0 none. */
  ringGlow: number;
  /** Neon: the text glows in its own colour. */
  neon: number;
  /** Dark shadow under the text for readability, 1 = the design's own. */
  shade: number;
  /** Dark outline of the glyphs, px. */
  stroke: number;
  /** Frosted disc behind the text. */
  glass: number;
  /** Darkening toward the rim. */
  vignette: number;
  /** Glass bevel on the rim: highlight top-left, shade bottom-right, lens shine. */
  bevel: number;
  /** Embossed text: light and dark edges. */
  emboss: number;
  hudOpacity: number;
}

export const HUD_EFFECT_LIMITS: Record<keyof HudEffects, readonly [number, number, number]> = {
  lightBlur: [0, 40, 14],
  lightOpacity: [0, 1, 1],
  trackOpacity: [0, 1, 0.16],
  ringGlow: [0, 3, 1],
  neon: [0, 2, 0],
  shade: [0, 2, 1],
  stroke: [0, 3, 0],
  glass: [0, 1, 0],
  vignette: [0, 1, 0],
  bevel: [0, 1, 0],
  emboss: [0, 1, 0],
  hudOpacity: [0.2, 1, 1],
};

export const HUD_EFFECT_KEYS = Object.keys(HUD_EFFECT_LIMITS) as (keyof HudEffects)[];

/** `slotN_fx<Name>` keys, e.g. slot0_fxNeon. */
export const fxKey = (slot: number, name: keyof HudEffects) => `slot${slot}_fx${name[0].toUpperCase()}${name.slice(1)}`;

export function readHudEffects(config: Record<string, unknown> | undefined, slot: number): HudEffects {
  return Object.fromEntries(HUD_EFFECT_KEYS.map(name => {
    const [lo, hi, def] = HUD_EFFECT_LIMITS[name];
    const n = Number(config?.[fxKey(slot, name)]);
    return [name, config?.[fxKey(slot, name)] == null || !Number.isFinite(n) ? def : Math.min(hi, Math.max(lo, n))];
  })) as unknown as HudEffects;
}

export function hudEffectVars(fx: HudEffects): CSSProperties {
  return {
    '--fx-blur': `${fx.lightBlur}px`,
    '--fx-light': String(fx.lightOpacity),
    '--fx-track': String(fx.trackOpacity),
    '--fx-ring-glow': String(fx.ringGlow),
    '--fx-neon': String(fx.neon),
    '--fx-shade': String(fx.shade),
    '--fx-stroke': `${fx.stroke}px`,
    '--fx-glass': String(fx.glass),
    '--fx-vignette': String(fx.vignette),
    '--fx-bevel': String(fx.bevel),
    '--fx-emboss': String(fx.emboss),
    '--fx-hud': String(fx.hudOpacity),
  } as CSSProperties;
}
