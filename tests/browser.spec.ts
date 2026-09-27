import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameMap, GameState, Replay } from '../src/sim/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).lingtu.getState());
const replay = (page: Page): Promise<Replay> => page.evaluate(() => (window as any).lingtu.getReplay());
const mode = (page: Page): Promise<string> => page.evaluate(() => (window as any).lingtu.getMode());

async function startBattle(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).lingtu))).toBe(true);
  if (await page.locator('#practice').isVisible()) await page.locator('#practice').click();
  const start = page.locator('#start:visible, #campaign-start:visible').first();
  if (await start.isVisible()) await start.click();
  await expect.poll(() => mode(page)).toBe('playing');
}

async function mapPoint(page: Page, point: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const map: GameMap = await page.evaluate(() => (window as any).lingtu.getScene());
  const box = await page.locator('#battle').boundingBox();
  if (!box) throw new Error('Battle canvas is not visible');
  return { x: box.x + point.x / map.width * box.width, y: box.y + point.y / map.height * box.height };
}

async function sourceAndTarget(page: Page) {
  const current = await state(page);
  const source = current.nodes.find(node => node.owner === 'blue')!;
  const target = current.nodes.find(node => node.id === 'L_W') ?? current.nodes.find(node => node.owner === 'neutral')!;
  return { source, target, from: await mapPoint(page, source.anchor), to: await mapPoint(page, target.anchor) };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('page loads without framework errors and a real drag dispatches one budget', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  await startBattle(page);
  const { source, target, from, to } = await sourceAndTarget(page);
  await drag(page, from, to);
  const commands = (await replay(page)).commands.filter(command => command.kind === 'dispatch');
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ sourceId: source.id, targetId: target.id, owner: 'blue' });
  await expect.poll(async () => (await state(page)).packets.some(packet => packet.owner === 'blue')).toBe(true);
  expect(await page.locator('vite-error-overlay').count()).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('battle-stream.png') });
});

test('enemy drag, release on blank space and pointercancel never issue commands', async ({ page }) => {
  await startBattle(page);
  const { from, to } = await sourceAndTarget(page);
  const enemy = (await state(page)).nodes.find(node => node.owner !== 'blue' && node.owner !== 'neutral')!;
  await drag(page, await mapPoint(page, enemy.anchor), from);
  expect((await replay(page)).commands).toHaveLength(0);
  const map: GameMap = await page.evaluate(() => (window as any).lingtu.getScene());
  const blank = await mapPoint(page, { x: map.width * 0.85, y: map.height * 0.75 });
  await drag(page, from, blank);
  expect((await replay(page)).commands).toHaveLength(0);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.locator('#battle').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  expect((await replay(page)).commands).toHaveLength(0);
  await expect(page.locator('#selection-note')).toBeEmpty();
});

test('tap-select source then tap neutral target sends exactly one command', async ({ page }) => {
  await startBattle(page);
  const { from, to } = await sourceAndTarget(page);
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  expect((await replay(page)).commands.filter(command => command.kind === 'dispatch')).toHaveLength(1);
});

test('pause freezes tick and resume does not catch up paused wall time', async ({ page }) => {
  await startBattle(page);
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(3);
  await page.locator('#back').click();
  await expect.poll(() => mode(page)).toBe('paused');
  const frozen = (await state(page)).tick;
  await page.waitForTimeout(700);
  expect((await state(page)).tick).toBe(frozen);
  await page.locator('#resume').click();
  await page.waitForTimeout(200);
  const advanced = (await state(page)).tick - frozen;
  expect(advanced).toBeGreaterThan(0);
  expect(advanced).toBeLessThan(16);
});

test('window blur clears a pending gesture and pauses without a ghost order', async ({ page }) => {
  await startBattle(page);
  const { from, to } = await sourceAndTarget(page);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  // Browser event contract only; real Android app-switching remains a device test.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect.poll(() => mode(page)).toBe('paused');
  expect((await replay(page)).commands).toHaveLength(0);
  await page.locator('#resume').click();
  await page.mouse.click(to.x, to.y);
  expect((await replay(page)).commands).toHaveLength(0);
});

