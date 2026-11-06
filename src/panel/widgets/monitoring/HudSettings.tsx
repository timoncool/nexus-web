import { useTranslation } from '../../../lib/i18n';
import type { PanelConfigValue } from '../../types';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { SettingSlider } from '../../../components/common/SettingRow/SettingRow';
import { SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { HUD_PIECES, HUD_SCHEMES, readHudSettings, type HudRole, type HudScheme } from './hudColors';
import { HUD_BLENDS, HUD_EFFECT_KEYS, HUD_EFFECT_LIMITS, fxKey, readHudBlend, readHudEffects, type HudEffects } from './hudEffects';

interface Props {
  config: Record<string, unknown> | undefined;
  slot: number;
  onUpdate: (patch: Record<string, PanelConfigValue>) => void;
}

const pieceKey = (p: string) => `hud${p[0].toUpperCase()}${p.slice(1)}`;

/** Effect sliders: px for blur/outline, percent for the rest. */
const PX_EFFECTS: ReadonlySet<keyof HudEffects> = new Set<keyof HudEffects>(['lightBlur', 'stroke']);

/** The Ambient HUD's colour scheme over the live LED colour, and its static glass effects. */
export function HudSettings({ config, slot, onUpdate }: Props) {
  const { t } = useTranslation();
  const hud = readHudSettings(config, slot);
  const fx = readHudEffects(config, slot);
  const key = (s: string) => `slot${slot}_${s}`;
  const roleOptions: { value: HudRole; label: string }[] = [
    { value: 'white', label: t('monitoring.settings.hud.role.white') },
    { value: 'base', label: t('monitoring.settings.hud.role.base') },
    { value: 'h1', label: t('monitoring.settings.hud.role.h1') },
    { value: 'h2', label: t('monitoring.settings.hud.role.h2') },
    { value: 'h3', label: t('monitoring.settings.hud.role.h3') },
  ];

  return (
    <>
      <SettingsSection title={t('monitoring.settings.hud.title')} description={t('monitoring.settings.hud.description')}>
        <ChipGroup
          fullWidth
          ariaLabel={t('monitoring.settings.hud.mode')}
          activeKey={hud.mode}
          onChange={v => onUpdate({ [key('hudMode')]: v === 'white' ? null : v })}
          options={[
            { key: 'white', label: t('monitoring.settings.hud.mode.white') },
            { key: 'average', label: t('monitoring.settings.hud.mode.average') },
            { key: 'flow', label: t('monitoring.settings.hud.mode.flow') },
          ]}
        />
        {hud.mode !== 'white' && (
          <>
            <ChipGroup
              wrap
              ariaLabel={t('monitoring.settings.hud.scheme')}
              activeKey={hud.scheme}
              onChange={v => onUpdate({ [key('hudScheme')]: v })}
              options={(Object.keys(HUD_SCHEMES) as HudScheme[]).map(s => ({ key: s, label: t(`monitoring.settings.hud.scheme.${s}`) }))}
            />
            {HUD_PIECES.map(p => (
              <SettingsSelect
                key={p}
                label={t(`monitoring.settings.hud.piece.${p}`)}
                value={hud.roles[p]}
                options={roleOptions}
                onChange={v => onUpdate({ [key(pieceKey(p))]: v })}
              />
            ))}
            <SettingSlider
              editable
              trackFill
              label={t('monitoring.settings.hud.contrast')}
              value={Math.round(hud.contrast)}
              min={0}
              max={100}
              step={5}
              formatValue={v => `Lc ${v}`}
              onChange={(v, commit) => { if (commit) onUpdate({ [key('hudContrast')]: v }); }}
              onCommit={v => onUpdate({ [key('hudContrast')]: v })}
            />
            <SettingSlider
              editable
              trackFill
              label={t('monitoring.settings.hud.chroma')}
              value={Math.round(hud.chroma * 100)}
              min={0}
              max={100}
              step={5}
              formatValue={v => `${v}%`}
              onChange={(v, commit) => { if (commit) onUpdate({ [key('hudChroma')]: v === 100 ? null : v / 100 }); }}
              onCommit={v => onUpdate({ [key('hudChroma')]: v === 100 ? null : v / 100 })}
            />
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t('monitoring.settings.fx.title')}>
        <SettingsSelect
          label={t('monitoring.settings.fx.blend')}
          value={readHudBlend(config, slot)}
          options={HUD_BLENDS.map(b => ({ value: b, label: t(`monitoring.settings.fx.blend.${b}`) }))}
          onChange={v => onUpdate({ [key('fxBlend')]: v === 'normal' ? null : v })}
        />
        {HUD_EFFECT_KEYS.map(name => {
          const [lo, hi, def] = HUD_EFFECT_LIMITS[name];
          const px = PX_EFFECTS.has(name);
          const toUi = (v: number) => (px ? v : Math.round(v * 100));
          const fromUi = (v: number) => (px ? v : v / 100);
          const write = (v: number) => onUpdate({ [fxKey(slot, name)]: fromUi(v) === def ? null : fromUi(v) });
          return (
            <SettingSlider
              key={name}
              editable
              trackFill
              label={t(`monitoring.settings.fx.${name}`)}
              value={toUi(fx[name])}
              min={toUi(lo)}
              max={toUi(hi)}
              step={px ? (name === 'stroke' ? 0.5 : 1) : 5}
              formatValue={v => (px ? `${v}px` : `${v}%`)}
              onChange={(v, commit) => { if (commit) write(v); }}
              onCommit={write}
            />
          );
        })}
      </SettingsSection>
    </>
  );
}
