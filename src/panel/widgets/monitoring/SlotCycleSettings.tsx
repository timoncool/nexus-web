import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import type { PanelConfigValue } from '../../types';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Button } from '../../../components/common/Button/Button';
import { SettingsSection, SettingsButton } from '../common/SettingsRow/SettingsRow';
import { DEFAULT_SLOTS, isMicroLayout, resolvedSlotLayout, type DeviceKey } from './perfSlots';
import { CYCLE_DEFAULT_SECONDS, CYCLE_MAX_SECONDS, CYCLE_MIN_SECONDS, cycleEntryConfig, readSlotCycle, type SlotCycleEntry } from './slotCycle';
import { MonitoringSettings } from './MonitoringSettings';
import { GaugeLayoutEditor } from './GaugeLayoutEditor';
import styles from './SlotCycleSettings.module.scss';

const COMMON = 'common';

const toConfigValue = (entries: readonly SlotCycleEntry[]): PanelConfigValue =>
  entries.map(e => ({
    device: e.device,
    sensor: e.sensor,
    ...(e.label ? { label: e.label } : {}),
    seconds: e.seconds,
    ...(e.config && Object.keys(e.config).length > 0 ? { config: e.config as Record<string, PanelConfigValue> } : {}),
  }));

/** The slot's own reading, as the first slide of a cycle made from it. */
function slideFromSlot(config: Record<string, unknown> | undefined, slot: number): SlotCycleEntry {
  const label = config?.[`slot${slot}_labelMode`] === 'custom' ? config?.[`slot${slot}_label`] : undefined;
  return {
    device: ((config?.[`slot${slot}_device`] as DeviceKey | undefined) ?? DEFAULT_SLOTS[slot]?.device ?? 'cpu'),
    sensor: ((config?.[`slot${slot}_sensor`] as string | undefined) ?? DEFAULT_SLOTS[slot]?.sensor ?? ''),
    label: typeof label === 'string' && label.trim() ? label : undefined,
    seconds: CYCLE_DEFAULT_SECONDS,
  };
}

/**
 * Monitoring settings with the slot's sensor cycle: the slide list, and a
 * target switch that points every setting below at the shared slot or at one
 * slide's own keys.
 */
