import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let context: BrowserContext;
let worker: Worker;
let settings: Page;
let reading: Page;
let server: Server;
let extensionId: string;
let origin: string;
let profile: string;
const requests: { messages: { role: string; content: string }[] }[] = [];
const errors: string[] = [];
test.describe.configure({ mode: 'serial' });
let slow = false;
let failure = false;
const article = `<!doctype html><html><head><title>Notes on attention</title><style>body{font:18px/1.85 Georgia,serif;background:#faf9f6;color:#28372f;margin:90px auto;max-width:760px;padding:0 35px}small{font:12px sans-serif;letter-spacing:2px;color:#637567}h1{font-weight:400;font-size:48px;line-height:1.2;margin:25px 0}p{margin:25px 0}footer{margin-top:100px;color:#728077}button{font:inherit}input{padding:10px}article{max-width:620px}</style></head><body><article><small>THE READING ROOM / FIELD NOTES 01</small><h1>A little more room<br>for understanding.</h1><p id="source">Attention is the beginning of understanding. When we slow down and ask better questions, familiar ideas reveal new possibilities.</p><p id="second">A good tool should disappear into the work. It supports your curiosity without interrupting the rhythm of reading.</p><input aria-label="Page input" value="Never capture private input"/><p contenteditable="true" id="editable">Do not capture editable text.</p><footer>Read thoughtfully. Stay curious.</footer></article></body></html>`;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const payload = JSON.parse(body); requests.push(payload);
        if (failure) { res.writeHead(429); res.end('mock quota'); return; }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        const followup = payload.messages.length > 2;
        const pieces = followup ? ['当然。', '可以把注意力理解为一束光，', '帮助我们看清重要的信息。'] : ['注意力是', '理解的起点。', '\n\n当我们放慢脚步，提出更好的问题，', '熟悉的想法也会展现新的可能。'];
        let index = 0;
        const interval = setInterval(() => {
          if (index < pieces.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[index++] } }] })}\n\n`);
          else { res.end('data: [DONE]\n\n'); clearInterval(interval); }
        }, slow ? 1800 : 160);
        res.on('close', () => clearInterval(interval));
      });
    } else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(article); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Mock server did not start');
  origin = `http://127.0.0.1:${address.port}`;
  profile = await mkdtemp(path.join(tmpdir(), 'selio-smoke-'));
  const extension = path.resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    ...(process.env.SELIO_CHROMIUM_PATH ? { executablePath: process.env.SELIO_CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1360, height: 900 },
  });
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  settings = await context.newPage();
  await settings.goto(`chrome-extension://${extensionId}/options.html`);
});
test.afterAll(async () => { await context?.close(); await new Promise<void>(resolve => server?.close(() => resolve())); if (profile) await rm(profile, { recursive: true, force: true }); });

async function select(page: Page, id = 'source') {
  await page.bringToFront();
  // A real selection starts outside the extension's focused textarea.
  await page.mouse.click(20, 20);
  await page.locator(`#${id}`).evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); });
  await expect(page.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true })).toBeVisible();
  const text = await page.locator(`#${id}`).innerText();
  await expect(page.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true })).toHaveAttribute('title', `Selio · ${text.slice(0, 60)}`);
}

