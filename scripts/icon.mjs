// Renders media/icon.svg to media/icon.png (128×128 @1x is what the Marketplace shows).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(root, 'media', 'icon.svg')).href);
await page.screenshot({ path: join(root, 'media', 'icon.png'), omitBackground: true });
await browser.close();
console.log('✓ media/icon.png');
