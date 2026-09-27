import { describe, expect, it } from 'vitest';
import { GameEngine, pointOnPath, stableHash } from '../src/sim/engine';
import type { GameMap, NodeDefinition, SimConfig } from '../src/sim/types';
import { longMap } from '../src/maps/long';

const quiet: Partial<SimConfig> = { aiEnabled: false, productionPerSecond: 0, neutralProductionPerSecond: 0 };
const node = (id: string, owner: NodeDefinition['owner'], garrison: number, x: number, y = 0): NodeDefinition => ({ id, owner, garrison, anchor: { x, y }, neighbors: [] });
function map(...nodes: NodeDefinition[]): GameMap {
  for (const n of nodes) n.neighbors = nodes.filter(other => other !== n).map(other => other.id);
  return { id: 'fixture', width: 20000, height: 20000, nodes };
}
function checkedSteps(engine: GameEngine, ticks: number): void {
  for (let i = 0; i < ticks && engine.state.winner === null; i++) { engine.step(); engine.assertInvariants(); }
}

describe('fixed-budget stream, reservations and conservation', () => {
  it('five-unit batches wait for enough emission credit and a final partial batch is conserved', () => {
    const engine = new GameEngine(map(node('a', 'blue', 100, 0), node('b', 'neutral', 100, 10000)), { ...quiet, emitUnitsPerSecond: 16, packetUnits: 5 });
    engine.dispatch('blue', 'a', 'b', 0.48);
    engine.step(9);
    expect(engine.getNode('a')!.garrison).toBe(100);
    engine.step();
    expect(engine.getNode('a')!.garrison).toBe(95);
    engine.step(10);
    expect(engine.getNode('a')!.garrison).toBe(90);
    checkedSteps(engine, 70);
    expect(engine.getNode('a')).toMatchObject({ garrison: 52, reserved: 0 });
    expect(engine.state.packets.map(p => p.units)).toEqual([5, 5, 5, 5, 5, 5, 5, 5, 5, 3]);
  });
  it('B03/B04: emits exactly 30 in 3 seconds and cancellation never refunds reserved garrison', () => {
    const engine = new GameEngine(map(node('a', 'blue', 100, 0), node('b', 'neutral', 125, 10000)), { ...quiet, emitUnitsPerSecond: 10 });
    expect(engine.dispatch('blue', 'a', 'b', 0.8)).toMatchObject({ accepted: true, units: 80 });
    expect(engine.getNode('a')!.garrison).toBe(100);
    checkedSteps(engine, 90);
    expect(engine.getNode('a')).toMatchObject({ garrison: 70, reserved: 50 });
    expect(engine.state.packets.reduce((sum, packet) => sum + packet.units, 0)).toBe(30);
    expect(engine.cancel('a')).toBe(50);
    expect(engine.getNode('a')).toMatchObject({ garrison: 70, reserved: 0 });
    engine.assertInvariants();
  });

  it('B05: several commands share actual available troops and one source emission rate', () => {
    const engine = new GameEngine(map(node('a', 'blue', 100, 0), node('b', 'neutral', 125, 10000), node('c', 'neutral', 125, 15000)), { ...quiet, emitUnitsPerSecond: 10 });
    expect(engine.dispatch('blue', 'a', 'b', 0.8).units).toBe(80);
    expect(engine.dispatch('blue', 'a', 'c').units).toBe(20);
    expect(engine.dispatch('blue', 'a', 'c').accepted).toBe(false);
    checkedSteps(engine, 90);
    expect(engine.getNode('a')).toMatchObject({ garrison: 70, reserved: 70 });
    expect(engine.state.packets.reduce((sum, packet) => sum + packet.units, 0)).toBe(30);
  });

  it('validates owners, target, routes, fractions and zero-budget commands without changing state', () => {
    const fixture = map(node('a', 'blue', 10, 0), node('b', 'brown', 10, 100));
    fixture.nodes[0].neighbors = [];
    const engine = new GameEngine(fixture, quiet);
    const before = engine.snapshot();
    expect(engine.dispatch('brown', 'a', 'b').reason).toBe('source_not_owned');
    expect(engine.dispatch('neutral', 'a', 'b').accepted).toBe(false);
    expect(engine.dispatch('blue', 'a', 'missing').accepted).toBe(false);
    expect(engine.dispatch('blue', 'a', 'b', Number.NaN).accepted).toBe(false);
    expect(engine.dispatch('blue', 'a', 'b', 1.5).accepted).toBe(false);
    expect(engine.dispatch('blue', 'a', 'b').reason).toBe('route_unavailable');
    expect(engine.snapshot()).toEqual(before);
  });

  it('B06/C10: captured source cancels unissued budget while old packets remain a living faction', () => {
    const engine = new GameEngine(map(node('a', 'blue', 41, 0), node('b', 'brown', 100, 1), node('c', 'neutral', 0, 10000)), { ...quiet, emitUnitsPerSecond: 300, packetUnits: 10, movementSpeed: 30 });
    engine.dispatch('blue', 'a', 'c');
    engine.dispatch('brown', 'b', 'a');
    checkedSteps(engine, 3);
    expect(engine.getNode('a')!.owner).toBe('brown');
    expect(engine.getNode('a')!.reserved).toBe(0);
    expect(engine.state.queues.some(q => q.sourceId === 'a')).toBe(false);
    expect(engine.state.packets.some(p => p.sourceId === 'a' && p.owner === 'blue')).toBe(true);
    expect(engine.state.eliminated).not.toContain('blue');
    expect(engine.state.winner).toBeNull();
    expect(engine.state.ledger.some(e => e.kind === 'cancel' && e.reason === 'source_captured')).toBe(true);
  });
});

