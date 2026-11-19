async (page) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    const {useAuthStore} = await import('/src/store/auth.ts');
    useAuthStore.setState({user:{id:'visual-user',name:'Visual Review',email:'visual@example.test',plan:'pro',avatarUrl:null,createdAt:new Date().toISOString()},token:null,restoring:false});
  });
  await page.locator('.desktop-sidebar').getByRole('button', { name: '新建会话', exact: true }).waitFor();
  await page.evaluate(async () => {
    const {useWorkspaceStore} = await import('/src/store/workspace.ts');
    const {useSettingsStore, applyTheme} = await import('/src/store/settings.ts');
    const stamp = new Date().toISOString();
    const project = {id:'visual-project',name:'claude-code-desktop',path:'D:/code/tauri/claude-code-desktop',description:null,color:'#D97757',createdAt:stamp,updatedAt:stamp,sessionCount:2};
    useWorkspaceStore.setState({projects:[project],activeProjectId:project.id,activeSessionId:null,sessionsByProject:{[project.id]:[{id:'visual-session',projectId:project.id,title:'对齐桌面布局与动画',model:'test-model',status:'idle',createdAt:stamp,updatedAt:stamp,messageCount:2,skills:[]},{id:'visual-session-2',projectId:project.id,title:'检查项目结构',model:'test-model',status:'idle',createdAt:stamp,updatedAt:stamp,messageCount:0,skills:[]}]}});
    const settings={theme:'light',accent:'#D97757',fontSize:14,model:'test-model',temperature:1,maxTokens:4096,backendMode:'mock',apiBaseUrl:'',notifications:false,sound:false,autoCompact:false,showThinking:true,streamSpeed:20};
    useSettingsStore.setState({settings,models:[{id:'test-model',name:'Claude Sonnet',contextWindow:200000,description:'Visual fixture'}]});
    applyTheme(settings);
  });
  await page.waitForFunction(() => {
    const card = document.querySelector('.welcome-suggestion:last-child');
    return card && getComputedStyle(card).opacity === '1' && document.documentElement.dataset.theme === 'light';
  });
  await page.screenshot({path:'output/playwright/welcome-light.png'});
  const composerBounds = await page.locator('.desktop-composer').boundingBox();
  const suggestionBounds = await page.getByRole('region',{name:'任务建议'}).boundingBox();
  if (!composerBounds || !suggestionBounds || suggestionBounds.y < composerBounds.y + composerBounds.height || Math.abs(suggestionBounds.x - composerBounds.x) > 1) throw Error('Welcome suggestions are not aligned below the composer');
  await page.getByRole('button',{name:'收起侧边栏'}).click();
  await page.waitForFunction(() => document.querySelector('.desktop-sidebar').getBoundingClientRect().width < 2);
  await page.getByRole('button',{name:'切换侧边栏'}).click();
  await page.waitForFunction(() => document.querySelector('.desktop-sidebar').getBoundingClientRect().width >= 247);
  console.log('welcome', await page.locator('.desktop-composer').boundingBox());
  await page.getByRole('button',{name:'了解代码库',exact:true}).click();
  if (!(await page.getByRole('textbox',{name:'给 Megvii Code 的任务'}).inputValue()).includes('目录结构')) throw Error('Suggestion did not populate composer');
  await page.getByRole('button',{name:'选择模型',exact:true}).click();
  await page.getByRole('listbox',{name:'模型',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'会话详情',exact:true}).click();
  await page.getByRole('complementary',{name:'会话详情',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/details-light.png'});
  await page.getByRole('separator',{name:'调整详情面板宽度'}).focus();
  await page.keyboard.press('ArrowLeft');
  if (await page.getByRole('separator').getAttribute('aria-valuenow') !== '320') throw Error('Resize keyboard failed');
  await page.getByRole('button',{name:'关闭会话详情',exact:true}).click();
  await page.getByRole('textbox',{name:'搜索会话',exact:true}).fill('不存在的会话');
  await page.getByText('没有匹配的会话',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'搜索会话',exact:true}).fill('');
  await page.keyboard.press('Control+o');
  const mode = await page.evaluate(async()=> (await import('/src/store/ui.ts')).useUiStore.getState().transcriptView);
  if(mode !== 'thinking') throw Error('Ctrl+O failed: '+mode);
  await page.getByRole('textbox',{name:'给 Megvii Code 的任务'}).focus();
  const initialPermission = await page.evaluate(async()=> (await import('/src/store/ui.ts')).useUiStore.getState().uiMode);
  await page.keyboard.press('Shift+Tab');
  const permission = await page.evaluate(async()=> (await import('/src/store/ui.ts')).useUiStore.getState().uiMode);
  if(permission !== initialPermission) throw Error('Shift+Tab changed permissions');
  await page.evaluate(async () => {
    const {useChatStore}=await import('/src/store/chat.ts');
    const {useWorkspaceStore}=await import('/src/store/workspace.ts');
    const {useSettingsStore,applyTheme}=await import('/src/store/settings.ts');
    useWorkspaceStore.setState({activeSessionId:'visual-session'});
    const stamp = new Date().toISOString();
    useChatStore.setState({messages:[{id:'u1',sessionId:'visual-session',role:'user',blocks:[{type:'text',text:'请检查桌面布局和动画。'}],status:'done',createdAt:stamp,model:null,usage:null},{id:'a1',sessionId:'visual-session',role:'assistant',blocks:[{type:'thinking',thinking:'检查界面布局、状态与过渡效果。',durationMs:1800},{type:'tool_use',id:'t1',name:'Read',input:{file_path:'src/views/Shell.tsx'},status:'success',result:'Read 120 lines\nexport function Shell() {}',durationMs:120},{type:'text',text:'已检查主要界面。\n\n- 会话侧栏支持搜索和状态筛选\n- 输入区可选择项目与模型\n- 工具输出可展开查看\n\n接下来运行构建并检查窄窗口布局。'}],status:'done',createdAt:stamp,model:'Claude Sonnet',usage:{inputTokens:12000,outputTokens:1200,cacheReadTokens:2000}}],loading:false});
    applyTheme({...useSettingsStore.getState().settings,theme:'dark'});
  });
  const rustExample = 'fn main() {\n    // 保留注释、缩进和引号\n    println!("' + '示例代码'.repeat(28) + '");\n}';
  await page.evaluate(async (example) => {
    const {useChatStore} = await import('/src/store/chat.ts');
    useChatStore.setState(({messages}) => ({messages: messages.map(message => message.id === 'a1' ? {
      ...message,
      blocks: [...message.blocks, {type:'text', text:`## 代码示例\n\n\`\`\`rust\n${example}\n\`\`\`\n\n| 项目 | 状态 |\n| --- | --- |\n| 代码检查 | 已完成 |`}],
    } : message)}));
  }, rustExample);
  const codePanel = page.locator('.code-panel');
  await codePanel.locator('.hljs-keyword').first().waitFor();
  await page.locator('.thread-context').getByText('对齐桌面布局与动画',{exact:true}).waitFor();
  await page.getByRole('button',{name:'更多会话操作'}).click();
  await page.getByRole('menuitem',{name:'重命名'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'更多会话操作'}).evaluate(el => { if (document.activeElement !== el) throw Error('Menu did not restore focus'); });
  await page.getByRole('table').getByText('已完成').waitFor();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await codePanel.getByRole('button', {name:'复制代码'}).click();
  await codePanel.getByRole('status').getByText('代码已复制').waitFor({state:'attached'});
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if(copied.replace(/\r\n/g, '\n') !== rustExample) throw Error('Copied highlighted code differs from the source');
  await codePanel.scrollIntoViewIfNeeded();
  await codePanel.screenshot({path:'output/playwright/code-dark.png'});
  await page.screenshot({path:'output/playwright/conversation-dark.png'});
  await page.evaluate(async () => {
    const {useSettingsStore,applyTheme} = await import('/src/store/settings.ts');
    applyTheme({...useSettingsStore.getState().settings,theme:'light'});
  });
  await codePanel.screenshot({path:'output/playwright/code-light.png'});
  await page.evaluate(async () => {
    const {useSettingsStore,applyTheme} = await import('/src/store/settings.ts');
    applyTheme({...useSettingsStore.getState().settings,theme:'dark'});
  });
  await page.getByRole('button',{name:/Read.*Shell/}).click();
  await page.getByText('export function Shell() {}',{exact:false}).waitFor();
  await page.setViewportSize({width:940,height:600});
  const codeScroller = codePanel.locator('pre');
  if (!(await codeScroller.evaluate(el => el.scrollWidth > el.clientWidth))) throw Error('Long line should scroll horizontally');
  const wrap = codePanel.getByRole('button', {name:'自动换行'});
  await wrap.click();
  if (await wrap.getAttribute('aria-pressed') !== 'true' || await codeScroller.evaluate(el => el.scrollWidth > el.clientWidth)) throw Error('Code wrap failed');
  await page.screenshot({path:'output/playwright/conversation-minimum.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow) throw Error('Horizontal overflow at minimum window size');
  await page.getByRole('button',{name:'会话详情',exact:true}).click();
  const separator = page.getByRole('separator',{name:'调整详情面板宽度'});
  await separator.focus();
  for (let step = 0; step < 9; step++) await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => {
    const details = document.querySelector('.session-details');
    const limit = Number(details.querySelector('[role="separator"]').getAttribute('aria-valuemax'));
    const send = document.querySelector('.composer-send').getBoundingClientRect();
    const composer = document.querySelector('.desktop-composer').getBoundingClientRect();
    const transcript = document.querySelector('.conversation-transcript').getBoundingClientRect();
    return limit < 460 && Math.abs(details.offsetWidth - limit) <= 1 && send.right <= details.getBoundingClientRect().left && Math.abs(transcript.left - composer.left) <= 1 && Math.abs(transcript.right - composer.right) <= 1;
  });
  await page.screenshot({path:'output/playwright/three-pane-minimum.png'});
  const composerToolbar = page.locator('.composer-toolbar');
  for (const trigger of await composerToolbar.locator('[aria-haspopup]').all()) {
    await trigger.click();
    const menu = composerToolbar.locator('.desktop-menu');
    await menu.waitFor();
    const fits = await menu.evaluate(panel => {
      const popup = panel.getBoundingClientRect();
      const composer = panel.closest('.desktop-composer').getBoundingClientRect();
      return popup.left >= composer.left && popup.right <= composer.right;
    });
    if (!fits) throw Error('Composer menu extends beyond the narrow conversation column');
    await page.keyboard.press('Escape');
    await menu.waitFor({state:'detached'});
  }
  await page.getByRole('button',{name:'关闭会话详情',exact:true}).click();
  await page.evaluate(async () => (await import('/src/store/chat.ts')).useChatStore.setState({isStreaming:true, streamingId:'a1'}));
  await page.getByRole('button', {name:'停止生成'}).waitFor();
  const status = page.locator('.generation-status');
  await status.getByRole('status').getByText('Megvii Code 正在处理…').waitFor();
  if(await status.evaluate(el => getComputedStyle(el, '::after').animationName) !== 'signal-sweep') throw Error('Missing generation sweep');
  await page.waitForFunction(() => {
    const status = document.querySelector('.generation-status');
    return status && getComputedStyle(status.parentElement).opacity === '1' && status.parentElement.clientHeight >= status.offsetHeight;
  });
  await page.screenshot({path:'output/playwright/generation-dark.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  if(await status.evaluate(el => getComputedStyle(el, '::after').animationName) !== 'none') throw Error('Generation sweep ignores reduced motion');
  const transcriptAnimation = await page.locator('.conversation-transcript').evaluate(el => getComputedStyle(el).animationName);
  if(transcriptAnimation !== 'none') throw Error('Transcript still animates with reduced motion');
  const animation=await page.evaluate(()=>getComputedStyle(document.querySelector('.desktop-icon')).transitionDuration);
  console.log('PASS: suggestions, model menu, details, resize, search, Ctrl+O, Shift+Tab, tools, minimum window; reduced motion='+animation);
}
