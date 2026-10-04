import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameMap, GameState, Replay } from '../src/sim/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).lingtu.getState());
const replay = (page: Page): Promise<Replay> => page.evaluate(() => (window as any).lingtu.getReplay());
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lingtu-replica-v1')!));

async function point(page: Page, id: string) {
  const map: GameMap = await page.evaluate(() => (window as any).lingtu.getScene());
  const anchor = map.nodes.find(node => node.id === id)!.anchor;
  const box = (await page.locator('#battle').boundingBox())!;
  return { x: box.x + anchor.x / map.width * box.width, y: box.y + anchor.y / map.height * box.height };
}
async function drag(page: Page, sourceId: string, targetId: string) {
  const from = await point(page, sourceId), to = await point(page, targetId);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
}
async function startContinuous(page: Page) {
  await page.goto('/');
  await page.locator('#home-settings').click();
  await expect(page.locator('#dispatch-mode')).toHaveValue('budget');
  await page.locator('#dispatch-mode').selectOption('continuous');
  await expect(page.locator('#fraction')).toBeDisabled();
  await page.locator('#close').click();
  await page.locator('#practice').click(); await page.locator('#start').click();
  await expect(page.locator('#command-settings')).toContainText('持续派兵');
  const nodes = (await state(page)).nodes;
  return { source: nodes.find(node => node.owner === 'blue')!, target: nodes.find(node => node.id === 'L_W')! };
}
const emitted = (s: GameState, sourceId: string) => s.ledger.filter(event => event.kind === 'emit' && event.nodeId === sourceId).reduce((sum, event) => sum + event.units, 0);

async function exportPracticeReplay(page: Page, info: TestInfo) {
  await page.goto('/');
  await page.locator('#practice').click(); await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(3);
  await page.locator('#back').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = info.outputPath('pending-import.json');
  await (await downloadPromise).saveAs(file);
  await page.locator('#return').click();
  return file;
}

async function delayFileRead(page: Page) {
  // Inject latency only at the browser file API. Replay contents and all game
  // operations still come from a real export and normal UI interactions.
  await page.evaluate(() => {
    const read = File.prototype.text;
    const probe = { started: false, release: undefined as undefined | (() => Promise<void>) };
    (window as any).delayedFileRead = probe;
    File.prototype.text = function () {
      probe.started = true;
      return new Promise<string>((resolve, reject) => {
        probe.release = () => read.call(this).then(resolve, reject);
      });
    };
  });
}