describe('movement and arrival combat', () => {
  it('B07: travel time scales with distance after separately specified emission delay', () => {
    const engine = new GameEngine(map(node('a', 'blue', 2, 0), node('b', 'neutral', 50, 100), node('c', 'neutral', 50, 200)), { ...quiet, movementSpeed: 50, emitUnitsPerSecond: 30 });
    engine.dispatch('blue', 'a', 'b', 0.5);
    engine.dispatch('blue', 'a', 'c');
    engine.step(2);
    expect(engine.state.packets.map(p => [p.targetId, p.departTick, p.arrivalTick])).toEqual([['b', 1, 61], ['c', 2, 122]]);
    engine.step(59);
    expect(engine.getNode('b')!.garrison).toBe(49);
    expect(engine.getNode('c')!.garrison).toBe(50);
    engine.step(61);
    expect(engine.getNode('c')!.garrison).toBe(49);
    engine.assertInvariants();
  });

  it('B08: defenders decrease before the stream tail arrives', () => {
    const engine = new GameEngine(map(node('a', 'blue', 200, 0), node('b', 'neutral', 100, 100)), { ...quiet, emitUnitsPerSecond: 20, movementSpeed: 100 });
    engine.dispatch('blue', 'a', 'b');
    checkedSteps(engine, 150);
    expect(engine.getNode('b')!.garrison).toBe(20);
    expect(engine.state.queues[0].remainingBudget).toBe(100);
    expect(engine.state.packets.reduce((n, p) => n + p.units, 0)).toBe(20);
    expect(engine.state.stats.casualties).toBe(160);
  });

  it.each([[8, 3, 'blue', 5, 6], [3, 8, 'neutral', 5, 6], [5, 5, 'neutral', 0, 10]] as const)('C01–C03: %i attack versus %i defenders', (attack, defense, owner, army, casualties) => {
    const engine = new GameEngine(map(node('a', 'blue', attack, 0), node('b', 'neutral', defense, 1)), { ...quiet, emitUnitsPerSecond: 300, packetUnits: 10, movementSpeed: 30 });
    engine.dispatch('blue', 'a', 'b');
    checkedSteps(engine, 2);
    expect(engine.getNode('b')).toMatchObject({ owner, garrison: army });
    expect(engine.state.stats.casualties).toBe(casualties);
  });

  it('B09: later packets reinforce their target after an earlier packet captures it', () => {
    const engine = new GameEngine(map(node('a', 'blue', 10, 0), node('b', 'neutral', 3, 1)), { ...quiet, emitUnitsPerSecond: 30, movementSpeed: 30 });
    engine.dispatch('blue', 'a', 'b');
    checkedSteps(engine, 11);
    expect(engine.getNode('b')).toMatchObject({ owner: 'blue', garrison: 7 });
    expect(engine.state.stats.casualties).toBe(6);
    expect(engine.state.ledger.some(event => event.reason === 'friendly_reinforcement')).toBe(true);
  });

  it('C04: simultaneous arrivals resolve by documented packet order, without owner preference', () => {
    const fixture = map(node('b', 'brown', 5, -10), node('a', 'blue', 8, 10), node('c', 'neutral', 3, 0));
    const engine = new GameEngine(fixture, { ...quiet, emitUnitsPerSecond: 300, packetUnits: 10, movementSpeed: 300 });
    engine.dispatch('blue', 'a', 'c');
    engine.dispatch('brown', 'b', 'c');
    checkedSteps(engine, 2);
    expect(engine.getNode('c')).toMatchObject({ owner: 'blue', garrison: 6 });
    expect(engine.state.ledger.filter(e => e.kind === 'capture').map(e => e.owner)).toEqual(['brown', 'blue']);
    expect(GameEngine.fromReplay(fixture, engine.exportReplay()).snapshot()).toEqual(engine.snapshot());
  });

  it('B10: a bent path follows arc length and graph routing does not cross hostile intermediate nodes', () => {
    expect(pointOnPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.75)).toEqual({ x: 100, y: 50 });
    const fixture = map(node('a', 'blue', 10, 0), node('b', 'blue', 10, 100), node('c', 'neutral', 10, 200));
    fixture.nodes[0].neighbors = ['b']; fixture.nodes[1].neighbors = ['a', 'c']; fixture.nodes[2].neighbors = ['b'];
    const engine = new GameEngine(fixture, { ...quiet, routeMode: 'graph-path' });
    expect(engine.route('a', 'c')).toHaveLength(3);
    fixture.nodes[1].owner = 'brown';
    expect(new GameEngine(fixture, { ...quiet, routeMode: 'graph-path' }).route('a', 'c')).toBeNull();
  });

  it('subtick arrivals precede an exact integer arrival within the same tick', () => {
    const fixture = map(node('b', 'brown', 5, -10), node('a', 'blue', 8, 9.5), node('c', 'neutral', 3, 0));
    const engine = new GameEngine(fixture, { ...quiet, emitUnitsPerSecond: 300, packetUnits: 10, movementSpeed: 30 });
    engine.dispatch('brown', 'b', 'c'); engine.dispatch('blue', 'a', 'c');
    checkedSteps(engine, 11);
    expect(engine.getNode('c')).toMatchObject({ owner: 'blue', garrison: 0 });
    expect(engine.state.ledger.filter(e => e.kind === 'capture').map(e => e.owner)).toEqual(['blue']);
  });
});

