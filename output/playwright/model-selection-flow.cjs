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
      const {api}=await import('/src/lib/api.ts');const {useSettingsStore:settings}=await import('/src/store/settings.ts');const {useWorkspaceStore:ws}=await import('/src/store/workspace.ts');const {useAuthStore:auth}=await import('/src/store/auth.ts');const {useChatStore:chat}=await import('/src/store/chat.ts');
      window.settings=settings;window.chat=chat;window.sent=[];window.saveBehavior='delay';window.delayReply=true;
      window.saved={backendMode:'remote',apiBaseUrl:'http://qa/v1',theme:'dark',accent:'#D97757',fontSize:14,model:'model-a',temperature:0.7,maxTokens:8192,notifications:true,sound:false,autoCompact:true,showThinking:true,streamSpeed:3};
      window.available=[{id:'model-a',name:'Model A',description:'Worker model A',contextWindow:0},{id:'model-b',name:'Model B',description:'Worker model B',contextWindow:0},{id:'broken-model',name:'Broken model',description:'Failure fixture',contextWindow:0}];
      const stamp=new Date().toISOString();const project={id:'models',kind:'normal',name:'模型验证',path:'D:/fixture',description:null,color:'#D97757',createdAt:stamp,updatedAt:stamp,sessionCount:1};const session={id:'model-session',projectId:'models',title:'模型验证',model:'model-a',status:'idle',createdAt:stamp,updatedAt:stamp,messageCount:0,skills:[]};
      api.getSettings=async()=>window.saved;api.listModels=async()=>window.available;api.listSkills=async()=>[];api.listProjects=async()=>[project];api.listSessions=async()=>[session];api.listMessages=async()=>[];api.listSessionApprovals=async()=>[];api.syncProjectFiles=async()=>({localPath:null,files:[],conflicts:[],syncedAt:stamp});
      api.updateSettings=async(_t,patch)=>{
        if(window.saveBehavior==='fail')throw Error('fixture save failed');
        if(window.saveBehavior==='wrong')return {...window.saved,model:'model-a'};
        if(window.saveBehavior==='delay')return await new Promise(resolve=>{window.resolveSave=()=>{window.saved={...window.saved,...patch};resolve(window.saved);};});
        window.saved={...window.saved,...patch};return window.saved;
      };
      api.sendMessage=async(_t,id,req)=>{
        window.sent.push(req);chat.getState().applyEvent({sessionId:id,event:{type:'start',messageId:'server-'+window.sent.length,model:req.model}});
        const message={id:'reply-'+window.sent.length,sessionId:id,role:'assistant',blocks:[{type:'text',text:'Model confirmed'}],status:'done',createdAt:stamp,model:req.model,usage:null};
        if(window.delayReply)return await new Promise(resolve=>{window.resolveReply=()=>resolve(message);});return message;
      };
      settings.setState({settings:window.saved,models:window.available,loading:false});ws.setState({projects:[project],activeProjectId:'models',activeSessionId:'model-session',sessionsByProject:{models:[session]}});auth.setState({token:'ui-only',user:{id:'qa',plan:'free',avatarUrl:null,name:'QA',email:'qa@example.test',createdAt:stamp},restoring:false});
    })()`);
    await wait(`!!document.querySelector('.composer-textarea')`);
    const choose=async label=>{await click('[aria-label="选择模型"]');await wait(`!!document.querySelector('[role=listbox][aria-label="模型"]')`);await evaluate(`(()=>{[...document.querySelectorAll('[role=option]')].find(b=>b.querySelector('span span')?.textContent===${JSON.stringify(label)}).click();})()`);};
    await evaluate(`document.querySelector('.composer-textarea').focus()`);await cdp('Input.insertText',{text:'Use model B'});
    await choose('Model B');await wait(`settings.getState().modelSaving`);
    assert.equal(await evaluate('settings.getState().settings.model'),'model-a');
    assert.equal(await evaluate(`document.querySelector('[aria-label="发送"]').disabled`),true);
    await evaluate(`document.querySelector('.composer-textarea').focus()`);await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate('sent.length'),0);assert.equal(await evaluate(`document.querySelector('.composer-textarea').value`),'Use model B');
    await evaluate(`resolveSave();saveBehavior='normal'`);await wait(`settings.getState().settings.model==='model-b' && !settings.getState().modelSaving`);
    await click('[aria-label="发送"]');await wait(`sent.length===1 && document.body.innerText.includes('Worker 已接受')`);
    assert.equal(await evaluate('sent[0].model'),'model-b');
    await choose('Model A');await wait(`settings.getState().settings.model==='model-a'`);
    assert.equal(await evaluate('chat.getState().messages.at(-1).model'),'model-b');
    await evaluate('resolveReply();delayReply=false');await wait(`!document.querySelector('[aria-label="停止生成"]')`);
    await evaluate(`document.querySelector('.composer-textarea').focus()`);await cdp('Input.insertText',{text:'Use model A'});await click('[aria-label="发送"]');await wait(`sent.length===2 && !document.querySelector('[aria-label="停止生成"]')`);
    assert.equal(await evaluate('sent[1].model'),'model-a');assert.ok(await evaluate(`document.body.innerText.includes('本轮模型：model-b') && document.body.innerText.includes('本轮模型：model-a')`));
    await evaluate(`saveBehavior='fail'`);await choose('Broken model');await wait(`!settings.getState().modelSaving && document.body.innerText.includes('fixture save failed')`);assert.equal(await evaluate('settings.getState().settings.model'),'model-a');
    await evaluate(`saveBehavior='wrong'`);await evaluate(`(()=>{[...document.querySelectorAll('[role=option]')].find(b=>b.querySelector('span span')?.textContent==='Model B').click();})()`);await wait(`document.body.innerText.includes('后端未确认所选模型')`);assert.equal(await evaluate('settings.getState().settings.model'),'model-a');
    await evaluate(`available.push({id:'model-c',name:'Model C',description:'New model',contextWindow:0})`);await button('刷新模型列表');await wait(`document.body.innerText.includes('Model C')`);
    await screenshot('model-selection.png');assert.deepEqual(errors,[]);
    const result={passed:true,checks:['wait-for-save','block-keyboard-send-while-saving','selected-model-sent','worker-confirmation','switch-next-turn-only','per-reply-model-history','failed-save-keeps-selection','mismatched-save-keeps-selection','refresh-models']};
    await fs.writeFile('output/playwright/model-selection-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  } finally {socket?.close();edge.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