test('install, configure, select, stream, follow up, preserve, cancel and recover', async () => {
  await expect(settings.getByRole('heading', { name: '连接一个模型' })).toBeVisible();
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.host_permissions ?? []).toEqual([]);
  expect(manifest.content_scripts ?? []).toEqual([]);
  expect(await worker.evaluate(() => chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] }))).toBe(false);
  // Set up user consent through Chromium's own extension settings API in this
  // disposable profile. Native permission dialogs are outside Playwright's DOM.
  // No extension APIs are mocked and the production manifest is not rewritten.
  const manager = await context.newPage();
  await manager.goto('chrome://extensions');
  await manager.evaluate(async ({ id, host }) => {
    const api = (chrome as unknown as { developerPrivate: { addHostPermission: (id: string, host: string) => Promise<void> } }).developerPrivate;
    await api.addHostPermission(id, host);
  }, { id: extensionId, host: `${origin}/*` });
  await manager.close();
  await settings.screenshot({ animations: 'disabled', path: 'test-results/settings-initial.png', fullPage: true });
  await settings.getByLabel('供应商').selectOption('custom');
  await settings.getByLabel('显示名称').fill('Local mock');
  await settings.getByLabel('Base URL', { exact: true }).fill(`${origin}/v1`);
  await settings.getByLabel('模型标识').fill('selio-mock');
  await settings.getByLabel('API Key', { exact: true }).fill('mock-key-for-testing');
  await settings.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(settings.getByText('模型已保存。可以测试连接，然后在网页中开始阅读。')).toBeVisible();
  expect(await worker.evaluate(origin => chrome.permissions.contains({ origins: [`${origin}/*`] }), origin)).toBe(true);
  await settings.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(settings.getByText('连接成功，流式响应正常。')).toBeVisible();
  await settings.getByRole('button', { name: '隐私与权限' }).click();
  await settings.getByLabel('网站地址').fill(origin);
  await settings.getByRole('button', { name: '授权网站', exact: true }).click();
  await expect(settings.getByText('网站已授权。刷新该网站后即可划词。')).toBeVisible();
  reading = await context.newPage(); await reading.goto(origin);
  await select(reading);
  const before = requests.length;
  await reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true }).click();
  await expect(reading.getByText('正在生成', { exact: true })).toBeVisible();
  await expect(reading.getByText('熟悉的想法也会展现新的可能。', { exact: false })).toBeVisible();
  await expect(reading.getByText('已完成', { exact: true })).toBeVisible();
  expect(requests.length).toBe(before + 1);
  expect(requests.at(-1)!.messages[1]!.content).not.toContain('A good tool');
  await reading.screenshot({ animations: 'disabled', path: 'test-results/selection-chat.png', fullPage: true });
  await reading.getByRole('textbox', { name: '继续追问' }).fill('能举一个例子吗？');
  await reading.getByRole('textbox', { name: '继续追问' }).press('Enter');
  await expect(reading.getByText('帮助我们看清重要的信息。', { exact: false })).toBeVisible();
  expect(requests.at(-1)!.messages.at(-1)?.content).toBe('能举一个例子吗？');
  expect(requests.at(-1)!.messages.some(m => m.role === 'assistant')).toBe(true);
  await reading.getByRole('textbox', { name: '继续追问' }).fill('保留这个草稿');
  await select(reading, 'second');
  await reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true }).click();
  await expect(reading.getByText('发现新的选中文字')).toBeVisible();
  await reading.getByRole('button', { name: '保留对话', exact: true }).click();
  await expect(reading.getByRole('textbox', { name: '继续追问' })).toHaveValue('保留这个草稿');
  await reading.getByRole('button', { name: '收起浮窗，保留对话' }).click();
  await select(reading); await reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true }).click();
  await expect(reading.getByRole('textbox', { name: '继续追问' })).toHaveValue('保留这个草稿');
  slow = true;
  await reading.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(reading.getByRole('button', { name: '停止生成', exact: true })).toBeVisible();
  await reading.getByRole('button', { name: '停止生成', exact: true }).click();
  await expect(reading.getByText('生成已停止，已保留收到的内容。')).toBeVisible();
  slow = false; failure = true;
  await reading.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(reading.getByText('请求过于频繁或额度不足，请稍后重试并检查账户额度。')).toBeVisible();
  failure = false;
  await reading.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(reading.getByText('已完成', { exact: true })).toBeVisible();
  const stored = await worker.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) }));
  expect(JSON.stringify(stored.local)).not.toContain('mock-key-for-testing');
  expect(JSON.stringify(stored.session)).toContain('mock-key-for-testing');
  expect(await reading.locator('selio-assistant').evaluate(el => el.shadowRoot?.textContent)).not.toContain('mock-key-for-testing');
  expect(errors).toEqual([]);
});

test('side panel reuses the same conversation without another request', async () => {
  const count = requests.length;
  await reading.getByRole('button', { name: '固定到侧边栏', exact: true }).click();
  await expect(reading.getByRole('dialog', { name: 'Selio 对话' })).not.toBeVisible();
  await expect.poll(async () => worker.evaluate(async () => (await chrome.runtime.getContexts({})).filter(c => c.contextType === 'SIDE_PANEL').length)).toBe(1);
  // Side panels are CDP targets of type "other", not Playwright Pages.
  const cdp = await context.newCDPSession(reading);
  const targets = await cdp.send('Target.getTargets');
  const target = targets.targetInfos.find(t => t.url.endsWith('/sidepanel.html'))!;
  expect(target).toBeTruthy();
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let nextId = 0;
  const command = <T,>(method: string, params: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    const receive = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const reply = JSON.parse(event.message);
      if (reply.id !== id) return;
      cdp.off('Target.receivedMessageFromTarget', receive);
      if (reply.error) reject(new Error(reply.error.message)); else resolve(reply.result);
    };
    cdp.on('Target.receivedMessageFromTarget', receive);
    void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
  });
  const inspect = async () => (await command<{ result: { value: { draft: string; text: string } } }>('Runtime.evaluate', { expression: '({draft:document.querySelector("textarea")?.value,text:document.body.innerText})', returnByValue: true })).result.value;
  await expect.poll(async () => (await inspect()).draft).toBe('保留这个草稿');
  expect((await inspect()).text).toContain('帮助我们看清重要的信息。');
  expect(requests.length).toBe(count);
  const screenshot = await command<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  await writeFile('test-results/sidepanel.png', Buffer.from(screenshot.data, 'base64'));
  await cdp.detach();
});

