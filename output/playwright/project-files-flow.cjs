const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const profile = path.join(os.tmpdir(), 'megvii-ui-' + Date.now());
  const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9335', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    for (let i = 0; i < 100; i++) { try { await fetch('http://127.0.0.1:9335/json/version'); break; } catch { await delay(100); } }
    const target = await (await fetch('http://127.0.0.1:9335/json/new?http://127.0.0.1:1421/', { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let seq = 0; const pending = new Map(); const errors = [];
    socket.addEventListener('message', e => { const data = JSON.parse(e.data); if (data.id) { const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(Error(JSON.stringify(data.error))) : p.resolve(data.result); } } if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text); });
    const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const wait = async expression => { for (let i = 0; i < 500; i++) { if (await evaluate(expression)) return; await delay(80); } throw Error('Timed out: ' + expression + ' | ' + await evaluate('document.body.innerText') + ' | errors: ' + JSON.stringify(errors)); };
    const click = selector => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Missing: ' + ${JSON.stringify(selector)}); el.scrollIntoView({block:'nearest'}); el.click(); })()`);
    const button = text => evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw Error('Missing button: ' + ${JSON.stringify(text)}); el.scrollIntoView({block:'nearest'}); el.click(); })()`);
    const fill = async (label, value) => { await evaluate(`(() => { const el = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input:not([type=checkbox]):not([type=radio]),textarea'); if (!el) throw Error('Missing field: ' + ${JSON.stringify(label)}); el.scrollIntoView({block:'nearest'}); el.focus(); el.select(); })()`); await cdp('Input.insertText', { text: value }); };
    const check = text => evaluate(`(() => { const el = [...document.querySelectorAll('.algorithm-options label')].find(l => l.textContent.trim() === ${JSON.stringify(text)})?.querySelector('input'); if (!el) throw Error('Missing checkbox'); el.click(); })()`);
    const screenshot = async name => { const shot = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile('output/playwright/' + name, Buffer.from(shot.data, 'base64')); };
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await wait(`!!document.querySelector('.login-page')`);
    await evaluate(`(async () => {
      window.imp = path => import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path);
      const { useAuthStore } = await imp('/src/store/auth.ts');
      useAuthStore.setState({ user: { id:'qa', name:'QA', email:'qa@example.test', plan:'pro', avatarUrl:null, createdAt:new Date().toISOString() }, token:null, restoring:false });
    })()`);
    await wait(`!!document.querySelector('.desktop-shell')`);
    await evaluate(`(async () => {
      const {api}=await imp('/src/lib/api.ts'); const {useWorkspaceStore:ws}=await imp('/src/store/workspace.ts'); const {useUiStore:ui}=await imp('/src/store/ui.ts'); const {useAuthStore:auth}=await imp('/src/store/auth.ts'); const {useSettingsStore:settings}=await imp('/src/store/settings.ts');
      window.ws=ws;window.ui=ui;window.syncCalls=0;window.openCalls=0;window.bound=false;
      const stamp=new Date().toISOString();window.projects=[{id:'files',kind:'algorithm',name:'人脸算法仓',path:'D:/algorithms',description:null,color:'#D97757',createdAt:stamp,updatedAt:stamp,sessionCount:0},{id:'other',kind:'normal',name:'其他项目',path:'D:/other',description:null,color:'#D97757',createdAt:stamp,updatedAt:stamp,sessionCount:0}];
      window.remoteFiles=[{path:'megflow-face',kind:'directory',size:0,version:'1'},{path:'megflow-face/src',kind:'directory',size:0,version:'1'},{path:'megflow-face/src/detect.py',kind:'file',size:41,version:'1'},{path:'megflow-face/model.bin',kind:'file',size:4096,version:'1'}];
      api.listProjects=async()=>window.projects;api.listSessions=async()=>[];api.listMessages=async()=>[];
      api.syncProjectFiles=async(_t,id)=>{window.syncCalls++;return {localPath:id==='files'&&window.bound?'D:/algorithms':null,files:id==='files'&&window.bound?window.remoteFiles:[],conflicts:window.conflicts??[],syncedAt:new Date().toISOString()};};
      api.pickDirectory=async()=>'D:/algorithms';api.bindProjectDirectory=async()=>{window.bound=true;};api.openProjectDirectory=async()=>{window.openCalls++;};
      api.readProjectFile=async(_t,id,path)=>({path,content:path.endsWith('.bin')?null:'def detect(image):\\n    return {"minor": True}\\n',binary:path.endsWith('.bin'),tooLarge:false,size:41});
      settings.setState({settings:{backendMode:'remote',apiBaseUrl:'http://qa/v1',theme:'dark'},models:[],loading:false});ws.setState({projects:window.projects,activeProjectId:'files',activeSessionId:null,sessionsByProject:{files:[],other:[]}});ui.setState({detailsOpen:true});auth.setState({token:'ui-only',restoring:false});
    })()`);
    await wait(`document.body.innerText.includes('尚未关联本机目录')`);
    await button('关联本地目录');await wait(`document.body.innerText.includes('megflow-face')`);
    await click('[aria-label="目录 megflow-face"]');await click('[aria-label="目录 megflow-face/src"]');
    await click('[aria-label="文件 megflow-face/src/detect.py"]');
    await wait(`!!document.querySelector('.project-code-preview')`);assert.match(await evaluate(`document.querySelector('.project-code-preview').innerText`),/def detect/);
    await screenshot('project-file-preview.png');await click('[role="dialog"] [aria-label="关闭"]');
    await button('打开本地目录');assert.equal(await evaluate('openCalls'),1);
    await click('[aria-label="文件 megflow-face/model.bin"]');await wait(`document.body.innerText.includes('这是二进制文件')`);await click('[role="dialog"] [aria-label="关闭"]');
    await evaluate(`(()=>{const el=document.querySelector('[aria-label="筛选项目文件"]');el.focus();el.select();})()`);await cdp('Input.insertText',{text:'detect.py'});await wait(`!document.querySelector('[aria-label="文件 megflow-face/model.bin"]')`);
    await evaluate(`(()=>{const el=document.querySelector('[aria-label="筛选项目文件"]');el.focus();el.select();})()`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await evaluate(`window.conflicts=['megflow-face/src/detect.py']`);await click('[aria-label="刷新项目文件"]');await wait(`document.body.innerText.includes('保留了 1 个本地冲突文件')`);
    await cdp('Emulation.setDeviceMetricsOverride',{width:1100,height:760,deviceScaleFactor:1,mobile:false});await screenshot('project-files-compact.png');
    await click('[aria-label="关闭会话详情"]');const before=await evaluate('syncCalls');await delay(2600);assert.ok(await evaluate('syncCalls')>before,'background sync continues with pane closed');
    await evaluate(`ws.getState().selectProject('other');ui.setState({detailsOpen:true});`);await wait(`document.body.innerText.includes('尚未关联本机目录')`);assert.equal(await evaluate(`!!document.querySelector('[aria-label="文件 megflow-face/src/detect.py"]')`),false);
    assert.deepEqual(errors,[]);await fs.writeFile('output/playwright/project-files-result.json',JSON.stringify({passed:true,checks:['bind-directory','expand-tree','preview-code','binary-notice','open-local-folder','filter','conflict-notice','background-sync','project-switch-isolation']},null,2));console.log('Project file UI passed (9 checks)');
  } finally {socket?.close();edge.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
