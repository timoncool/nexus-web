import type { GaugeGradient } from '../valueColor';
import type { GaugeGradientStop } from '../../../theme/gaugeGradient';

/** Monitoring gauge line weight in px. Mirror of --gauge-line-thickness (variables.scss). */
export const GAUGE_LINE_THICKNESS = 3.2;

/** Outer stroke edge shared by every full-circle gauge, in its 100-unit viewBox. */
export const GAUGE_FIGURE_OUTER = 48;

export interface GaugeProps {
  value: number;
  rawValue: number;
  formatted: string;
  label: string;
  history: number[];
  maxValue: number;
  /** Relative-stretched [min, max] for line-graph gauges. Other shapes ignore. */
  historyDomain: [number, number];
  /** Value-colour ramp positioned on this gauge's own scale; null when off. */
  gradient?: GaugeGradient | null;
  /** Ring line weight relative to the design's own; the ring designs read it, the rest ignore it. */
  strokeScale?: number;
  /** Ring designs blur a copy of their fill under it. */
  ringGlow?: boolean;
  /** Ring designs draw a thin second ring just inside the main one, painted like the fill. */
  halo?: boolean;
  /** Live LED colours of the panel's lighting card in strip order, for designs lit by the device around them. */
  ambient?: readonly GaugeGradientStop[] | null;
  /** Row-major 3x3 linear-light correction applied to the ambient colours. */
  ambientMatrix?: readonly number[] | null;
  /** Hue correction pairs [LED hue, hue to send], applied to the ambient colours. */
  ambientHueLut?: readonly (readonly [number, number])[] | null;
}

export type GaugeDesignKey =
  | 'sparkline'
  | 'line'
  | 'text'
  | 'waterLevel'
  | 'caterpillar'
  | 'squareRing'
  | 'bar'
  | 'microbars'
  | 'hbar'
  | 'dotgrid'
  | 'halfgauge'
  | 'numberfill'
  | 'thermo'
  | 'arc270'
  | 'wedge'
  | 'battery'
  | 'segments'
  | 'mirrorwave'
  | 'heatmap'
  | 'dial'
  | 'tickring'
  | 'backdrop'
  | 'fill'
  | 'ambient';
