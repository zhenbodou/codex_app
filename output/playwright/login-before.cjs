async(page) => {
 await page.getByRole('textbox',{name:'邮箱',exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/login-before.png'});
 console.log(await page.getByRole('textbox',{name:'邮箱',exact:true}).evaluate(e=>{let chain=[];for(let p=e;p;p=p.parentElement){let s=getComputedStyle(p);chain.push({tag:p.tagName,opacity:s.opacity,mask:s.maskImage,color:s.color,background:s.backgroundColor});}return chain;}));
}
