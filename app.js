import { firebaseConfig } from './firebase-config.js?v=20261109-firebase-key-fix2';

const app=document.getElementById('app');
const modal=document.getElementById('modal');
const toast=document.getElementById('toast');
const configured=Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.authDomain && firebaseConfig.apiKey!=='REPLACE_ME');
const blockTypes=[['text','텍스트'],['h1','제목 1'],['h2','제목 2'],['h3','제목 3'],['bullet','글머리 기호'],['number','번호 목록'],['todo','체크리스트'],['quote','인용'],['code','코드'],['divider','구분선'],['page','하위 페이지'],['image','이미지']];
const SIDEBAR_WIDTH_KEY='folio-sidebar-width-v1';
const SIDEBAR_HIDDEN_KEY='folio-sidebar-hidden-v1';
function readSidebarWidth(){
 try{const n=Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));return Number.isFinite(n)&&n>=210&&n<=480?n:264}catch{return 264}
}
function readSidebarCollapsed(){
 try{return localStorage.getItem(SIDEBAR_HIDDEN_KEY)==='true'}catch{return false}
}
function isNarrowSidebar(){return window.matchMedia('(max-width:650px)').matches}
function syncSidebarButtons(){
 const hidden=isNarrowSidebar()?!state.sidebarOpen:state.sidebarCollapsed;
 const btn=app.querySelector('.sidebar-toggle');
 if(btn){btn.setAttribute('aria-label',hidden?'사이드바 펼치기':'사이드바 접기');btn.title=hidden?'사이드바 펼치기':'사이드바 접기';btn.setAttribute('aria-expanded',String(!hidden))}
}
function toggleSidebar(){
 const layout=app.querySelector('.layout'),side=app.querySelector('.sidebar');
 if(!layout||!side)return;
 if(isNarrowSidebar()){
  state.sidebarOpen=!state.sidebarOpen;
  side.classList.toggle('open',state.sidebarOpen);
 }else{
  state.sidebarCollapsed=!state.sidebarCollapsed;
  try{localStorage.setItem(SIDEBAR_HIDDEN_KEY,String(state.sidebarCollapsed))}catch{}
  layout.classList.toggle('sidebar-collapsed',state.sidebarCollapsed);
 }
 syncSidebarButtons()
}
function applySidebarWidth(width,persist=false){
 const max=Math.max(210,Math.min(480,window.innerWidth-340));
 const next=Math.max(210,Math.min(max,Math.round(width)));
 state.sidebarWidth=next;
 const layout=app.querySelector('.layout');
 layout?.style.setProperty('--folio-sidebar-width',next+'px');
 const grip=app.querySelector('.sidebar-resize-grip');
 grip?.setAttribute('aria-valuenow',String(next));
 if(persist){try{localStorage.setItem(SIDEBAR_WIDTH_KEY,String(next))}catch{}}
}
function bindSidebarGrip(){
 const grip=app.querySelector('.sidebar-resize-grip');
 if(!grip)return;
 let drag=null;
 grip.addEventListener('pointerdown',event=>{
  if(isNarrowSidebar()||state.sidebarCollapsed||event.button!==0)return;
  drag={pointerId:event.pointerId,startX:event.clientX,startWidth:state.sidebarWidth};
  event.preventDefault();
  grip.setPointerCapture?.(event.pointerId);
  app.querySelector('.layout')?.classList.add('sidebar-resizing')
 });
 grip.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  applySidebarWidth(drag.startWidth+event.clientX-drag.startX)
 });
 const finish=event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  drag=null;
  app.querySelector('.layout')?.classList.remove('sidebar-resizing');
  if(grip.hasPointerCapture?.(event.pointerId))grip.releasePointerCapture(event.pointerId);
  applySidebarWidth(state.sidebarWidth,true)
 };
 grip.addEventListener('pointerup',finish);
 grip.addEventListener('pointercancel',finish);
 grip.addEventListener('keydown',event=>{
  if(isNarrowSidebar()||state.sidebarCollapsed)return;
  let delta=0;
  if(event.key==='ArrowRight')delta=16;
  if(event.key==='ArrowLeft')delta=-16;
  if(event.key==='Home')delta=-480;
  if(event.key==='End')delta=480;
  if(!delta)return;
  event.preventDefault();applySidebarWidth(state.sidebarWidth+delta,true)
 });
}

const state={pages:[],blocks:[],images:new Map(),imageLoading:new Set(),current:null,screen:'page',search:'',expanded:new Set(),mode:configured?'cloud':'demo',ready:false,editing:null,menu:null,sidebarOpen:false,sidebarCollapsed:readSidebarCollapsed(),sidebarWidth:readSidebarWidth(),seeding:false,creatingInline:false,listen:[],pending:new Map(),drafts:new Map(),saveError:false,blocksLoaded:false,error:null};
let fb={};
function uuid(){return globalThis.crypto?.randomUUID?.()||'id'+Date.now().toString(36)+Math.random().toString(36).slice(2)}
function randomSpace(){const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
const params=new URLSearchParams(location.hash.slice(1));
let space=params.get('space');
if(!/^[0-9a-f]{48}$/.test(space||'')){space=randomSpace();history.replaceState(null,'',location.pathname+location.search+'#space='+space)}
const demoKey='folio-workspace-v2-'+space;
// Keep the workspace token in the URL and add a page/view route for browser history.
function readRoute(){
 const q=new URLSearchParams(location.hash.slice(1));
 const view=q.get('view');
 return {space:q.get('space'),page:q.get('page'),screen:view==='search'||view==='all'?view:'page'};
}
function routeHref(screen=state.screen,page=state.current){
 const q=new URLSearchParams({space});
 if(screen==='page'&&page)q.set('page',page);
 else if(screen==='all'||screen==='search')q.set('view',screen);
 return location.pathname+location.search+'#'+q.toString();
}
function currentHref(){return location.pathname+location.search+location.hash}
function setRoute(replace=false){
 const href=routeHref();
 if(currentHref()!==href){
  if(replace)history.replaceState({folio:true},'',href);
  else history.pushState({folio:true},'',href);
 }
}
function saveOriginRoute(){
 // Initial workspace-only links do not contain a page ID.
 // Make that existing history entry represent the visible page before navigating.
 if(state.ready&&currentHref()!==routeHref())setRoute(true);
}
function restoreRoute(){
 disposeRich();
 flushPendingWrites();
 const route=readRoute();
 if(route.space!==space){location.reload();return}
 state.screen=route.screen;
 if(state.ready){
  if(route.page&&pageById(route.page))state.current=route.page;
  else if(!pageById(state.current))state.current=children(null)[0]?.id||state.pages[0]?.id||null;
  state.sidebarOpen=false;
  render(true);
 }
}
window.addEventListener('popstate',restoreRoute);
window.addEventListener('hashchange',restoreRoute);
function navigateView(view){
 if(state.screen===view)return;
 disposeRich();
 flushPendingWrites();
 saveOriginRoute();
 state.screen=view;state.sidebarOpen=false;
 setRoute();render(true);window.scrollTo({top:0});
}
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString();
function notice(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>toast.classList.remove('show'),2900)}
function stamp(iso){return iso?new Date(iso).toLocaleDateString('ko-KR',{month:'short',day:'numeric'}):''}
const pageById=id=>state.pages.find(p=>p.id===id);
const blockById=id=>state.blocks.find(b=>b.id===id);
const RICH_TAG='folio-rich-v1';
let richController=null,richMountSerial=0;
const richBase=id=>'__folio_rich_'+id+'_';
const richMetaId=id=>richBase(id)+'meta';
const richPartId=(id,i)=>richBase(id)+'part_'+i;
function isRichRecord(block){return block?.id?.startsWith('__folio_rich_')&&
 (block.id.includes('_meta')||block.id.includes('_part_'))}
