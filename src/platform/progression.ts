/** Local progression. Observed anchors and provisional rules are separated in references/ECONOMY.md. */
export type UpgradeKind = 'units' | 'production';
export type BattleMode = 'campaign' | 'pvp' | 'reference';
export type SkinId = 'blue' | 'jade' | 'gold';
export type TaskId = 'play1' | 'win1' | 'win5';
export interface BattleRecord { mode: BattleMode; stage: number }
export interface Profile {
  coins: number; gems: number; energy: number; energyUpdatedAt: number;
  unitLevel: number; productionLevel: number; stage: number; stars: number;
  wins: number; games: number; captures: number;
  settled: string[]; paidBattles: string[]; battleRecords: Record<string, BattleRecord>;
  taskClaims: string[]; lastSpinDay: string; skin: SkinId; ownedSkins: SkinId[];
}
export interface ActionResult {
  ok: boolean; reason?: string; coins?: number; stars?: number; energy?: number; skin?: SkinId;
}
export const ENERGY_CAP = 20;
export const ENERGY_REFILL_MS = 5 * 60 * 1000;
export const CAMPAIGN_ENERGY_COST = 5;
export const MAX_LEVEL = 10000;
const MAX_BALANCE = 1_000_000_000;
const skins: SkinId[] = ['blue', 'jade', 'gold'];
const safeTime = (now: number) => Number.isFinite(now) && now >= 0 ? Math.floor(now) : 0;
const levelValue = (n: number) => Number.isSafeInteger(n) && n >= 1 ? Math.min(n, MAX_LEVEL) : 1;
const idValid = (id: string) => typeof id === 'string' && id.length > 0 && id.length <= 200 &&
  id !== '__proto__' && id !== 'constructor' && id !== 'prototype';

