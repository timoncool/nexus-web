import { ArcSegments, type ArcGeometry } from './ArcSegments';
import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import type { GaugeProps } from './types';
import styles from './Arc270Gauge.module.scss';

const STROKE = 9;
// 270 deg arc starting at 7 o'clock (bottom-left) sweeping clockwise
// to 5 o'clock (bottom-right) - the bottom 90 deg is the visible gap.
const ARC_DEG = 270;
const START_DEG = 135;

function arcGeometry(strokeScale: number) {
  const stroke = STROKE * strokeScale;
  const radius = GAUGE_FIGURE_OUTER - stroke / 2;
  const polar = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
  };
  const start = polar(START_DEG);
  const end = polar(START_DEG + ARC_DEG);
  const geometry: ArcGeometry = {
    cx: 50, cy: 50, radius, startDeg: START_DEG, sweepDeg: ARC_DEG, strokeWidth: stroke,
  };
  return {
    stroke,
    length: (ARC_DEG / 360) * 2 * Math.PI * radius,
    path: `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 1 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    geometry,
  };
}

const DEFAULT_ARC = arcGeometry(1);

export function Arc270Gauge({ value, formatted, label, gradient, strokeScale = 1 }: GaugeProps) {
  const arc = strokeScale === 1 ? DEFAULT_ARC : arcGeometry(strokeScale);
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * arc.length;
  const gapLength = arc.length - fillLength;

  return (
    <div className={styles.arc270}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        <path d={arc.path} className={styles.trackArc} style={{ strokeWidth: arc.stroke }} />
        {gradient ? (
          <ArcSegments
            geometry={arc.geometry}
            gradient={gradient}
            fillPercent={clamped}
          />
        ) : (
          <path
            d={arc.path}
            className={styles.fillArc}
            style={{ strokeWidth: arc.stroke }}
            strokeDasharray={`${fillLength} ${gapLength}`}
          />
        )}
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={`${styles.label} panel-gauge-label`}>{label}</span>}
      </div>
    </div>
  );
}

export default Arc270Gauge;