function rawLegacyBlocks(id){return state.blocks.filter(b=>b.pageId===id&&!isRichRecord(b)).sort(sortByOrder)}
function readRichDocument(id){
 const metaRecord=state.blocks.find(x=>x.id===richMetaId(id));
 if(!metaRecord)return null;
 let meta;try{meta=JSON.parse(metaRecord.text)}catch{throw Error('문서 저장 정보가 올바르지 않습니다. 기존 내용은 보존되어 있습니다.')}
 if(meta?.tag!==RICH_TAG||!Number.isInteger(meta.count)||meta.count<1||meta.count>50)
  throw Error('문서 저장 버전이 올바르지 않습니다.');
 let jsonText='';
 for(let i=0;i<meta.count;i++){
  const part=state.blocks.find(x=>x.id===richPartId(id,i));
  if(!part||!part.text.startsWith(meta.revision+'\n'))throw Error('문서 일부가 아직 동기화되지 않았습니다. 새로고침해 주세요.');
  jsonText+=part.text.slice(meta.revision.length+1)
 }
 let json;try{json=JSON.parse(jsonText)}catch{throw Error('문서를 해석할 수 없습니다. 기존 내용은 보존되어 있습니다.')}
 return {revision:meta.revision,json}
}
function richRecord(id,text){
 return {id,pageId:state.current,type:'text',text,checked:false,order:-999999,
         createdAt:now(),updatedAt:now()}
}
function richConflict(){const err=new Error('다른 사용자의 변경이 먼저 저장되었습니다.');err.code='conflict';return err}
async function writeRichDocument(pageId,json,expectedRevision){
 const serial=JSON.stringify(json);
 if(serial.length>480000)throw Error('한 페이지가 너무 큽니다. 긴 문서를 여러 하위 페이지로 나누어 주세요.');
 const chunks=serial.match(/[\s\S]{1,14000}/g)||['{}'];
 const revision=uuid();
 const metaId=richMetaId(pageId),newMeta={tag:RICH_TAG,revision,count:chunks.length,updatedAt:now()};
 const records=[{...richRecord(metaId,JSON.stringify(newMeta)),pageId},
 ...chunks.map((txt,i)=>({...richRecord(richPartId(pageId,i),revision+'\n'+txt),pageId}))];
 if(state.mode==='demo'){
  const old=readRichDocument(pageId);
  if((old?.revision||null)!==(expectedRevision||null))throw richConflict();
  for(const item of records)localUpdate('blocks',item);
  state.blocks=state.blocks.filter(x=>!x.id.startsWith(richBase(pageId)+'part_')||
   records.some(y=>y.id===x.id));
  saveDemo();return revision
 }
 await fb.runTransaction(fb.db,async tx=>{
  const metaRef=fb.doc(blocksColl(),metaId);
  const previous=await tx.get(metaRef);
  let old;
  try{old=previous.exists()?JSON.parse(previous.data().text):null}catch{throw Error('기존 문서의 버전 정보를 읽지 못했습니다.')}
  if((old?.revision||null)!==(expectedRevision||null))throw richConflict();
  for(const item of records)tx.set(fb.doc(blocksColl(),item.id),item);
  for(let i=chunks.length;i<(old?.count||0);i++)tx.delete(fb.doc(blocksColl(),richPartId(pageId,i)));
 });
 return revision
}
async function addRichImage(file){
 const dataUrl=await compressImage(file);
 const asset={id:uuid(),pageId:state.current,name:(file.name||'첨부 이미지').slice(0,120),
   dataUrl,bytes:imageByteSize(dataUrl),createdAt:now()};
 if(state.mode==='demo'){state.images.set(asset.id,asset);saveDemo()}
 else await fb.setDoc(fb.doc(imageColl(),asset.id),asset);
 state.images.set(asset.id,asset);return asset.id
}
async function getRichImage(id){
 if(state.images.has(id))return state.images.get(id);
 if(state.mode==='demo')return null;
 const snap=await fb.getDoc(fb.doc(imageColl(),id));
 if(!snap.exists())return null;
 const asset=snap.data();state.images.set(id,asset);return asset
}
async function createRichSubpage(){
 const parentId=state.current;
 if(!pageById(parentId))throw Error('상위 페이지가 존재하지 않습니다.');
 const page={id:uuid(),title:'제목 없음',icon:'📄',parentId,order:Date.now(),
 createdAt:now(),updatedAt:now()};
 await put('pages',page);localUpdate('pages',page);
 state.expanded.add(parentId);return page
}
function disposeRich(){
 richMountSerial++;
 if(richController){const current=richController;richController=null;void current.flush?.();current.destroy()}
}
async function ensureRich(){
 const host=app.querySelector('#folio-rich-host');
 if(!host||!state.blocksLoaded||!state.current||richController?.pageId===state.current)return;
 const pageId=state.current,serial=++richMountSerial;
 try{
  const module=await import('./rich-editor.bundle.js?v=20261111-broken-links-v1');
  if(serial!==richMountSerial||!host.isConnected||state.current!==pageId)return;
  const controller=await module.mountFolioEditor(host,{
   pageId,workspace:space,
   legacyBlocks:()=>rawLegacyBlocks(pageId),
   readRich:()=>readRichDocument(pageId),
   writeRich: (doc,rev)=>writeRichDocument(pageId,doc,rev),
   createSubpage:createRichSubpage,
   openPage:showPage,
   findPage:pageById,
   addImage:addRichImage,
   loadImage:getRichImage
  });
  if(serial!==richMountSerial||!host.isConnected){controller.destroy();return}
  richController=controller
 }catch(err){
  if(serial!==richMountSerial)return;
  console.error('Rich editor error',err);
  host.innerHTML='<div class="rich-load-error"><strong>편집기를 불러오지 못했습니다.</strong><p>'+
   e(err.message||err)+'</p><button type="button" data-rich-retry>다시 시도</button>'+
   '<p>기존 블록 자료는 지우지 않고 보존되어 있어요.</p></div>';
  host.querySelector('[data-rich-retry]')?.addEventListener('click',()=>{host.replaceChildren();void ensureRich()})
 }
}

