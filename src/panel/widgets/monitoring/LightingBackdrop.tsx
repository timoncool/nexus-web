import { useState } from 'react';
import { useLightingTexture } from '../../theme/lightingAccent';
import styles from './MonitoringWidget.module.scss';

/** The lighting canvas under a card, behind a slot's gauge, so the screen reads as part of that device's glow. */
export function LightingBackdrop({ spec, opacity }: { spec: string; opacity: number }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const live = useLightingTexture(spec, canvas);
  return (
    <canvas
      ref={setCanvas}
      className={styles.lightingBackdrop}
      style={{ opacity: live ? opacity : 0 }}
      aria-hidden="true"
    />
  );
}
