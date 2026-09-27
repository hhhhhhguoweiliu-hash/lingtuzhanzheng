import { describe, expect, it } from 'vitest';
import { beginBattle, buyUpgrade, claimTask, ENERGY_REFILL_MS, equipSkin, freshProfile,
  getInitialUnits, getProduction, getUpgradeCost, refreshEnergy, settleBattle, spin, validateProfile } from '../src/platform/progression';

describe('observed upgrade anchors and local profile', () => {
  it('keeps the actual observed unit and production values while starting a new player at level 1', () => {
    const p = freshProfile(1000);
    expect([getInitialUnits(p), getProduction(p)]).toEqual([10, 1.05]);
    expect([getInitialUnits(124), getInitialUnits(125)]).toEqual([133, 134]);
    expect([getProduction(166), getProduction(170), getProduction(173)]).toEqual([12.6, 12.88, 13.09]);
    expect([getUpgradeCost('units', 124), getUpgradeCost('production', 166), getUpgradeCost('production', 172)])
      .toEqual([11730, 15720, 16300]);
  });
  it('validates corrupt data without giving negative balances, impossible levels or prototype records', () => {
    const p = validateProfile({ coins: -5, gems: NaN, energy: Infinity, unitLevel: 0,
      productionLevel: 2.5, wins: 7, games: 1, ownedSkins: ['made-up'], skin: 'gold',
      paidBattles: ['__proto__', 'valid', 'valid'], settled: [null, 'done', 'done'],
      battleRecords: JSON.parse('{"__proto__":{"mode":"campaign","stage":1}}') }, 10);
    expect(p.coins).toBe(250);
    expect(p.energy).toBe(20);
    expect(p.unitLevel).toBe(1);
    expect(p.productionLevel).toBe(1);
    expect(p.games).toBe(7);
    expect(p.skin).toBe('blue');
    expect(p.paidBattles).toEqual(['valid']);
    expect(p.settled).toEqual(['done']);
    expect(Object.hasOwn(p.battleRecords, '__proto__')).toBe(false);
  });
  it('charges exactly the displayed price and refuses unaffordable upgrades atomically', () => {
    const p = freshProfile();
    p.unitLevel = 124; p.coins = 11729;
    const before = structuredClone(p);
    expect(buyUpgrade(p, 'units').ok).toBe(false);
    expect(p).toEqual(before);
    p.coins = 11730;
    expect(buyUpgrade(p, 'units')).toEqual({ ok: true, coins: -11730 });
    expect([p.coins, p.unitLevel]).toEqual([0, 125]);
  });
});

describe('energy and match transactions', () => {
  it('spends campaign energy once, preserves refill remainder, and cannot mint energy by rolling the clock backwards', () => {
    const p = freshProfile(0);
    expect(beginBattle(p, 'a', 0).ok).toBe(true);
    expect(p.energy).toBe(15);
    expect(beginBattle(p, 'a', 0).ok).toBe(false);
    refreshEnergy(p, ENERGY_REFILL_MS + 5000);
    expect(p.energy).toBe(16);
    expect(p.energyUpdatedAt).toBe(ENERGY_REFILL_MS);
    refreshEnergy(p, 0);
    expect(p.energy).toBe(16);
    refreshEnergy(p, ENERGY_REFILL_MS * 2);
    expect(p.energy).toBe(17);
  });
  it('refuses to start without energy and does not create a match record', () => {
    const p = freshProfile(0); p.energy = 4;
    expect(beginBattle(p, 'insufficient', 0).ok).toBe(false);
    expect(p.paidBattles).not.toContain('insufficient');
    expect(beginBattle(p, 'pvp', 0, 'pvp').ok).toBe(true);
    expect(p.energy).toBe(4);
  });
  it('settles one win once even after a save reload, and rejects changed match identity', () => {
    const p = freshProfile(0);
    beginBattle(p, 'a', 0);
    expect(settleBattle(p, 'a', true, { mode: 'pvp' }).ok).toBe(false);
    expect(settleBattle(p, 'a', true)).toMatchObject({ ok: true, coins: 135, stars: 0 });
    expect([p.games, p.wins, p.stage, p.coins]).toEqual([1, 1, 2, 385]);
    const loaded = validateProfile(JSON.parse(JSON.stringify(p)), 0);
    const before = structuredClone(loaded);
    expect(settleBattle(loaded, 'a', true).ok).toBe(false);
    expect(loaded).toEqual(before);
    expect(settleBattle(loaded, 'unstarted', true).ok).toBe(false);
  });
  it('does not advance two stages for concurrently started matches from the same stage', () => {
    const p = freshProfile(0); beginBattle(p, 'a', 0); beginBattle(p, 'b', 0);
    settleBattle(p, 'a', true); settleBattle(p, 'b', true);
    expect(p.stage).toBe(2);
    expect(p.wins).toBe(2);
  });
  it('reference replay remains free of progression rewards and PVP awards the observed five stars', () => {
    const p = freshProfile(0);
    beginBattle(p, 'reference', 0, 'reference');
    settleBattle(p, 'reference', true);
    expect([p.energy, p.coins, p.games, p.wins, p.stage]).toEqual([20, 250, 0, 0, 1]);
    beginBattle(p, 'pvp', 0, 'pvp');
    settleBattle(p, 'pvp', true);
    expect([p.stars, p.stage]).toEqual([5, 1]);
  });
});

describe('local optional progression', () => {
  it('only completed tasks can be claimed and every task pays once', () => {
    const p = freshProfile(0);
    expect(claimTask(p, 'win1').ok).toBe(false);
    beginBattle(p, 'a', 0); settleBattle(p, 'a', true);
    expect(claimTask(p, 'win1')).toEqual({ ok: true, coins: 150 });
    const coins = p.coins;
    expect(claimTask(p, 'win1').ok).toBe(false);
    expect(p.coins).toBe(coins);
  });
  it('a daily spin grants once, rejects invalid RNG and only equips unlocked skins', () => {
    const now = new Date(2026, 8, 27, 12).getTime();
    const p = freshProfile(now);
    expect(spin(p, now, () => NaN).ok).toBe(false);
    expect(p.lastSpinDay).toBe('');
    expect(equipSkin(p, 'jade').ok).toBe(false);
    expect(spin(p, now, () => 0.99)).toEqual({ ok: true, skin: 'jade' });
    expect(spin(p, now, () => 0).ok).toBe(false);
    expect(equipSkin(p, 'jade').ok).toBe(true);
    expect(spin(p, now + 86400000, () => 0.99)).toEqual({ ok: true, coins: 250 });
  });
});