// Page links are encoded as text blocks, so the existing published Firestore rules remain compatible.
function pageRefId(text){const match=String(text||'').match(/^\[\[folio-page:([a-zA-Z0-9-]+)\]\]$/);return match?.[1]||null}
function pageLinkText(id){return '[[folio-page:'+id+']]' }
function imageRefId(text){const m=String(text||'').match(/^\[\[folio-image:([a-zA-Z0-9-]+)\]\]$/);return m?.[1]||null}
function imageURL(text){
 const m=String(text||'').match(/^\[\[folio-image-url:(.+)\]\]$/);
 if(!m)return null;
 try{const u=new URL(decodeURIComponent(m[1]));return u.protocol==='https:'?u.href:null}catch{return null}
}
function imageLinkText(id){return '[[folio-image:'+id+']]' }
function imageURLText(url){return '[[folio-image-url:'+encodeURIComponent(url)+']]' }
function imageByteSize(dataUrl){return Math.ceil((dataUrl.length-(dataUrl.indexOf(',')+1))*3/4)}
function afterOrder(pageId,afterId){
 const list=pageBlocks(pageId);
 if(afterId){
  const i=list.findIndex(x=>x.id===afterId);
  if(i>=0){const a=list[i].order??0,b=list[i+1]?.order;return b!==undefined?(a+b)/2:a+1024}
 }
 return (list.at(-1)?.order??0)+1024
}
function imageColl(){return fb.collection(fb.db,'spaces',space,'images')}
function loadImage(id){
 if(state.images.has(id)||state.imageLoading.has(id)||state.mode==='demo')return;
 state.imageLoading.add(id);
 fb.getDoc(fb.doc(imageColl(),id)).then(doc=>{
  if(doc.exists()){
   state.images.set(id,doc.data());
   document.querySelectorAll('[data-image-view="'+id+'"]').forEach(img=>{
    img.src=doc.data().dataUrl;img.alt=doc.data().name||'첨부 이미지';img.hidden=false;
    img.closest('.image-frame')?.classList.remove('waiting');
    const caption=img.closest('.image-frame')?.querySelector('figcaption');if(caption)caption.textContent=doc.data().name||'첨부 이미지';
   });
  }else{document.querySelectorAll('[data-image-status="'+id+'"]').forEach(el=>el.textContent='이미지를 찾을 수 없습니다.')}
 }).catch(err=>document.querySelectorAll('[data-image-status="'+id+'"]').forEach(el=>el.textContent='이미지 불러오기 실패: '+err.message)).finally(()=>state.imageLoading.delete(id))
}
function refreshImages(){
 for(const b of state.blocks){
  const id=imageRefId(b.text);
  if(id)loadImage(id)
 }
}
function sortByOrder(a,b){return (a.order??0)-(b.order??0) || (a.createdAt||'').localeCompare(b.createdAt||'')}
function pageBlocks(pid){return state.blocks.filter(b=>b.pageId===pid&&!isRichRecord(b)).sort(sortByOrder)}
function children(pid){return state.pages.filter(p=>(p.parentId||null)===(pid||null)).sort(sortByOrder)}
function saveDemo(){try{localStorage.setItem(demoKey,JSON.stringify({pages:state.pages,blocks:state.blocks,images:[...state.images]}))}catch{notice('저장 공간이 부족하거나 차단됐습니다.')}}
function seedPage(){const timestamp=now();return {id:'welcome',title:'시작 페이지',icon:'🌿',parentId:null,order:0,createdAt:timestamp,updatedAt:timestamp}}
function seedBlocks(){const timestamp=now();return [
{id:'intro',pageId:'welcome',type:'h2',text:'나만의 워크스페이스',checked:false,order:1024,createdAt:timestamp,updatedAt:timestamp},
{id:'guide',pageId:'welcome',type:'text',text:'떠오르는 생각, 공부한 내용, 프로젝트 자료를 페이지로 정리하세요. 왼쪽 사이드바에서 하위 페이지도 만들 수 있어요.',checked:false,order:2048,createdAt:timestamp,updatedAt:timestamp},
{id:'todo1',pageId:'welcome',type:'todo',text:'새 페이지 만들어 보기',checked:false,order:3072,createdAt:timestamp,updatedAt:timestamp},
{id:'todo2',pageId:'welcome',type:'todo',text:'공유 링크 복사하기',checked:false,order:4096,createdAt:timestamp,updatedAt:timestamp}
]}
function initDemo(){try{const saved=JSON.parse(localStorage.getItem(demoKey)||'null');if(saved&&Array.isArray(saved.pages)&&Array.isArray(saved.blocks)){state.pages=saved.pages;state.blocks=saved.blocks;state.images=new Map(Array.isArray(saved.images)?saved.images:[])}else{state.pages=[seedPage()];state.blocks=seedBlocks();saveDemo()}}catch{state.pages=[seedPage()];state.blocks=seedBlocks()}state.ready=true;state.blocksLoaded=true;const route=readRoute();state.screen=route.screen;state.current=(route.page&&pageById(route.page)?route.page:null)||children(null)[0]?.id||state.pages[0]?.id||null;render()}
function pagesColl(){return fb.collection(fb.db,'spaces',space,'pages')}
function blocksColl(){return fb.collection(fb.db,'spaces',space,'blocks')}
async function initCloud(){
 try{
  const [m,a,d]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
   import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
  ]);
  const project=m.initializeApp(firebaseConfig);
  fb={...d,...a,db:d.getFirestore(project),auth:a.getAuth(project)};
  await a.signInAnonymously(fb.auth);
  state.listen.push(d.onSnapshot(pagesColl(),snap=>{
   state.pages=snap.docs.map(x=>({id:x.id,...x.data()})).sort(sortByOrder);
    for(const [key,draft] of state.drafts)if(key.startsWith('pages:')){const i=state.pages.findIndex(p=>p.id===draft.id);if(i>=0)state.pages[i]=draft;}
   if(state.pages.length===0&&!state.seeding){seedCloud();return}
   if(state.pages.length){
    if(!state.ready){
     const route=readRoute();
     state.screen=route.screen;
     state.current=(route.page&&pageById(route.page)?route.page:null)||children(null)[0]?.id||state.pages[0].id;
    }else if(!pageById(state.current)){
     state.current=children(null)[0]?.id||state.pages[0].id;
     setRoute(true);
    }
    state.ready=true;render();refreshImages();
    richController?.refreshReferences?.();
   }
  },err=>showError('페이지 동기화 실패: '+err.message)));
  state.listen.push(d.onSnapshot(blocksColl(),snap=>{
   state.blocks=snap.docs.map(x=>({id:x.id,...x.data()})).sort(sortByOrder);
    state.blocksLoaded=true;
    for(const [key,draft] of state.drafts)if(key.startsWith('blocks:')){const i=state.blocks.findIndex(b=>b.id===draft.id);if(i>=0)state.blocks[i]=draft;else state.blocks.push(draft);}
   if(state.ready){
     render();refreshImages();
     if(richController?.pageId===state.current){
      try{richController.onRemote(readRichDocument(state.current))}catch(err){console.warn('Rich document sync incomplete',err)}
     }
    }
  },err=>showError('본문 동기화 실패: '+err.message)));
 }catch(err){showError('Firebase 연결에 실패했습니다: '+err.message)}
}
async function seedCloud(){
 if(state.seeding)return;
 state.seeding=true;
 try{
  const base=seedPage();
  await fb.setDoc(fb.doc(pagesColl(),base.id),base);
  const batch=fb.writeBatch(fb.db);
  for(const block of seedBlocks())batch.set(fb.doc(blocksColl(),block.id),block);
  await batch.commit()
 }catch(err){showError('첫 페이지를 만들 수 없습니다: '+err.message)}
 finally{state.seeding=false}
}
function showError(message){state.error=message;state.ready=false;render()}
async function put(kind,item){
 if(state.mode==='demo'){const arr=state[kind];const i=arr.findIndex(x=>x.id===item.id);if(i>=0)arr[i]={...item};else arr.push({...item});saveDemo();return}
 const ref=fb.doc(kind==='pages'?pagesColl():blocksColl(),item.id);
 await fb.setDoc(ref,item);
}
async function erase(kind,id){
 if(state.mode==='demo'){state[kind]=state[kind].filter(x=>x.id!==id);saveDemo();return}
 await fb.deleteDoc(fb.doc(kind==='pages'?pagesColl():kind==='images'?imageColl():blocksColl(),id))
}
function localUpdate(kind,obj){
 const arr=state[kind];const index=arr.findIndex(x=>x.id===obj.id);
 if(index>=0)arr[index]={...arr[index],...obj};else arr.push(obj);
 if(state.mode==='demo')saveDemo()
}
function saveLabel(){
 if(state.mode==='demo')return '이 브라우저에 저장됨';
 if(state.saveError)return '저장 실패 · 확인 필요';
 return state.drafts.size||state.pending.size?'저장 중…':'모든 변경 저장됨'
}
function showSaveLabel(){
 const node=app.querySelector('.status');
 if(node)node.textContent=saveLabel()
}
function debounceSave(kind,item,delay=550){
 const key=kind+':'+item.id;clearTimeout(state.pending.get(key));
 localUpdate(kind,item);state.drafts.set(key,item);state.saveError=false;showSaveLabel();
 const timer=setTimeout(async()=>{
  state.pending.delete(key);
  try{await put(kind,item);if(state.drafts.get(key)===item)state.drafts.delete(key);showSaveLabel()}
  catch(err){state.saveError=true;showSaveLabel();notice('자동 저장 실패: '+err.message)}
 },delay);
 state.pending.set(key,timer)
}
async function saveImmediate(kind,item){
 const key=kind+':'+item.id;clearTimeout(state.pending.get(key));state.pending.delete(key);
 localUpdate(kind,item);state.drafts.set(key,item);state.saveError=false;showSaveLabel();
 try{await put(kind,item);if(state.drafts.get(key)===item)state.drafts.delete(key);showSaveLabel()}
 catch(err){state.saveError=true;showSaveLabel();notice('저장 실패: '+err.message)}
}
function flushPendingWrites(){
 for(const [key,timer] of [...state.pending]){
  clearTimeout(timer);state.pending.delete(key);
  const item=state.drafts.get(key);
  if(!item)continue;
  const kind=key.split(':')[0];
  put(kind,item).then(()=>{if(state.drafts.get(key)===item)state.drafts.delete(key);showSaveLabel()}).catch(err=>{state.saveError=true;showSaveLabel();notice('저장 실패: '+err.message)})
 }
}
window.addEventListener('pagehide',flushPendingWrites);
function iconFor(p){return e(p?.icon||'📄')}
function pagePath(p){
 let out=[],seen=new Set(),cur=p;
 while(cur&&!seen.has(cur.id)&&out.length<8){out.unshift(cur);seen.add(cur.id);cur=pageById(cur.parentId)}
 return out
}
function tree(parentId=null,depth=0){
 if(depth>7)return '';
 const nodes=children(parentId);
 return nodes.map(p=>{
  const nested=children(p.id).length>0;
  const open=state.expanded.has(p.id);
  return '<div class="tree-node '+(p.id===state.current&&state.screen==='page'?'selected':'')+'" style="padding-left:'+Math.min(depth*14,98)+'px">'+
  '<button class="tree-expand" data-expand="'+e(p.id)+'" aria-label="펼치기">'+(nested?(open?'⌄':'›'):'·')+'</button>'+
  '<button class="tree-select" data-page="'+e(p.id)+'" title="'+e(p.title)+'"><span class="tree-emoji">'+iconFor(p)+'</span><span>'+e(p.title||'제목 없음')+'</span></button>'+
  '<button class="tree-add" data-new-child="'+e(p.id)+'" title="하위 페이지 추가" aria-label="하위 페이지 추가">+</button></div>'+
  (nested&&open?tree(p.id,depth+1):'')
 }).join('');
}
function sidebar(){
 return '<aside class="sidebar '+(state.sidebarOpen?'open':'')+'"><div class="sidebar-inner">'+
 '<div class="workspace"><span class="workspace-mark">F</span><span class="workspace-name">Folio Workspace<small>MY LITTLE NOTION</small></span><button type="button" class="sidebar-close" data-action="sidebar" title="사이드바 접기" aria-label="사이드바 접기">‹</button></div>'+
 '<button class="side-btn '+(state.screen==='search'?'active':'')+'" data-action="search">⌕ &nbsp; 전체 검색</button>'+
 '<button class="side-btn" data-action="home">⌂ &nbsp; 모든 페이지</button>'+
 '<div class="sidebar-label">내 페이지 <button class="add-small" data-new-child="" title="최상위 페이지 추가">+</button></div>'+
 (tree()||'<div class="empty-list">아직 페이지가 없습니다.</div>')+
 '</div><div class="sidebar-footer"><b>'+(state.mode==='cloud'?'● 실시간 공동 편집':'● 브라우저 체험 모드')+'</b><br>'+
 (state.mode==='cloud'?'링크를 가진 누구나 수정할 수 있어요.':'Firebase 연결 전에는 다른 사람과 공유되지 않아요.')+
 '<button class="side-share" data-action="share">↗ 공유 링크 복사</button></div><div class="sidebar-resize-grip" role="separator" aria-label="사이드바 너비 조절" aria-orientation="vertical" tabindex="0" aria-valuemin="210" aria-valuemax="480" aria-valuenow="'+state.sidebarWidth+'" title="좌우로 드래그하거나 방향키로 너비 조절"></div></aside>'
}
function breadcrumbs(p){return pagePath(p).map((x,i,a)=>'<button class="crumb '+(i===a.length-1?'active':'')+'" data-page="'+e(x.id)+'">'+iconFor(x)+' '+e(x.title||'제목 없음')+'</button>'+(i<a.length-1?'<span class="crumb-sep">/</span>':'')).join('')}
function topbar(p){return '<div class="topbar"><div class="breadcrumbs"><button class="mobile-menu sidebar-toggle" data-action="sidebar" aria-label="사이드바 펼치기" title="사이드바 접기" aria-expanded="true">☰</button>'+(p?breadcrumbs(p):'<span class="crumb active">'+(state.screen==='search'?'검색':'모든 페이지')+'</span>')+'</div>'+
 '<div class="top-right"><span class="status" aria-live="polite">'+saveLabel()+'</span><button class="top-btn strong" data-action="share">공유</button></div></div>'}
