import { useId, type CSSProperties } from 'react';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import styles from './AmbientGauge.module.scss';
import { partStyle, ringTransform } from '../slotParts';
import { hudEffectVars } from '../hudEffects';
import type { HudPaint } from '../hudColors';

const STROKE = 3;

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** The colour the screen must show to look like the LED did, per the camera calibration. */
function corrected(hex: string, m: readonly number[]): string {
  const c = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return `#${[0, 1, 2].map(row => {
    const v = m[row * 3] * c[0] + m[row * 3 + 1] * c[1] + m[row * 3 + 2] * c[2];
    return Math.round(Math.min(1, Math.max(0, toSrgb(Math.max(0, v)))) * 255).toString(16).padStart(2, '0');
  }).join('')}`;
}

/** Where a hue lands on a circular piecewise-linear lookup. */
function mapHue(h: number, lut: readonly (readonly [number, number])[]): number {
  const n = lut.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = lut[i];
    const [x1raw, y1raw] = lut[(i + 1) % n];
    const x1 = i + 1 < n ? x1raw : x1raw + 360;
    let y1 = i + 1 < n ? y1raw : y1raw + 360;
    if (y1 < y0 - 180) y1 += 360;
    const hh = h < x0 ? h + 360 : h;
    if (hh >= x0 && hh <= x1) return ((y0 + (y1 - y0) * ((hh - x0) / (x1 - x0))) % 360 + 360) % 360;
  }
  return h;
}

/** The hue the screen must be sent for it to look like the LED, per the camera hue table; saturation and value stay. */
function hueCorrected(hex: string, lut: readonly (readonly [number, number])[]): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-3) return hex;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h * 60) % 360 + 360) % 360;
  const nh = mapHue(h, lut) / 60;
  const s = d / max;
  const f = (k: number) => {
    const kk = (k + nh) % 6;
    return max - max * s * Math.max(0, Math.min(kk, 4 - kk, 1));
  };
  return `#${[f(5), f(3), f(1)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Scales the colour so its value becomes value^(1/gamma); hue and saturation stay. */
function lifted(hex: string, gamma: number): string {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...c);
  if (max <= 0 || max >= 1) return hex;
  const k = max ** (1 / gamma) / max;
  return `#${c.map(v => Math.round(Math.min(1, v * k) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function conicOf(
  stops: NonNullable<GaugeProps['ambient']>,
  matrix: GaugeProps['ambientMatrix'],
  lut: GaugeProps['ambientHueLut'],
  gamma: GaugeProps['ambientGamma'],
  rotate: GaugeProps['ambientRotate'],
): string {
  const hued = (c: string) => (lut ? hueCorrected(c, lut) : matrix ? corrected(c, matrix) : c);
  const fix = (c: string) => (gamma && gamma !== 1 ? lifted(hued(c), gamma) : hued(c));
  const parts = stops.map(s => `${fix(s.color)} ${(s.at * 100).toFixed(1)}%`);
  // Screens whose LED ring is mounted turned against the panel pass a rotation so the glow lines up with the device.
  const from = rotate ? ((rotate % 360) + 360) % 360 : 0;
  // Closing on the first colour keeps the seam invisible.
  return `conic-gradient(from ${from}deg, ${parts.join(', ')}, ${parts[0].split(' ')[0]} 100%)`;
}

/**
 * The glass lit by the device around it: the card's live LED colours, as the
 * LEDs show them, wrap the circle and diffuse inward; a thin light ring carries
 * the value.
 */
const sweepOf = (paint: HudPaint | undefined): string | null => {
  if (!paint || !('sweep' in paint) || paint.sweep.length === 0) return null;
  const parts = paint.sweep.map(s => `${s.color} ${(s.at * 100).toFixed(1)}%`);
  return `conic-gradient(from 0deg, ${parts.join(', ')}, ${paint.sweep[0].color} 100%)`;
};
const colorOf = (paint: HudPaint | undefined): string | undefined => (paint && 'color' in paint ? paint.color : undefined);

