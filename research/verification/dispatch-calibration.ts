import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { GameEngine, stableHash } from '../../src/sim/engine';
import { longMap } from '../../src/maps/long';
import type { SimConfig } from '../../src/sim/types';

const output = 'research/verification';
mkdirSync(output, { recursive: true });
const paths = ['src/main.ts', 'src/sim/engine.ts', 'src/sim/types.ts', 'src/maps/long.ts'];
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const before = Object.fromEntries(paths.map(path => [path, sha(path)]));
const main = readFileSync('src/main.ts', 'utf8');
const longIndex = main.indexOf("id:'long'");
const configIndex = main.indexOf('config:', longIndex) + 'config:'.length;
let end = configIndex, depth = 0;
for (; end < main.length; end++) {
  if (main[end] === '{') depth++;
  if (main[end] === '}' && --depth === 0) { end++; break; }
}
const configText = main.slice(configIndex, end);
const sceneConfig = runInNewContext('(' + configText + ')') as Partial<SimConfig>;
if (sceneConfig.productionPerSecond !== 11 || sceneConfig.productionByOwner?.blue !== 13.7)
  throw new Error('Long scene changed; inspect config before rerunning calibration.');
const config: Partial<SimConfig> = { ...sceneConfig, aiEnabled: false };
const seed = 731, sourceId = 'L_SW', targetId = 'L_W';

function experiment(policy: 'single_fixed_budget' | 'repeat_when_source_queue_empty') {
  const e = new GameEngine(longMap, config, seed);
  if (e.getNode(sourceId)?.garrison !== 200 || e.getNode(targetId)?.garrison !== 125)
    throw new Error('Starting armies no longer match requested 200 to 125.');
  let emittedUnits = 0, emittedPackets = 0, acceptedCommands = 0, invariantChecks = 0;
  let firstCapture: null | { tick: number; seconds: number; garrison: number } = null;
  let firstEmissionSeconds: number | null = null, lastEmissionSeconds: number | null = null;
  let initialQueueEmptySeconds: number | null = null, firstArrivalSeconds: number | null = null;
  let sourceProduced = 0, targetNeutralProduced = 0;
  const commandLog: { tick: number; seconds: number; units: number }[] = [];
  const invariant = () => { e.assertInvariants(); invariantChecks++; };
  const dispatch = () => {
    const result = e.dispatch('blue', sourceId, targetId, 1);
    if (!result.accepted) throw new Error('Unexpected rejected calibration command: ' + result.reason);
    acceptedCommands++;
    commandLog.push({ tick: e.state.tick, seconds: e.seconds, units: result.units });
    invariant();
  };
  const summary = () => ({
    tick: e.state.tick, seconds: e.seconds,
    source: { owner: e.getNode(sourceId)!.owner, garrison: e.getNode(sourceId)!.garrison,
      reserved: e.getNode(sourceId)!.reserved, available: e.available(sourceId) },
    target: { owner: e.getNode(targetId)!.owner, garrison: e.getNode(targetId)!.garrison },
    emittedUnits, emittedPackets, acceptedCommands,
    inTransitUnits: e.state.packets.filter(p => p.sourceId === sourceId).reduce((sum, p) => sum + p.units, 0),
    queuedUnits: e.state.queues.filter(q => q.sourceId === sourceId).reduce((sum, q) => sum + q.remainingBudget, 0),
    sourceProduced, targetNeutralProduced,
    totalGarrison: e.state.nodes.reduce((sum, n) => sum + n.garrison, 0),
    totalInTransit: e.state.packets.reduce((sum, p) => sum + p.units, 0),
    stats: { ...e.state.stats }, stateHash: stableHash(e.snapshot()),
  });
  invariant();
  dispatch();
  let at20: ReturnType<typeof summary> | null = null;
  let atVideoCapture17: ReturnType<typeof summary> | null = null;
  for (let tick = 0; tick < 90 * e.config.tickRate; tick++) {
    if (policy === 'repeat_when_source_queue_empty' && e.state.tick > 0 &&
        !e.state.queues.some(q => q.sourceId === sourceId) && e.available(sourceId) > 0) dispatch();
    e.step();
    invariant();
    if (e.state.tick !== tick + 1) throw new Error('Battle stopped before requested horizon.');
    const events = e.state.ledger.filter(event => event.tick === e.state.tick);
    for (const event of events) {
      if (event.kind === 'emit' && event.nodeId === sourceId) {
        emittedUnits += event.units; emittedPackets++;
        firstEmissionSeconds ??= e.seconds; lastEmissionSeconds = e.seconds;
      }
      if (event.kind === 'production' && event.nodeId === sourceId) sourceProduced += event.units;
      if (event.kind === 'production' && event.nodeId === targetId && event.owner === 'neutral') targetNeutralProduced += event.units;
      if ((event.kind === 'combat_loss' || event.kind === 'arrival') && event.nodeId === targetId) firstArrivalSeconds ??= e.seconds;
    }
    if (initialQueueEmptySeconds === null && !e.state.queues.some(q => q.sourceId === sourceId))
      initialQueueEmptySeconds = e.seconds;
    if (firstCapture === null && e.getNode(targetId)!.owner === 'blue')
      firstCapture = { tick: e.state.tick, seconds: e.seconds, garrison: e.getNode(targetId)!.garrison };
    if (e.state.tick === 17 * e.config.tickRate) atVideoCapture17 = summary();
    if (e.state.tick === 20 * e.config.tickRate) at20 = summary();
  }
  return { policy, commandLog, firstCapture, firstEmissionSeconds, lastEmissionSeconds,
    firstArrivalSeconds, initialQueueEmptySeconds, atVideoCapture17, at20,
    capturedBy90Seconds: firstCapture !== null, at90: summary(),
    conservation: { status: 'PASS', checkedEveryTick: true, invariantChecks } };
}

const results = [experiment('single_fixed_budget'), experiment('repeat_when_source_queue_empty')];
const after = Object.fromEntries(paths.map(path => [path, sha(path)]));
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source changed during experiment; rerun on stable files.');
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), seed, sourceId, targetId,
  sourceFilesSha256: before, sourceFilesUnchangedDuringRun: true,
  sourceConfigLiteral: configText, effectiveConfig: new GameEngine(longMap, config, seed).config,
  mapHash: stableHash(longMap), horizonSeconds: 90,
  protocol: {
    initialCommandTick: 0, fraction: 1, initialSourceUnits: 200, initialTargetUnits: 125,
    otherFactionsPresentButAiDisabled: true,
    repeatingRule: 'Before each next tick, if this source has no queue and has available units, submit another 100% fixed-budget command to W; continue after capture as reinforcement.',
    snapshot20Timing: 'After completing tick 600, before any next command at time 20.',
    noSourceCodeChanges: true, noSpecialTowerDamageOrSlowdown: true,
  },
  videoReference: {
    source: 'L / 1000042572.mp4', observedWCaptureWindowSeconds: [16.5, 17.0],
    timingAlignment: 'Video starts mid-action with SW187; experiment starts with SW200 and a command at tick0. Treat comparison as approximate local calibration, not identical input replay.',
    meaning: 'Repeat policy is an explicit input hypothesis, not proof of permanent automatic channels in the original.',
  },
  results,
};
writeFileSync(output + '/dispatch-calibration.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(results.map(r => ({ policy:r.policy, firstCapture:r.firstCapture, at20:r.at20, capturedBy90:r.capturedBy90Seconds, totalEmitted:r.at90.emittedUnits, commands:r.at90.acceptedCommands, conservation:r.conservation })),null,2));