function options(type){return blockTypes.map(([key,label])=>'<option value="'+key+'" '+(type===key?'selected':'')+'>'+label+'</option>').join('')}
function blockHTML(b){
 const refId=pageRefId(b.text);
 const target=refId?pageById(refId):null;
 if(refId){
  return '<div class="block inline-page" data-row="'+e(b.id)+'">'+
   '<div class="block-tools"><button data-add-after="'+e(b.id)+'" aria-label="아래에 블록 추가" title="블록 추가">+</button><button data-block-menu="'+e(b.id)+'" aria-label="블록 메뉴" title="블록 메뉴">⋮</button></div>'+
   '<span class="block-page-tag">페이지</span>'+
   '<div class="block-core"><button class="inline-page-link" '+(target?'data-page="'+e(target.id)+'"':'disabled')+'>'+
   '<span class="inline-page-emoji">'+(target?iconFor(target):'📄')+'</span>'+
   '<span class="inline-page-title">'+e(target?.title||'삭제된 페이지')+'</span>'+
   '<span class="inline-page-arrow">↗</span></button></div></div>';
 }
 const imageId=imageRefId(b.text), external=imageURL(b.text);
 if(imageId||external){
  const asset=imageId?state.images.get(imageId):null;
  const imgSrc=asset?.dataUrl||external||'';
  return '<div class="block image-block" data-row="'+e(b.id)+'">'+
   '<div class="block-tools"><button data-add-after="'+e(b.id)+'" aria-label="아래에 블록 추가">+</button><button data-block-menu="'+e(b.id)+'" aria-label="블록 메뉴">⋮</button></div>'+
   '<span class="block-page-tag">이미지</span><div class="block-core"><figure class="image-frame '+(!imgSrc?'waiting':'')+'">'+
   (imgSrc?'<img loading="lazy" decoding="async" src="'+e(imgSrc)+'" alt="'+e(asset?.name||'첨부 이미지')+'" '+(imageId?'data-image-view="'+e(imageId)+'"':'')+'>':
   '<img data-image-view="'+e(imageId||'')+'" alt="첨부 이미지" hidden>')+
   '<figcaption data-image-status="'+e(imageId||'')+'">'+e(asset?.name|| (external?'링크 이미지':'이미지를 불러오는 중…'))+'</figcaption>'+
   '</figure></div></div>'
 }
 const isTodo=b.type==='todo';
 const ordered=pageBlocks(b.pageId);
 let number=1;
 if(b.type==='number'){
  const idx=ordered.findIndex(item=>item.id===b.id);
  for(let j=idx-1;j>=0&&ordered[j]?.type==='number';j--)number++;
 }
 return '<div class="block '+e(b.type)+(b.checked?' checked':'')+'" data-row="'+e(b.id)+'">'+
  '<div class="block-tools"><button data-add-after="'+e(b.id)+'" aria-label="아래에 블록 추가" title="블록 추가">+</button><button data-block-menu="'+e(b.id)+'" aria-label="블록 메뉴" title="블록 메뉴">⋮</button></div>'+
  '<select class="block-type" data-block-type="'+e(b.id)+'" aria-label="블록 종류">'+options(b.type)+'</select>'+
  '<div class="block-core" '+(b.type==='number'?'data-counter="'+number+'"':'')+'>'+(isTodo?'<input class="block-check" type="checkbox" data-check="'+e(b.id)+'" '+(b.checked?'checked':'')+' aria-label="체크리스트 완료">':'')+
  (b.type==='divider'?'<div class="divider-label" aria-hidden="true"></div>':
 '<textarea class="block-input" rows="1" spellcheck="true" aria-label="블록 내용" maxlength="20000" data-block-edit="'+e(b.id)+'" placeholder="'+(b.type==='h1'?'큰 제목':b.type==='h2'?'제목':b.type==='todo'?'할 일': '텍스트를 입력하거나 /로 명령어를 선택하세요')+'">'+e(b.text)+'</textarea>')+'</div></div>';
}

