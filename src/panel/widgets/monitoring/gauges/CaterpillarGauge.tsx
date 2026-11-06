import { GaugeValue } from './GaugeValue';
import { GAUGE_FIGURE_OUTER } from './types';
import { RING_STROKE } from './squareRingGeometry';
import type { GaugeProps } from './types';
import { ArcSegments, type ArcGeometry } from './ArcSegments';
import { useId } from 'react';
import { HaloRing, RingGlowFilter } from './RingGlow';
import styles from './CaterpillarGauge.module.scss';

// The graded ring starts at 12 o'clock like the dash below.
function ringGeometry(strokeScale: number) {
  const stroke = RING_STROKE * strokeScale;
  // Centre line of a stroke whose outer edge lands on the shared figure edge.
  const radius = GAUGE_FIGURE_OUTER - stroke / 2;
  const geometry: ArcGeometry = { cx: 50, cy: 50, radius, startDeg: -90, sweepDeg: 360, strokeWidth: stroke };
  return { stroke, radius, circumference: 2 * Math.PI * radius, geometry };
}

const DEFAULT_RING = ringGeometry(1);

export function CaterpillarGauge({ value, formatted, label, gradient, strokeScale = 1, ringGlow, halo }: GaugeProps) {
  const glowId = useId();
  const ring = strokeScale === 1 ? DEFAULT_RING : ringGeometry(strokeScale);
  const clamped = Math.max(0, Math.min(100, value));
  const fillLength = (clamped / 100) * ring.circumference;
  const gapLength = ring.circumference - fillLength;

  return (
    <div className={styles.caterpillar}>
      <svg className={styles.svg} viewBox="0 0 100 100">
        {ringGlow && <RingGlowFilter id={glowId} />}
        <circle cx="50" cy="50" r={ring.radius} className={styles.trackRing} style={{ strokeWidth: ring.stroke }} />
        <g filter={ringGlow ? `url(#${glowId})` : undefined}>
          {halo && <HaloRing geometry={ring.geometry} gradient={gradient} className={styles.fillRing} />}
          {gradient ? (
            <ArcSegments geometry={ring.geometry} gradient={gradient} fillPercent={clamped} />
          ) : (
            <circle
              cx="50"
              cy="50"
              r={ring.radius}
              className={styles.fillRing}
              style={{ strokeWidth: ring.stroke }}
              strokeDasharray={`${fillLength} ${gapLength}`}
              // Start the dash at 12 o'clock and sweep clockwise.
              transform="rotate(-90 50 50)"
            />
          )}
        </g>
      </svg>
      <div className={styles.center}>
        <GaugeValue formatted={formatted} className={styles.value} />
        {label && <span className={`${styles.label} panel-gauge-label`}>{label}</span>}
      </div>
    </div>
  );
}
