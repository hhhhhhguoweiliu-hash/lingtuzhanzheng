/** All numerical defaults are research candidates, not recovered original rules. */
export type OwnerId = 'neutral' | 'blue' | 'brown' | 'magenta' | 'green' | 'red';
export type DispatchMode = 'budget' | 'continuous';
export interface Point { x: number; y: number }
export interface NodeDefinition {
  id: string;
  owner: OwnerId;
  garrison: number;
  anchor: Point;
  labelAnchor?: Point;
  polygons?: Point[][];
  neighbors: string[];
  kind?: 'normal' | 'special_unknown';
  productionPerSecond?: number;
  productionCap?: number | null;
  /** Optional visual data. The simulation does not give these effects. */
  coverageRadius?: number;
  bonusLabel?: string;
}
export interface GameMap {
  id: string;
  width: number;
  height: number;
  nodes: NodeDefinition[];
  /** Optional explicit routes, in either direction; otherwise anchor-to-anchor. */
  routes?: { from: string; to: string; points: Point[] }[];
}
export interface SimConfig {
  tickRate: number;
  playerOwner: OwnerId;
  aiEnabled: boolean;
  playerAI: boolean;
  productionPerSecond: number;
  productionByOwner: Partial<Record<OwnerId, number>>;
  neutralProductionPerSecond: number;
  neutralProductionCap: number | null;
  productionCap: number | null;
  emitUnitsPerSecond: number;
  packetUnits: number;
  movementSpeed: number;
  routeMode: 'neighbors' | 'any-visible' | 'graph-path';
  aiThinkSeconds: number;
  aiReserveMargin: number;
  requireAllTerritories: boolean;
  /** Finite history for development HUD; full aggregate accounting is retained. */
  maxLedgerEvents: number;
}
export interface NodeState extends NodeDefinition {
  reserved: number;
  productionRemainder: number;
  emitRemainder: number;
}
export interface DispatchQueue {
  id: number;
  commandId: number;
  owner: OwnerId;
  sourceId: string;
  targetId: string;
  remainingBudget: number;
  /** Absent means the original fixed-budget queue. Continuous queues reserve zero. */
  mode?: DispatchMode;
  path: Point[];
}
export interface UnitPacket {
  id: number;
  sequenceId: number;
  owner: OwnerId;
  units: number;
  sourceId: string;
  targetId: string;
  path: Point[];
  pathLength: number;
  departTick: number;
  arrivalTick: number;
  subTick: number;
  travelTicks: number;
  progress: number;
  distanceTravelled: number;
  x: number;
  y: number;
}
export type LedgerKind = 'production' | 'reserve' | 'route' | 'emit' | 'arrival' | 'combat_loss' | 'capture' | 'cancel' | 'reward' | 'eliminated' | 'winner' | 'ai';
export interface LedgerEvent {
  tick: number;
  kind: LedgerKind;
  units: number;
  owner: OwnerId;
  nodeId?: string;
  targetId?: string;
  packetId?: number;
  reason: string;
}
export interface SimStats {
  initialUnits: number;
  produced: number;
  rewarded: number;
  casualties: number;
  captures: number;
  commands: number;
}
export interface GameState {
  tick: number;
  nodes: NodeState[];
  packets: UnitPacket[];
  queues: DispatchQueue[];
  winner: OwnerId | null;
  eliminated: OwnerId[];
  ledger: LedgerEvent[];
  stats: SimStats;
}
export interface CommandResult { accepted: boolean; reason: string; units: number; commandId?: number }
export type ReplayCommand =
  | { kind: 'dispatch'; tick: number; owner: OwnerId; sourceId: string; targetId: string; fraction: number; mode?: DispatchMode }
  | { kind: 'cancel'; tick: number; sourceId: string }
  | { kind: 'reward'; tick: number; id: string; owner: OwnerId; targetId: string; units: number }
  | { kind: 'player-ai'; tick: number; enabled: boolean };
export interface Replay {
  version: 1 | 2;
  configHash: string;
  mapHash: string;
  seed: number;
  config: SimConfig;
  commands: ReplayCommand[];
  endTick: number;
}