function editorPage(){
 const p=pageById(state.current);
 if(!p)return '<div class="welcome"><h1>새로운 공간</h1><p>첫 페이지를 만들어 보세요.</p><button data-new-child="">+ 새 페이지</button></div>';
 const descendants=children(p.id);
 return '<div class="canvas"><div class="page-cover"></div><button class="page-icon-btn" data-action="icon" title="아이콘 변경">'+iconFor(p)+'</button>'+
 '<input class="title-input" data-title="'+e(p.id)+'" value="'+e(p.title)+'" placeholder="제목 없음" aria-label="페이지 제목">'+
 '<div class="page-meta">마지막 수정 '+stamp(p.updatedAt)+' · 변경 사항 자동 저장</div>'+
 (state.mode==='demo'?'<div class="notice">체험 모드: 작성 내용은 이 브라우저에만 저장됩니다. 다른 사람과 함께 편집하려면 Firebase를 연결해야 합니다.</div>':'')+
 '<section class="blocks rich-blocks"><div id="folio-rich-host" data-rich-page="'+e(p.id)+'">'+
 (state.blocksLoaded?'편집기를 불러오는 중…':'기존 문서를 불러오는 중…')+'</div></section>'+
 '<div class="editor-footer rich-editor-footer"><span>문단을 가로질러 선택 · 표와 굵은 글씨 · / 명령 메뉴 · 자동 저장</span></div>'+
 '<div class="page-actions"><button class="page-action" data-new-child="'+e(p.id)+'">＋ 하위 페이지 만들기</button><button class="page-action" data-action="move-page">↳ 상위 페이지 변경</button><button class="page-action" data-action="delete-page">🗑 페이지 삭제</button></div>'+
 (descendants.length?'<div class="child-pages"><h2>하위 페이지</h2>'+descendants.map(x=>'<button class="child-link" data-page="'+e(x.id)+'">'+iconFor(x)+' '+e(x.title||'제목 없음')+'</button>').join('')+'</div>':'')+
 '<p class="editor-hint">기존 팀원 자료는 보존됩니다. 첫 수정부터 새 편집기 형식으로 따로 저장해요. 동시 수정 충돌이 발생하면 자동 저장을 중지하고 알려줍니다.</p></div>';
}
function allPages(){
 const sorted=[...state.pages].sort(sortByOrder);
 return '<div class="search-results"><h1>모든 페이지</h1><p class="hint">워크스페이스의 페이지를 빠르게 찾아보세요.</p><button class="page-action" data-new-child="">+ 새 페이지</button>'+
 sorted.map(p=>'<button class="search-result" data-page="'+e(p.id)+'"><b>'+iconFor(p)+' '+e(p.title||'제목 없음')+'</b><small>'+e(pagePath(p).map(x=>x.title).join(' / '))+'</small></button>').join('')+'</div>';
}
function searchPage(){
 const q=state.search.trim().toLowerCase();
 const matched=state.pages.filter(p=>!q||p.title.toLowerCase().includes(q)||state.blocks.some(b=>b.pageId===p.id&&b.text.toLowerCase().includes(q)));
 return '<div class="search-results"><h1>검색</h1><input id="search-field" class="search-input" type="search" placeholder="페이지 제목이나 본문 검색" value="'+e(state.search)+'" autofocus>'+
 '<div id="results">'+searchMatches(matched)+'</div></div>';
}
function searchMatches(items){return items.length?items.map(p=>'<button class="search-result" data-page="'+e(p.id)+'"><b>'+iconFor(p)+' '+e(p.title||'제목 없음')+'</b><small>'+e(pagePath(p).map(x=>x.title).join(' / '))+'</small></button>').join(''):'<p class="hint">검색 결과가 없습니다.</p>'}
function isEditing(){const node=document.activeElement;return Boolean(node&&(node.matches('[data-block-edit]')||node.matches('[data-title]')))}
function render(force=false){
 if(!state.ready){
  app.innerHTML=state.error?'<div class="error"><h2>연결 오류</h2><p>'+e(state.error)+'</p><p>Firebase 설정·익명 인증·Firestore 규칙을 확인하세요.</p><button onclick="location.reload()">새로고침</button></div>':'<div class="boot">워크스페이스를 불러오는 중…</div>';
  return
 }
 if(!force&&(isEditing()||richController?.focused())){refreshImages();return;}
 let preserved=null;
 if(richController?.pageId===state.current&&state.screen==='page'){
  const old=app.querySelector('#folio-rich-host');
  if(old){preserved=old;old.remove()}
 }
 const p=state.screen==='page'?pageById(state.current):null;
 app.innerHTML='<div class="layout '+(state.sidebarCollapsed?'sidebar-collapsed':'')+'" style="--folio-sidebar-width:'+state.sidebarWidth+'px">'+sidebar()+'<main class="main">'+topbar(p)+(state.screen==='search'?searchPage():state.screen==='all'?allPages():editorPage())+'</main></div>';
 if(preserved){
  const replacement=app.querySelector('#folio-rich-host');
  if(replacement)replacement.replaceWith(preserved)
 }
 bind();bindSidebarGrip();syncSidebarButtons();app.querySelectorAll('textarea.block-input').forEach(autoSize);refreshImages();
 if(state.screen==='page')void ensureRich();
}
function showPage(id){
 if(!pageById(id))return;
 if(state.screen==='page'&&state.current===id){state.sidebarOpen=false;return}
 disposeRich();
 flushPendingWrites();
 if(state.screen!=='page'||state.current!==id)saveOriginRoute();
 state.current=id;state.screen='page';state.sidebarOpen=false;state.menu=null;
 let p=pageById(id);
 if(p?.parentId){let x=p;let seen=new Set();while(x?.parentId&&!seen.has(x.id)){seen.add(x.id);state.expanded.add(x.parentId);x=pageById(x.parentId)}}
 setRoute();render(true);window.scrollTo({top:0});
}
async function createPage(parentId=null){
 const id=uuid();const newPage={id,title:'제목 없음',icon:'📄',parentId:parentId||null,order:Date.now(),createdAt:now(),updatedAt:now()};
 localUpdate('pages',newPage);
 if(parentId)state.expanded.add(parentId);
 showPage(id);const input=app.querySelector('[data-title]');if(input){input.focus();input.select()}
 try{await put('pages',newPage)}catch(err){notice('페이지 생성 실패: '+err.message)}
}
// Notion-like /page command: convert the current text block into an embedded child-page link.
async function createInlinePage(sourceBlockId=null){
 if(state.creatingInline || !state.current || !pageById(state.current))return;
 const source=sourceBlockId?blockById(sourceBlockId):null;
 if(sourceBlockId && (!source || source.pageId!==state.current || pageRefId(source.text)))return;
 state.creatingInline=true;
 const timestamp=now();
 const child={id:uuid(),title:'제목 없음',icon:'📄',parentId:state.current,order:Date.now(),createdAt:timestamp,updatedAt:timestamp};
 let order=(pageBlocks(state.current).at(-1)?.order??0)+1024;
 const link=source?{...source,type:'text',text:pageLinkText(child.id),checked:false,updatedAt:timestamp}:
   {id:uuid(),pageId:state.current,type:'text',text:pageLinkText(child.id),checked:false,order,createdAt:timestamp,updatedAt:timestamp};
 try{
  document.querySelector('.slash-menu')?.remove();
  if(source)clearPending('blocks',source.id);
  if(state.mode==='cloud'){
   const batch=fb.writeBatch(fb.db);
   batch.set(fb.doc(pagesColl(),child.id),child);
   batch.set(fb.doc(blocksColl(),link.id),link);
   await batch.commit();
  }
  localUpdate('pages',child);
  localUpdate('blocks',link);
  if(state.mode==='demo')saveDemo();
  state.expanded.add(child.parentId);
  showPage(child.id);
  notice('하위 페이지를 만들었어요.');
 }catch(err){
  notice('하위 페이지를 만들지 못했어요: '+err.message);
  render(true);
 }finally{state.creatingInline=false}
}
const slashCommands=[
 {id:'text',icon:'¶',name:'일반 텍스트',desc:'기본 문단',keys:'text 본문 기본 문단 paragraph'},
 {id:'h1',icon:'H₁',name:'제목 1',desc:'큰 제목',keys:'h1 heading1 제목1 큰제목'},
 {id:'h2',icon:'H₂',name:'제목 2',desc:'중간 제목',keys:'h2 heading2 제목2'},
 {id:'h3',icon:'H₃',name:'제목 3',desc:'작은 제목',keys:'h3 heading3 제목3'},
 {id:'bullet',icon:'•',name:'글머리 기호 목록',desc:'목록 작성',keys:'bullet ul list 목록 글머리'},
 {id:'number',icon:'1.',name:'번호 목록',desc:'번호가 붙는 목록',keys:'number ol list 번호'},
 {id:'todo',icon:'☑',name:'체크리스트',desc:'체크할 수 있는 할 일',keys:'todo checkbox check task 체크 할일'},
 {id:'quote',icon:'❝',name:'인용문',desc:'인용 블록',keys:'quote 인용'},
 {id:'code',icon:'</>',name:'코드',desc:'여러 줄 코드 작성',keys:'code 코드'},
 {id:'divider',icon:'—',name:'구분선',desc:'가로 구분선',keys:'divider line hr 구분선'},
 {id:'page',icon:'📄',name:'하위 페이지',desc:'현재 위치에 페이지 만들기',keys:'page subpage 하위 페이지'},
 {id:'image',icon:'🖼️',name:'이미지 업로드',desc:'파일 선택 또는 Ctrl+V',keys:'image img 사진 그림 업로드'},
 {id:'image-url',icon:'🔗',name:'이미지 URL',desc:'이미지 링크 붙여넣기',keys:'url image link 이미지 링크'}
];
function commandMatches(raw){
 const text=String(raw||'').trim();
 if(!/^[/\\][^\n]{0,35}$/.test(text))return [];
 const query=text.slice(1).toLowerCase().trim();
 return slashCommands.filter(cmd=>(cmd.id+' '+cmd.name+' '+cmd.keys).toLowerCase().includes(query));
}
function selectedSlashCommand(){
 const menu=document.querySelector('.slash-menu');if(!menu)return null;
 return menu.querySelector('.slash-command.active')?.dataset.command||null
}
function moveSlashSelection(delta){
 const menu=document.querySelector('.slash-menu');
 if(!menu)return false;
 const buttons=[...menu.querySelectorAll('.slash-command')];
 if(!buttons.length)return false;
 let index=buttons.findIndex(b=>b.classList.contains('active'));
 index=(index+delta+buttons.length)%buttons.length;
 buttons.forEach((b,i)=>b.classList.toggle('active',i===index));
 buttons[index].scrollIntoView({block:'nearest'});
 return true
}
async function runCommand(commandId,blockId){
 document.querySelector('.slash-menu')?.remove();
 if(commandId==='page'){await createInlinePage(blockId);return}
 if(commandId==='image'){chooseImageFile(blockId);return}
 if(commandId==='image-url'){await addImageURL(blockId);return}
 const b=blockById(blockId);if(!b)return;
 const command=slashCommands.find(c=>c.id===commandId);if(!command)return;
 clearPending('blocks',b.id);
 const item={...b,type:commandId,text:'',checked:false,updatedAt:now()};
 localUpdate('blocks',item);
 render(true);
 focusBlock(b.id,0);
 await saveImmediate('blocks',item);
 if(commandId==='divider'){await createBlock(b.id,'text');return}
}
function showSlashMenu(blockId,raw){
 document.querySelector('.slash-menu')?.remove();
 const commands=commandMatches(raw);
 const row=app.querySelector('[data-row="'+blockId+'"]');
 if(!row||!commands.length)return;
 const menu=document.createElement('div');
 menu.className='slash-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label','명령어');
 menu.innerHTML='<div class="slash-heading">기본 블록 · 서식과 삽입</div>'+commands.map((cmd,i)=>
  '<button type="button" role="option" class="slash-command '+(i===0?'active':'')+'" data-command="'+cmd.id+'"><span class="slash-command-icon">'+cmd.icon+'</span><span><b>'+cmd.name+'</b><small>'+cmd.desc+'</small></span><span class="slash-command-key">'+(i===0?'↵':'')+'</span></button>').join('');
 menu.addEventListener('pointerdown',ev=>ev.preventDefault());
 menu.querySelectorAll('[data-command]').forEach(btn=>btn.addEventListener('click',()=>runCommand(btn.dataset.command,blockId)));
 row.appendChild(menu);
}


async function createBlock(afterId=null,type='text',initialText='',focusAt=null){
 const current=state.current;const sorted=pageBlocks(current);
 let order=1024;
 if(afterId){
  const ix=sorted.findIndex(b=>b.id===afterId);
  const a=sorted[ix]?.order??0;const b=sorted[ix+1]?.order;
  order=(b!==undefined)?(a+b)/2:a+1024
 }else if(sorted.length)order=(sorted[sorted.length-1].order??0)+1024;
 const item={id:uuid(),pageId:current,type,text:initialText,checked:false,order,createdAt:now(),updatedAt:now()};
 localUpdate('blocks',item);state.drafts.set('blocks:'+item.id,item);render(true);focusBlock(item.id,focusAt);
 try{await put('blocks',item);if(state.drafts.get('blocks:'+item.id)===item)state.drafts.delete('blocks:'+item.id)}catch(err){notice('블록 생성 실패: '+err.message)}
}