async function finishFileRead(page: Page) {
  await page.evaluate(async () => {
    await (window as any).delayedFileRead.release();
    // Let the waiting change handler and the next browser task complete.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

test('legacy save keeps progress and defaults to single dispatch; mode and fraction persist independently', async ({ page }) => {
  await page.goto('/');
  await page.locator('#upgrade-units').click();
  const old = await saved(page);
  expect(old.profile.unitLevel).toBe(2);
  // Reproduce a real pre-feature save by removing only the newly introduced preferences.
  delete old.dispatchMode; delete old.dispatchFraction;
  await page.evaluate(value => localStorage.setItem('lingtu-replica-v1', JSON.stringify(value)), old);
  await page.reload();
  expect((await saved(page)).profile.unitLevel).toBe(2);
  await page.locator('#home-settings').click();
  await expect(page.locator('#dispatch-mode')).toHaveValue('budget');
  await expect(page.locator('#fraction')).toHaveValue('1');
  await page.locator('#fraction').selectOption('0.5');
  await page.locator('#dispatch-mode').selectOption('continuous');
  await expect(page.locator('#fraction')).toBeDisabled();
  await page.reload(); await page.locator('#home-settings').click();
  await expect(page.locator('#dispatch-mode')).toHaveValue('continuous');
  await expect(page.locator('#fraction')).toHaveValue('0.5');
  await page.locator('#dispatch-mode').selectOption('budget');
  await expect(page.locator('#fraction')).toBeEnabled();
  expect((await saved(page)).profile.coins).toBe(old.profile.coins);
});

test('continuous route exceeds the initial budget, duplicate orders do not multiply emission, and redirect/stop preserve travelling troops', async ({ page }, info) => {
  test.setTimeout(45_000);
  const { source, target } = await startContinuous(page);
  const initial = (await state(page)).nodes.find(node => node.id === source.id)!.garrison;
  await drag(page, source.id, target.id);
  await expect(page.locator('#command-routes g path')).toHaveCount(1);
  const before = await state(page);
  for (let i = 0; i < 3; i++) await drag(page, source.id, target.id);
  await expect.poll(async () => emitted(await state(page), source.id), { timeout: 22_000 }).toBeGreaterThan(initial);
  const after = await state(page);
  const sourceQueues = after.queues.filter(queue => queue.sourceId === source.id);
  expect(sourceQueues).toHaveLength(1);
  expect(sourceQueues[0]).toMatchObject({ mode: 'continuous', targetId: target.id, remainingBudget: 0 });
  const config = (await replay(page)).config;
  expect(emitted(after, source.id) - emitted(before, source.id)).toBeLessThanOrEqual(Math.ceil((after.tick - before.tick) / config.tickRate * config.emitUnitsPerSecond) + config.packetUnits);
  expect((await replay(page)).version).toBe(2);
  const replacement = after.nodes.find(node => node.owner === 'neutral' && node.id !== target.id)!;
  await drag(page, source.id, replacement.id);
  expect((await state(page)).queues.filter(queue => queue.sourceId === source.id)).toHaveLength(1);
  expect((await state(page)).queues.find(queue => queue.sourceId === source.id)?.targetId).toBe(replacement.id);
  await expect(page.locator('#command-routes g path')).toHaveCount(1);
  const sourcePoint = await point(page, source.id);
  await page.mouse.click(sourcePoint.x, sourcePoint.y);
  await expect(page.locator('#stop-orders')).toBeVisible();
  await page.screenshot({ path: info.outputPath('continuous-selected-390.png') });
  await page.locator('#stop-orders').click();
  const stopped = await state(page);
  const travelling = stopped.packets.filter(packet => packet.sourceId === source.id).map(packet => packet.id);
  expect(travelling.length).toBeGreaterThan(0);
  expect(stopped.queues.filter(queue => queue.sourceId === source.id)).toHaveLength(0);
  await expect(page.locator('#command-routes g path')).toHaveCount(0);
  await page.waitForTimeout(700);
  const later = await state(page);
  expect(emitted(later, source.id)).toBe(emitted(stopped, source.id));
  expect(later.packets.some(packet => travelling.includes(packet.id))).toBe(true);
});

test('pause stops all routes and exported v2 replay imports exactly while refusing live commands', async ({ page }, info) => {
  const { source, target } = await startContinuous(page);
  await drag(page, source.id, target.id);
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(80);
  await page.locator('#back').click();
  await page.locator('#stop-all').click();
  const expected = await state(page);
  expect(expected.queues.filter(queue => queue.owner === 'blue')).toHaveLength(0);
  const exported = await replay(page);
  expect(exported.version).toBe(2);
  expect(exported.commands.some(command => command.kind === 'dispatch' && command.mode === 'continuous')).toBe(true);
  expect(exported.commands.some(command => command.kind === 'cancel')).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = info.outputPath('continuous-v2.json');
  await (await downloadPromise).saveAs(file);
  await page.locator('#return').click();
  const profileBefore = (await saved(page)).profile;
  await page.locator('#home-settings').click();
  await page.locator('#replay-file').setInputFiles(file);
  await expect(page.locator('#battle-note')).toContainText('不接受操作');
  await drag(page, source.id, target.id);
  await expect(page.locator('#command-settings')).toBeHidden();
  await expect(page.locator('#stop-orders')).toBeHidden();
  await expect(page.locator('#replay-home')).toBeVisible();
  expect(await state(page)).toEqual(expected);
  expect((await replay(page)).commands).toEqual(exported.commands);
  expect((await saved(page)).profile).toEqual(profileBefore);
});

test.describe('touch route controls', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('mode, route and stop controls remain reachable on the smallest supported portrait viewport', async ({ page }, info) => {
    const { source, target } = await startContinuous(page);
    const from = await point(page, source.id), to = await point(page, target.id);
    await page.touchscreen.tap(from.x, from.y); await page.touchscreen.tap(to.x, to.y);
    await expect(page.locator('#command-routes g path')).toHaveCount(1);
    await page.touchscreen.tap(from.x, from.y);
    for (const id of ['command-settings', 'stop-orders']) {
      const box = (await page.locator(`#${id}`).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(321); expect(box.y + box.height).toBeLessThanOrEqual(569);
      const topmost = await page.evaluate(({ x, y, id }) => document.elementFromPoint(x, y)?.closest('button')?.id === id, { x: box.x + box.width / 2, y: box.y + box.height / 2, id });
      expect(topmost).toBe(true);
    }
    await page.screenshot({ path: info.outputPath('continuous-selected-320.png') });
    await page.locator('#stop-orders').tap();
    expect((await state(page)).queues.filter(queue => queue.sourceId === source.id)).toHaveLength(0);
    await page.locator('#command-settings').tap();
    const frozen = (await state(page)).tick;
    await page.waitForTimeout(300);
    expect((await state(page)).tick).toBe(frozen);
    await expect(page.locator('#dispatch-mode')).toHaveValue('continuous');
  });
});

test('another home tab refreshes the visible upgrade and wallet without overwriting new progress', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage(); await other.goto('/');
  await expect(other.locator('.upgrade-description em').first()).toHaveText('Lv1');
  await page.locator('#upgrade-units').click();
  await expect(other.locator('.upgrade-description em').first()).toHaveText('Lv2');
  await expect(other.locator('.wallet').last().locator('b')).toHaveText('150');
  await other.locator('#home-settings').click();
  await other.locator('#dispatch-mode').selectOption('continuous');
  const latest = await saved(page);
  expect(latest.profile.unitLevel).toBe(2);
  expect(latest.profile.coins).toBe(150);
  expect(latest.dispatchMode).toBe('continuous');
  await other.close();
});

test('another tab update suspends an open panel until the player reloads the latest saved progress', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage(); await other.goto('/');
  await other.locator('#home-settings').click();
  await page.locator('#upgrade-units').click();
  await expect(other.locator('#reload-save')).toBeVisible();
  const expectedSave = await saved(page);
  const tick = (await state(other)).tick;
  await other.keyboard.press('Space'); await other.keyboard.press('Escape');
  // The back control is hidden at home; the player cannot bypass the conflict with keys.
  await expect(other.locator('#reload-save')).toBeVisible();
  await page.waitForTimeout(300);
  expect((await state(other)).tick).toBe(tick);
  expect(await saved(page)).toEqual(expectedSave);
  await other.locator('#reload-save').click();
  await expect(other.locator('.upgrade-description em').first()).toHaveText('Lv2');
  await expect(other.locator('.wallet').last().locator('b')).toHaveText('150');
  expect(await saved(other)).toEqual(expectedSave);
  expect(await saved(page)).toEqual(expectedSave);
  await other.close();
});

test('opening a second home tab does not write the save or interrupt a full-energy practice battle with a conflict', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#practice').click(); await page.locator('#start').click();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(3);
  const before = await saved(page);
  expect(before.profile.energy).toBe(20);
  const other = await context.newPage(); await other.goto('/');
  await expect(other.locator('#campaign-start')).toBeVisible();
  await expect(page.locator('#reload-save')).toBeHidden();
  expect(await page.evaluate(() => (window as any).lingtu.getMode())).toMatch(/^(playing|paused)$/);
  expect(await saved(page)).toEqual(before);
  expect(await saved(other)).toEqual(before);
  // Give storage events a full task turn, then confirm no delayed conflict.
  await page.waitForTimeout(200);
  await expect(page.locator('#reload-save')).toBeHidden();
  expect(await saved(page)).toEqual(before);
  await other.close();
});