test('service worker restart restores draft and requires an explicit retry', async () => {
  await reading.bringToFront();
  await select(reading);
  await reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true }).click();
  slow = true;
  const cdp = await context.newCDPSession(reading);
  let versionId = '';
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    const version = versions.find(v => v.scriptURL === worker.url() && v.runningStatus === 'running');
    if (version) versionId = version.versionId;
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => versionId).not.toBe('');
  await reading.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect.poll(async () => worker.evaluate(async () => Object.entries(await chrome.storage.session.get(null)).some(([k, v]) => k.startsWith('conversation:') && (v as {status: string}).status === 'generating'))).toBe(true);
  const count = requests.length;
  await cdp.send('ServiceWorker.stopWorker', { versionId });
  await expect(reading.getByText('后台连接已重启，已保留最近内容。点击重新生成继续。')).toBeVisible({ timeout: 25000 });
  worker = context.serviceWorkers().find(w => w.url().includes(extensionId))!;
  await expect(reading.getByRole('textbox', { name: '继续追问' })).toHaveValue('保留这个草稿');
  expect(requests.length).toBe(count);
  slow = false;
  await reading.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(reading.getByText('已完成', { exact: true })).toBeVisible();
  await reading.getByRole('button', { name: '收起浮窗，保留对话' }).click();
  await cdp.detach();
});

test('privacy boundary, theme, viewport and permission revocation', async () => {
  const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({})).find(t => t.url === `${origin}/`)!.id!, origin);
  const isolation = await worker.evaluate(async tabId => {
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: async () => {
      let localBlocked = false, sessionBlocked = false;
      try { await chrome.storage.local.get(null); } catch { localBlocked = true; }
      try { await chrome.storage.session.get(null); } catch { sessionBlocked = true; }
      const reply = await chrome.runtime.sendMessage({ type: 'settings:get' });
      return { localBlocked, sessionBlocked, settingsDenied: reply.ok === false };
    } });
    return results[0]?.result;
  }, tabId);
  expect(isolation).toEqual({ localBlocked: true, sessionBlocked: true, settingsDenied: true });
  await settings.bringToFront();
  await settings.getByRole('button', { name: '阅读偏好' }).click();
  await settings.getByLabel('外观', { exact: true }).selectOption('dark');
  await expect(settings.locator('.settings-shell')).toHaveAttribute('data-theme', 'dark');
  await settings.screenshot({ animations: 'disabled', path: 'test-results/settings-dark.png', fullPage: true });
  await settings.setViewportSize({ width: 390, height: 844 });
  expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await settings.screenshot({ animations: 'disabled', path: 'test-results/settings-mobile.png', fullPage: true });
  await settings.setViewportSize({ width: 1360, height: 900 });
  await settings.getByLabel('外观', { exact: true }).selectOption('light');
  await reading.bringToFront();
  await select(reading);
  await reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true }).click();
  await expect(reading.getByRole('textbox', { name: '继续追问' })).toHaveValue('保留这个草稿');
  await reading.setViewportSize({ width: 390, height: 700 });
  const box = await reading.getByRole('dialog', { name: 'Selio 对话' }).boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await expect.poll(async () => (await reading.getByRole('dialog', { name: 'Selio 对话' }).boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await reading.screenshot({ animations: 'disabled', path: 'test-results/chat-mobile.png' });
  await settings.bringToFront();
  await settings.getByRole('button', { name: '隐私与权限' }).click();
  await settings.getByRole('button', { name: `撤销 ${origin}/*`, exact: true }).click();
  await expect(settings.getByText('网站授权已撤销。')).toBeVisible();
  await reading.bringToFront();
  await reading.getByRole('button', { name: '收起浮窗，保留对话' }).click();
  await reading.mouse.click(20, 20);
  await reading.locator('#second').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range); });
  await expect(reading.getByRole('button', { name: '用 Selio 阅读选中文字', exact: true })).not.toBeVisible();
  expect(await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
  expect(errors).toEqual([]);
});