const MAX_IMAGE_DATA_URL=650000; // Base64 characters; comfortably below Firestore's 1 MiB document limit.
function slashImageQuery(value){return /^[/\\](?:i|im|img|ima|imag|image|이|이미|이미지)$/.test(String(value||'').trim().toLowerCase())}
function imageContext(sourceBlockId=null,afterId=null){
 const source=sourceBlockId?blockById(sourceBlockId):null;
 const replaceId=source && (!source.text.trim()||slashImageQuery(source.text))?source.id:null;
 return {pageId:source?.pageId||state.current,replaceId,afterId:replaceId?null:(afterId||source?.id||null)}
}
function chooseImageFile(sourceBlockId=null,afterId=null){
 const context=imageContext(sourceBlockId,afterId);
 if(!pageById(context.pageId)){notice('먼저 페이지를 열어 주세요.');return}
 const input=document.createElement('input');
 input.type='file';input.accept='image/png,image/jpeg,image/webp';
 input.setAttribute('aria-label','이미지 파일 선택');
 input.style.display='none';
 document.body.appendChild(input);
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];input.remove();
  if(file)await uploadImage(file,context)
 },{once:true});
 input.addEventListener('cancel',()=>input.remove(),{once:true});
 input.click();
}
async function compressImage(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('PNG, JPEG, WebP 이미지만 지원합니다.');
 if(file.size>15*1024*1024)throw Error('원본 이미지 크기는 15MB 이하여야 합니다.');
 const fileUrl=URL.createObjectURL(file);
 let img;
 try{
  img=await new Promise((resolve,reject)=>{
   const i=new Image();
   i.onload=()=>resolve(i);
   i.onerror=()=>reject(Error('이미지를 열 수 없습니다.'));
   i.src=fileUrl
  });
 }finally{URL.revokeObjectURL(fileUrl)}
 if(!img.naturalWidth||!img.naturalHeight)throw Error('이미지 크기를 확인할 수 없습니다.');
 const canvas=document.createElement('canvas');
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('이미지 압축을 지원하지 않는 브라우저입니다.');
 let scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
 let quality=.9;
 for(let attempt=0;attempt<18;attempt++){
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  // White background avoids black transparency when a JPEG fallback is used.
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let dataUrl=canvas.toDataURL('image/webp',quality);
  if(!dataUrl.startsWith('data:image/webp;'))dataUrl=canvas.toDataURL('image/jpeg',quality);
  if(dataUrl.length<=MAX_IMAGE_DATA_URL)return dataUrl;
  if(quality>.55)quality=Math.max(.55,quality-.11);else{scale*=.82;quality=.8}
 }
 throw Error('이미지를 더 압축할 수 없습니다. 다른 이미지를 사용해 주세요.')
}
async function saveImageBlock(text,context,asset=null){
 if(!pageById(context.pageId))throw Error('페이지가 삭제되어 이미지를 삽입할 수 없습니다.');
 const old=context.replaceId?blockById(context.replaceId):null;
 const timestamp=now();
 const block=old?{...old,type:'text',text,checked:false,updatedAt:timestamp}:
  {id:uuid(),pageId:context.pageId,type:'text',text,checked:false,order:afterOrder(context.pageId,context.afterId),createdAt:timestamp,updatedAt:timestamp};
 const assetId=asset?.id;
 if(old)clearPending('blocks',old.id);
 if(state.mode==='cloud'){
  // Create the asset before publishing a reference to it, avoiding broken links for other editors.
  if(asset)await fb.setDoc(fb.doc(imageColl(),asset.id),asset);
  try{await put('blocks',block)}
  catch(err){
   if(asset)await fb.deleteDoc(fb.doc(imageColl(),asset.id)).catch(()=>{});
   throw err
  }
 }else{
  if(asset)state.images.set(asset.id,asset);
  localUpdate('blocks',block);
  saveDemo()
 }
 if(state.mode==='cloud'){localUpdate('blocks',block);if(asset)state.images.set(asset.id,asset)}
 if(state.current===context.pageId && state.screen==='page')render(true);
 if(assetId)document.querySelectorAll('[data-image-view="'+assetId+'"]').forEach(el=>{el.src=asset.dataUrl;el.hidden=false;el.closest('.image-frame')?.classList.remove('waiting')});
 notice('이미지를 삽입했어요.')
}
async function uploadImage(file,context){
 try{
  notice('이미지를 최적화하는 중…');
  const dataUrl=await compressImage(file);
  const asset={id:uuid(),pageId:context.pageId,name:file.name.slice(0,120),dataUrl,bytes:imageByteSize(dataUrl),createdAt:now()};
  await saveImageBlock(imageLinkText(asset.id),context,asset);
 }catch(err){
  notice(err.code==='permission-denied'?'이미지 저장 권한이 없습니다. GitHub의 최신 firestore.rules를 Firebase에서 다시 게시해 주세요.':'이미지 업로드 실패: '+err.message)
 }
}
async function addImageURL(sourceId=null){
 const entered=prompt('이미지 주소(https://)를 붙여넣어 주세요.');
 if(entered===null)return;
 try{
  const u=new URL(entered.trim());
  if(u.protocol!=='https:'||u.href.length>1800)throw Error('1800자 이하의 HTTPS 이미지 주소를 사용해 주세요.');
  await saveImageBlock(imageURLText(u.href),imageContext(sourceId));
 }catch(err){notice('이미지 주소 오류: '+err.message)}
}
function handleImagePaste(ev){
 const item=Array.from(ev.clipboardData?.items||[]).find(i=>i.type.startsWith('image/'));
 if(!item)return;
 const file=item.getAsFile();
 if(!file)return;
 ev.preventDefault();
 const field=ev.target.closest('[data-block-edit]');
 const source=field?blockById(field.dataset.blockEdit):null;
 const replace=source && (source.text.trim()===''||slashImageQuery(source.text));
 uploadImage(file,imageContext(replace?source?.id:null,replace?null:source?.id||null))
}
function bindImageDrop(){
 const canvas=app.querySelector('.canvas');
 if(!canvas)return;
 canvas.addEventListener('dragover',ev=>{if(Array.from(ev.dataTransfer?.types||[]).includes('Files')){ev.preventDefault();canvas.classList.add('image-dragover')}});
 canvas.addEventListener('dragleave',ev=>{if(!canvas.contains(ev.relatedTarget))canvas.classList.remove('image-dragover')});
 canvas.addEventListener('drop',ev=>{
  canvas.classList.remove('image-dragover');
  const file=Array.from(ev.dataTransfer?.files||[]).find(f=>f.type.startsWith('image/'));
  if(!file)return;
  ev.preventDefault();
  const row=ev.target.closest('[data-row]');
  uploadImage(file,imageContext(null,row?.dataset.row||null))
 });
}

function autoSize(el){
 if(!el||el.tagName!=='TEXTAREA')return;
 el.style.height='auto';
 el.style.height=Math.max(34,el.scrollHeight)+'px';
}
function focusBlock(id,offset=null){
 const el=app.querySelector('[data-block-edit="'+id+'"]');
 if(!el)return;
 el.focus();
 const n=offset===null?el.value.length:Math.min(offset,el.value.length);
 el.setSelectionRange(n,n);autoSize(el);
}
function clearPending(kind,id){const k=kind+':'+id;clearTimeout(state.pending.get(k));state.pending.delete(k);state.drafts.delete(k)}
async function deleteBlock(id){
 const b=blockById(id);if(!b)return;clearPending('blocks',id);
 const imageId=imageRefId(b.text);
 state.blocks=state.blocks.filter(x=>x.id!==id);render(true);
 try{
  await erase('blocks',id);
  if(imageId&&!state.blocks.some(x=>imageRefId(x.text)===imageId)){
   state.images.delete(imageId);
   if(state.mode==='cloud')await fb.deleteDoc(fb.doc(imageColl(),imageId));
   else saveDemo();
  }
 }catch(err){notice('블록 삭제 실패: '+err.message)}
}
async function deleteCurrentPage(){
 const p=pageById(state.current);if(!p)return;
 const affected=new Set([p.id]);
 let expanded=true;
 while(expanded){expanded=false;for(const item of state.pages)if(item.parentId&&affected.has(item.parentId)&&!affected.has(item.id)){affected.add(item.id);expanded=true}}
 if(!confirm('“'+p.title+'” 페이지와 하위 페이지 '+(affected.size-1)+'개, 해당 본문을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.'))return;
 const removedBlocks=state.blocks.filter(b=>affected.has(b.pageId)||affected.has(pageRefId(b.text))).map(b=>b.id);
 const removedSet=new Set(removedBlocks);
 const imageIds=[...new Set(state.blocks.filter(b=>removedSet.has(b.id)).map(b=>imageRefId(b.text)).filter(Boolean))].filter(id=>!state.blocks.some(b=>!removedSet.has(b.id)&&imageRefId(b.text)===id));
 for(const id of removedBlocks)clearPending('blocks',id);
 for(const id of affected)clearPending('pages',id);
 state.pages=state.pages.filter(x=>!affected.has(x.id));state.blocks=state.blocks.filter(x=>!removedSet.has(x.id));
 for(const id of imageIds)state.images.delete(id);
 const parent=p.parentId;state.current=pageById(parent)?.id||children(null)[0]?.id||state.pages[0]?.id||null;
 state.screen='page';setRoute(true);
 if(state.mode==='demo'){saveDemo();render(true);return}
 try{
  const tasks=[...[...affected].map(id=>['pages',id]),...removedBlocks.map(id=>['blocks',id]),...imageIds.map(id=>['images',id])];
  for(let i=0;i<tasks.length;i+=450){const batch=fb.writeBatch(fb.db);for(const [kind,id] of tasks.slice(i,i+450))batch.delete(fb.doc(kind==='pages'?pagesColl():kind==='images'?imageColl():blocksColl(),id));await batch.commit()}
  if(!state.pages.length)await createPage(null);
  render(true)
 }catch(err){notice('일부 항목 삭제 실패: '+err.message)}
 if(!state.pages.length&&state.mode==='demo')await createPage(null);
}
async function moveCurrentPage(){
 const p=pageById(state.current);if(!p)return;
 const available=state.pages.filter(x=>x.id!==p.id&&pagePath(x).every(y=>y.id!==p.id));
 const list=['0. 최상위 페이지',...available.map((x,i)=>(i+1)+'. '+pagePath(x).map(v=>v.title).join(' / '))];
 const answer=prompt('이동할 상위 페이지의 번호를 입력하세요:\n'+list.join('\n'),'0');
 if(answer===null)return;const n=Number(answer);if(!Number.isInteger(n)||n<0||n>available.length){notice('잘못된 번호입니다.');return}
 await saveImmediate('pages',{...p,parentId:n===0?null:available[n-1].id,updatedAt:now()});render(true)
}
async function renameIcon(){
 const p=pageById(state.current);if(!p)return;
 const input=prompt('페이지 아이콘으로 사용할 이모지를 입력하세요.',p.icon||'📄');
 if(input===null)return;
 await saveImmediate('pages',{...p,icon:input.trim().slice(0,8)||'📄',updatedAt:now()});render(true)
}
function copyShare(){
 if(state.mode==='demo'){
  modal.className='share-modal';
  modal.innerHTML='<h2>공유는 Firebase 연결 후 가능해요</h2><p>지금은 작성한 페이지가 현재 브라우저에만 저장되므로, 링크를 보내도 다른 사람은 같은 내용을 볼 수 없습니다.</p><p>GitHub README의 Firebase 설정 방법에 따라 익명 인증과 Firestore를 활성화하면 링크를 가진 누구나 로그인 절차 없이 공동 편집할 수 있어요.</p><div class="modal-actions"><button data-close-modal>닫기</button></div>';modal.showModal();modal.querySelector('[data-close-modal]').onclick=()=>modal.close();return
 }
 const url=location.origin+location.pathname+location.search+'#space='+space;
 modal.className='share-modal';
 modal.innerHTML='<h2>워크스페이스 공유</h2><p>아래 링크를 가진 모든 사람은 페이지와 본문을 생성·수정·삭제할 수 있어요. 별도의 회원가입이나 승인이 필요하지 않습니다.</p><input id="share-url" class="share-input" readonly value="'+e(url)+'"><p>⚠️ 링크가 유출되면 제3자도 편집할 수 있습니다. 중요한 개인정보, 비밀번호, 민감한 자료는 저장하지 마세요. 수정 이력과 복원 기능은 현재 제공되지 않습니다.</p><div class="modal-actions"><button data-close-modal>닫기</button><button class="primary" id="copy-url">링크 복사</button></div>';
 modal.showModal();modal.querySelector('[data-close-modal]').onclick=()=>modal.close();modal.querySelector('#copy-url').onclick=async()=>{try{await navigator.clipboard.writeText(url);notice('공유 링크를 복사했어요.');modal.close()}catch{document.getElementById('share-url').select();notice('주소를 선택했습니다. 직접 복사해 주세요.')}};
}
function blockMenu(id){
 const box=app.querySelector('[data-row="'+id+'"]');if(!box)return;
 const old=document.querySelector('.floating-menu');if(old)old.remove();
 const r=box.getBoundingClientRect();
 const menu=document.createElement('div');menu.className='floating-menu';menu.style.left=Math.max(8,Math.min(r.left+44,innerWidth-200))+'px';menu.style.top=Math.min(r.top+32,innerHeight-225)+'px';menu.innerHTML='<button data-block-action="up">↑ 위로 이동</button><button data-block-action="down">↓ 아래로 이동</button><button data-block-action="duplicate">⧉ 복제</button><button data-block-action="delete">🗑 삭제</button>';
 document.body.appendChild(menu);
 menu.querySelectorAll('button').forEach(b=>b.onclick=()=>{const action=b.dataset.blockAction;menu.remove();actOnBlock(id,action)});
 const away=ev=>{if(!menu.contains(ev.target)&&!ev.target.closest('[data-block-menu]')){menu.remove();document.removeEventListener('pointerdown',away)}};setTimeout(()=>document.addEventListener('pointerdown',away),0)
}
async function actOnBlock(id,action){
 const b=blockById(id);if(!b)return;
 if(action==='delete'){await deleteBlock(id);return}
 if(action==='duplicate'){const items=pageBlocks(b.pageId);const i=items.findIndex(x=>x.id===id),after=items[i+1];const copy={...b,id:uuid(),order:after?(b.order+after.order)/2:b.order+1024,createdAt:now(),updatedAt:now()};localUpdate('blocks',copy);render(true);await saveImmediate('blocks',copy);return}
 const siblings=pageBlocks(b.pageId),i=siblings.findIndex(x=>x.id===id);
 const other=siblings[i+(action==='up'?-1:1)];if(!other)return;
 const old=b.order;await Promise.all([saveImmediate('blocks',{...b,order:other.order,updatedAt:now()}),saveImmediate('blocks',{...other,order:old,updatedAt:now()})]);render(true)
}