export function AmbientGauge({ value, formatted, label, ambient, ambientMatrix, ambientHueLut, ambientGamma, ambientRotate, strokeScale = 1, ringInset = 7, parts, hud, fx, blend }: GaugeProps) {
  const id = useId().replace(/:/g, '');
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = STROKE * strokeScale;
  const radius = GAUGE_FIGURE_OUTER - ringInset - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = (clamped / 100) * circumference;
  const light: CSSProperties | undefined = ambient && ambient.length > 0 ? { backgroundImage: conicOf(ambient, ambientMatrix, ambientHueLut, ambientGamma, ambientRotate) } : undefined;

  const ringSweep = sweepOf(hud?.ring);
  const trackSweep = sweepOf(hud?.track);
  const rootStyle = {
    ...(fx ? hudEffectVars(fx) : undefined),
    ...(blend && blend !== 'normal' ? { '--fx-blend': blend } : undefined),
    ...(colorOf(hud?.value) ? { '--hud-value': colorOf(hud?.value) } : undefined),
    ...(colorOf(hud?.unit) ? { '--hud-unit': colorOf(hud?.unit) } : undefined),
    ...(colorOf(hud?.label) ? { '--hud-label': colorOf(hud?.label) } : undefined),
    ...(colorOf(hud?.ring) ? { '--hud-ring': colorOf(hud?.ring) } : undefined),
    ...(colorOf(hud?.track) ? { '--hud-track': colorOf(hud?.track) } : undefined),
  } as CSSProperties;
  const trackCircle = <circle cx="50" cy="50" r={radius} className={styles.track} style={{ strokeWidth: stroke }} />;
  const fillCircle = (
    <circle
      cx="50"
      cy="50"
      r={radius}
      className={styles.fill}
      style={{ strokeWidth: stroke }}
      strokeDasharray={`${fill} ${circumference - fill}`}
      transform="rotate(-90 50 50)"
    />
  );

  return (
    <div className={styles.ambient} style={rootStyle} data-hud-unit={colorOf(hud?.unit) ? '' : undefined}>
      <div className={styles.light} style={light} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.glass} aria-hidden="true" />
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        {(ringSweep || trackSweep) && (
          <defs>
            {trackSweep && (
              <mask id={`${id}-track`} maskUnits="userSpaceOnUse">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#fff" strokeWidth={stroke} />
              </mask>
            )}
            {ringSweep && (
              <mask id={`${id}-fill`} maskUnits="userSpaceOnUse">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={`${fill} ${circumference - fill}`} transform="rotate(-90 50 50)" />
              </mask>
            )}
          </defs>
        )}
        <g data-gauge-part="ring" transform={ringTransform(parts?.ring)} className={styles.hud}>
          {trackSweep
            ? <foreignObject x="0" y="0" width="100" height="100" mask={`url(#${id}-track)`} className={styles.sweepTrack}><div style={{ width: '100%', height: '100%', backgroundImage: trackSweep }} /></foreignObject>
            : trackCircle}
          {ringSweep
            ? <foreignObject x="0" y="0" width="100" height="100" mask={`url(#${id}-fill)`} className={styles.sweepFill}><div style={{ width: '100%', height: '100%', backgroundImage: ringSweep }} /></foreignObject>
            : fillCircle}
        </g>
      </svg>
      <div className={styles.bevel} aria-hidden="true" />
      <div className={`${styles.center} ${styles.hud}`} style={parts?.unit ? { '--part-unit': partStyle(parts.unit) } as CSSProperties : undefined}>
        <span className={styles.part} data-gauge-part="value" style={{ transform: partStyle(parts?.value) }}>
          <GaugeValue formatted={formatted} className={styles.value} />
        </span>
        {label && <span className={`${styles.label} ${styles.part} panel-gauge-label`} data-gauge-part="label" style={{ transform: partStyle(parts?.label) }}>{label}</span>}
      </div>
    </div>
  );
}

export default AmbientGauge;