test('a delayed replay import cannot override a newer save conflict from another tab', async ({ page, context }, info) => {
  const file = await exportPracticeReplay(page, info);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await delayFileRead(page);
  await page.locator('#home-settings').click();
  await page.locator('#replay-file').setInputFiles(file);
  await page.waitForFunction(() => (window as any).delayedFileRead.started);
  const other = await context.newPage(); await other.goto('/');
  await other.locator('#upgrade-units').click();
  await expect(page.locator('#reload-save')).toBeVisible();
  const latest = await saved(other);
  expect(latest.profile.unitLevel).toBe(2);
  expect(latest.profile.coins).toBe(150);
  const frozen = await state(page);
  await finishFileRead(page);
  await expect(page.locator('#reload-save')).toBeVisible();
  expect(await page.evaluate(() => (window as any).lingtu.getMode())).toBe('conflict');
  expect(await state(page)).toEqual(frozen);
  expect(await saved(page)).toEqual(latest);
  expect(errors).toEqual([]);
  await other.close();
});

test('a delayed replay import cannot start after the player has left settings', async ({ page }, info) => {
  const file = await exportPracticeReplay(page, info);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const before = await saved(page);
  await delayFileRead(page);
  await page.locator('#home-settings').click();
  await page.locator('#replay-file').setInputFiles(file);
  await page.waitForFunction(() => (window as any).delayedFileRead.started);
  await page.locator('#close').click();
  await expect(page.locator('#campaign-start')).toBeVisible();
  await expect(page.locator('#replay-file')).toBeHidden();
  const homeState = await state(page);
  await finishFileRead(page);
  await expect(page.locator('#campaign-start')).toBeVisible();
  expect(await page.evaluate(() => (window as any).lingtu.getMode())).toBe('home');
  expect(await state(page)).toEqual(homeState);
  expect(await saved(page)).toEqual(before);
  expect(errors).toEqual([]);
});
