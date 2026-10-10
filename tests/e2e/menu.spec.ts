// Leaving mid-game and the host ending the mission early, from the in-game menu.
import { expect, test, type Browser, type Page } from '@playwright/test';

async function agent(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#agent').fill(name);
  return page;
}

test('an agent can leave mid-game and the host can end the mission', async ({ browser }) => {
  const fox = await agent(browser, 'Fox');
  await fox.screenshot({ path: 'test-results/screens/1-home.png' });
  await fox.getByRole('button', { name: 'Open a new case' }).click();
  const code = (await fox.getByTestId('case-code').textContent())!.trim();
  const others: Page[] = [];
  for (const name of ['Moth', 'Wren']) {
    const p = await agent(browser, name);
    await p.locator('#code').fill(code);
    await p.getByRole('button', { name: 'Join' }).click();
    await expect(p.getByText('Waiting room')).toBeVisible();
    others.push(p);
  }
  const [moth, wren] = others;
  await fox.getByRole('button', { name: 'Begin mission' }).click();
  await expect(moth.getByRole('button', { name: 'Case menu' })).toBeVisible();

  // Moth leaves: a confirm step, then back to the home page
  await moth.getByRole('button', { name: 'Case menu' }).click();
  await expect(moth.getByRole('button', { name: 'End mission for everyone' })).toHaveCount(0); // host only
  await moth.getByRole('button', { name: 'Leave case' }).click();
  await moth.getByRole('button', { name: 'Yes, leave case' }).click();
  await expect(moth.getByRole('button', { name: 'Open a new case' })).toBeVisible();

  // Fox (host) ends the mission: everyone still in goes to the debrief
  await fox.getByRole('button', { name: 'Case menu' }).click();
  await fox.screenshot({ path: 'test-results/screens/7-menu-host.png' });
  await fox.getByRole('button', { name: 'End mission for everyone' }).click();
  await fox.getByRole('button', { name: 'Yes, end mission' }).click();
  for (const p of [fox, wren]) await expect(p.getByText('CASE CLOSED')).toBeVisible();
  await expect(fox.getByTestId('leaderboard')).toContainText('Agent Moth (left)');
});