describe('production, soft capacity and reward adapters', () => {
  it('neutral defenders regenerate to125 after an attack and use the colored250 cap after capture', () => {
    const engine = new GameEngine(map(node('a', 'blue', 300, 0), node('b', 'neutral', 125, 1)), { ...quiet, productionPerSecond: 11, neutralProductionPerSecond: 7, neutralProductionCap: 125, emitUnitsPerSecond: 9000, packetUnits: 5, movementSpeed: 30 });
    engine.dispatch('blue', 'a', 'b', 5 / 300);
    engine.step(2);
    expect(engine.getNode('b')).toMatchObject({ owner: 'neutral', garrison: 120 });
    engine.step(30);
    expect(engine.getNode('b')!.garrison).toBe(125);
    engine.dispatch('blue', 'a', 'b');
    engine.step(2);
    expect(engine.getNode('b')).toMatchObject({ owner: 'blue', garrison: 170 });
    engine.step(30);
    expect(engine.getNode('b')!.garrison).toBe(181);
    engine.assertInvariants();
  });
  it('C05/C06: reinforcement exceeds soft cap and survives; emission below cap restores production', () => {
    const engine = new GameEngine(map(node('a', 'blue', 250, 0), node('b', 'neutral', 1000, 10000)), { ...quiet, productionPerSecond: 10, emitUnitsPerSecond: 100 });
    expect(engine.grantReward('test-bonus', 'blue', 'a', 80)).toBe(true);
    engine.step(30);
    expect(engine.getNode('a')!.garrison).toBe(330);
    expect(engine.state.stats.produced).toBe(0);
    engine.dispatch('blue', 'a', 'b', 100 / 330);
    checkedSteps(engine, 30);
    expect(engine.getNode('a')!.garrison).toBeGreaterThanOrEqual(230);
    expect(engine.getNode('a')!.garrison).toBeLessThan(250);
    expect(engine.state.stats.produced).toBeGreaterThan(0);
  });

  it('C07: fixed-point 1.47/s production gives exactly 147 units over 100 seconds', () => {
    const engine = new GameEngine(map(node('a', 'blue', 0, 0)), { ...quiet, productionPerSecond: 1.47, productionCap: null });
    engine.step(3000);
    expect(engine.getNode('a')!.garrison).toBe(147);
    expect(engine.getNode('a')!.productionRemainder).toBe(0);
    engine.assertInvariants();
  });

  it('production overrides follow the owner after capture and special visuals have no hidden effects', () => {
    const fixture = map(node('a', 'blue', 10, 0), node('b', 'neutral', 0, 1));
    fixture.nodes[1].kind = 'special_unknown'; fixture.nodes[1].coverageRadius = 1000;
    const engine = new GameEngine(fixture, { ...quiet, productionPerSecond: 11, productionByOwner: { blue: 13 }, emitUnitsPerSecond: 300, packetUnits: 10, movementSpeed: 30, productionCap: null });
    engine.dispatch('blue', 'a', 'b');
    engine.step(2);
    const before = engine.getNode('b')!.garrison;
    engine.step(30);
    expect(engine.getNode('b')!.garrison - before).toBe(13);
    expect(engine.state.stats.casualties).toBe(0);
  });

  it('C09: duplicate reward callback is idempotent; invalid target does not consume grant ID', () => {
    const engine = new GameEngine(map(node('a', 'blue', 20, 0), node('b', 'brown', 20, 100)), quiet);
    expect(engine.grantReward('bonus-1', 'blue', 'b', 100)).toBe(false);
    expect(engine.grantReward('bonus-1', 'blue', 'a', 100)).toBe(true);
    expect(engine.grantReward('bonus-1', 'blue', 'a', 100)).toBe(false);
    expect(engine.getNode('a')!.garrison).toBe(120);
    expect(engine.state.stats.rewarded).toBe(100);
    engine.assertInvariants();
  });
});