export function freshProfile(now = Date.now()): Profile {
  return { coins: 250, gems: 0, energy: ENERGY_CAP, energyUpdatedAt: safeTime(now),
    unitLevel: 1, productionLevel: 1, stage: 1, stars: 0, wins: 0, games: 0, captures: 0,
    settled: [], paidBattles: [], battleRecords: {}, taskClaims: [], lastSpinDay: '',
    skin: 'blue', ownedSkins: ['blue'] };
}
export function validateProfile(raw: unknown, now = Date.now()): Profile {
  const p = freshProfile(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  const r = raw as Record<string, unknown>;
  const integer = (value: unknown, fallback: number, max = MAX_BALANCE) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
  for (const key of ['coins', 'gems', 'stars', 'wins', 'games', 'captures'] as const)
    p[key] = integer(r[key], p[key]);
  p.games = Math.max(p.games, p.wins);
  p.energy = integer(r.energy, p.energy, ENERGY_CAP);
  p.energyUpdatedAt = Math.min(integer(r.energyUpdatedAt, p.energyUpdatedAt, Number.MAX_SAFE_INTEGER), safeTime(now));
  p.unitLevel = levelValue(typeof r.unitLevel === 'number' ? r.unitLevel : 1);
  p.productionLevel = levelValue(typeof r.productionLevel === 'number' ? r.productionLevel : 1);
  p.stage = Math.max(1, integer(r.stage, 1, MAX_LEVEL));
  const ids = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((x): x is string => typeof x === 'string' && idValid(x)))] : [];
  p.settled = ids(r.settled);
  p.paidBattles = ids(r.paidBattles);
  p.taskClaims = ids(r.taskClaims).filter(x => ['play1', 'win1', 'win5'].includes(x));
  p.lastSpinDay = typeof r.lastSpinDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastSpinDay) ? r.lastSpinDay : '';
  p.ownedSkins = [...new Set(['blue' as SkinId, ...ids(r.ownedSkins).filter((x): x is SkinId => skins.includes(x as SkinId))])];
  p.skin = p.ownedSkins.includes(r.skin as SkinId) ? r.skin as SkinId : 'blue';
  if (r.battleRecords && typeof r.battleRecords === 'object' && !Array.isArray(r.battleRecords)) {
    for (const [id, value] of Object.entries(r.battleRecords)) {
      if (!idValid(id) || !p.paidBattles.includes(id) || !value || typeof value !== 'object') continue;
      const b = value as Record<string, unknown>;
      if (b.mode === 'campaign' || b.mode === 'pvp' || b.mode === 'reference')
        p.battleRecords[id] = { mode: b.mode, stage: Math.max(1, integer(b.stage, 1, MAX_LEVEL)) };
    }
  }
  refreshEnergy(p, now);
  return p;
}
export function getInitialUnits(profileOrLevel: Profile | number): number {
  const level = levelValue(typeof profileOrLevel === 'number' ? profileOrLevel : profileOrLevel.unitLevel);
  return level + 9;
}
export function getProduction(profileOrLevel: Profile | number): number {
  const level = levelValue(typeof profileOrLevel === 'number' ? profileOrLevel : profileOrLevel.productionLevel);
  return (98 + 7 * level) / 100;
}
const observedProductionPrices: Record<number, number> = {
  166: 15720, 167: 15820, 169: 16010, 170: 16110, 171: 16200, 172: 16300,
};
export function getUpgradeCost(kind: UpgradeKind, level: number): number {
  const l = levelValue(level);
  if (kind === 'production' && observedProductionPrices[l] !== undefined) return observedProductionPrices[l];
  const anchorLevel = kind === 'units' ? 124 : 166;
  const anchorPrice = kind === 'units' ? 11730 : 15720;
  const value = l <= anchorLevel
    ? 100 + (anchorPrice - 100) * (l - 1) / (anchorLevel - 1)
    : anchorPrice + (l - anchorLevel) * 97;
  return Math.max(100, Math.round(value / 10) * 10);
}
export function buyUpgrade(p: Profile, kind: UpgradeKind): ActionResult {
  if (kind !== 'units' && kind !== 'production') return { ok: false, reason: '未知升级项目' };
  const key = kind === 'units' ? 'unitLevel' : 'productionLevel';
  if (p[key] >= MAX_LEVEL) return { ok: false, reason: '已达当前版本等级上限' };
  const cost = getUpgradeCost(kind, p[key]);
  if (p.coins < cost) return { ok: false, reason: '金币不足' };
  p.coins -= cost; p[key] += 1;
  return { ok: true, coins: -cost };
}
export function refreshEnergy(p: Profile, now = Date.now()): number {
  const timestamp = safeTime(now);
  if (timestamp < p.energyUpdatedAt) return p.energy;
  if (p.energy >= ENERGY_CAP) { p.energy = ENERGY_CAP; p.energyUpdatedAt = timestamp; return p.energy; }
  const gained = Math.floor((timestamp - p.energyUpdatedAt) / ENERGY_REFILL_MS);
  if (gained > 0) {
    p.energy = Math.min(ENERGY_CAP, p.energy + gained);
    p.energyUpdatedAt = p.energy === ENERGY_CAP ? timestamp : p.energyUpdatedAt + gained * ENERGY_REFILL_MS;
  }
  return p.energy;
}
export function beginBattle(p: Profile, id: string, now = Date.now(), mode: BattleMode = 'campaign'): ActionResult {
  if (!idValid(id) || !['campaign', 'pvp', 'reference'].includes(mode)) return { ok: false, reason: '无效对局' };
  if (p.paidBattles.includes(id) || p.settled.includes(id)) return { ok: false, reason: '对局已经开始或结算' };
  refreshEnergy(p, now);
  const cost = mode === 'campaign' ? CAMPAIGN_ENERGY_COST : 0;
  if (p.energy < cost) return { ok: false, reason: '体力不足，休息后恢复' };
  p.energy -= cost;
  p.paidBattles.push(id);
  p.battleRecords[id] = { mode, stage: p.stage };
  return { ok: true, energy: -cost };
}
export function settleBattle(p: Profile, id: string, won: boolean,
  options: { mode?: BattleMode; stage?: number; captured?: number } = {}): ActionResult {
  if (!idValid(id) || !p.paidBattles.includes(id) || !Object.hasOwn(p.battleRecords, id))
    return { ok: false, reason: '对局尚未开始' };
  if (p.settled.includes(id)) return { ok: false, reason: '本局奖励已领取' };
  const battle = p.battleRecords[id];
  if ((options.mode !== undefined && options.mode !== battle.mode) ||
      (options.stage !== undefined && options.stage !== battle.stage))
    return { ok: false, reason: '对局记录不匹配' };
  p.settled.push(id);
  if (battle.mode === 'reference') return { ok: true, coins: 0, stars: 0 };
  p.games += 1;
  const captured = typeof options.captured === 'number' && Number.isSafeInteger(options.captured) && options.captured >= 0
    ? Math.min(options.captured, 1000) : 0;
  p.captures = Math.min(MAX_BALANCE, p.captures + captured);
  const coins = won ? 100 + 35 * battle.stage : 25;
  const stars = battle.mode === 'pvp' && won ? 5 : 0;
  p.coins = Math.min(MAX_BALANCE, p.coins + coins);
  p.stars = Math.min(MAX_BALANCE, p.stars + stars);
  if (won) {
    p.wins += 1;
    if (battle.mode === 'campaign' && battle.stage === p.stage) p.stage = Math.min(MAX_LEVEL, p.stage + 1);
    if (p.wins >= 3 && !p.ownedSkins.includes('jade')) p.ownedSkins.push('jade');
    if (p.wins >= 10 && !p.ownedSkins.includes('gold')) p.ownedSkins.push('gold');
  }
  return { ok: true, coins, stars };
}
export const TASKS: ReadonlyArray<{ id: TaskId; label: string; target: number; reward: number }> = [
  { id: 'play1', label: '完成一场战斗', target: 1, reward: 100 },
  { id: 'win1', label: '获得一次胜利', target: 1, reward: 150 },
  { id: 'win5', label: '累计获胜五场', target: 5, reward: 400 },
];
export function claimTask(p: Profile, id: TaskId): ActionResult {
  const task = TASKS.find(t => t.id === id);
  if (!task) return { ok: false, reason: '未知任务' };
  if (p.taskClaims.includes(id)) return { ok: false, reason: '任务奖励已领取' };
  if ((id === 'play1' ? p.games : p.wins) < task.target) return { ok: false, reason: '任务尚未完成' };
  p.taskClaims.push(id); p.coins = Math.min(MAX_BALANCE, p.coins + task.reward);
  return { ok: true, coins: task.reward };
}
export function spinDay(now = Date.now()): string {
  const d = new Date(safeTime(now));
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function spin(p: Profile, now = Date.now(), random: () => number = Math.random): ActionResult {
  const day = spinDay(now);
  if (p.lastSpinDay === day) return { ok: false, reason: '今日已抽取' };
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) return { ok: false, reason: '抽取未完成，请重试' };
  p.lastSpinDay = day;
  if (value >= 0.95 && !p.ownedSkins.includes('jade')) {
    p.ownedSkins.push('jade'); return { ok: true, skin: 'jade' };
  }
  const coins = value < 0.6 ? 100 : value < 0.9 ? 200 : value < 0.95 ? 500 : 250;
  p.coins = Math.min(MAX_BALANCE, p.coins + coins);
  return { ok: true, coins };
}
export function equipSkin(p: Profile, id: SkinId): ActionResult {
  if (!skins.includes(id) || !p.ownedSkins.includes(id)) return { ok: false, reason: '皮肤尚未解锁' };
  p.skin = id; return { ok: true, skin: id };
}
