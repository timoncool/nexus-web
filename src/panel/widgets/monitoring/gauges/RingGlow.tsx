import { ArcSegments, type ArcGeometry } from './ArcSegments';
import type { GaugeGradient } from '../valueColor';

const HALO_STROKE = 1.4;
const HALO_GAP = 2.5;

/** A blur of whatever it wraps merged under the original, so a multicoloured fill glows in its own colours. */
export function RingGlowFilter({ id }: { id: string }) {
  return (
    <defs>
      <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** The thin ring just inside a ring of `geometry`, painted with the gradient when there is one, else the accent. */
export function HaloRing({ geometry, gradient, className }: { geometry: ArcGeometry; gradient?: GaugeGradient | null; className?: string }) {
  const halo: ArcGeometry = {
    ...geometry,
    radius: geometry.radius - geometry.strokeWidth / 2 - HALO_GAP - HALO_STROKE / 2,
    strokeWidth: HALO_STROKE,
  };
  if (gradient) {
    return <ArcSegments geometry={halo} gradient={{ ...gradient, id: `${gradient.id}-halo` }} fillPercent={100} />;
  }
  const r = halo.radius;
  const start = (halo.startDeg * Math.PI) / 180;
  const end = ((halo.startDeg + halo.sweepDeg) * Math.PI) / 180;
  const full = halo.sweepDeg >= 360;
  const d = full
    ? undefined
    : `M ${(halo.cx + r * Math.cos(start)).toFixed(3)} ${(halo.cy + r * Math.sin(start)).toFixed(3)} A ${r} ${r} 0 ${halo.sweepDeg > 180 ? 1 : 0} 1 ${(halo.cx + r * Math.cos(end)).toFixed(3)} ${(halo.cy + r * Math.sin(end)).toFixed(3)}`;
  return full
    ? <circle cx={halo.cx} cy={halo.cy} r={r} className={className} style={{ strokeWidth: HALO_STROKE }} />
    : <path d={d} className={className} style={{ strokeWidth: HALO_STROKE }} />;
}
