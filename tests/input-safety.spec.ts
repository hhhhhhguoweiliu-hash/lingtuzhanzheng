import { expect, test, type Page } from '@playwright/test';
import type { GameMap, GameState, Replay } from '../src/sim/types';

const state = (page: Page): Promise<GameState> => page.evaluate(() => (window as any).lingtu.getState());
const replay = (page: Page): Promise<Replay> => page.evaluate(() => (window as any).lingtu.getReplay());
async function start(page: Page) {
  await page.goto('/'); await page.locator('#practice').click(); await page.locator('#start').click();
  const map: GameMap = await page.evaluate(() => (window as any).lingtu.getScene());
  const nodes = (await state(page)).nodes;
  const source = nodes.find(node => node.owner === 'blue')!;
  const target = nodes.find(node => node.id === 'L_W')!;
  const other = nodes.find(node => node.owner === 'magenta')!;
  const box = (await page.locator('#battle').boundingBox())!;
  const at = (node: typeof source) => ({ x: box.x + node.anchor.x / map.width * box.width, y: box.y + node.anchor.y / map.height * box.height });
  return { source, target, from: at(source), to: at(target), other: at(other) };
}
test('right mouse button cannot select or dispatch, and a subsequent left drag still works', async ({ page }) => {
  const { source, target, from, to } = await start(page);
  await page.mouse.click(from.x, from.y, { button: 'right' });
  await expect(page.locator('#selection-note')).toBeEmpty();
  await page.mouse.move(from.x, from.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up({ button: 'right' });
  expect((await replay(page)).commands).toHaveLength(0);
  // Escape is a game pause shortcut, so it must not be used to dismiss a
  // browser menu in this input test. A regular left drag is the next action.
  expect(await page.evaluate(() => (window as any).lingtu.getMode())).toBe('playing');
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
  const commands = (await replay(page)).commands.filter(command => command.kind === 'dispatch');
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ sourceId: source.id, targetId: target.id });
});

test.describe('real browser multitouch', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('secondary finger does not steal the primary drag or cancel it when lifted first', async ({ page, context }, info) => {
    const { source, target, from, to, other } = await start(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      (window as any).pointerEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) {
        document.querySelector('#battle')!.addEventListener(type, event => {
          const pointer = event as PointerEvent;
          (window as any).pointerEvents.push({ type, pointerId: pointer.pointerId, isPrimary: pointer.isPrimary, x: pointer.clientX, y: pointer.clientY });
        });
      }
    });
    const cdp = await context.newCDPSession(page);
    const a = { ...from, id: 1, radiusX: 3, radiusY: 3, force: 1 };
    const b = { ...other, id: 2, radiusX: 3, radiusY: 3, force: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
    const moved = { ...a, ...to };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved, b] });
    // In CDP, a nonempty touchEnd list identifies the contacts to end, not
    // those to keep down. End b first and verify the browser's actual events.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b] });
    const firstLift = await page.evaluate(() => (window as any).pointerEvents) as { type: string; isPrimary: boolean }[];
    await info.attach('pointer-events-after-first-lift', { body: JSON.stringify(firstLift, null, 2), contentType: 'application/json' });
    expect(firstLift.filter(event => event.type === 'pointerup').map(event => event.isPrimary)).toEqual([false]);
    expect(firstLift.some(event => event.type === 'lostpointercapture' && !event.isPrimary)).toBe(true);
    expect((await replay(page)).commands).toHaveLength(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const bothLifts = await page.evaluate(() => (window as any).pointerEvents) as { type: string; isPrimary: boolean }[];
    expect(bothLifts.filter(event => event.type === 'pointerup').map(event => event.isPrimary)).toEqual([false, true]);
    const commands = (await replay(page)).commands.filter(command => command.kind === 'dispatch');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ sourceId: source.id, targetId: target.id });
    expect(errors).toEqual([]);
    await cdp.detach();
  });

  test('browser touch cancellation releases the gesture and the next real touch can dispatch', async ({ page, context }) => {
    const { source, target, from, to } = await start(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect((await replay(page)).commands).toHaveLength(0);
    await expect(page.locator('#selection-note')).toBeEmpty();
    await page.touchscreen.tap(from.x, from.y); await page.touchscreen.tap(to.x, to.y);
    const commands = (await replay(page)).commands.filter(command => command.kind === 'dispatch');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ sourceId: source.id, targetId: target.id });
    expect(errors).toEqual([]);
    await cdp.detach();
  });
});
