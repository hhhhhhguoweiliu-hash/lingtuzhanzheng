import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameMap, GameState } from '../src/sim/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).lingtu.getState());
const mode = (page: Page): Promise<string> => page.evaluate(() => (window as any).lingtu.getMode());
const profile = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lingtu-replica-v1')!).profile);

async function clickNode(page: Page, id: string): Promise<void> {
  const map: GameMap = await page.evaluate(() => (window as any).lingtu.getScene());
  const point = map.nodes.find(node => node.id === id)!.anchor;
  const box = await page.locator('#battle').boundingBox();
  if (!box) throw Error('Canvas unavailable');
  await page.mouse.click(box.x + point.x / map.width * box.width, box.y + point.y / map.height * box.height);
}

test('new local player wins campaign by visible pointer actions, buys an upgrade and retains progress on reload', async ({ page }, info) => {
  test.setTimeout(180_000);
  const built = resolve('dist/领土战争.html');
  await page.goto(process.env.PROGRESSION_URL ?? (existsSync(built) ? pathToFileURL(built).href : '/'));
  await expect(page.locator('#campaign-start')).toBeVisible();
  const initial = await profile(page);
  expect(initial.stage).toBe(1);
  expect(initial.unitLevel).toBe(1);
  expect(initial.coins).toBe(250);
  await page.locator('#campaign-start').click();
  await expect.poll(() => mode(page)).toBe('playing');
  expect((await profile(page)).energy).toBe(initial.energy - 5);
  let pointerOrders = 0;
  const deadline = Date.now() + 140_000;
  while (await mode(page) === 'playing' && Date.now() < deadline) {
    const current = await state(page);
    const idle = current.nodes.filter(node => node.owner === 'blue' && node.garrison - node.reserved >= 5 && !current.queues.some(queue => queue.sourceId === node.id));
    const targets = current.nodes.filter(node => node.owner !== 'blue');
    const plans = targets.map(target => {
      const incoming = current.packets.filter(packet => packet.owner === 'blue' && packet.targetId === target.id).reduce((sum, packet) => sum + packet.units, 0)
        + current.queues.filter(queue => queue.owner === 'blue' && queue.targetId === target.id).reduce((sum, queue) => sum + queue.remainingBudget, 0);
      const sources = [...idle].sort((a, b) => Math.hypot(a.anchor.x - target.anchor.x, a.anchor.y - target.anchor.y) - Math.hypot(b.anchor.x - target.anchor.x, b.anchor.y - target.anchor.y)).slice(0, 4);
      const budget = sources.reduce((sum, source) => sum + source.garrison - source.reserved, 0);
      const distance = sources[0] ? Math.hypot(sources[0].anchor.x - target.anchor.x, sources[0].anchor.y - target.anchor.y) : Infinity;
      const need = target.garrison + (target.owner === 'neutral' ? 3 : distance / 80 + 5);
      return { target, sources, incoming, budget, need, score: target.garrison + distance / 40 + (target.owner === 'neutral' ? 0 : 2) };
    }).filter(plan => plan.sources.length > 0 && plan.incoming < plan.need && plan.budget + plan.incoming >= plan.need).sort((a, b) => a.score - b.score);
    if (plans.length) {
      const plan = plans[0];
      let committed = plan.incoming;
      for (const source of plan.sources) {
        if (committed >= plan.need + 3 || await mode(page) !== 'playing') break;
        await clickNode(page, source.id);
        await clickNode(page, plan.target.id);
        pointerOrders++;
        committed += source.garrison - source.reserved;
      }
    }
    await page.waitForTimeout(350);
  }
  expect(await mode(page)).toBe('result');
  await expect(page.locator('.ribbon')).toHaveText('你赢了');
  expect(pointerOrders).toBeGreaterThan(3);
  const earned = await profile(page);
  const finalTick = (await state(page)).tick;
  expect(earned.games).toBe(1);
  expect(earned.wins).toBe(1);
  expect(earned.stage).toBe(2);
  expect(earned.coins).toBeGreaterThan(initial.coins);
  expect(earned.energy).toBe(initial.energy - 5);
  expect(earned.paidBattles).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('first-campaign-victory.png') });
  await page.locator('#return').click();
  await page.locator('#upgrade-units').click();
  const upgraded = await profile(page);
  expect(upgraded.unitLevel).toBe(2);
  expect(upgraded.coins).toBe(earned.coins - 100);
  await page.reload();
  await expect(page.locator('#campaign-start')).toContainText('第2关');
  const restored = await profile(page);
  expect(restored.unitLevel).toBe(2);
  expect(restored.coins).toBe(upgraded.coins);
  expect(restored.wins).toBe(1);
  await page.screenshot({ path: info.outputPath('upgraded-persisted-home.png') });
  console.log(JSON.stringify({ pointerOrders, finalTick, coins: [initial.coins, earned.coins, restored.coins], stage: restored.stage, unitLevel: restored.unitLevel, energy: restored.energy }));
});

for (const endTick of [0, 7]) {
  test(`replay import executes commands at terminal tick${endTick} and exposes mobile pause control`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home-settings')).toBeVisible();
    const fixture = await page.evaluate(() => {
      const api = (window as any).lingtu;
      return { ...api.getReplay(), map: api.getScene(), sceneId: 'long' };
    });
    fixture.endTick = endTick;
    fixture.commands = [{ kind: 'player-ai', tick: endTick, enabled: true }];
    await page.locator('#home-settings').click();
    await page.locator('#replay-file').setInputFiles({ name: 'terminal-command.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await expect(page.locator('#replay-home')).toBeVisible();
    expect((await state(page)).tick).toBe(endTick);
    const reconstructed = await page.evaluate(() => (window as any).lingtu.getReplay());
    expect(reconstructed.commands).toEqual(fixture.commands);
    await expect(page.locator('#back')).toBeVisible();
  });
}

test('exported campaign replay imports its modified map without spending another energy entry', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('#campaign-start').click();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(4);
  await page.locator('#back').click();
  const expected = await state(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  const file = info.outputPath('campaign-replay.json');
  await download.saveAs(file);
  await page.locator('#return').click();
  const energy = (await profile(page)).energy;
  await page.locator('#home-settings').click();
  await page.locator('#replay-file').setInputFiles(file);
  await expect(page.locator('#replay-home')).toBeVisible();
  expect(await state(page)).toEqual(expected);
  expect((await profile(page)).energy).toBe(energy);
  expect((await profile(page)).games).toBe(0);
});
