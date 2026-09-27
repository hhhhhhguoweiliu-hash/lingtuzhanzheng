import type { CommandResult, DispatchQueue, GameMap, GameState, LedgerEvent, NodeState, OwnerId, Point, Replay, ReplayCommand, SimConfig, UnitPacket } from './types';

/** Candidate settings from the handoff. They are deliberately replaceable. */
export const DEFAULT_CONFIG: SimConfig = {
  tickRate: 30,
  playerOwner: 'blue',
  aiEnabled: true,
  playerAI: false,
  productionPerSecond: 5,
  productionByOwner: {},
  neutralProductionPerSecond: 0,
  neutralProductionCap: 125,
  productionCap: 250,
  emitUnitsPerSecond: 12,
  packetUnits: 1,
  movementSpeed: 110,
  routeMode: 'neighbors',
  aiThinkSeconds: 1.8,
  aiReserveMargin: 8,
  requireAllTerritories: false,
  maxLedgerEvents: 2000,
};

const SCALE = 1_000_000;
const OWNERS: OwnerId[] = ['neutral', 'blue', 'brown', 'magenta', 'green', 'red'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const pathLength = (path: Point[]): number => path.slice(1).reduce((n, point, i) => n + distance(path[i], point), 0);

/** Hashes normalized JSON, including candidate rules and map geometry. */
export function stableHash(value: unknown): string {
  function canonical(item: unknown): string {
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    if (item && typeof item === 'object') return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical((item as Record<string, unknown>)[key])}`).join(',')}}`;
    return JSON.stringify(item) ?? 'null';
  }
  let hash = 2166136261;
  for (const char of canonical(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function pointOnPath(path: Point[], progress: number): Point {
  if (path.length < 2) return { ...(path[0] ?? { x: 0, y: 0 }) };
  let remaining = pathLength(path) * Math.max(0, Math.min(1, progress));
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    const segment = distance(a, b);
    if (remaining <= segment && segment > 0) {
      const t = remaining / segment;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= segment;
  }
  return { ...path[path.length - 1] };
}

/** No clocks, DOM, timers, platform adapters or rendering objects enter this core. */
export class GameEngine {
  readonly map: GameMap;
  readonly config: SimConfig;
  readonly seed: number;
  readonly state: GameState;
  private readonly initialConfig: SimConfig;
  private readonly nodeIndex = new Map<string, NodeState>();
  private readonly participants: OwnerId[];
  private readonly rewardedIds = new Set<string>();
  private readonly commands: ReplayCommand[] = [];
  private randomState: number;
  private nextId = 1;
  private aiNextTick: number;
  private replaying = false;

  constructor(map: GameMap, config: Partial<SimConfig> = {}, seed = 1) {
    this.map = clone(map);
    this.config = clone({ ...DEFAULT_CONFIG, ...config });
    this.initialConfig = clone(this.config);
    this.seed = seed >>> 0;
    this.randomState = this.seed;
    this.validate();
    this.state = {
      tick: 0,
      nodes: this.map.nodes.map(node => ({ ...clone(node), reserved: 0, productionRemainder: 0, emitRemainder: 0 })),
      packets: [], queues: [], winner: null, eliminated: [], ledger: [],
      stats: { initialUnits: this.map.nodes.reduce((sum, node) => sum + node.garrison, 0), produced: 0, rewarded: 0, casualties: 0, captures: 0, commands: 0 },
    };
    for (const node of this.state.nodes) this.nodeIndex.set(node.id, node);
    this.participants = [...new Set(this.map.nodes.map(node => node.owner).filter(owner => owner !== 'neutral'))].sort();
    this.aiNextTick = Math.max(1, Math.round(this.config.aiThinkSeconds * this.config.tickRate));
  }

  private validate(): void {
    const c = this.config;
    const finite = (value: number) => Number.isFinite(value) && value >= 0;
    if (!Number.isInteger(c.tickRate) || c.tickRate < 1 || c.tickRate > 1000) throw new Error('tickRate must be an integer from 1 to 1000');
    if (!finite(c.productionPerSecond) || !finite(c.neutralProductionPerSecond) || !finite(c.emitUnitsPerSecond) || !finite(c.movementSpeed) || c.movementSpeed === 0) throw new Error('Invalid simulation rates');
    for (const [owner, rate] of Object.entries(c.productionByOwner)) if (!OWNERS.includes(owner as OwnerId) || !finite(rate)) throw new Error('Invalid owner production override');
    if (!Number.isInteger(c.packetUnits) || c.packetUnits < 1 || !Number.isInteger(c.aiReserveMargin) || c.aiReserveMargin < 0 || !finite(c.aiThinkSeconds) || c.aiThinkSeconds === 0) throw new Error('Invalid packet or AI settings');
    for (const cap of [c.productionCap, c.neutralProductionCap]) if (cap !== null && (!Number.isInteger(cap) || cap < 0)) throw new Error('Invalid production cap');
    if (!Number.isInteger(c.maxLedgerEvents) || c.maxLedgerEvents < 1 || !OWNERS.includes(c.playerOwner) || c.playerOwner === 'neutral') throw new Error('Invalid owner or ledger limit');
    if (!['neighbors', 'any-visible', 'graph-path'].includes(c.routeMode)) throw new Error('Invalid route mode');
    if (!finite(this.map.width) || !finite(this.map.height) || !this.map.width || !this.map.height || !this.map.nodes.length) throw new Error('Invalid map dimensions');
    const ids = new Set<string>();
    for (const node of this.map.nodes) {
      if (!node.id || ids.has(node.id)) throw new Error(`Duplicate or empty node id: ${node.id}`);
      ids.add(node.id);
      if (!OWNERS.includes(node.owner) || !Number.isInteger(node.garrison) || node.garrison < 0) throw new Error(`Invalid army or owner: ${node.id}`);
      if (!Number.isFinite(node.anchor.x) || !Number.isFinite(node.anchor.y)) throw new Error(`Invalid anchor: ${node.id}`);
      if (node.productionPerSecond !== undefined && !finite(node.productionPerSecond)) throw new Error(`Invalid production rate: ${node.id}`);
      if (node.productionCap !== undefined && node.productionCap !== null && (!Number.isInteger(node.productionCap) || node.productionCap < 0)) throw new Error(`Invalid cap: ${node.id}`);
    }
    for (const node of this.map.nodes) if (node.neighbors.some(id => !ids.has(id) || id === node.id)) throw new Error(`Invalid neighbor: ${node.id}`);
    for (const route of this.map.routes ?? []) {
      if (!ids.has(route.from) || !ids.has(route.to) || route.points.length < 2 || route.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Invalid explicit route');
    }
  }

  getNode(id: string): NodeState | undefined { return this.nodeIndex.get(id); }
  available(node: NodeState | string): number {
    const state = typeof node === 'string' ? this.getNode(node) : node;
    return state ? Math.max(0, state.garrison - state.reserved) : 0;
  }
  get seconds(): number { return this.state.tick / this.config.tickRate; }

  /** Only private PRNG state is used; replay is independent of Math.random(). */
  private random(): number {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let t = this.randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private event(event: Omit<LedgerEvent, 'tick'>): void {
    this.state.ledger.push({ tick: this.state.tick, ...event });
    if (this.state.ledger.length > this.config.maxLedgerEvents) this.state.ledger.splice(0, this.state.ledger.length - this.config.maxLedgerEvents);
  }

  /** Graph routes may pass through friendly intermediate nodes only. */
  route(sourceId: string, targetId: string): Point[] | null {
    const source = this.getNode(sourceId), target = this.getNode(targetId);
    if (!source || !target || source === target) return null;
    if (this.config.routeMode === 'neighbors' && !source.neighbors.includes(targetId)) return null;
    if (this.config.routeMode !== 'graph-path' || source.neighbors.includes(targetId)) return this.edgePath(sourceId, targetId);
    const pending = [sourceId];
    const previous = new Map<string, string | null>([[sourceId, null]]);
    while (pending.length) {
      const id = pending.shift()!;
      for (const next of this.getNode(id)!.neighbors) {
        if (previous.has(next)) continue;
        const node = this.getNode(next)!;
        if (next !== targetId && node.owner !== source.owner) continue;
        previous.set(next, id);
        if (next === targetId) {
          const ids = [next];
          let parent = id;
          while (parent !== sourceId) { ids.unshift(parent); parent = previous.get(parent)!; }
          ids.unshift(sourceId);
          const path: Point[] = [];
          for (let i = 1; i < ids.length; i++) path.push(...this.edgePath(ids[i - 1], ids[i]).slice(i === 1 ? 0 : 1));
          return path;
        }
        pending.push(next);
      }
    }
    return null;
  }

  private edgePath(sourceId: string, targetId: string): Point[] {
    const explicit = this.map.routes?.find(route => route.from === sourceId && route.to === targetId);
    if (explicit) return clone(explicit.points);
    const reverse = this.map.routes?.find(route => route.from === targetId && route.to === sourceId);
    if (reverse) return clone(reverse.points).reverse();
    return [{ ...this.getNode(sourceId)!.anchor }, { ...this.getNode(targetId)!.anchor }];
  }

  dispatch(owner: OwnerId, sourceId: string, targetId: string, fraction = 1): CommandResult {
    return this.issueDispatch(owner, sourceId, targetId, fraction, false);
  }

  private issueDispatch(owner: OwnerId, sourceId: string, targetId: string, fraction: number, ai: boolean): CommandResult {
    const reject = (reason: string): CommandResult => ({ accepted: false, reason, units: 0 });
    if (this.state.winner !== null) return reject('battle_finished');
    if (owner === 'neutral' || !OWNERS.includes(owner)) return reject('invalid_owner');
    const source = this.getNode(sourceId), target = this.getNode(targetId);
    if (!source || !target || source === target) return reject('invalid_target');
    if (source.owner !== owner) return reject('source_not_owned');
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return reject('invalid_fraction');
    const path = this.route(sourceId, targetId);
    if (!path) return reject('route_unavailable');
    const budget = Math.floor(this.available(source) * fraction + 1e-9);
    if (budget < 1) return reject('no_available_units');
    const id = this.nextId++;
    source.reserved += budget;
    this.state.queues.push({ id, commandId: id, owner, sourceId, targetId, remainingBudget: budget, path });
    this.state.stats.commands++;
    this.event({ kind: 'reserve', owner, nodeId: sourceId, targetId, units: budget, reason: ai ? 'ai_fixed_budget' : 'player_fixed_budget' });
    if (!ai && !this.replaying) this.commands.push({ kind: 'dispatch', tick: this.state.tick, owner, sourceId, targetId, fraction });
    return { accepted: true, reason: 'queued', units: budget, commandId: id };
  }

  /** Reserved troops never left the garrison, so cancellation cannot refund them. */
  cancel(sourceId: string): number {
    const released = this.cancelQueues(sourceId, 'user_cancelled');
    if (released > 0 && !this.replaying) this.commands.push({ kind: 'cancel', tick: this.state.tick, sourceId });
    return released;
  }

  private cancelQueues(sourceId: string, reason: string): number {
    let released = 0;
    this.state.queues = this.state.queues.filter(queue => {
      if (queue.sourceId !== sourceId) return true;
      released += queue.remainingBudget;
      this.event({ kind: 'cancel', owner: queue.owner, nodeId: sourceId, targetId: queue.targetId, units: queue.remainingBudget, reason });
      return false;
    });
    const node = this.getNode(sourceId);
    if (node) { node.reserved = 0; node.emitRemainder = 0; }
    return released;
  }

  /** Reward adapter; callers must label demonstration grants in the interface. */
  grantReward(id: string, owner: OwnerId, targetId: string, units: number): boolean {
    const target = this.getNode(targetId);
    if (this.state.winner !== null || !id || this.rewardedIds.has(id) || !target || target.owner !== owner || owner === 'neutral' || !Number.isSafeInteger(units) || units < 1 || !Number.isSafeInteger(target.garrison + units)) return false;
    this.rewardedIds.add(id);
    target.garrison += units;
    this.state.stats.rewarded += units;
    this.event({ kind: 'reward', owner, nodeId: targetId, units, reason: `grant:${id}` });
    if (!this.replaying) this.commands.push({ kind: 'reward', tick: this.state.tick, id, owner, targetId, units });
    return true;
  }

  setPlayerAI(enabled: boolean): void {
    if (this.config.playerAI === enabled) return;
    this.config.playerAI = enabled;
    if (!this.replaying) this.commands.push({ kind: 'player-ai', tick: this.state.tick, enabled });
  }

  step(ticks = 1): void {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error('step expects a non-negative integer tick count');
    for (let i = 0; i < ticks && this.state.winner === null; i++) {
      this.state.tick++;
      if (this.config.aiEnabled && this.state.tick >= this.aiNextTick) {
        this.thinkAI();
        this.aiNextTick = this.state.tick + Math.max(1, Math.round(this.config.aiThinkSeconds * this.config.tickRate));
      }
      this.produce();
      this.emit();
      this.moveAndResolve();
      this.updateOutcome();
    }
  }

  private productionRate(node: NodeState): number {
    // Neutral nodes do not inherit a colored faction's production override.
    return node.owner === 'neutral' ? this.config.neutralProductionPerSecond : node.productionPerSecond ?? this.config.productionByOwner[node.owner] ?? this.config.productionPerSecond;
  }

  private productionCap(node: NodeState): number | null {
    return node.owner === 'neutral' ? this.config.neutralProductionCap : node.productionCap === undefined ? this.config.productionCap : node.productionCap;
  }

  private produce(): void {
    const denominator = this.config.tickRate * SCALE;
    for (const node of this.state.nodes) {
      const cap = this.productionCap(node);
      if (cap !== null && node.garrison >= cap) { node.productionRemainder = 0; continue; }
      node.productionRemainder += Math.round(this.productionRate(node) * SCALE);
      const due = Math.floor(node.productionRemainder / denominator);
      node.productionRemainder %= denominator;
      const generated = cap === null ? due : Math.min(due, cap - node.garrison);
      if (generated > 0) {
        node.garrison += generated;
        this.state.stats.produced += generated;
        this.event({ kind: 'production', owner: node.owner, nodeId: node.id, units: generated, reason: 'natural_production' });
      }
      if (cap !== null && node.garrison >= cap) node.productionRemainder = 0;
    }
  }

  private emit(): void {
    const denominator = this.config.tickRate * SCALE;
    for (const source of this.state.nodes) {
      const queues = this.state.queues.filter(queue => queue.sourceId === source.id && queue.remainingBudget > 0);
      if (!queues.length) { source.emitRemainder = 0; continue; }
      // A source has one emission budget, even if several commands were queued.
      source.emitRemainder += Math.round(this.config.emitUnitsPerSecond * SCALE);
      let credit = Math.floor(source.emitRemainder / denominator);
      for (const queue of queues) {
        if (source.owner !== queue.owner) { this.cancelQueues(source.id, 'source_changed_owner'); break; }
        while (queue.remainingBudget > 0 && source.garrison > 0) {
          // Keep fractional and whole credits until a full visual/logic batch
          // is ready; only the final packet may be smaller than packetUnits.
          const units = Math.min(this.config.packetUnits, queue.remainingBudget, source.garrison);
          if (credit < units) break;
          credit -= units;
          source.emitRemainder -= units * denominator;
          queue.remainingBudget -= units;
          source.garrison -= units;
          source.reserved -= units;
          const length = pathLength(queue.path);
          const travelTicks = Math.max(1, length / this.config.movementSpeed * this.config.tickRate);
          const exactArrival = this.state.tick + travelTicks;
          const packet: UnitPacket = {
            id: this.nextId++, sequenceId: 0, owner: queue.owner, units, sourceId: source.id, targetId: queue.targetId,
            path: queue.path, pathLength: length, departTick: this.state.tick, arrivalTick: Math.ceil(exactArrival),
            subTick: exactArrival - (Math.ceil(exactArrival) - 1), travelTicks, progress: 0, distanceTravelled: 0,
            x: queue.path[0].x, y: queue.path[0].y,
          };
          packet.sequenceId = packet.id;
          this.state.packets.push(packet);
          this.event({ kind: 'emit', owner: queue.owner, nodeId: source.id, targetId: queue.targetId, units, packetId: packet.id, reason: 'deduct_on_emission' });
        }
        if (queue.remainingBudget > 0) break;
      }
    }
    this.state.queues = this.state.queues.filter(queue => queue.remainingBudget > 0);
  }

  private moveAndResolve(): void {
    const arrivals: UnitPacket[] = [];
    this.state.packets = this.state.packets.filter(packet => {
      packet.progress = Math.min(1, (this.state.tick - packet.departTick) / packet.travelTicks);
      packet.distanceTravelled = packet.pathLength * packet.progress;
      Object.assign(packet, pointOnPath(packet.path, packet.progress));
      if (this.state.tick >= packet.arrivalTick) { arrivals.push(packet); return false; }
      return true;
    });
    arrivals.sort((a, b) => a.arrivalTick - b.arrivalTick || a.subTick - b.subTick || a.sequenceId - b.sequenceId);
    for (const packet of arrivals) {
      const target = this.getNode(packet.targetId)!;
      if (target.owner === packet.owner) {
        target.garrison += packet.units;
        this.event({ kind: 'arrival', owner: packet.owner, nodeId: target.id, units: packet.units, packetId: packet.id, reason: 'friendly_reinforcement' });
        continue;
      }
      const loss = Math.min(target.garrison, packet.units);
      const remaining = packet.units - target.garrison;
      target.garrison -= loss;
      this.state.stats.casualties += 2 * loss;
      this.event({ kind: 'combat_loss', owner: packet.owner, nodeId: target.id, units: 2 * loss, packetId: packet.id, reason: 'one_for_one_both_sides' });
      if (remaining > 0) {
        this.cancelQueues(target.id, 'source_captured');
        const previousOwner = target.owner;
        target.owner = packet.owner;
        target.garrison = remaining;
        target.productionRemainder = 0;
        this.state.stats.captures++;
        this.event({ kind: 'capture', owner: packet.owner, nodeId: target.id, units: remaining, packetId: packet.id, reason: `captured_from:${previousOwner}` });
      } else if (target.reserved > target.garrison) {
        // Defender casualties consume garrison, including its reserved subset.
        // Reduce newest reservations first; never create a negative available army.
        let excess = target.reserved - target.garrison;
        for (let i = this.state.queues.length - 1; i >= 0 && excess > 0; i--) {
          const queue = this.state.queues[i];
          if (queue.sourceId !== target.id) continue;
          const removed = Math.min(excess, queue.remainingBudget);
          queue.remainingBudget -= removed;
          target.reserved -= removed;
          excess -= removed;
          this.event({ kind: 'cancel', owner: queue.owner, nodeId: target.id, targetId: queue.targetId, units: removed, reason: 'reserved_defenders_lost_in_combat' });
        }
        this.state.queues = this.state.queues.filter(queue => queue.remainingBudget > 0);
      }
    }
  }

  private updateOutcome(): void {
    const alive = this.participants.filter(owner => this.state.nodes.some(node => node.owner === owner) || this.state.packets.some(packet => packet.owner === owner));
    for (const owner of this.participants) if (!alive.includes(owner) && !this.state.eliminated.includes(owner)) {
      this.state.eliminated.push(owner);
      this.event({ kind: 'eliminated', owner, units: 0, reason: 'no_territory_and_no_in_transit_units' });
    }
    // Single-faction maps are useful research sandboxes, not contested matches.
    if (this.participants.length > 1 && alive.length === 1 && (!this.config.requireAllTerritories || this.state.nodes.every(node => node.owner === alive[0]))) {
      this.state.winner = alive[0];
      this.event({ kind: 'winner', owner: alive[0], units: 0, reason: 'last_surviving_faction' });
    }
  }

  private incoming(owner: OwnerId, targetId: string): number {
    return this.state.packets.reduce((n, p) => n + (p.owner === owner && p.targetId === targetId ? p.units : 0), 0)
      + this.state.queues.reduce((n, q) => n + (q.owner === owner && q.targetId === targetId ? q.remainingBudget : 0), 0);
  }

  private thinkAI(): void {
    for (const owner of this.participants) {
      if (owner === this.config.playerOwner && !this.config.playerAI) continue;
      const owned = this.state.nodes.filter(node => node.owner === owner);
      if (!owned.length) continue;
      const idle = owned.filter(node => !this.state.queues.some(queue => queue.sourceId === node.id) && this.available(node) > this.config.aiReserveMargin + 5);
      const plans: { target: NodeState; allocations: { source: NodeState; budget: number }[]; need: number; score: number }[] = [];
      for (const target of this.state.nodes.filter(node => node.owner !== owner)) {
        const sources = idle.filter(node => this.route(node.id, target.id));
        if (!sources.length) continue;
        const committed = this.incoming(owner, target.id);
        const capacities = sources.map(source => Math.max(0, this.available(source) - this.config.aiReserveMargin));
        const budget = capacities.reduce((sum, amount) => sum + amount, 0);
        const travel = Math.max(...sources.map(node => pathLength(this.route(node.id, target.id)!) / this.config.movementSpeed));
        const rate = this.productionRate(target);
        const cap = this.productionCap(target);
        const defenders = Math.min(cap ?? Infinity, target.garrison + rate * travel);
        const required = Math.max(0, defenders + (target.owner === 'neutral' ? 5 : 10) - committed);
        if (required <= 0 || this.config.emitUnitsPerSecond <= 0) continue;
        // All selected sources emit for a comparable duration. This avoids
        // forecasting several streams then actually sending only one source.
        // A packet burst adds a small delay to the defender-production budget.
        const effective = (perSource: number) => capacities.reduce((sum, capacity) => sum + Math.min(capacity, perSource), 0)
          - rate * (perSource + this.config.packetUnits) / this.config.emitUnitsPerSecond;
        const breakpoint = [...capacities].sort((a, b) => a - b).find(amount => effective(amount) >= required);
        if (breakpoint === undefined) continue;
        let low = 0, high = breakpoint;
        for (let iteration = 0; iteration < 20; iteration++) {
          const middle = (low + high) / 2;
          if (effective(middle) >= required) high = middle; else low = middle;
        }
        const allocations = sources.map((source, index) => ({ source, budget: Math.min(capacities[index], Math.ceil(high)) }));
        const need = allocations.reduce((sum, allocation) => sum + allocation.budget, 0);
        const score = (target.owner === 'neutral' ? 1.6 : 1) + Math.min(2, budget / Math.max(1, need)) * 0.3 - travel * 0.04 - need * 0.001 + this.random() * 0.1;
        plans.push({ target, allocations, need, score });
      }
      plans.sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id));
      if (plans.length) {
        const plan = plans[0];
        let needed = plan.need;
        for (const { source, budget } of plan.allocations) {
          const available = this.available(source);
          if (budget < 1) continue;
          const result = this.issueDispatch(owner, source.id, plan.target.id, budget / available, true);
          needed -= result.units;
          if (needed <= 0) break;
        }
        this.event({ kind: 'ai', owner, nodeId: plan.target.id, units: plan.need - needed, reason: 'attack_budget_includes_defender_production_and_committed_units' });
        continue;
      }
      // Move real reserves toward a front. This also lets a 250-cap economy
      // assemble a >250 army instead of stalemating against a full enemy node.
      let reinforced = false;
      for (const source of idle.sort((a, b) => this.available(b) - this.available(a))) {
        const hostileNeighbors = source.neighbors.map(id => this.getNode(id)!).filter(node => node.owner !== owner);
        const friendly = owned.filter(node => node.id !== source.id && this.route(source.id, node.id) && this.incoming(owner, node.id) < 150);
        const nearestHostile = (node: NodeState): number => Math.min(...this.state.nodes.filter(other => other.owner !== owner).map(other => distance(node.anchor, other.anchor)), Number.POSITIVE_INFINITY);
        friendly.sort((a, b) => nearestHostile(a) - nearestHostile(b) || a.id.localeCompare(b.id));
        const target = friendly.find(node => nearestHostile(node) + 1 < nearestHostile(source) && (hostileNeighbors.length === 0 || node.garrison > source.garrison));
        if (!target || this.available(source) < 35) continue;
        const desired = Math.floor((this.available(source) - this.config.aiReserveMargin) * 0.8);
        const result = this.issueDispatch(owner, source.id, target.id, desired / this.available(source), true);
        if (result.accepted) {
          this.event({ kind: 'ai', owner, nodeId: source.id, targetId: target.id, units: result.units, reason: 'reinforce_front_with_existing_units' });
          reinforced = true;
          break;
        }
      }
      if (!reinforced) this.event({ kind: 'ai', owner, units: 0, reason: idle.length ? 'wait_for_sufficient_uncommitted_army' : 'sources_busy_or_low_army' });
    }
  }

  /** A compact accounting assertion suitable for every tick in regression tests. */
  assertInvariants(): void {
    for (const node of this.state.nodes) {
      if (!Number.isSafeInteger(node.garrison) || node.garrison < 0 || !Number.isSafeInteger(node.reserved) || node.reserved < 0 || node.reserved > node.garrison || !OWNERS.includes(node.owner)) throw new Error(`Invalid node state: ${node.id}`);
      const reserved = this.state.queues.filter(queue => queue.sourceId === node.id).reduce((n, queue) => n + queue.remainingBudget, 0);
      if (reserved !== node.reserved) throw new Error(`Reservation mismatch: ${node.id}`);
    }
    for (const queue of this.state.queues) if (!Number.isSafeInteger(queue.remainingBudget) || queue.remainingBudget <= 0 || this.getNode(queue.sourceId)?.owner !== queue.owner || !this.getNode(queue.targetId)) throw new Error(`Invalid queue: ${queue.id}`);
    for (const packet of this.state.packets) if (!Number.isSafeInteger(packet.units) || packet.units <= 0 || !this.getNode(packet.targetId) || !Number.isFinite(packet.x) || !Number.isFinite(packet.y) || !OWNERS.includes(packet.owner)) throw new Error(`Invalid packet: ${packet.id}`);
    const actual = this.state.nodes.reduce((n, node) => n + node.garrison, 0) + this.state.packets.reduce((n, packet) => n + packet.units, 0);
    const expected = this.state.stats.initialUnits + this.state.stats.produced + this.state.stats.rewarded - this.state.stats.casualties;
    if (actual !== expected) throw new Error(`Conservation violated: actual=${actual}, expected=${expected}`);
  }

  snapshot(): GameState { return clone(this.state); }
  exportReplay(): Replay {
    return { version: 1, seed: this.seed, config: clone(this.initialConfig), configHash: stableHash(this.initialConfig), mapHash: stableHash(this.map), commands: clone(this.commands), endTick: this.state.tick };
  }

  static fromReplay(map: GameMap, replay: Replay): GameEngine {
    if (replay.version !== 1 || stableHash(map) !== replay.mapHash || stableHash(replay.config) !== replay.configHash) throw new Error('Replay version, map or configuration mismatch');
    if (!Number.isInteger(replay.endTick) || replay.endTick < 0) throw new Error('Invalid replay end tick');
    const engine = new GameEngine(map, replay.config, replay.seed);
    engine.replaying = true;
    let previousTick = 0;
    for (const command of replay.commands) {
      if (!Number.isInteger(command.tick) || command.tick < previousTick || command.tick > replay.endTick) throw new Error('Invalid replay command order');
      engine.step(command.tick - engine.state.tick);
      if (engine.state.tick !== command.tick) throw new Error('Replay command occurs after battle finished');
      switch (command.kind) {
        case 'dispatch': if (!engine.dispatch(command.owner, command.sourceId, command.targetId, command.fraction).accepted) throw new Error('Replay dispatch rejected'); break;
        case 'cancel': engine.cancel(command.sourceId); break;
        case 'reward': if (!engine.grantReward(command.id, command.owner, command.targetId, command.units)) throw new Error('Replay reward rejected'); break;
        case 'player-ai': engine.setPlayerAI(command.enabled); break;
        default: throw new Error('Unknown replay command');
      }
      previousTick = command.tick;
    }
    engine.step(replay.endTick - engine.state.tick);
    engine.replaying = false;
    engine.commands.push(...clone(replay.commands));
    engine.assertInvariants();
    return engine;
  }
}