describe('determinism, replay and complete AI matches', () => {
  it('C12: commands, cancellations, rewards and AI toggle round-trip to exact state', () => {
    const engine = new GameEngine(longMap, { productionPerSecond: 11, productionByOwner: { blue: 13.33 }, emitUnitsPerSecond: 40 }, 731);
    engine.dispatch('blue', 'L_SW', 'L_W', 0.8);
    engine.step(90);
    engine.cancel('L_SW');
    engine.grantReward('explicit-demo', 'blue', 'L_SW', 100);
    engine.setPlayerAI(true);
    checkedSteps(engine, 1200);
    const replay = engine.exportReplay();
    expect(GameEngine.fromReplay(longMap, replay).snapshot()).toEqual(engine.snapshot());
    expect(GameEngine.fromReplay(longMap, replay).exportReplay()).toEqual(replay);
    expect(() => GameEngine.fromReplay(longMap, { ...replay, mapHash: 'bad' })).toThrow('mismatch');
    expect(() => GameEngine.fromReplay(longMap, { ...replay, config: { ...replay.config, movementSpeed: 999 } })).toThrow('mismatch');
  });

  it('same fixed ticks in 30/60/120 render-frame schedules result in identical snapshots', () => {
    const snapshots = [30, 60, 120].map(fps => {
      const engine = new GameEngine(longMap, { playerAI: true, productionPerSecond: 11, emitUnitsPerSecond: 40 }, 91);
      let completedTicks = 0;
      for (let frame = 1; frame <= fps * 20; frame++) {
        const targetTick = Math.floor(frame * 30 / fps);
        engine.step(targetTick - completedTicks);
        completedTicks = targetTick;
      }
      return engine.snapshot();
    });
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
  });

  it('snapshots and caller map data are isolated; map/config hashes are key-order independent', () => {
    const fixture = map(node('a', 'blue', 100, 0));
    const engine = new GameEngine(fixture, quiet);
    fixture.nodes[0].garrison = 999;
    const snapshot = engine.snapshot(); snapshot.nodes[0].garrison = 888;
    expect(engine.getNode('a')!.garrison).toBe(100);
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });

  it.each([7, 31, 731, 2026])('D01/D02: AI seed %i expands, respects conservation and reaches a winner', seed => {
    const engine = new GameEngine(longMap, { playerAI: true, productionPerSecond: 11, productionByOwner: { blue: 13.7 }, neutralProductionPerSecond: 7, neutralProductionCap: 125, emitUnitsPerSecond: 16, packetUnits: 5, movementSpeed: 80, routeMode: 'any-visible', maxLedgerEvents: 3000 }, seed);
    checkedSteps(engine, 30 * 600);
    if (!engine.state.winner) console.log(JSON.stringify({ seed, nodes: engine.state.nodes.map(n => ({ id: n.id, owner: n.owner, garrison: n.garrison, reserved: n.reserved })), queues: engine.state.queues, packets: engine.state.packets.length, stats: engine.state.stats, recentAI: engine.state.ledger.filter(e => e.kind === 'ai').slice(-6) }));
    expect(engine.state.stats.captures).toBeGreaterThan(8);
    expect(engine.state.stats.commands).toBeGreaterThan(10);
    expect(engine.state.winner).not.toBeNull();
    const before = engine.snapshot(); engine.step(900);
    expect(engine.snapshot()).toEqual(before);
    expect(engine.state.ledger.some(e => e.kind === 'winner')).toBe(true);
    console.log(JSON.stringify({ seed, seconds: engine.seconds, winner: engine.state.winner, captures: engine.state.stats.captures, commands: engine.state.stats.commands, totalProduced: engine.state.stats.produced }));
  }, 20000);
});
