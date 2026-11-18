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
    socket.addEventListener('message', e => { const data = JSON.parse(e.data); if (data.id) { const p = pending.get(data.id); if (p) { pending.delete(data.id); data.error ? p.reject(Error(JSON.stringify(data.error))) : p.resolve(data.result); } } if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text); });
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
    await evaluate(`(async()=>{
      const imp=p=>import(p); const {api}=await imp('/src/lib/api.ts'); const {useWorkspaceStore:ws}=await imp('/src/store/workspace.ts'); const {useUiStore:ui}=await imp('/src/store/ui.ts'); const {useAuthStore:auth}=await imp('/src/store/auth.ts'); const {useSettingsStore:settings}=await imp('/src/store/settings.ts');
      window.ui=ui;window.sent=[];const stamp=new Date().toISOString();const project={id:'permission-project',kind:'normal',name:'权限验证',path:'D:/fixture',description:null,color:'#D97757',createdAt:stamp,updatedAt:stamp,sessionCount:1};const session={id:'permission-session',projectId:project.id,title:'权限验证',model:'default',status:'idle',createdAt:stamp,updatedAt:stamp,messageCount:0,skills:[]};
      api.getSettings=async()=>({backendMode:"remote",apiBaseUrl:"http://qa/v1",theme:"dark",model:"default",fontSize:14,showThinking:true});api.listModels=async()=>[];api.listSkills=async()=>[];api.listProjects=async()=>[project];api.listSessions=async()=>[session];api.listMessages=async()=>[];api.listSessionApprovals=async()=>[];api.syncProjectFiles=async()=>({localPath:null,files:[],conflicts:[],syncedAt:stamp});
      api.sendMessage=async(_token,id,req)=>{window.sent.push(req);return {id:'reply-'+window.sent.length,sessionId:id,role:'assistant',blocks:[{type:'text',text:'done'}],status:'done',createdAt:stamp,model:'default',usage:null};};
      settings.setState({settings:{backendMode:'remote',apiBaseUrl:'http://qa/v1',theme:'dark'},models:[],loading:false});ws.setState({projects:[project],activeProjectId:project.id,activeSessionId:session.id,sessionsByProject:{[project.id]:[session]}});auth.setState({token:'ui-only',user:{id:'qa',plan:'free',avatarUrl:null,name:'QA',email:'qa@example.test',createdAt:stamp},restoring:false});
    })()`);
    await wait(`!!document.querySelector('.composer-textarea')`);
    assert.equal(await evaluate('ui.getState().uiMode'),'request-approval');
    const checks=['safe-default'];
    for(const [mode,label] of [['full-access','完全权限'],['request-approval','请求审批'],['auto-review','帮我审批']]) {
      await evaluate(`(()=>{const labels=['完全权限','请求审批','帮我审批'];[...document.querySelectorAll('.composer-control')].find(b=>labels.includes(b.textContent.trim())).click();})()`);
      await wait(`document.querySelectorAll('[role=menuitemradio]').length===3`);
      await evaluate(`(()=>{[...document.querySelectorAll('[role=menuitemradio]')].find(b=>b.querySelector('span span')?.textContent===${JSON.stringify(label)}).click();})()`);
      assert.equal(await evaluate('ui.getState().uiMode'),mode);
      await evaluate(`document.querySelector('.composer-textarea').focus()`);await cdp('Input.insertText',{text:'permission test '+mode});
      await click('[aria-label="发送"]');
      await wait(`sent.length===${checks.length} && !document.querySelector('[aria-label="停止生成"]')`);
      assert.equal(await evaluate(`sent[${checks.length-1}].permissionMode`),mode);
      checks.push(mode+'-sent');
    }
    await screenshot('permission-modes.png');
    assert.equal(await evaluate(`localStorage.getItem('megvii-permission-mode')`),'auto-review');
    await cdp('Page.reload');await delay(800);
    assert.equal(await evaluate(`import('/src/store/ui.ts').then(m=>m.useUiStore.getState().uiMode)`),'auto-review');checks.push('remember-choice');
    await evaluate(`localStorage.setItem('megvii-permission-mode','plan')`);await cdp('Page.reload');await delay(800);
    assert.equal(await evaluate(`import('/src/store/ui.ts').then(m=>m.useUiStore.getState().uiMode)`),'request-approval');checks.push('invalid-choice-safe-default');
    assert.deepEqual(errors,[]);
    await fs.writeFile('output/playwright/permission-modes-result.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
  } finally {socket?.close();edge.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
