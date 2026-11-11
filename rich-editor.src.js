// Folio rich-text editor, built on Tiptap 3 / ProseMirror.
// Old Folio block records are only READ for initial migration. Rich edits are saved in
// separate, revisioned chunks inside the existing Firestore blocks collection.
import { Editor, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { TableMap } from '@tiptap/pm/tables';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';

const blankImage='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const FolioImage=Node.create({
 name:'folioImage',group:'block',atom:true,draggable:true,selectable:true,
 addAttributes(){return {imageId:{default:null},url:{default:null},alt:{default:'이미지'}}},
 parseHTML(){return [{tag:'figure[data-folio-image]'}]},
 renderHTML({node,HTMLAttributes}){
  const {imageId,url,alt}=node.attrs;
  const safe=typeof url==='string'&&/^https:\/\//.test(url)?url:blankImage;
  return ['figure',mergeAttributes(HTMLAttributes,{class:'folio-media','data-folio-image':imageId||''}),
   ['img',{src:safe,alt:alt||'이미지',loading:'lazy'}],
   ['figcaption',{},alt||'이미지']]
 }
});
const FolioSubpage=Node.create({
 name:'folioSubpage',group:'block',atom:true,selectable:true,draggable:true,
 addAttributes(){return {pageId:{default:null}}},
 parseHTML(){return [{tag:'div[data-folio-subpage]'}]},
 renderHTML({node,HTMLAttributes}){
  return ['div',mergeAttributes(HTMLAttributes,{
   class:'folio-subpage-node','data-folio-subpage':node.attrs.pageId||''
  }),['span',{class:'folio-page-icon'},'📄'],['span',{class:'folio-page-title'},'하위 페이지 열기'],['span',{class:'folio-page-note',hidden:true},'대상 페이지를 찾을 수 없음'],['button',{type:'button',class:'folio-remove-broken-link',hidden:true,'aria-label':'끊어진 페이지 링크 제거'},'링크 제거'],['span',{class:'folio-page-arrow'},'↗']]
 }
});
const actions=[
 {id:'paragraph',label:'일반 텍스트',hint:'문단',icon:'¶',keys:'paragraph text 본문'},
 {id:'h1',label:'제목 1',hint:'큰 제목',icon:'H₁',keys:'h1 heading 제목'},
 {id:'h2',label:'제목 2',hint:'중간 제목',icon:'H₂',keys:'h2 heading 제목'},
 {id:'h3',label:'제목 3',hint:'작은 제목',icon:'H₃',keys:'h3 heading 제목'},
 {id:'bullet',label:'글머리 목록',hint:'• 목록',icon:'•',keys:'bullet list 목록 글머리'},
 {id:'ordered',label:'번호 목록',hint:'1. 목록',icon:'1.',keys:'number ordered list 번호'},
 {id:'task',label:'체크리스트',hint:'선택 가능한 할 일',icon:'☑',keys:'task todo check 체크 할일'},
 {id:'quote',label:'인용문',hint:'인용',icon:'❝',keys:'blockquote quote 인용'},
 {id:'code',label:'코드 블록',hint:'여러 줄 코드',icon:'</>',keys:'code 코드'},
 {id:'rule',label:'구분선',hint:'가로선',icon:'—',keys:'line divider hr 구분선'},
 {id:'table',label:'표',hint:'3×3 표 삽입',icon:'▦',keys:'table 표 테이블'},
 {id:'page',label:'하위 페이지',hint:'현재 문서 안에 페이지',icon:'📄',keys:'page subpage 하위 페이지'},
 {id:'image',label:'이미지',hint:'파일 업로드',icon:'🖼️',keys:'image photo 이미지 그림'},
 {id:'image-url',label:'이미지 URL',hint:'웹 이미지 주소',icon:'🔗',keys:'url link 이미지 링크'},
 {id:'bold',label:'굵게',hint:'선택한 글 강조',icon:'B',keys:'bold strong 굵게'},
 {id:'italic',label:'기울임',hint:'이탤릭',icon:'I',keys:'italic 기울임'}
];
function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function isMarkdown(text){
 return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|.+\|\s*(\n|$)|---\s*$)|\*\*[^*\n]+\*\*|(^|\n)\s*[-*]\s*\[[ xX]\]/m.test(text)
}
function textMarkdown(block,api){
 if(!block)return '';
 const b=block,text=String(b.text||'');
 if(b.type==='divider')return '---';
 if(b.type==='h1')return '# '+text;
 if(b.type==='h2')return '## '+text;
 if(b.type==='h3')return '### '+text;
 if(b.type==='bullet')return '- '+text;
 if(b.type==='number')return '1. '+text;
 if(b.type==='todo')return '- ['+(b.checked?'x':' ')+'] '+text;
 if(b.type==='quote')return text.split('\n').map(x=>'> '+x).join('\n');
 if(b.type==='code')return '~~~\n'+text+'\n~~~';
 return text
}
function legacyContent(editor,blocks,api){
 const content=[];let lines=[];
 function flush(){
  if(!lines.length)return;
  const source=lines.join('');
  try{
   const parsed=editor.markdown.parse(source);
   if(parsed?.content?.length)content.push(...parsed.content);
   else content.push({type:'paragraph',content:[{type:'text',text:source}]});
  }catch{
   const safe=source.trim();if(safe)content.push({type:'paragraph',content:[{type:'text',text:safe}]})
  }
  lines=[]
 }
 let previousIsTable=false,previousList=false;
 for(const block of blocks){
  if(!block||!block.text?.trim()&&block.type!=='divider')continue;
  const raw=String(block.text||'');
  const page=/^\[\[folio-page:([a-zA-Z0-9-]+)\]\]$/.exec(raw);
  const image=/^\[\[folio-image:([a-zA-Z0-9-]+)\]\]$/.exec(raw);
  const url=/^\[\[folio-image-url:(.+)\]\]$/.exec(raw);
  if(page||image||url){
   flush();
   if(page)content.push({type:'folioSubpage',attrs:{pageId:page[1]}});
   else if(image)content.push({type:'folioImage',attrs:{imageId:image[1],alt:'첨부 이미지'}});
   else {
    let src='';
    try{src=decodeURIComponent(url[1])}catch{}
    if(/^https:\/\//.test(src))content.push({type:'folioImage',attrs:{url:src,alt:'링크 이미지'}})
   }
   previousIsTable=false;previousList=false;continue
  }
  const converted=textMarkdown(block,api);
  const tableLine=/^\s*\|.*\|\s*$/.test(converted);
  const isList=['bullet','number','todo'].includes(block.type)||/^\s*(?:[-*+]\s|\d+[.)]\s)/.test(converted);
  const glue=lines.length===0?'':(tableLine&&previousIsTable)||(isList&&previousList)?'\n':'\n\n';
  lines.push(glue+converted);
  previousIsTable=tableLine;previousList=isList;
 }
 flush();
 return {type:'doc',content:content.length?content:[{type:'paragraph'}]}
}
function newMenu(){
 const el=document.createElement('div');
 el.className='folio-rich-slash';
 el.style.display='none';
 el.setAttribute('role','listbox');el.setAttribute('aria-label','삽입 메뉴');
 document.body.appendChild(el);return el
}
function isRichImage(node){return node?.type?.name==='folioImage'}
function hasClipboardFile(event){
 return [...event.clipboardData?.items||[]].some(x=>x.type?.startsWith('image/'))
}
export async function mountFolioEditor(host,api){
 let current=api.readRich();
 let revision=current?.revision||null;
 let draft=false,saving=false,conflict=false,disposed=false,changed=0,timer=null,inFlightSave=null,navigating=false;
 let lastRemote=revision,menuQuery=null,selected=0,menuFrom=0,menuTo=0;
 const backupKey='folio-rich-unsaved-'+api.workspace+'-'+api.pageId;
 function saveCrashBackup(){
  try{localStorage.setItem(backupKey,JSON.stringify({at:Date.now(),revision,doc:editor.getJSON()}))}catch{}
 }
 function clearCrashBackup(){try{localStorage.removeItem(backupKey)}catch{}}
 const root=document.createElement('div');root.className='folio-rich';
 host.replaceChildren(root);
 root.innerHTML='<div class="folio-rich-toolbar" role="toolbar" aria-label="문서 서식">'+
  '<button data-rich="bold" title="굵게 Ctrl+B"><b>B</b></button>'+
  '<button data-rich="italic" title="기울임 Ctrl+I"><i>I</i></button>'+
  '<button data-rich="strike" title="취소선">S̶</button>'+
  '<span class="rich-sep"></span>'+
  '<button data-rich="h1">제목 1</button><button data-rich="h2">제목 2</button>'+
  '<button data-rich="bullet">• 목록</button><button data-rich="ordered">1. 목록</button>'+
  '<button data-rich="task">☑ 할 일</button>'+
  '<span class="rich-sep"></span>'+
  '<button data-rich="table">▦ 표</button><button data-rich="page">📄 페이지</button><button data-rich="image">🖼️ 이미지</button>'+
  '<button data-rich="undo" title="실행 취소 Ctrl+Z">↶</button><button data-rich="redo" title="다시 실행 Ctrl+Y">↷</button>'+
  '</div>'+
  '<div class="folio-rich-tabletools" hidden><button data-rich="row">행 +</button><button data-rich="col">열 +</button><button data-rich="delrow">행 삭제</button><button data-rich="delcol">열 삭제</button><button data-rich="deltable">표 삭제</button></div>'+
  '<div class="folio-rich-alert" hidden></div>'+
  '<div class="folio-rich-content"></div>'+
  '<div class="folio-rich-bottom"><span data-rich-status>문서 준비됨</span><button data-rich="copy">전체 복사</button><button data-rich="export">백업 내보내기</button></div>';
 const area=root.querySelector('.folio-rich-content');
 const status=root.querySelector('[data-rich-status]');
 const alert=root.querySelector('.folio-rich-alert');
 const tabletools=root.querySelector('.folio-rich-tabletools');
 const menu=newMenu();
 const editor=new Editor({
  element:area,
  extensions:[
   StarterKit.configure({heading:{levels:[1,2,3]}}),
   TaskList,TaskItem.configure({nested:true}),
   TableKit.configure({table:{resizable:true,handleWidth:8,cellMinWidth:64,lastColumnResizable:true}}),
   Markdown.configure({markedOptions:{gfm:true}}),
   Placeholder.configure({placeholder:'내용을 입력하거나 /를 눌러 서식을 선택하세요…'}),
   FolioImage,FolioSubpage
  ],
  content:current?.json||{type:'doc',content:[{type:'paragraph'}]},
  editorProps:{
   attributes:{class:'tiptap folio-document',spellcheck:'true','aria-label':'문서 본문'},
   handlePaste(view,event){
    if(hasClipboardFile(event)){
     const file=[...event.clipboardData.items].find(x=>x.type.startsWith('image/'))?.getAsFile();
     if(file){event.preventDefault();void upload(file);return true}
    }
    const plain=event.clipboardData?.getData('text/plain')||'';
    const html=event.clipboardData?.getData('text/html')||'';
    // For HTML from Word/ChatGPT, let ProseMirror parse rich markup natively.
    // Convert raw Markdown (including pipe tables) when the clipboard has no useful HTML.
    if(plain&&isMarkdown(plain)&&(!html||!/<(?:table|strong|b|em|i|h[1-6]|ul|ol|li|p)[\s>]/i.test(html))){
     try{
      const doc=editor.markdown.parse(plain);
      if(doc?.content?.length){
       event.preventDefault();
       editor.chain().focus().insertContent(doc.content).run();
       return true
      }
     }catch(err){console.warn('Markdown paste fallback',err)}
    }
    return false
   },
   handleDrop(view,event){
    const file=[...event.dataTransfer?.files||[]].find(x=>x.type.startsWith('image/'));
    if(file){event.preventDefault();void upload(file);return true}
    return false
   },
   handleKeyDown(view,event){
    if(menu.style.display!=='none'){
     if(event.key==='Escape'){hideMenu();event.preventDefault();return true}
     if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      const len=menu.querySelectorAll('[data-rich-action]').length;
      if(len){selected=(selected+(event.key==='ArrowDown'?1:-1)+len)%len;highlight();event.preventDefault();return true}
     }
     if(event.key==='Enter'&&selected>=0){
      const item=menu.querySelectorAll('[data-rich-action]')[selected];
      if(item){event.preventDefault();void choose(item.dataset.richAction);return true}
     }
    }
    return false
   }
  },
  onUpdate(){
   if(disposed||conflict)return;
   draft=true;changed++;saveCrashBackup();schedule();updateStatus();updateMenu();refreshTableTools()
  },
  onSelectionUpdate(){updateMenu();refreshTableTools()}
 });
 if(!current){
  const initial=legacyContent(editor,api.legacyBlocks(),api);
  editor.commands.setContent(initial,{emitUpdate:false});
 }
 function showAlert(message,buttons=[]){
  alert.hidden=false;alert.replaceChildren();
  const p=document.createElement('p');p.textContent=message;alert.appendChild(p);
  for(const {label,fn} of buttons){
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.onclick=fn;alert.appendChild(btn)
  }
 }
 function hideAlert(){alert.hidden=true;alert.replaceChildren()}
 function updateStatus(message){
  status.textContent=message||(conflict?'충돌 감지 · 자동 저장 중지':saving?'저장 중…':draft?'자동 저장 대기 중':'모든 변경 저장됨')
 }
 function schedule(delay=1100){
  clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void save()},delay)
 }
 async function save(){
  if(inFlightSave)return inFlightSave;
  if(disposed||conflict||!draft)return;
  const job=performSave();
  inFlightSave=job;
  try{return await job}
  finally{if(inFlightSave===job)inFlightSave=null}
 }
 async function performSave(){
  saving=true;updateStatus();
  const data=editor.getJSON(),gen=changed;
  try{
   const newRevision=await api.writeRich(data,revision);
   revision=newRevision;lastRemote=newRevision;
   if(gen===changed){draft=false;clearCrashBackup()}
   else schedule(450);
   hideAlert()
  }catch(err){
   if(err?.code==='conflict'){
    conflict=true;clearTimeout(timer);
    showAlert('다른 팀원이 이 문서를 먼저 수정했어. 자동 저장을 멈췄어. 내 초안을 먼저 복사하거나 백업한 뒤 최신 문서를 열어 줘.',[
     {label:'내 초안 복사',fn:()=>void copyAll()},
     {label:'초안 백업',fn:exportBackup},
     {label:'최신 버전 불러오기',fn:()=>{if(confirm('화면에 보이는 내 변경 내용은 교체됩니다. 먼저 백업했나요?')){conflict=false;draft=false;const remote=api.readRich();if(remote){revision=remote.revision;lastRemote=revision;editor.commands.setContent(remote.json,{emitUpdate:false})}hideAlert();updateStatus();decorate()}}}
    ])
   }else{
    showAlert('저장에 실패했어: '+(err.message||String(err)),[
     {label:'다시 저장',fn:()=>{hideAlert();schedule(30)}},
     {label:'내 초안 복사',fn:()=>void copyAll()}
    ])
   }
  }finally{saving=false;updateStatus()}
 }
 function remoteChanged(incoming){
  if(disposed)return;
  if(!incoming||!incoming.revision||incoming.revision===revision||incoming.revision===lastRemote)return;
  if(draft||saving){
   lastRemote=incoming.revision;
   // A local write with a stale revision is rejected by the Firestore transaction.
   if(!saving){
    conflict=true;clearTimeout(timer);
    showAlert('다른 팀원이 방금 이 문서를 수정했어. 지금까지 입력한 내 내용을 먼저 복사하거나 백업해 줘.',[
     {label:'내 초안 복사',fn:()=>void copyAll()},
     {label:'초안 백업',fn:exportBackup},
     {label:'최신 내용 불러오기',fn:()=>{
      if(!confirm('현재 작성 중인 초안이 사라집니다. 백업했나요?'))return;
      const latest=api.readRich();if(latest){revision=latest.revision;lastRemote=revision;editor.commands.setContent(latest.json,{emitUpdate:false})}
      draft=false;conflict=false;hideAlert();updateStatus();decorate()
     }}
    ])
   }
   return
  }
  revision=incoming.revision;lastRemote=revision;
  editor.commands.setContent(incoming.json,{emitUpdate:false});
  decorate();updateStatus('다른 팀원의 수정 내용이 반영됨')
 }
 function action(id){
  const chain=editor.chain().focus();
  switch(id){
   case 'paragraph':return chain.setParagraph().run();
   case 'bold':return chain.toggleBold().run();
   case 'italic':return chain.toggleItalic().run();
   case 'strike':return chain.toggleStrike().run();
   case 'h1':return chain.toggleHeading({level:1}).run();
   case 'h2':return chain.toggleHeading({level:2}).run();
   case 'h3':return chain.toggleHeading({level:3}).run();
   case 'bullet':return chain.toggleBulletList().run();
   case 'ordered':return chain.toggleOrderedList().run();
   case 'task':return chain.toggleTaskList().run();
   case 'quote':return chain.toggleBlockquote().run();
   case 'code':return chain.toggleCodeBlock().run();
   case 'rule':return chain.setHorizontalRule().run();
   case 'table':return chain.insertTable({rows:3,cols:3,withHeaderRow:true}).run();
   case 'row':return chain.addRowAfter().run();
   case 'col':return chain.addColumnAfter().run();
   case 'delrow':return chain.deleteRow().run();
   case 'delcol':return chain.deleteColumn().run();
   case 'deltable':return chain.deleteTable().run();
   case 'undo':return chain.undo().run();
   case 'redo':return chain.redo().run();
   case 'image':return filePicker();
   case 'image-url':return insertImageURL();
   case 'page':return void insertSubpage();
   case 'copy':return void copyAll();
   case 'export':return exportBackup();
  }
 }
 async function flushBeforeNavigation(){
  clearTimeout(timer);timer=null;
  // Autosave may already be underway, or a newer keystroke may have arrived mid-write.
  // Wait for the active write and persist the latest draft before changing routes.
  for(let i=0;i<6;i++){
   if(conflict||disposed)return false;
   if(inFlightSave){await inFlightSave;continue}
   if(!draft)return true;
   await save();
  }
  return !conflict&&!disposed&&!draft&&!saving
 }
 async function openEmbeddedPage(pageId){
  if(navigating||!pageId)return;
  if(!api.findPage(pageId)){
   decorate();
   updateStatus('이 카드의 대상 페이지가 없습니다. 링크만 정리할 수 있어요.');
   return
  }
  navigating=true;
  try{
   const ready=await flushBeforeNavigation();
   if(!ready){
    showAlert('현재 문서의 수정 내용이 아직 저장되지 않았어. 먼저 저장 상태를 확인하거나 백업한 뒤 이동해 줘.',[
      {label:'다시 시도',fn:()=>{hideAlert();void openEmbeddedPage(pageId)}},
      {label:'초안 백업',fn:exportBackup}
    ]);
    return
   }
   api.openPage(pageId)
  }catch(err){showAlert('페이지 이동 실패: '+(err.message||String(err)))}
  finally{navigating=false}
 }
 async function insertSubpage(){
  try{
   const page=await api.createSubpage();
   editor.chain().focus().insertContent({type:'folioSubpage',attrs:{pageId:page.id}}).run();
   await openEmbeddedPage(page.id)
  }catch(err){showAlert('하위 페이지를 생성하지 못했어: '+err.message)}
 }
 function filePicker(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/png,image/jpeg,image/webp';
  inp.style.display='none';document.body.appendChild(inp);
  inp.addEventListener('change',()=>{const f=inp.files?.[0];inp.remove();if(f)void upload(f)},{once:true});
  inp.addEventListener('cancel',()=>inp.remove(),{once:true});
  inp.click()
 }
 async function upload(file){
  try{
   updateStatus('이미지를 업로드하는 중…');
   const id=await api.addImage(file);
   editor.chain().focus().insertContent({type:'folioImage',attrs:{imageId:id,alt:file.name||'첨부 이미지'}}).run();
   decorate()
  }catch(err){showAlert('이미지 업로드 실패: '+(err.message||String(err)))}
 }
 function insertImageURL(){
  const raw=prompt('이미지 URL (https://)');
  if(raw===null)return;
  try{
   const url=new URL(raw.trim());
   if(url.protocol!=='https:')throw Error('HTTPS 주소만 지원합니다.');
   editor.chain().focus().insertContent({type:'folioImage',attrs:{url:url.href,alt:'링크 이미지'}}).run()
  }catch(err){showAlert('이미지 주소 오류: '+err.message)}
 }
 async function copyAll(){
  try{
   let text='';
   try{text=editor.getMarkdown?.()||''}catch{}
   if(!text)text=editor.getText({blockSeparator:'\n\n'});
   await navigator.clipboard.writeText(text);
   updateStatus('문서를 복사했어')
  }catch(err){showAlert('복사 실패: '+err.message)}
 }
 function exportBackup(){
  const backup={version:1,workspace:api.workspace,pageId:api.pageId,date:new Date().toISOString(),revision,document:editor.getJSON()};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='Folio-document-backup-'+api.pageId+'.json';document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000)
 }
 // Resize the entire table by scaling its column widths. Persist widths in the
 // existing ProseMirror cell 'colwidth' attributes so Firestore saves them with the document.
 function findTableNode(tableElement){
  const tables=[...area.querySelectorAll('table')];
  const index=tables.indexOf(tableElement);
  if(index<0)return null;
  let count=0,found=null;
  editor.state.doc.descendants((node,pos)=>{
   if(node.type.name!=='table')return true;
   if(count++===index){found={node,pos};return false}
   return false
  });
  return found
 }
 function scaledColumnWidths(base,target,min=64){
  const values=base.map(x=>Math.max(1,Number(x)||100));
  const total=Math.max(values.length*min,Math.round(target));
  const out=Array(values.length).fill(0),available=new Set(values.map((_,i)=>i));
  let remaining=total;
  while(available.size){
   const baseTotal=[...available].reduce((a,i)=>a+values[i],0)||available.size;
   let froze=false;
   for(const i of [...available]){
    const assigned=remaining*values[i]/baseTotal;
    if(assigned<min){out[i]=min;remaining-=min;available.delete(i);froze=true}
   }
   if(!froze)break
  }
  let free=[...available];
  let consumed=0;
  free.forEach((i,n)=>{
   const weight=free.reduce((a,j)=>a+values[j],0)||1;
   const size=n===free.length-1?remaining-consumed:Math.round(remaining*values[i]/weight);
   out[i]=Math.max(min,size);consumed+=out[i]
  });
  return out
 }
 function persistTableWidth(tableElement,newWidths){
  const found=findTableNode(tableElement);
  if(!found)return false;
  const {node,pos}=found;
  const map=TableMap.get(node);
  if(!map.width||newWidths.length!==map.width)return false;
  const widths=newWidths.map(x=>Math.max(64,Math.round(x)));
  const transaction=editor.state.tr;
  const seen=new Set();
  for(let row=0;row<map.height;row++){
   for(let col=0;col<map.width;col++){
    const offset=map.map[row*map.width+col];
    if(seen.has(offset))continue;
    seen.add(offset);
    const cell=node.nodeAt(offset);
    if(!cell)continue;
    const span=Math.max(1,cell.attrs.colspan||1);
    const next=widths.slice(col,col+span);
    if(!next.length)continue;
    transaction.setNodeMarkup(pos+1+offset,null,{...cell.attrs,colwidth:next},cell.marks)
   }
  }
  if(!transaction.docChanged)return false;
  editor.view.dispatch(transaction);
  return true
 }
 function decorateTableResizers(){
  // TableView's tableWrapper survives cursor movement, while the table's tbody
  // is the content DOM owned by ProseMirror. The handle is outside that content DOM.
  area.querySelectorAll('.tableWrapper').forEach(wrapper=>{
   if(wrapper.querySelector(':scope > .folio-table-width-grip'))return;
   const table=wrapper.querySelector(':scope > table');
   if(!table)return;
   const grip=document.createElement('button');
   grip.type='button';grip.contentEditable='false';
   grip.className='folio-table-width-grip';
   grip.setAttribute('aria-label','표 전체 너비 조절');
   grip.title='드래그해서 표 전체 너비 조절';
   grip.innerHTML='<span aria-hidden="true">↔</span>';
   wrapper.append(grip);
  })
 }
 let tableDrag=null;
 function onTableWidthPointerDown(event){
  const grip=event.target instanceof Element?event.target.closest('.folio-table-width-grip'):null;
  if(!grip||!root.contains(grip)||event.button!==0)return;
  const wrapper=grip.closest('.tableWrapper');
  const table=wrapper?.querySelector('table');
  const found=table&&findTableNode(table);
  if(!found)return;
  const map=TableMap.get(found.node);
  const cols=[...table.querySelectorAll('colgroup col')];
  const width=Math.round(table.getBoundingClientRect().width);
  const source=Array.from({length:map.width},(_,i)=>cols[i]?.getBoundingClientRect().width||width/map.width);
  const scale=width/(source.reduce((a,v)=>a+v,0)||width);
  tableDrag={
   table,grip,startX:event.clientX,startWidth:width,columns:source.map(x=>x*scale),
   minWidth:map.width*64,target:width,
   pointerId:event.pointerId
  };
  event.preventDefault();event.stopPropagation();
  grip.setPointerCapture?.(event.pointerId);
  root.classList.add('folio-table-resizing');
 }
 function onTableWidthPointerMove(event){
  const drag=tableDrag;
  if(!drag||event.pointerId!==drag.pointerId)return;
  event.preventDefault();
  drag.target=Math.max(drag.minWidth,Math.min(2600,Math.round(drag.startWidth+event.clientX-drag.startX)));
  const widths=scaledColumnWidths(drag.columns,drag.target);
  const cols=drag.table.querySelectorAll('colgroup col');
  cols.forEach((col,i)=>{col.style.width=widths[i]+'px'});
  drag.table.style.width=widths.reduce((a,b)=>a+b,0)+'px';
  drag.grip.title='표 전체 너비: '+widths.reduce((a,b)=>a+b,0)+'px (놓으면 저장)';
 }
 function onTableWidthPointerUp(event){
  const drag=tableDrag;
  if(!drag||event.pointerId!==drag.pointerId)return;
  const widths=scaledColumnWidths(drag.columns,drag.target);
  tableDrag=null;root.classList.remove('folio-table-resizing');
  if(drag.grip.hasPointerCapture?.(event.pointerId))drag.grip.releasePointerCapture(event.pointerId);
  persistTableWidth(drag.table,widths);
  // If the width didn't change, remove any temporary inline DOM changes.
  editor.view.updateState(editor.state);
 }
 root.addEventListener('pointerdown',onTableWidthPointerDown,true);
 root.addEventListener('pointermove',onTableWidthPointerMove,true);
 root.addEventListener('pointerup',onTableWidthPointerUp,true);
 root.addEventListener('pointercancel',onTableWidthPointerUp,true);
 function refreshTableTools(){
  tabletools.hidden=!editor.isActive('table');
  decorateTableResizers();
 }
 function decorate(){
  if(disposed)return;
  root.querySelectorAll('[data-folio-subpage]').forEach(node=>{
   const page=api.findPage(node.dataset.folioSubpage);
   const label=node.querySelector('.folio-page-title');
   const note=node.querySelector('.folio-page-note');
   const remove=node.querySelector('.folio-remove-broken-link');
   node.classList.toggle('folio-page-missing',!page);
   if(label)label.textContent=page?.title||'연결이 끊어진 페이지';
   if(note)note.hidden=Boolean(page);
   if(remove)remove.hidden=Boolean(page)
  });
  root.querySelectorAll('[data-folio-image]').forEach(node=>{
   const imageId=node.dataset.folioImage;
   if(!imageId)return;
   const el=node.querySelector('img');
   if(!el||el.dataset.loaded===imageId)return;
   api.loadImage(imageId).then(asset=>{
    if(disposed||!node.isConnected||!asset)return;
    el.src=asset.dataUrl;el.alt=asset.name||'첨부 이미지';el.dataset.loaded=imageId;
    const caption=node.querySelector('figcaption');if(caption)caption.textContent=asset.name||'이미지'
   }).catch(()=>{const caption=node.querySelector('figcaption');if(caption)caption.textContent='이미지를 불러오지 못했어'})
  })
 }
 function slashMatch(){
  const {$from}=editor.state.selection;
  if(!editor.state.selection.empty||!$from.parent.isTextblock)return null;
  const text=$from.parent.textBetween(0,$from.parentOffset,undefined,'');
  const match=/(?:^|\s)\/([\p{L}\d-]{0,25})$/u.exec(text);
  if(!match)return null;
  const query=match[1].toLowerCase();
  const found=actions.filter(a=>(a.id+' '+a.label+' '+a.keys).toLowerCase().includes(query));
  return found.length?{from:editor.state.selection.from-match[0].trimStart().length,to:editor.state.selection.from,found}:null
 }
 function updateMenu(){
  const m=slashMatch();
  if(!m){hideMenu();return}
  menuFrom=m.from;menuTo=m.to;
  const query=m.found.map(x=>x.id).join(',');
  if(query!==menuQuery){
   menuQuery=query;selected=0;
   menu.innerHTML='<div class="folio-slash-label">블록 및 삽입</div>'+m.found.map((a,i)=>
    '<button data-rich-action="'+escapeHTML(a.id)+'" class="'+(i===0?'active':'')+'"><span class="folio-action-icon">'+a.icon+'</span><span><b>'+escapeHTML(a.label)+'</b><small>'+escapeHTML(a.hint)+'</small></span></button>').join('');
   menu.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('mousedown',event=>event.preventDefault());
    btn.addEventListener('click',()=>{void choose(btn.dataset.richAction)})
   })
  }
  try{
   const pos=editor.view.coordsAtPos(editor.state.selection.from);
   menu.style.top=Math.min(innerHeight-310,pos.bottom+8)+'px';
   menu.style.left=Math.max(8,Math.min(innerWidth-265,pos.left))+'px';
   menu.style.display='block'
  }catch{hideMenu()}
 }
 function hideMenu(){menu.style.display='none';menuQuery=null}
 function highlight(){[...menu.querySelectorAll('button')].forEach((b,i)=>b.classList.toggle('active',i===selected))}
 async function choose(id){
  hideMenu();
  editor.chain().focus().deleteRange({from:menuFrom,to:menuTo}).run();
  await action(id)
 }
 function removeBrokenPageLink(card){
  const pageId=card?.dataset.folioSubpage;
  if(!pageId||api.findPage(pageId))return;
  const cards=[...area.querySelectorAll('[data-folio-subpage]')];
  const targetIndex=cards.indexOf(card);
  if(targetIndex<0)return;
  let index=0,location=null;
  editor.state.doc.descendants((node,pos)=>{
   if(node.type.name!=='folioSubpage')return true;
   if(index++===targetIndex){location={node,pos};return false}
   return true
  });
  if(!location||location.node.attrs.pageId!==pageId){
   showAlert('링크 위치를 확인할 수 없어서 제거하지 않았어. 페이지를 새로고침한 뒤 다시 시도해 줘.');
   return
  }
  if(!confirm('이 끊어진 페이지 링크 카드만 제거할까요? 다른 페이지나 본문 데이터는 삭제하지 않습니다.'))return;
  editor.chain().focus().deleteRange({from:location.pos,to:location.pos+location.node.nodeSize}).run();
  updateStatus('끊어진 링크 제거 중 · 자동 저장')
 }
 // ProseMirror may consume clicks on selectable atom nodes before they bubble.
 // Capture the click on the stable editor root first, before node-selection handlers run.
 root.addEventListener('click',event=>{
  const element=event.target instanceof Element?event.target:null;
  const target=element?.closest('[data-folio-subpage]');
  if(!target||!root.contains(target))return;
  event.preventDefault();
  event.stopPropagation();
  if(element.closest('.folio-remove-broken-link')){
   removeBrokenPageLink(target);
   return
  }
  void openEmbeddedPage(target.dataset.folioSubpage);
 },true);
 root.querySelectorAll('[data-rich]').forEach(button=>{
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',()=>void action(button.dataset.rich))
 });
 editor.on('update',()=>{decorate();refreshTableTools()});
 try{
  const pending=JSON.parse(localStorage.getItem(backupKey)||'null');
  if(pending?.doc&&pending.at&&JSON.stringify(pending.doc)!==JSON.stringify(editor.getJSON())){
   showAlert('이 브라우저에서 저장되지 않았을 수 있는 초안을 찾았어. 기존 문서에 덮어쓰기 전에 검토해 줘.',[
    {label:'미저장 초안 복원',fn:()=>{
      editor.commands.setContent(pending.doc,{emitUpdate:false});
      revision=pending.revision||null;draft=true;changed++;hideAlert();schedule(200);updateStatus()
    }},
    {label:'현재 저장된 내용 유지',fn:()=>{clearCrashBackup();hideAlert()}}
   ])
  }else if(pending?.doc)clearCrashBackup()
 }catch{}
 decorate();refreshTableTools();updateStatus(current?'저장된 문서 표시 중':'기존 블록 자료를 보존한 상태로 변환');
 return {
  pageId:api.pageId,
  focused(){return editor.isFocused},
  onRemote:remoteChanged,
  refreshReferences:decorate,
  flush(){clearTimeout(timer);timer=null;return save()},
  exportBackup,
  destroy(){disposed=true;clearTimeout(timer);menu.remove();editor.destroy()}
 }
}
