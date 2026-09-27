import { stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';

// Node 26 built-in erasure: execute the checked-in engine directly, without editing it.
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const engine = moduleUrl(readFileSync('src/sim/engine.ts', 'utf8'));
const map = moduleUrl(readFileSync('src/maps/long.ts', 'utf8'));
const experiment = readFileSync('research/verification/dispatch-calibration.ts', 'utf8')
  .replace("'../../src/sim/engine'", JSON.stringify(engine))
  .replace("'../../src/maps/long'", JSON.stringify(map));
await import(moduleUrl(experiment));
