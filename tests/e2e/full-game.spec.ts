// A full 4-agent mission in four separate browser "phones", plus a late
// spectator, a refresh mid-turn, locked keys, a pass, play-again and host
// handover. It also records every byte each phone receives and checks that no
// secret word reached a guesser before it was revealed.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => l.split('=').map((s) => s.trim())),
);

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` });

interface Agent { name: string; page: Page; traffic: string[] }

async function newAgent(browser: Browser, name: string): Promise<Agent> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const agent: Agent = { name, page, traffic: [] };
  page.on('websocket', (ws) => ws.on('framereceived', (f) => agent.traffic.push(String(f.payload))));
  page.on('response', async (r) => {
    if (!r.url().includes('supabase.co')) return;
    try { agent.traffic.push(await r.text()); } catch { /* redirects / aborted */ }
  });
  page.on('pageerror', (e) => console.error(`[${name}] page error`, e));
  await page.goto('/');
  await page.locator('#agent').fill(name);
  return agent;
}

async function waitForGiver(agents: Agent[]): Promise<Agent> {
  for (let i = 0; i < 300; i++) {
    for (const a of agents) if (await a.page.getByTestId('secret-word').isVisible().catch(() => false)) return a;
    await agents[0].page.waitForTimeout(100);
  }
  throw new Error('No clue-giver screen appeared');
}

async function readSecret(page: Page, previous: string): Promise<string> {
  const el = page.getByTestId('secret-word');
  await expect(el).not.toHaveText(/·/);
  await expect(el).not.toHaveText(previous || '\u0000');
  return (await el.textContent())!.trim();
}

const clueFor = (word: string) =>
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((c) => !word.includes(c)).slice(0, 6).join('') + '!';

async function guess(a: Agent, text: string) {
  await a.page.locator('#guess').fill(text);
  await a.page.locator('#guess').press('Enter');
}

async function rest(page: Page, path: string, init: RequestInit = {}) {
  return page.evaluate(async ({ url, key, path, init }) => {
    const session = JSON.parse(sessionStorage.getItem('letterless-auth')!);
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init, headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    });
    return { status: res.status, body: await res.text() };
  }, { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, path, init });
}

test('four agents play a full mission', async ({ browser }) => {
  const names = ['Fox', 'Moth', 'Badger', 'Wren'];
  const agents: Agent[] = [];
  for (const n of names) agents.push(await newAgent(browser, n));
  const [fox] = agents;
  const byName = (n: string) => agents.find((a) => a.name === n)!;
  await shot(fox.page, '1-home');
  await fox.page.getByRole('button', { name: /HOW TO PLAY/ }).click();
  await shot(fox.page, '1b-how-to-play');
  await fox.page.getByRole('button', { name: 'Close how to play' }).click();

  // ---- Home: validation, then open a case
  await fox.page.locator('#agent').fill('F0x');
  await expect(fox.page.locator('#agent')).toHaveValue('Fx');
  await fox.page.locator('#agent').fill('Fox');
  await fox.page.getByRole('button', { name: 'Open a new case' }).click();
  const code = (await fox.page.getByTestId('case-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  // Duplicate codename is refused
  const dup = await newAgent(browser, 'fox');
  await dup.page.locator('#code').fill(code);
  await dup.page.getByRole('button', { name: 'Join' }).click();
  await expect(dup.page.getByRole('alert')).toContainText('already on this case');
  await dup.page.context().close();

  for (const a of agents.slice(1)) {
    await a.page.locator('#code').fill(code.toLowerCase());
    await a.page.getByRole('button', { name: 'Join' }).click();
    await expect(a.page.getByText('Waiting room')).toBeVisible();
  }
  await expect(fox.page.getByText('4 / 10')).toBeVisible();
  await expect(byName('Moth').page.getByRole('button', { name: 'Waiting for the host' })).toBeDisabled();

  // ---- Host settings: 1 round, 45s
  await fox.page.getByRole('group', { name: 'Rounds' }).getByRole('button', { name: '1' }).click();
  await fox.page.getByRole('group', { name: 'Turn length' }).getByRole('button', { name: '45s' }).click();
  await expect(byName('Wren').page.getByRole('group', { name: 'Turn length' }).getByRole('button', { name: '45s' }))
    .toHaveAttribute('aria-pressed', 'true');
  await shot(fox.page, '2-waiting-room');
  await fox.page.getByRole('button', { name: 'Begin mission' }).click();

  const givers: Record<string, string> = {}; // word -> giver name
  let spectator: Agent | null = null;
  let totalCracked = 0;

  for (let t = 0; t < 4; t++) {
    const giver = await waitForGiver(agents);
    const guessers = agents.filter((a) => a !== giver);
    await expect(guessers[0].page.getByText(`Agent ${giver.name} is describing`)).toBeVisible();

    // Briefing: guessers see bars, not the word
    let word = await readSecret(giver.page, '');
    givers[word] = giver.name;
    await expect(guessers[0].page.getByTestId('bars').locator('span')).toHaveCount(word.length);

    // Anti-cheat: a guesser cannot read the secret or the word list, or write directly
    const secrets = await rest(guessers[0].page, 'word_secrets?select=word');
    expect(JSON.parse(secrets.body)).toEqual([]);
    const list = await rest(guessers[0].page, 'words?select=word&limit=1');
    expect(list.status).not.toBe(200);
    const write = await rest(guessers[0].page, 'clues', { method: 'POST', body: JSON.stringify({ text: 'HI' }) });
    expect(write.status).toBeGreaterThanOrEqual(400);

    await expect(giver.page.locator('#clue')).toBeEnabled({ timeout: 10_000 });

    if (t === 0) {
      // A latecomer becomes a spectator
      spectator = await newAgent(browser, 'Owl');
      await spectator.page.locator('#code').fill(code);
      await spectator.page.getByRole('button', { name: 'Join' }).click();
      await expect(spectator.page.getByText("You're watching as a spectator")).toBeVisible();
    }

    let turnCracked = 0;
    for (let k = 0; k < 3; k++) {
      // Locked key: a banned letter does nothing and explains why
      await giver.page.locator('#clue').pressSequentially(word[0].toLowerCase());
      await expect(giver.page.locator('#clue-note')).toContainText(`${word[0]} is redacted. That key is locked.`);
      await expect(giver.page.locator('#clue')).toHaveValue('');

      const clue = clueFor(word);
      await giver.page.locator('#clue').fill(clue);
      await giver.page.locator('#clue').press('Enter');
      await expect(guessers[0].page.getByTestId('clues')).toContainText(clue);

      // A wrong guess is visible to everyone, including the giver
      await guess(guessers[1], 'qwzx');
      await expect(giver.page.locator('.list')).toContainText('qwzx');
      await expect(guessers[2].page.locator('.list')).toContainText('qwzx');

      if (t === 0 && k === 1) {
        await giver.page.getByRole('button', { name: /Pass · 1 left/ }).click();
        await expect(giver.page.getByRole('button', { name: /Pass · used/ })).toBeDisabled();
        await expect(guessers[0].page.getByTestId('last-word')).toContainText(`${word}, passed`);
        word = await readSecret(giver.page, word);
        givers[word] = giver.name;
        continue;
      }

      if (t === 0 && k === 2) {
        await giver.page.locator('#clue').pressSequentially(word[0].toLowerCase());
        await shot(giver.page, '3-clue-giver');
        await shot(guessers[0].page, '4-guesser');
      }

      if (t === 1 && k === 1) {
        // Refresh mid-turn: the phone picks up where it left off
        await guessers[0].page.reload();
        await expect(guessers[0].page.getByTestId('bars')).toBeVisible();
      }

      const cracker = guessers[k % guessers.length];
      await guess(cracker, ` ${word.toLowerCase()} `);
      totalCracked++;
      turnCracked++;
      await expect(cracker.page.getByTestId('last-word')).toContainText(`${word}, cracked by you`);
      await expect(guessers.find((g) => g !== cracker)!.page.getByTestId('last-word'))
        .toContainText(`cracked by Agent ${cracker.name}`);
      await expect(giver.page.getByTestId('cracked-count')).toHaveText(String(turnCracked));
      word = await readSecret(giver.page, word);
      givers[word] = giver.name;
    }

    // Clock runs out: everyone sees the turn report
    for (const a of agents) await expect(a.page.getByTestId('turn-report')).toBeVisible({ timeout: 60_000 });
    await expect(fox.page.getByTestId('turn-report')).toContainText(`Agent ${giver.name} cracked`);
    if (t < 3) await expect(fox.page.getByTestId('next-agent')).toBeVisible();
    if (t === 0) await shot(fox.page, '5-between-turns');
  }

  // ---- Debrief
  for (const a of agents) await expect(a.page.getByText('CASE CLOSED')).toBeVisible({ timeout: 30_000 });
  const rows = fox.page.getByTestId('leaderboard').locator('.board-row:not(.head)');
  await expect(rows).toHaveCount(4);
  let gave = 0;
  let cracked = 0;
  for (const row of await rows.all()) {
    const nums = await row.locator('.num').allTextContents();
    gave += Number(nums[0]);
    cracked += Number(nums[1]);
  }
  expect(gave).toBe(totalCracked);
  expect(cracked).toBe(totalCracked);
  await expect(fox.page.getByText('Hardest crack')).toBeVisible();
  await shot(fox.page, '6-debrief');

  // ---- Anti-cheat: no word reached a guesser before it was revealed
  for (const a of [...agents, spectator!]) {
    for (const [w, giverName] of Object.entries(givers)) {
      if (giverName === a.name) continue;
      const first = a.traffic.find((s) => s.includes(`"${w}"`));
      if (!first) continue;
      const revealed = new RegExp(`"revealed_word":\\s*"${w}"`).test(first) || /"correct":\s*true/.test(first);
      expect(revealed,
        `${a.name} saw ${w} before it was revealed: ${first.slice(0, 300)}`).toBe(true);
    }
  }

  // ---- Play again: everyone (spectator included) is back in the waiting room
  await fox.page.getByRole('button', { name: 'Play again, same agents' }).click();
  for (const a of [...agents, spectator!]) await expect(a.page.getByText('Waiting room')).toBeVisible();
  await expect(fox.page.getByText('5 / 10')).toBeVisible();

  // ---- Host leaves: hosting passes to the next agent in turn order
  await fox.page.getByRole('button', { name: '< Leave case' }).click();
  await expect(fox.page.getByRole('button', { name: 'Open a new case' })).toBeVisible();
  const moth = byName('Moth').page;
  await expect(moth.getByText('4 / 10')).toBeVisible();
  await expect(moth.locator('.agents > div').filter({ hasText: 'Agent Moth' })).toContainText('HOST');
  await expect(moth.getByRole('button', { name: 'Begin mission' })).toBeEnabled();
});
