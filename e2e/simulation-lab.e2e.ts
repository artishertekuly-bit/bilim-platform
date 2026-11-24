import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_PARAMS, STAY_PLAN, simulateNomadSeasons } from '../src/modules/simulation-lab/domain/nomad-seasons/model';

const LAB = '/dev/lab/nomad-seasons';

async function predict(page: Page, label: string) {
  await page.locator('label', { hasText: label }).first().click();
}

async function expectMetrics(page: Page, season: string, herd: number) {
  await expect(page.getByTestId('metric-season')).toHaveText(season);
  await expect(page.getByTestId('metric-herd')).toHaveText(`${herd} бас`);
}

test.describe('Simulation Lab: nomad seasons', () => {
  // Warm the dev server once so the first real test does not pay for the cold compile.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await browser.newPage();
    await page.goto(LAB);
    await page.getByTestId('lab-stage').waitFor({ timeout: 230_000 });
    await page.close();
  });

  test('requires a prediction, then steps through seasons with deterministic readings and resets', async ({ page }) => {
    const expected = simulateNomadSeasons(DEFAULT_PARAMS);
    await page.goto(LAB);
    await expect(page.getByRole('heading', { name: 'Көшпелілердің маусымдық көші' })).toBeVisible();

    const start = page.getByRole('button', { name: 'Бастау', exact: true });
    const next = page.getByRole('button', { name: 'Келесі маусым' });
    await expect(start).toBeDisabled();
    await expect(next).toBeDisabled();

    await predict(page, 'Көбейеді');
    await expect(next).toBeEnabled();

    await next.click();
    await expectMetrics(page, '1-жыл · Көктем', expected.steps[0].herdEnd);
    await expect(page.getByTestId('metric-fed')).toHaveText(`${expected.steps[0].fedPct}%`);
    await expect(page.getByTestId('metric-change')).toHaveText(`0 / +${expected.steps[0].born}`);

    for (let i = 0; i < 3; i += 1) await next.click();
    await expectMetrics(page, '1-жыл · Қыс', expected.steps[3].herdEnd);
    await expect(page.getByTestId('metric-pasture')).toHaveText('Қыстау');
    await expect(page.getByTestId('metric-grass')).toHaveText(`${expected.steps[3].grassPct.kystau}%`);

    await page.getByRole('button', { name: 'Қайта бастау' }).click();
    await expectMetrics(page, '1-жыл · Көктем', DEFAULT_PARAMS.herd);
    await expect(page.getByTestId('metric-fed')).toHaveText('—');
  });

  test('supports keyboard control of the timeline', async ({ page }) => {
    const expected = simulateNomadSeasons(DEFAULT_PARAMS);
    await page.goto(LAB);
    await predict(page, 'Көбейеді');

    const scene = page.getByTestId('lab-stage').getByRole('img').first();
    await scene.focus();
    await page.keyboard.press('ArrowRight');
    await expectMetrics(page, '1-жыл · Көктем', expected.steps[0].herdEnd);
    await page.keyboard.press('End');
    await expectMetrics(page, '3-жыл · Қыс', expected.finalHerd);
    await expect(page.getByTestId('lab-result')).toContainText('Болжамың расталды');
    await page.keyboard.press('Home');
    await expectMetrics(page, '1-жыл · Көктем', DEFAULT_PARAMS.herd);

    const timeline = page.getByLabel(/Уақыт сызығы/);
    await timeline.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('metric-season')).toHaveText('1-жыл · Жаз');
  });

  test('shows the collapse of a herd that never moves, matching the model', async ({ page }) => {
    const expected = simulateNomadSeasons({ ...DEFAULT_PARAMS, plan: { ...STAY_PLAN } });
    await page.goto(LAB);
    await page.getByRole('button', { name: 'Бір жерде' }).click();
    await predict(page, 'Азаяды');
    await page.getByTestId('lab-stage').getByRole('img').first().focus();
    await page.keyboard.press('End');

    await expect(page.getByTestId('metric-herd')).toHaveText(`${expected.finalHerd} бас`);
    const result = page.getByTestId('lab-result');
    await expect(result).toContainText('Мал шаруашылығы күйреді');
    await expect(result).toContainText(`${expected.initialHerd}-ден ${expected.finalHerd}-ге азайды`);
    await expect(result).toContainText('Болжамың расталды');
  });

  test('runs the knowledge check and prepares a compact tutor summary without saving in the harness', async ({ page }) => {
    const rpcCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/')) rpcCalls.push(request.url());
    });
    const expected = simulateNomadSeasons(DEFAULT_PARAMS);

    await page.goto(LAB);
    await expect(page.getByTestId('lab-check')).toBeVisible();
    await expect(page.getByText('Сұрақ үш жылдық көш аяқталғанда ашылады.')).toBeVisible();

    await predict(page, 'Көбейеді');
    await page.getByTestId('lab-stage').getByRole('img').first().focus();
    await page.keyboard.press('End');

    await page.locator('label', { hasText: 'Жайлауда жазда шөп шүйгін' }).click();
    await page.getByRole('button', { name: 'Жауапты тексеру' }).click();
    await expect(page.getByText(/^Дұрыс!/)).toBeVisible();

    await page.getByText('Тьюторға не жіберіледі?').click();
    const summary = JSON.parse((await page.getByTestId('lab-tutor-summary').textContent()) ?? '{}');
    expect(summary.sim).toBe('nomad-seasons@1');
    expect(summary.result.finalHerd).toBe(expected.finalHerd);
    expect(summary.check).toEqual({ answer: 'rest', correct: true });
    expect(summary.hypothesisConfirmed).toBe(true);

    expect(rpcCalls.filter((url) => url.includes('save_simulation_attempt'))).toEqual([]);
  });

  test('falls back to the 2D map in low-end mode', async ({ page }) => {
    await page.goto(`${LAB}?renderer=2d`);
    const stage = page.getByTestId('lab-stage');
    await expect(stage).toHaveAttribute('data-renderer', '2d');
    await expect(page.getByTestId('lab-map-2d')).toBeVisible();
    await expect(stage.locator('canvas')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Жеңіл режим (2D)' })).toHaveAttribute('aria-pressed', 'true');

    await predict(page, 'Көбейеді');
    await page.getByRole('button', { name: 'Келесі маусым' }).click();
    await expect(page.getByTestId('lab-map-camp')).toBeVisible();
  });

  test('shows the 2D fallback with a notice when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto(LAB);
    await expect(page.getByTestId('lab-stage')).toHaveAttribute('data-renderer', '2d');
    await expect(page.getByText('3D көрініс бұл құрылғыда іске қосылмады')).toBeVisible();
    await expect(page.getByTestId('lab-map-2d')).toBeVisible();
  });

  test('renders the 3D canvas when WebGL works', async ({ page }) => {
    await page.goto(LAB);
    const stage = page.getByTestId('lab-stage');
    const renderer = await stage.getAttribute('data-renderer');
    test.skip(renderer !== '3d', 'This browser has no WebGL; the fallback test covers it.');
    await expect(stage.locator('canvas')).toHaveCount(1);
    await expect(page.getByText('3D көрініс бұл құрылғыда іске қосылмады')).toHaveCount(0);
  });

  test('keeps the page within the viewport width', async ({ page }) => {
    await page.goto(LAB);
    await expect(page.getByTestId('lab-stage')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('shows a not-found state for an unknown simulation', async ({ page }) => {
    await page.goto('/dev/lab/unknown-sim');
    await expect(page.getByRole('heading', { name: 'Симуляция табылмады' })).toBeVisible();
  });
});
