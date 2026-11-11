import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve('.');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
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
 await page.locator('[data-folio-subpage="child-page"]').click();
 await page.waitForFunction(()=>window.__folioOpenedPage==='child-page');
 console.log('PASS: editor initialized; table and bold migrated; multi-paragraph selection; toolbar table insertion; nested page click');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve))
}
