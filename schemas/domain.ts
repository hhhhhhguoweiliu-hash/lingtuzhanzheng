/** 建议数据契约；未连接引擎，不能视为运行实现。坐标以单场设计坐标定义。 */
export type OwnerId = string; // neutral is a real enum member in the eventual engine.
export type Tick = number;
export type MechanismStatus = 'candidate'|'calibrated_for_scene'|'confirmed_by_interaction';
export interface Point {x:number;y:number}
export interface Evidence {source:string;startPts:number;endPts:number;observation:string;interpretation?:string;occluded:boolean}
export interface Territory {
 id:string;polygons:Point[][];anchor:Point;labelAnchor:Point;owner:OwnerId;
 garrison:number;reserved:number;productionRemainder:number;productionPerSecond:number;
 productionCap:number|null;hardCap:number|null;kind:'normal'|'special_unknown';
 neighbors:string[];effects:string[];
}
export interface Route {id:string;from:string;to:string;points:Point[];length:number}
export interface DispatchCommand {id:string;tick:Tick;owner:OwnerId;sourceIds:string[];targetId:string;mode:'fixed_budget_stream'|'continuous_channel';fraction?:number}
export interface DispatchQueue {id:string;commandId:string;owner:OwnerId;sourceId:string;targetId:string;remainingBudget:number;emitRemainder:number;cancelled:boolean}
export interface UnitPacket {id:string;sequenceId:number;owner:OwnerId;units:number;sourceId:string;targetId:string;routeId:string;departTick:Tick;arrivalTick:Tick;subTick:number;distanceTravelled:number}
export interface LedgerEvent {tick:Tick;kind:'production'|'reserve'|'emit'|'arrival'|'combat_loss'|'capture'|'cancel'|'reward';units:number;owner:OwnerId;nodeId?:string;packetId?:string;reason:string}
export interface Replay {version:number;configHash:string;mapHash:string;seed:number;commands:DispatchCommand[];events?:LedgerEvent[]}
export interface ObservationRow {source:string;pts:number;nodeId:string;visibleArmy:number|null;owner:OwnerId|null;outboundVisible:boolean|null;inboundVisible:boolean|null;note:string}
export interface SkillDefinition {id:string;status:MechanismStatus;effectEnabled:boolean;candidateBonusUnits?:number;cooldownTicks?:number|null;evidence:Evidence[]}
export interface MapDefinition {id:string;coordinateWidth:number;coordinateHeight:number;territories:Territory[];routes:Route[];source:string;annotationStatus:'draft'|'reviewed'}
