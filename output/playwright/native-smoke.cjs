const { chromium } = require(require('node:path').join(process.env.LOCALAPPDATA, 'npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'));
const fs = require('node:fs/promises');
(async () => {
  let browser;
  for (let i = 0; i < 20; i++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9223'); break; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  if (!browser) throw Error('Native debug endpoint was not available');
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !document.querySelector('#boot'));
  const savedToken = await page.evaluate(() => localStorage.getItem('cc.token'));
  try {
  await page.evaluate(() => localStorage.removeItem('cc.token'));
  await page.reload();
  await page.getByRole('tab', { name: '登录', exact: true }).waitFor();
  const native = await page.evaluate(() => !!window.__TAURI_INTERNALS__);
  if (!native) throw Error('Not connected to a native Tauri WebView');
  const login = page.getByRole('tab', { name: '登录', exact: true });
  const onLogin = await login.isVisible();
  if (onLogin) {
    await page.screenshot({ path: 'output/playwright/native-login.png' });
    const theme = await page.locator('.login-page').getAttribute('data-theme');
    if (theme !== 'light') throw Error('Native login did not use readable default theme');
    await page.getByRole('button', { name: '填入演示账号', exact: true }).click();
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.getByRole('button', { name: '新建会话 Ctrl+N', exact: true }).waitFor({ timeout: 20000 });
  }
  await page.getByRole('textbox', { name: '给 Claude 的任务' }).waitFor();
  const existingDialog = page.getByRole('dialog', { name: '键盘快捷键', exact: true });
  if (await existingDialog.isVisible()) { await page.keyboard.press('Escape'); await existingDialog.waitFor({state:'hidden'}); }
  await page.screenshot({ path: 'output/playwright/native-workspace.png' });
  await page.keyboard.press('Control+/');
  await page.getByRole('dialog', { name: '键盘快捷键', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '键盘快捷键', exact: true }).waitFor({state:'hidden'});
  if (errors.length) throw Error('Native page errors: ' + errors.join('; '));
  await fs.writeFile('output/playwright/native-result.json', JSON.stringify({ native, demoLoginChecked: onLogin, runtimeErrors: errors, url: page.url(), checks: ['native Tauri WebView', 'readable login when unauthenticated', 'real backend projects/settings load', 'composer', 'shortcut dialog'] }, null, 2));
  console.log('Native desktop smoke passed');
  } finally {
    if (!page.isClosed()) {
      await page.evaluate(token => { if (token) localStorage.setItem('cc.token', token); else localStorage.removeItem('cc.token'); }, savedToken);
      await page.reload();
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