export function MonitoringSettingsWithCycle(props: WidgetSettingsProps) {
  const { t } = useTranslation();
  const { widget, onUpdate, selectedSlot = 0 } = props;
  const layout = resolvedSlotLayout(widget.size, widget.config);
  const slot = Math.max(0, Math.min(selectedSlot, layout.count - 1));
  const micro = isMicroLayout(widget.size, layout.count, layout.hero);
  const entries = useMemo(() => readSlotCycle(widget.config, slot) ?? [], [widget.config, slot]);
  const [target, setTarget] = useState<number | null>(null);
  const editing = target !== null && target < entries.length ? target : null;
  const holdKey = `slot${slot}_cycleHold`;

  const storedHold = (widget.config?.[holdKey] as number | null | undefined) ?? null;
  const heldRef = useRef(storedHold);
  heldRef.current = storedHold;
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;

  // While a slide is open the screen holds it, so an edit shows on the glass.
  useEffect(() => {
    if (storedHold !== editing) updateRef.current({ [holdKey]: editing });
  }, [editing, holdKey, storedHold]);

  useEffect(() => () => {
    if (heldRef.current !== null) updateRef.current({ [holdKey]: null });
  }, [holdKey]);

  if (micro) return <MonitoringSettings {...props} />;

  const writeCycle = (next: SlotCycleEntry[]) => {
    if (next.length >= 2) {
      onUpdate({ [`slot${slot}_cycle`]: toConfigValue(next) });
      return;
    }
    const last = next[0];
    onUpdate({
      [`slot${slot}_cycle`]: null,
      ...(last ? {
        [`slot${slot}_device`]: last.device,
        [`slot${slot}_sensor`]: last.sensor,
        [`slot${slot}_label`]: last.label ?? null,
        [`slot${slot}_labelMode`]: last.label ? 'custom' : null,
      } : {}),
    });
    setTarget(null);
  };

  const addSlide = () => {
    const base = entries.length > 0 ? entries : [slideFromSlot(widget.config, slot)];
    const copy = { ...base[base.length - 1], config: undefined, label: undefined };
    writeCycle([...base, copy]);
    setTarget(base.length);
  };
  const removeSlide = (i: number) => writeCycle(entries.filter((_, k) => k !== i));
  const moveSlide = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    writeCycle(next);
    if (editing === i) setTarget(j);
  };
  const setSeconds = (i: number, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    writeCycle(entries.map((e, k) => (k === i ? { ...e, seconds: Math.min(CYCLE_MAX_SECONDS, Math.max(CYCLE_MIN_SECONDS, n)) } : e)));
  };

  // A slide's settings: the panel reads the slot as the slide sees it, and every
  // slot key it writes lands in that slide instead of the shared slot.
  const slide = editing !== null ? entries[editing] : null;
  const prefix = `slot${slot}_`;
  const slideProps: WidgetSettingsProps = slide && editing !== null ? {
    ...props,
    widget: { ...widget, config: cycleEntryConfig(widget.config, slot, slide) as Record<string, PanelConfigValue> },
    onUpdate: patch => {
      const shared: Record<string, PanelConfigValue> = {};
      let next: SlotCycleEntry = { ...slide, config: { ...slide.config } };
      for (const [key, value] of Object.entries(patch)) {
        if (!key.startsWith(prefix)) { shared[key] = value; continue; }
        const own = key.slice(prefix.length);
        if (own === 'device') next = { ...next, device: value as DeviceKey };
        else if (own === 'sensor') next = { ...next, sensor: String(value ?? '') };
        else if (own === 'label') next = { ...next, label: typeof value === 'string' && value.trim() ? value : undefined };
        else if (own === 'labelMode') { if (value !== 'custom') next = { ...next, label: undefined }; }
        else if (value === null) delete next.config![own];
        else next.config![own] = value;
      }
      if (Object.keys(shared).length > 0) onUpdate(shared);
      writeCycle(entries.map((e, k) => (k === editing ? next : e)));
    },
  } : props;

  const slideName = (e: SlotCycleEntry, i: number) => `${i + 1}. ${(e.label ?? e.sensor.split('/').pop() ?? '').replace(/\n/g, ' ')}`;

  return (
    <>
      <SettingsSection title={t('monitoring.settings.cycle.title')} description={t('monitoring.settings.cycle.description')}>
        {entries.length > 0 && (
          <>
            <ChipGroup
              ariaLabel={t('monitoring.settings.cycle.target')}
              wrap
              activeKey={editing === null ? COMMON : String(editing)}
              onChange={key => setTarget(key === COMMON ? null : Number(key))}
              options={[
                { key: COMMON, label: t('monitoring.settings.cycle.common') },
                ...entries.map((_, i) => ({ key: String(i), label: t('monitoring.settings.cycle.slide', { n: i + 1 }) })),
              ]}
            />
            <ul className={styles.list}>
              {entries.map((e, i) => (
                <li key={i} className={`${styles.row}${editing === i ? ` ${styles.rowActive}` : ''}`}>
                  <button type="button" className={styles.name} onClick={() => setTarget(i)}>{slideName(e, i)}</button>
                  <label className={styles.seconds}>
                    <input
                      type="number"
                      min={CYCLE_MIN_SECONDS}
                      max={CYCLE_MAX_SECONDS}
                      value={e.seconds}
                      aria-label={t('monitoring.settings.cycle.seconds')}
                      onChange={ev => setSeconds(i, ev.target.value)}
                    />
                    <span>{t('monitoring.settings.cycle.secondsUnit')}</span>
                  </label>
                  <Button size="sm" tone="ghost" icon={<ArrowUp size={14} />} aria-label={t('monitoring.settings.cycle.up')} disabled={i === 0} onClick={() => moveSlide(i, -1)} />
                  <Button size="sm" tone="ghost" icon={<ArrowDown size={14} />} aria-label={t('monitoring.settings.cycle.down')} disabled={i === entries.length - 1} onClick={() => moveSlide(i, 1)} />
                  <Button size="sm" tone="ghost" icon={<Trash2 size={14} />} aria-label={t('monitoring.settings.cycle.remove')} onClick={() => removeSlide(i)} />
                </li>
              ))}
            </ul>
          </>
        )}
        <SettingsButton variant="muted" icon={<Plus size={14} />} onClick={addSlide}>
          {t('monitoring.settings.cycle.add')}
        </SettingsButton>
      </SettingsSection>
      <GaugeLayoutEditor {...slideProps} selectedSlot={slot} />
      <MonitoringSettings {...slideProps} />
    </>
  );
}