function markdownLine(raw){
 const text=String(raw);
 const rules=[
  [/^###\s+(.+)$/,'h3'],[/^##\s+(.+)$/,'h2'],[/^#\s+(.+)$/,'h1'],
  [/^[-*]\s+\[([xX ])\]\s*(.*)$/,'todo'],
  [/^[-*]\s+(.+)$/,'bullet'],[/^\d+[.)]\s+(.+)$/,'number'],
  [/^>\s+(.+)$/,'quote']
 ];
 for(const [reg,type] of rules){
  const m=text.match(reg);
  if(!m)continue;
  if(type==='todo')return {type,text:m[2],checked:m[1].toLowerCase()==='x'};
  return {type,text:m[1],checked:false}
 }
 return {type:'text',text,checked:false}
}
function matchMarkdownShortcut(text){
 const map=[[/^# $/,'h1'],[/^## $/,'h2'],[/^### $/,'h3'],[/^[-*] $/,'bullet'],[/^1[.)] $/,'number'],[/^> $/,'quote'],[/^[-*] \[ \] $/,'todo']];
 return map.find(([re])=>re.test(text))?.[1]||null
}
async function applyShorthand(block,type){
 const update={...block,type,text:'',checked:false,updatedAt:now()};
 clearPending('blocks',block.id);
 localUpdate('blocks',update);render(true);focusBlock(block.id,0);
 await saveImmediate('blocks',update)
}
function newBlockAfter(block,type,text,checked=false,order=null){
 return {id:uuid(),pageId:block.pageId,type,text,checked,
  order:order??afterOrder(block.pageId,block.id),createdAt:now(),updatedAt:now()}
}
async function splitBlockAtCursor(el,block){
 const start=el.selectionStart,end=el.selectionEnd;
 const current=el.value;const before=current.slice(0,start),after=current.slice(end);
 if(!before&&!after&&['bullet','number','todo','quote','h1','h2','h3'].includes(block.type)){
  await applyShorthand(block,'text');return
 }
 const original={...block,text:before,updatedAt:now()};
 debounceSave('blocks',original);
 let nextType=['bullet','number','todo'].includes(block.type)?block.type:'text';
 await createBlock(block.id,nextType,after,0);
}
async function mergeWithPrevious(el,b){
 const blocks=pageBlocks(b.pageId),index=blocks.findIndex(x=>x.id===b.id);
 if(index<=0)return false;
 const prior=blocks[index-1];
 if(!prior||pageRefId(prior.text)||imageRefId(prior.text)||imageURL(prior.text)||prior.type==='divider')return false;
 if(prior.text.length+el.value.length>20000){notice('문단이 너무 길어 합칠 수 없습니다.');return true}
 const offset=prior.text.length;
 const item={...prior,text:prior.text+el.value,updatedAt:now()};
 clearPending('blocks',prior.id);
 clearPending('blocks',b.id);
 localUpdate('blocks',item);
 state.blocks=state.blocks.filter(x=>x.id!==b.id);
 state.drafts.set('blocks:'+item.id,item);
 render(true);focusBlock(item.id,offset);
 try{
  if(state.mode==='cloud'){
   const batch=fb.writeBatch(fb.db);
   batch.set(fb.doc(blocksColl(),item.id),item);
   batch.delete(fb.doc(blocksColl(),b.id));
   await batch.commit();
  }else saveDemo();
  if(state.drafts.get('blocks:'+item.id)===item)state.drafts.delete('blocks:'+item.id);
 }catch(err){notice('문단 병합 저장 실패: '+err.message)}
 return true
}
function clipboardLines(value){
 const normalized=String(value).replace(/\r\n?/g,'\n');
 const raw=normalized.split('\n');
 if(raw.length<=250)return raw;
 // Keep all content while avoiding thousands of individual Firestore writes.
 const group=Math.ceil(raw.length/250);
 const grouped=[];
 for(let i=0;i<raw.length;i+=group)grouped.push(raw.slice(i,i+group).join('\n'));
 return grouped
}
async function pasteMultiline(el,b,plain){
 if(plain.length>300000){notice('붙여넣기가 너무 깁니다. 내용을 나눠서 붙여넣어 주세요.');return}
 const before=el.value.slice(0,el.selectionStart),after=el.value.slice(el.selectionEnd);
 const chunks=clipboardLines(plain);
 const first=before+chunks[0];
 let current={...b,text:first,updatedAt:now()};
 if(!before&&!b.text.trim()){
  const parsed=markdownLine(chunks[0]);
  current={...current,type:parsed.type,text:parsed.text,checked:parsed.checked}
 }
 const source=pageBlocks(b.pageId),pos=source.findIndex(x=>x.id===b.id);
 const next=source[pos+1];const n=chunks.length-1;
 const step=next?(next.order-b.order)/(n+1):1024;
 const additions=[];
 for(let i=1;i<chunks.length;i++){
  const parsed=markdownLine(chunks[i]);
  const isLast=i===chunks.length-1;
  const text=parsed.text+(isLast?after:'');
  if(text.length>20000){notice('일부 문단이 너무 깁니다. 텍스트를 나눠서 붙여넣어 주세요.');return}
  additions.push(newBlockAfter(b,parsed.type,text,parsed.checked,b.order+step*i))
 }
 if(current.text.length>20000){notice('문단이 너무 깁니다. 나눠서 붙여넣어 주세요.');return}
 clearPending('blocks',b.id);
 const all=[current,...additions];
 for(const item of all){localUpdate('blocks',item);state.drafts.set('blocks:'+item.id,item)}
 render(true);
 focusBlock(additions.at(-1)?.id||b.id,additions.length?additions.at(-1).text.length-after.length:current.text.length);
 try{
  if(state.mode==='cloud'){
   for(let k=0;k<all.length;k+=400){
    const batch=fb.writeBatch(fb.db);
    for(const item of all.slice(k,k+400))batch.set(fb.doc(blocksColl(),item.id),item);
    await batch.commit()
   }
  }else saveDemo();
  for(const item of all){const key='blocks:'+item.id;if(state.drafts.get(key)===item)state.drafts.delete(key)}
  notice(chunks.length+'개 문단을 붙여넣었어요.')
 }catch(err){notice('여러 문단 저장 실패: '+err.message)}
}
function handleTextPaste(ev){
 if(ev.defaultPrevented)return;
 const el=ev.target.closest('textarea[data-block-edit]');
 if(!el)return;
 const b=blockById(el.dataset.blockEdit);
 if(!b)return;
 const text=ev.clipboardData?.getData('text/plain');
 if(!text||!text.includes('\n')||b.type==='code')return;
 ev.preventDefault();
 pasteMultiline(el,b,text)
}
function plainBlock(b){
 const pageId=pageRefId(b.text),imageId=imageRefId(b.text),url=imageURL(b.text);
 if(pageId)return '📄 '+(pageById(pageId)?.title||'삭제된 페이지');
 if(imageId||url)return '[이미지]';
 const prefix={h1:'# ',h2:'## ',h3:'### ',bullet:'- ',number:'1. ',todo:b.checked?'- [x] ':'- [ ] ',quote:'> '}[b.type]||'';
 if(b.type==='divider')return '---';
 return prefix+b.text
}
async function copyDocument(){
 const p=pageById(state.current);if(!p)return;
 const content=[p.title,'',...pageBlocks(p.id).map(plainBlock)].join('\n');
 try{await navigator.clipboard.writeText(content);notice('현재 페이지 전체 내용을 복사했어요.')}
 catch(err){
  modal.className='share-modal';modal.innerHTML='<h2>전체 내용 복사</h2><textarea id="copy-doc-content" style="width:100%;min-height:220px"></textarea><div class="modal-actions"><button data-close-modal>닫기</button></div>';
  modal.showModal();modal.querySelector('textarea').value=content;modal.querySelector('textarea').select();modal.querySelector('[data-close-modal]').onclick=()=>modal.close();
 }
}

// Stable click delegation: rerenders and live Firestore updates must never detach navigation.
app.addEventListener('click',event=>{
 // Only explicit navigation controls are clickable; the editor host may contain
 // metadata attributes and must not swallow clicks on embedded Tiptap page cards.
 const node=event.target instanceof Element
  ?event.target.closest('button[data-page],a[data-page]'):null;
 if(!node||!app.contains(node))return;
 const pageId=node.dataset.page;
 if(!pageId)return;
 event.preventDefault();
 event.stopPropagation();
 showPage(pageId);
},true);
function bind(){
 bindImageDrop();
 const blockArea=app.querySelector('.blocks');if(blockArea)blockArea.addEventListener('paste',ev=>{handleImagePaste(ev);if(!ev.defaultPrevented)handleTextPaste(ev)});
 app.querySelectorAll('[data-new-child]').forEach(x=>x.onclick=()=>createPage(x.dataset.newChild||null));
 app.querySelectorAll('[data-expand]').forEach(x=>x.onclick=()=>{const id=x.dataset.expand;if(state.expanded.has(id))state.expanded.delete(id);else state.expanded.add(id);render(true)});
 app.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>{switch(x.dataset.action){
  case 'search':navigateView('search');document.getElementById('search-field')?.focus();break;
  case 'home':navigateView('all');break;
  case 'sidebar':toggleSidebar();break;
  case 'share':copyShare();break;
  case 'icon':renameIcon();break;
  case 'add-block':createBlock();break;
   case 'start-writing':createBlock();break;
   case 'copy-document':copyDocument();break;
   case 'inline-page':createInlinePage();break;
   case 'upload-image':chooseImageFile();break;
   case 'image-url':addImageURL();break;
  case 'move-page':moveCurrentPage();break;
  case 'delete-page':deleteCurrentPage();break;
 }});
 const q=document.getElementById('search-field');if(q)q.oninput=ev=>{state.search=ev.target.value.toLowerCase();const matches=state.pages.filter(p=>!state.search||p.title.toLowerCase().includes(state.search)||state.blocks.some(b=>b.pageId===p.id&&b.text.toLowerCase().includes(state.search)));document.getElementById('results').innerHTML=searchMatches(matches);void 0};
 const title=app.querySelector('[data-title]');if(title){title.oninput=ev=>{const p=pageById(ev.target.dataset.title);if(p)debounceSave('pages',{...p,title:ev.target.value||'',updatedAt:now()})};title.onblur=()=>setTimeout(()=>render(),100);title.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();ev.target.blur()}}}
 app.querySelectorAll('[data-add-after]').forEach(x=>x.onclick=()=>createBlock(x.dataset.addAfter));
 app.querySelectorAll('[data-block-menu]').forEach(x=>x.onclick=()=>blockMenu(x.dataset.blockMenu));
 app.querySelectorAll('[data-block-type]').forEach(x=>x.onchange=async()=>{const b=blockById(x.dataset.blockType);if(!b)return;if(x.value==='page'){createInlinePage(b.id);return}if(x.value==='image'){chooseImageFile(b.id);return}await saveImmediate('blocks',{...b,type:x.value,updatedAt:now()});render(true)});
 app.querySelectorAll('[data-check]').forEach(x=>x.onchange=async()=>{const b=blockById(x.dataset.check);if(b){await saveImmediate('blocks',{...b,checked:x.checked,updatedAt:now()});render(true)}});
 app.querySelectorAll('textarea[data-block-edit]').forEach(x=>{
  x.oninput=()=>{
   const b=blockById(x.dataset.blockEdit);if(!b)return;
   autoSize(x);
   const shortcut=matchMarkdownShortcut(x.value);
   if(shortcut&&x.selectionStart===x.value.length){
    document.querySelector('.slash-menu')?.remove();
    applyShorthand(b,shortcut);return;
   }
   debounceSave('blocks',{...b,text:x.value,updatedAt:now()});
   if(commandMatches(x.value).length && x.selectionStart===x.value.length)showSlashMenu(b.id,x.value);
   else document.querySelector('.slash-menu')?.remove()
  };
  x.onblur=()=>setTimeout(()=>{
   const menu=document.querySelector('.slash-menu');
   if(menu&&!menu.matches(':hover'))menu.remove();
   render()
  },160);
  x.onkeydown=ev=>{
   const id=x.dataset.blockEdit,b=blockById(id);
   if(!b||ev.isComposing||ev.keyCode===229)return;
   const menu=document.querySelector('.slash-menu');
   if(ev.key==='Escape'){menu?.remove();return}
   if(menu&&menu.closest('[data-row]')?.dataset.row===id){
    if(ev.key==='ArrowDown'){ev.preventDefault();moveSlashSelection(1);return}
    if(ev.key==='ArrowUp'){ev.preventDefault();moveSlashSelection(-1);return}
    if((ev.key==='Enter'||ev.key==='Tab')&&!ev.shiftKey){
     const command=selectedSlashCommand();
     if(command){ev.preventDefault();runCommand(command,id);return}
    }
   }
   if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();createBlock(id,'text');return}
   if(ev.key==='Enter'&&!ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&b.type!=='code'){
    ev.preventDefault();
    menu?.remove();
    splitBlockAtCursor(x,b);return
   }
   if(ev.key==='Backspace'&&!ev.shiftKey&&x.selectionStart===0&&x.selectionEnd===0){
    if(x.value.length===0&&b.type!=='text'){
     ev.preventDefault();applyShorthand(b,'text');return
    }
    const ordered=pageBlocks(b.pageId),ix=ordered.findIndex(y=>y.id===id);
    if(ix>0){
     ev.preventDefault();
     if(!x.value){
      const prior=ordered[ix-1],priorIsText=prior&&!pageRefId(prior.text)&&!imageRefId(prior.text)&&!imageURL(prior.text)&&prior.type!=='divider';
      deleteBlock(id);if(priorIsText)requestAnimationFrame(()=>focusBlock(prior.id));
     }else mergeWithPrevious(x,b);
     return
    }
   }
   if(!ev.shiftKey&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&(ev.key==='ArrowUp'||ev.key==='ArrowDown')){
    const ordered=pageBlocks(b.pageId),ix=ordered.findIndex(y=>y.id===id);
    if(ev.key==='ArrowUp'&&x.selectionStart===0&&ix>0){
     const prev=ordered[ix-1];if(prev&&!pageRefId(prev.text)&&!imageRefId(prev.text)&&!imageURL(prev.text)&&prev.type!=='divider'){
      ev.preventDefault();focusBlock(prev.id);return
     }
    }
    if(ev.key==='ArrowDown'&&x.selectionStart===x.value.length&&ix<ordered.length-1){
     const next=ordered[ix+1];if(next&&!pageRefId(next.text)&&!imageRefId(next.text)&&!imageURL(next.text)&&next.type!=='divider'){
      ev.preventDefault();focusBlock(next.id,0);return
     }
    }
   }
  };
 });
}
if(configured)initCloud();else initDemo();
