import { useEffect, useState } from 'react';
import { fetchLightingDevices, type LightingDevice } from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import { SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { usePanelGaugeGradient } from '../common/PanelGaugeGradientContext';

const OFF = '';

function cardLabel(card: LightingDevice, sameName: number): string {
  if (sameName < 2) return card.name;
  const tail = card.id.split(':').slice(1).join(':');
  return tail ? `${card.name} (${tail})` : card.name;
}

/** Picks the lighting card whose live colour becomes this panel's accent. Hidden where the host has no panel record. */
export function LightingAccentSelect() {
  const { t } = useTranslation();
  const { lightingDevice, commitLightingDevice } = usePanelGaugeGradient();
  const [cards, setCards] = useState<LightingDevice[] | null>(null);

  useEffect(() => {
    if (!commitLightingDevice) return undefined;
    let cancelled = false;
    void fetchLightingDevices().then(res => {
      if (!cancelled) setCards((res?.allDevices ?? []).filter(d => d.frameIndex !== undefined && d.ledCount > 0));
    });
    return () => { cancelled = true; };
  }, [commitLightingDevice]);

  if (!commitLightingDevice) return null;
  const names = new Map<string, number>();
  for (const c of cards ?? []) names.set(c.name, (names.get(c.name) ?? 0) + 1);
  const options = [
    { value: OFF, label: t('monitoring.settings.lightingAccentOff') },
    ...(cards ?? []).map(c => ({ value: c.id, label: cardLabel(c, names.get(c.name) ?? 0) })),
  ];
  if (lightingDevice && !options.some(o => o.value === lightingDevice)) {
    options.push({ value: lightingDevice, label: lightingDevice });
  }
  return (
    <SettingsSelect
      label={t('monitoring.settings.lightingAccent')}
      description={t('monitoring.settings.lightingAccentHint')}
      descriptionBelow
      value={lightingDevice ?? OFF}
      options={options}
      onChange={v => commitLightingDevice(v === OFF ? null : v)}
    />
  );
}
