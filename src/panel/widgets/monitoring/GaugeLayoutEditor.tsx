import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw, Redo2, Undo2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import type { PanelConfigValue } from '../../types';
import { Button } from '../../../components/common/Button/Button';
import { SettingsSection } from '../common/SettingsRow/SettingsRow';
import { MonitoringWidget } from './MonitoringWidget';
import { GAUGE_PARTS, IDENTITY, normalizePart, readSlotParts, type GaugePart, type PartTransform, type SlotParts } from './slotParts';
import styles from './GaugeLayoutEditor.module.scss';
import { previewFit } from '../common/widgetPreviewFit';
import { sizeToSpan } from '../../engine/grid';

const SNAP_PERCENT = 1.5;
const ROTATE_SNAP_DEG = 15;
const NUDGE_PERCENT = 0.5;
const NUDGE_BIG_PERCENT = 5;
const HISTORY_LIMIT = 50;

type Gesture =
  | { kind: 'move'; part: GaugePart; startX: number; startY: number; from: PartTransform }
  | { kind: 'scale'; part: GaugePart; cx: number; cy: number; startDist: number; from: PartTransform }
  | { kind: 'rotate'; part: GaugePart; cx: number; cy: number; startAngle: number; from: PartTransform };

interface Box { left: number; top: number; width: number; height: number; cx: number; cy: number; }

const PART_LABEL_KEYS: Record<GaugePart, string> = {
  value: 'monitoring.settings.layout.part.value',
  unit: 'monitoring.settings.layout.part.unit',
  label: 'monitoring.settings.layout.part.label',
  ring: 'monitoring.settings.layout.part.ring',
};

const toConfig = (parts: SlotParts): PanelConfigValue | null => {
  const entries = Object.entries(parts).filter(([, p]) => p && (p.x !== 0 || p.y !== 0 || p.s !== 1 || p.r !== 0));
  return entries.length === 0 ? null : Object.fromEntries(entries.map(([k, p]) => [k, { x: round(p!.x), y: round(p!.y), s: round(p!.s), r: round(p!.r) }]));
};
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Click a piece of the gauge to select it, drag it to move, pull a corner to
 * resize, the top handle to turn. Writes `slotN_parts` (a slide's own when the
 * settings point at a slide).
 */
