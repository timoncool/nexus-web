import type { CSSProperties } from 'react';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import styles from './AmbientGauge.module.scss';

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

function conicOf(stops: NonNullable<GaugeProps['ambient']>, matrix: GaugeProps['ambientMatrix']): string {
  const parts = stops.map(s => `${matrix ? corrected(s.color, matrix) : s.color} ${(s.at * 100).toFixed(1)}%`);
  // Closing on the first colour keeps the seam at 12 o'clock invisible.
  return `conic-gradient(from 0deg, ${parts.join(', ')}, ${parts[0].split(' ')[0]} 100%)`;
}

/**
 * The glass lit by the device around it: the card's live LED colours, as the
 * LEDs show them, wrap the circle and diffuse inward; a thin light ring carries
 * the value.
 */
export function AmbientGauge({ value, formatted, label, ambient, ambientMatrix, strokeScale = 1 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = STROKE * strokeScale;
  const radius = GAUGE_FIGURE_OUTER - 7 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = (clamped / 100) * circumference;
  const light: CSSProperties | undefined = ambient && ambient.length > 0 ? { backgroundImage: conicOf(ambient, ambientMatrix) } : undefined;

  return (
    <div className={styles.ambient}>
      <div className={styles.light} style={light} aria-hidden="true" />
      <svg className={styles.svg} viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className={styles.track} style={{ strokeWidth: stroke }} />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={styles.fill}
          style={{ strokeWidth: stroke }}
          strokeDasharray={`${fill} ${circumference - fill}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={`${styles.label} panel-gauge-label`}>{label}</span>}
      </div>
    </div>
  );
}

export default AmbientGauge;
