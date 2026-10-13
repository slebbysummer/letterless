// 2-agent games are co-op: every cracked word adds to one shared team score.
import { expect, test, type Browser, type Page } from '@playwright/test';

async function agent(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#agent').fill(name);
  return page;
}

test('a 2-agent game is co-op with a shared team score', async ({ browser }) => {
  const fox = await agent(browser, 'Fox');
  await fox.getByRole('button', { name: 'Open a new case' }).click();
  const code = (await fox.getByTestId('case-code').textContent())!.trim();
  const moth = await agent(browser, 'Moth');
  await moth.locator('#code').fill(code);
  await moth.getByRole('button', { name: 'Join' }).click();
  await fox.getByRole('button', { name: 'Begin mission' }).click();

  // Fox gives clues first; Moth cracks two words
  const secret = fox.getByTestId('secret-word');
  await expect(fox.getByRole('button', { name: 'Space' })).toBeEnabled({ timeout: 10_000 });
  let previous = '';
  for (let i = 0; i < 2; i++) {
    await expect(secret).not.toHaveText(/·/);
    if (previous) await expect(secret).not.toHaveText(previous);
    const word = (await secret.textContent())!.trim();
    await moth.keyboard.type(word.toLowerCase());
    await moth.keyboard.press('Enter');
    await expect(moth.getByTestId('last-word')).toContainText(`${word}, cracked by you`);
    await expect(moth.getByTestId('last-word')).toContainText('+1 team');
    previous = word;
  }
  await expect(moth.getByText('Team score: 2')).toBeVisible();

  await fox.getByRole('button', { name: 'Case menu' }).click();
  await fox.getByRole('button', { name: 'End mission for everyone' }).click();
  await fox.getByRole('button', { name: 'Yes, end mission' }).click();

  const board = moth.getByTestId('leaderboard');
  await expect(board).toContainText('Co-op mission');
  await expect(moth.getByTestId('team-score')).toHaveText('2');
  await expect(board).toContainText("On Agent Fox's turns2");
  await expect(board).toContainText("On Agent Moth's turns0");
  await moth.screenshot({ path: 'test-results/screens/8-duo-debrief.png' });
});