export function GaugeLayoutEditor({ widget, onUpdate, selectedSlot = 0 }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const slot = selectedSlot;
  const stored = useMemo(() => readSlotParts(widget.config, slot) ?? {}, [widget.config, slot]);
  const [draft, setDraft] = useState<SlotParts | null>(null);
  const parts = draft ?? stored;
  const [selected, setSelected] = useState<GaugePart | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const undoRef = useRef<SlotParts[]>([]);
  const redoRef = useRef<SlotParts[]>([]);
  const [, bump] = useState(0);
  const span = sizeToSpan(widget.size);
  const natural = previewFit(span.cols, span.rows);
  const [fitScale, setFitScale] = useState(1);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const fit = () => setFitScale(Math.min(stage.clientWidth / natural.width, stage.clientHeight / natural.height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [natural.width, natural.height]);

  const partOf = (p: GaugePart): PartTransform => parts[p] ?? IDENTITY;

  const commit = useCallback((next: SlotParts, prev: SlotParts) => {
    undoRef.current = [...undoRef.current.slice(-HISTORY_LIMIT + 1), prev];
    redoRef.current = [];
    setDraft(null);
    onUpdate({ [`slot${slot}_parts`]: toConfig(next) });
    bump(n => n + 1);
  }, [onUpdate, slot]);

  const partElement = useCallback((part: GaugePart): HTMLElement | SVGElement | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const scope = stage.querySelector(`[data-monitoring-slot-index="${slot}"]`) ?? stage;
    return scope.querySelector<HTMLElement | SVGElement>(`[data-gauge-part="${part}"]`);
  }, [slot]);

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const el = selected ? partElement(selected) : null;
    if (!stage || !el) { setBox(prev => (prev === null ? prev : null)); return; }
    const s = stage.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const next = { left: b.left - s.left, top: b.top - s.top, width: b.width, height: b.height, cx: b.left - s.left + b.width / 2, cy: b.top - s.top + b.height / 2 };
    setBox(prev => (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5
      && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 ? prev : next));
  }, [partElement, selected]);

  useLayoutEffect(measure, [measure, parts, widget.config]);
  useEffect(() => {
    const id = window.setInterval(measure, 500);
    return () => window.clearInterval(id);
  }, [measure]);

  // Part offsets are fractions of the gauge itself (its size container), not of the stage.
  const gaugeRect = (): DOMRect | null => {
    let n: Element | null = selected ? partElement(selected) : stageRef.current?.querySelector('[data-gauge-part]') ?? null;
    while (n && n !== stageRef.current) {
      if (getComputedStyle(n).containerType === 'size') return n.getBoundingClientRect();
      n = n.parentElement;
    }
    return stageRef.current?.getBoundingClientRect() ?? null;
  };
  const stageSize = () => stageRef.current?.getBoundingClientRect() ?? null;

  const pickAt = (clientX: number, clientY: number): GaugePart | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const hits = document.elementsFromPoint(clientX, clientY);
    for (const hit of hits) {
      if (!stage.contains(hit)) continue;
      const tagged = (hit as Element).closest('[data-gauge-part]');
      const part = tagged?.getAttribute('data-gauge-part') as GaugePart | null;
      if (part && GAUGE_PARTS.includes(part)) return part;
    }
    return null;
  };

  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    stageRef.current?.focus({ preventScroll: true });
    if ((e.target as HTMLElement).dataset.handle) return;
    const part = pickAt(e.clientX, e.clientY);
    setSelected(part);
    if (!part) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gestureRef.current = { kind: 'move', part, startX: e.clientX, startY: e.clientY, from: partOf(part) };
  };

  const onHandlePointerDown = (kind: 'scale' | 'rotate') => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !box) return;
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    const s = stageSize();
    if (!s) return;
    const cx = s.left + box.cx;
    const cy = s.top + box.cy;
    gestureRef.current = kind === 'scale'
      ? { kind, part: selected, cx, cy, startDist: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)), from: partOf(selected) }
      : { kind, part: selected, cx, cy, startAngle: Math.atan2(e.clientY - cy, e.clientX - cx), from: partOf(selected) };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    const s = gaugeRect();
    if (!g || !s) return;
    let next: PartTransform = g.from;
    if (g.kind === 'move') {
      let x = g.from.x + ((e.clientX - g.startX) / s.width) * 100;
      let y = g.from.y + ((e.clientY - g.startY) / s.height) * 100;
      if (e.shiftKey) {
        if (Math.abs(x - g.from.x) > Math.abs(y - g.from.y)) y = g.from.y; else x = g.from.x;
      }
      const el = partElement(g.part);
      let v = false;
      let h = false;
      if (el && !e.ctrlKey && !e.metaKey) {
        const b = el.getBoundingClientRect();
        const offX = ((b.left + b.width / 2 - s.left) / s.width) * 100 - 50 - (partOf(g.part).x - x);
        const offY = ((b.top + b.height / 2 - s.top) / s.height) * 100 - 50 - (partOf(g.part).y - y);
        if (Math.abs(offX) < SNAP_PERCENT) { x -= offX; v = true; }
        if (Math.abs(offY) < SNAP_PERCENT) { y -= offY; h = true; }
      }
      setGuides({ v, h });
      next = { ...g.from, x, y };
    } else if (g.kind === 'scale') {
      const ratio = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) / g.startDist;
      next = { ...g.from, s: g.from.s * ratio };
    } else {
      let r = g.from.r + ((Math.atan2(e.clientY - g.cy, e.clientX - g.cx) - g.startAngle) * 180) / Math.PI;
      if (e.shiftKey) r = Math.round(r / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
      next = { ...g.from, r };
    }
    setDraft({ ...parts, [g.part]: normalizePart(next) });
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    setGuides({ v: false, h: false });
    if (g && draft) commit(draft, stored);
  };

  const setPart = (part: GaugePart, p: PartTransform | null) => {
    const next = { ...parts };
    if (p) next[part] = normalizePart(p); else delete next[part];
    commit(next, parts);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(parts);
    onUpdate({ [`slot${slot}_parts`]: toConfig(prev) });
    bump(n => n + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(parts);
    onUpdate({ [`slot${slot}_parts`]: toConfig(next) });
    bump(n => n + 1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!selected) return;
    if (e.key === 'Escape') { setSelected(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setPart(selected, null); return; }
    const step = e.shiftKey ? NUDGE_BIG_PERCENT : NUDGE_PERCENT;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = partOf(selected);
    setPart(selected, { ...p, x: p.x + d[0], y: p.y + d[1] });
  };

  const sel = selected ? partOf(selected) : null;

  return (
    <SettingsSection title={t('monitoring.settings.layout.title')} description={t('monitoring.settings.layout.description')}>
      <div
        ref={stageRef}
        className={styles.stage}
        tabIndex={0}
        role="application"
        aria-label={t('monitoring.settings.layout.title')}
        onPointerDown={onStagePointerDown}
        onMouseDown={e => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          className={`panel-root ${styles.widget}`}
          data-theme="dark"
          style={{ width: natural.width, height: natural.height, transform: `scale(${fitScale})`, transformOrigin: 'top left' }}
        >
          <div className="panel-card" data-size={widget.size} data-widget-type={widget.type}>
            <MonitoringWidget widget={{ ...widget, config: { ...widget.config, [`slot${slot}_parts`]: toConfig(parts) } }} selectedSlot={slot} />
          </div>
        </div>
        {guides.v && <div className={styles.guideV} />}
        {guides.h && <div className={styles.guideH} />}
        {box && selected && (
          <div className={styles.frame} style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
            {(['tl', 'tr', 'bl', 'br'] as const).map(c => (
              <div key={c} data-handle="scale" className={`${styles.handle} ${styles[c]}`} onPointerDown={onHandlePointerDown('scale')} />
            ))}
            <div data-handle="rotate" className={styles.rotate} onPointerDown={onHandlePointerDown('rotate')} />
          </div>
        )}
      </div>
      <div className={styles.toolbar}>
        <span className={styles.status}>
          {selected && sel
            ? `${t(PART_LABEL_KEYS[selected])} · ${Math.round(sel.s * 100)}% · ${Math.round(sel.r)}°`
            : t('monitoring.settings.layout.hint')}
        </span>
        <Button size="sm" tone="ghost" icon={<Undo2 size={14} />} aria-label={t('monitoring.settings.layout.undo')} disabled={undoRef.current.length === 0} onClick={undo} />
        <Button size="sm" tone="ghost" icon={<Redo2 size={14} />} aria-label={t('monitoring.settings.layout.redo')} disabled={redoRef.current.length === 0} onClick={redo} />
        <Button size="sm" tone="ghost" icon={<RotateCcw size={14} />} disabled={!selected || !parts[selected]} onClick={() => selected && setPart(selected, null)}>
          {t('monitoring.settings.layout.resetPart')}
        </Button>
        <Button size="sm" tone="ghost" disabled={Object.keys(parts).length === 0} onClick={() => commit({}, parts)}>
          {t('monitoring.settings.layout.resetAll')}
        </Button>
      </div>
    </SettingsSection>
  );
}
