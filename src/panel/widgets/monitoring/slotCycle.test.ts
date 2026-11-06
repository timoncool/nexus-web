import { describe, expect, it } from 'vitest';
import { CYCLE_DEFAULT_SECONDS, CYCLE_MAX_SECONDS, CYCLE_MIN_SECONDS, readSlotCycle } from './slotCycle';

describe('readSlotCycle', () => {
  it('reads every usable entry with its caption and clamped seconds', () => {
    const cycle = readSlotCycle({
      slot0_cycle: [
        { device: 'cooler', sensor: 'coolant', label: 'ЖИДКОСТЬ', seconds: 8 },
        { device: 'quick', sensor: 'summary/cpu-temp', seconds: 0.5 },
        { device: 'quick', sensor: 'summary/gpu-temp', label: '  ', seconds: 99999 },
        { device: 'quick' },
      ],
    }, 0);
    expect(cycle).toEqual([
      { device: 'cooler', sensor: 'coolant', label: 'ЖИДКОСТЬ', seconds: 8 },
      { device: 'quick', sensor: 'summary/cpu-temp', label: undefined, seconds: CYCLE_MIN_SECONDS },
      { device: 'quick', sensor: 'summary/gpu-temp', label: undefined, seconds: CYCLE_MAX_SECONDS },
    ]);
  });

  it('gives an entry without seconds the default stay', () => {
    const cycle = readSlotCycle({ slot1_cycle: [{ device: 'cpu', sensor: 'a' }, { device: 'cpu', sensor: 'b' }] }, 1);
    expect(cycle?.map(e => e.seconds)).toEqual([CYCLE_DEFAULT_SECONDS, CYCLE_DEFAULT_SECONDS]);
  });

  it('is no cycle with fewer than two entries or a non-list', () => {
    expect(readSlotCycle({ slot0_cycle: [{ device: 'cpu', sensor: 'a' }] }, 0)).toBeNull();
    expect(readSlotCycle({ slot0_cycle: 'cpu' }, 0)).toBeNull();
    expect(readSlotCycle(undefined, 0)).toBeNull();
  });
});
