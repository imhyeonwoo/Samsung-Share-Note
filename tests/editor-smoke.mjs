import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('.');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/firebase-config.js'){
   res.writeHead(200,{'content-type':'text/javascript'});
   res.end('export const firebaseConfig={apiKey:"REPLACE_ME",projectId:"",authDomain:""};');
   return
  }
  const path=resolve(root,'.'+decodeURIComponent(pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
  const bytes=await readFile(path);
  res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});
  res.end(bytes)
 }catch(e){res.writeHead(404);res.end(e.message)}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 const port=server.address().port;
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/tests/editor-smoke.html');
 await page.waitForFunction(()=>window.__folioReady===true||Boolean(window.__folioError),{timeout:20000});
 const failure=await page.evaluate(()=>window.__folioError||null);
 assert.equal(failure,null,'Tiptap failed to initialize: '+failure);
 assert.equal(errors.length,0,'JavaScript errors: '+errors.join('; '));
 const content=page.locator('.tiptap.folio-document');
 assert.equal(await content.count(),1,'One unified editor must exist');
 assert.equal(await page.locator('textarea.block-input').count(),0,'No isolated paragraph textareas');
 assert.ok(await content.locator('table').count()>=1,'Legacy Markdown pipe table should render');
 assert.ok(await content.locator('strong').count()>=1,'Legacy Markdown bold should render');
 const before=await content.innerText();
 assert.ok(before.includes('문단 하나.')&&before.includes('문단 둘.'),'Legacy paragraphs preserved');
 // Browser selection must be permitted across multiple paragraphs, not one textarea.
 const selected=await page.evaluate(()=>{
  const root=document.querySelector('.tiptap');
  const paragraphs=[...root.querySelectorAll('p')].filter(p=>p.textContent.includes('문단'));
  if(paragraphs.length<2)return '';
  const range=document.createRange();
  range.setStart(paragraphs[0].firstChild,0);
  range.setEnd(paragraphs[1].firstChild,paragraphs[1].firstChild.textContent.length);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
  return sel.toString()
 });
 assert.ok(selected.includes('문단 하나.')&&selected.includes('문단 둘.'),'Cross-paragraph selection should work');
 // Add a table through the main toolbar.
 await page.locator('[data-rich="table"]').click();
 assert.ok(await content.locator('table').count()>=2,'Toolbar adds a table');
 // Regression: another save is in flight when a subpage card is clicked.
 // The old card handler simply refused to navigate while 'saving' was true.
 await page.evaluate(()=>{void window.__folioHandle.flush()});
 await page.waitForFunction(()=>window.__folioWriting===true);
 await page.locator('[data-folio-subpage="child-page"] .folio-page-title').click();
 await page.waitForFunction(()=>window.__folioOpenedPage==='child-page');
 assert.equal(await page.evaluate(()=>window.__folioWrites.length),1,'The active document write must finish before opening a child page');
 console.log('PASS: editor initialized; table and bold migrated; multi-paragraph selection; toolbar table insertion; nested page click');
 // End-to-end navigation smoke with Firestore disabled only in this local test.
 const token='a'.repeat(48);
 await page.goto('http://127.0.0.1:'+port+'/index.html#space='+token);
 await page.locator('.tiptap.folio-document').waitFor({timeout:20000});
 assert.equal(await page.locator('.title-input').inputValue(),'시작 페이지','Root page should render');
 await page.locator('[data-new-child="welcome"]').first().click();
 await page.locator('.title-input').waitFor();
 const childId=await page.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('page'));
 assert.ok(childId&&childId!=='welcome','A nested page should have its own route');
 await page.locator('.title-input').fill('하위 페이지 테스트');
 await page.locator('.title-input').press('Tab');
 await page.locator('.breadcrumbs [data-page="welcome"]').click();
 await page.waitForFunction(()=>document.querySelector('.title-input')?.value==='시작 페이지');
 await page.locator('.child-link[data-page="'+childId+'"]').click();
 await page.waitForFunction(id=>new URLSearchParams(location.hash.slice(1)).get('page')===id,childId);
 await page.goBack();
 await page.waitForFunction(()=>document.querySelector('.title-input')?.value==='시작 페이지');
 assert.equal(errors.length,0,'No JavaScript exceptions during page navigation');
 console.log('PASS: nested page creation, top breadcrumb click, bottom child-page click, browser Back');

 // Real Folio page: a legacy embedded child-page card must navigate when clicking
 // the card itself, not only the separate list of child pages below it.
 const seededToken='b'.repeat(48);
 const page2=await browser.newPage({viewport:{width:1200,height:900}});
 const page2Errors=[];
 page2.on('pageerror',err=>page2Errors.push(err.message));
 await page2.addInitScript(token=>{
  if(!location.pathname.endsWith('/index.html'))return;
  const time='2026-11-11T03:00:00.000Z';
  const pages=[
   {id:'welcome',title:'삼성물산 스터디',icon:'⚡',parentId:null,order:0,createdAt:time,updatedAt:time},
   {id:'seed-child',title:'삼성물산 PT면접 대비',icon:'📄',parentId:'welcome',order:1024,createdAt:time,updatedAt:time}
  ];
  const blocks=[
   {id:'embedded-child',pageId:'welcome',type:'text',text:'[[folio-page:seed-child]]',checked:false,order:1024,createdAt:time,updatedAt:time}
  ];
  localStorage.setItem('folio-workspace-v2-'+token,JSON.stringify({pages,blocks,images:[]}));
 },seededToken);
 await page2.goto('http://127.0.0.1:'+port+'/index.html#space='+seededToken);
 await page2.locator('[data-folio-subpage="seed-child"]').waitFor({timeout:20000});
 await page2.locator('[data-folio-subpage="seed-child"] .folio-page-title').click();
 await page2.waitForFunction(()=>new URLSearchParams(location.hash.slice(1)).get('page')==='seed-child');
 assert.equal(await page2.locator('.title-input').inputValue(),'삼성물산 PT면접 대비');
 await page2.goBack();
 await page2.waitForFunction(()=>document.querySelector('.title-input')?.value==='삼성물산 스터디');
 assert.equal(page2Errors.length,0,'No JS errors while clicking embedded child page: '+page2Errors.join('; '));
 await page2.close();
 console.log('PASS: real Folio embedded child card opens the child page and browser Back returns to parent');


}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve))
}