test('ten retries retain one input handler and one simulation clock', async ({ page }) => {
  await startBattle(page);
  for (let iteration = 0; iteration < 10; iteration++) {
    await page.locator('#back').click();
    await page.locator('#retry').click();
    await expect.poll(() => mode(page)).toBe('playing');
    expect((await state(page)).stats.commands).toBe(0);
    expect((await replay(page)).commands).toHaveLength(0);
  }
  const before = (await state(page)).tick;
  await page.waitForTimeout(1000);
  const elapsed = (await state(page)).tick - before;
  expect(elapsed).toBeGreaterThan(15);
  expect(elapsed).toBeLessThan(42);
  const { from, to } = await sourceAndTarget(page);
  await drag(page, from, to);
  expect((await replay(page)).commands.filter(command => command.kind === 'dispatch')).toHaveLength(1);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1365, height: 768 }, { width: 844, height: 390 }]) {
  test(`battle fits ${viewport.width}x${viewport.height} with all node anchors in canvas`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await startBattle(page);
    const metrics = await page.evaluate(() => {
      const stage = document.querySelector('#stage')!.getBoundingClientRect();
      const canvas = document.querySelector('#battle')!.getBoundingClientRect();
      const map = (window as any).lingtu.getScene() as GameMap;
      return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth, stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height }, canvas: { width: canvas.width, height: canvas.height }, nodesInside: map.nodes.every(node => node.anchor.x >= 0 && node.anchor.y >= 0 && node.anchor.x <= map.width && node.anchor.y <= map.height), aspect: map.width / map.height };
    });
    expect(metrics.horizontalOverflow).toBe(false);
    expect(metrics.stage.x).toBeGreaterThanOrEqual(-1);
    expect(metrics.stage.y).toBeGreaterThanOrEqual(-1);
    expect(metrics.stage.x + metrics.stage.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.stage.y + metrics.stage.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(metrics.canvas.width / metrics.canvas.height).toBeCloseTo(metrics.aspect, 3);
    expect(metrics.nodesInside).toBe(true);
    await page.screenshot({ path: info.outputPath(`viewport-${viewport.width}x${viewport.height}.png`) });
  });
}

test('tap-friendly reinforcement works after capturing a second blue territory', async ({ page }) => {
  await startBattle(page);
  const { source, target, from, to } = await sourceAndTarget(page);
  // All setup uses visible actions: once-per-match demonstration boost and speed control.
  await page.locator('#skill').click(); await page.mouse.click(from.x, from.y);
  await page.keyboard.press('F2');
  await page.locator('#d-speed').click(); await page.locator('#d-speed').click();
  await page.keyboard.press('F2');
  await drag(page, from, to);
  await expect.poll(async () => (await state(page)).nodes.find(node => node.id === target.id)?.owner, { timeout: 8000 }).toBe('blue');
  await page.keyboard.press('F2'); await page.locator('#d-speed').click(); await page.keyboard.press('F2');
  const before = (await replay(page)).commands.filter(command => command.kind === 'dispatch').length;
  await page.mouse.click(from.x, from.y); await page.mouse.click(to.x, to.y);
  const commands = (await replay(page)).commands.filter(command => command.kind === 'dispatch');
  expect(commands).toHaveLength(before + 1);
  expect(commands[commands.length - 1]).toMatchObject({ sourceId: source.id, targetId: target.id });
});

test.describe('touch input', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('mobile touch taps issue one command at device pixel ratio2', async ({ page }) => {
    await startBattle(page);
    const { from, to } = await sourceAndTarget(page);
    await page.touchscreen.tap(from.x, from.y);
    await page.touchscreen.tap(to.x, to.y);
    expect((await replay(page)).commands.filter(command => command.kind === 'dispatch')).toHaveLength(1);
    await expect.poll(async () => (await state(page)).packets.some(packet => packet.owner === 'blue')).toBe(true);
  });
});

test('built standalone file plays offline without attempting any network requests', async ({ page, context }) => {
  const standalone = process.env.STANDALONE_PATH ?? resolve('dist/领土战争.html');
  test.skip(!existsSync(standalone), 'Run npm run build before offline artifact verification');
  const network: string[] = [], errors: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await context.setOffline(true);
  await startBattle(page, pathToFileURL(standalone).href);
  const { from, to } = await sourceAndTarget(page);
  await drag(page, from, to);
  expect((await replay(page)).commands.filter(command => command.kind === 'dispatch')).toHaveLength(1);
  await expect.poll(async () => (await state(page)).packets.some(packet => packet.owner === 'blue')).toBe(true);
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});
