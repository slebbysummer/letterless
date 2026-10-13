// Renders scripts/og/og.html to public/og-image.png (1200x630), the link-preview image,
// and public/favicon.svg to public/apple-touch-icon.png (180x180) for iPhone home screens.
// Usage: node scripts/og/make-og.mjs
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: new URL('../../public/og-image.png', import.meta.url).pathname });

const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.goto(new URL('../../public/favicon.svg', import.meta.url).href);
await icon.screenshot({ path: new URL('../../public/apple-touch-icon.png', import.meta.url).pathname });
await browser.close();
console.log('Wrote public/og-image.png and public/apple-touch-icon.png');
