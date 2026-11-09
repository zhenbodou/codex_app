async(page) => {
 await page.reload();
 await page.getByRole('tab',{name:'登录',exact:true}).waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1280,height:800});
 await page.screenshot({path:'output/playwright/login-fixed-light.png'});
 const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
 const contrast=await page.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
   const lum=c=>c.map(x=>{x/=255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const el=document.querySelector('#auth-email');const style=getComputedStyle(el);
   return {text:ratio(rgb(style.color),rgb(style.backgroundColor)),placeholder:ratio(rgb(getComputedStyle(el,'::placeholder').color),rgb(style.backgroundColor)),theme:document.querySelector('.login-page').dataset.theme,opacity:getComputedStyle(document.querySelector('.login-page')).opacity};
 });
 assert(contrast.text>=4.5&&contrast.placeholder>=4.5&&contrast.theme==='light'&&contrast.opacity==='1','Unreadable login: '+JSON.stringify(contrast));
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByText('请输入有效的邮箱地址',{exact:true}).waitFor();
 await page.getByRole('button',{name:'填入演示账号',exact:true}).click();
 assert(await page.getByLabel('邮箱',{exact:true}).inputValue()==='demo@claude.dev','Demo email missing');
 await page.getByRole('button',{name:'显示密码',exact:true}).click();
 assert(await page.getByLabel('密码',{exact:true}).getAttribute('type')==='text','Reveal password failed');
 await page.getByRole('button',{name:'隐藏密码',exact:true}).click();
 await page.getByRole('tab',{name:'注册',exact:true}).click();
 await page.getByLabel('昵称',{exact:true}).waitFor();
 await page.getByRole('button',{name:'创建账户',exact:true}).click();
 await page.getByText('请输入昵称',{exact:true}).waitFor();
 await page.setViewportSize({width:940,height:600});
 await page.screenshot({path:'output/playwright/register-minimum.png'});
 const inScroll=await page.locator('.login-page').evaluate(e=>e.scrollHeight>=e.clientHeight&&e.scrollWidth<=e.clientWidth);
 assert(inScroll,'Register layout overflow');
 await page.getByRole('tab',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'切换为深色登录页',exact:true}).click();
 await page.screenshot({path:'output/playwright/login-fixed-dark.png'});
 const dark=await page.evaluate(()=>{const el=document.querySelector('#auth-email');const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const l=c=>c.map(x=>(x/=255)<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);const a=l(rgb(getComputedStyle(el,'::placeholder').color)),b=l(rgb(getComputedStyle(el).backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 assert(dark>=4.5,'Dark placeholder contrast '+dark);
 await page.evaluate(async()=>{
   const {api,ApiError}=await import('/src/lib/api.ts');
   window.authCalls=0;
   api.login=async()=>{window.authCalls++;await new Promise(r=>setTimeout(r,150));throw new ApiError('unauthorized','Invalid');};
 });
 await page.getByRole('button',{name:'登录',exact:true}).dblclick();
 await page.getByRole('alert').filter({hasText:'邮箱或密码不正确'}).waitFor();
 const calls=await page.evaluate(()=>window.authCalls);
 assert(calls===1,'Duplicate auth request: '+calls);
 await page.getByRole('button',{name:'切换为浅色登录页',exact:true}).click();
}
