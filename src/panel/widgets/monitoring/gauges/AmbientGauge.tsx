import type { CSSProperties } from 'react';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import styles from './AmbientGauge.module.scss';

const STROKE = 3;

function conicOf(stops: NonNullable<GaugeProps['ambient']>): string {
  const parts = stops.map(s => `${s.color} ${(s.at * 100).toFixed(1)}%`);
  // Closing on the first colour keeps the seam at 12 o'clock invisible.
  return `conic-gradient(from 0deg, ${parts.join(', ')}, ${stops[0].color} 100%)`;
}

/**
 * The glass lit from its rim by the device around it: the card's live LED
 * colours wrap the circle and diffuse inward, a dark core keeps the reading
 * legible, and a thin light ring on the glass carries the value.
 */
export function AmbientGauge({ value, formatted, label, ambient, strokeScale = 1 }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = STROKE * strokeScale;
  const radius = GAUGE_FIGURE_OUTER - 7 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = (clamped / 100) * circumference;
  const light: CSSProperties | undefined = ambient && ambient.length > 0 ? { backgroundImage: conicOf(ambient) } : undefined;

  return (
    <div className={styles.ambient}>
      <div className={styles.light} style={light} aria-hidden="true" />
      <div className={styles.core} aria-hidden="true" />
      <div className={styles.glass} aria-hidden="true" />
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
