import { firebaseConfig } from './firebase-config.js';

const $=s=>document.querySelector(s);
const app=$('#app'),dialog=$('#editor-dialog'),toastEl=$('#toast');
const icons={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  notes:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  tasks:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 4-4M8 16h8"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
};
function svg(s){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[s]+'</svg>'}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function val(s){return String(s??'')}
function date(s){if(!s)return '날짜 없음';const d=new Date(s);return isNaN(d)?esc(s):new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'short',day:'numeric'}).format(d)}
function notify(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>toastEl.classList.remove('show'),3200)}
function uid(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}
const dbkey='samsung-share-note-demo-v1';
let state={page:'home',notes:[],tasks:[],filter:'',category:'all',status:'all',mode:'demo',auth:null,owner:false,members:[],loading:true,unsubs:[],ready:false};
let firebase={};
const configured=Boolean(firebaseConfig?.apiKey&&firebaseConfig?.projectId&&firebaseConfig?.authDomain&&firebaseConfig.apiKey!=='REPLACE_ME');
function loadLocal(){try{let x=JSON.parse(localStorage.getItem(dbkey)||'{}');state.notes=Array.isArray(x.notes)?x.notes:[];state.tasks=Array.isArray(x.tasks)?x.tasks:[]}catch{state.notes=[];state.tasks=[]}}
function saveLocal(){try{localStorage.setItem(dbkey,JSON.stringify({notes:state.notes,tasks:state.tasks}))}catch{notify('브라우저 저장에 실패했습니다.')}}
async function init(){
 if(!configured){loadLocal();state.loading=false;state.ready=true;render();return}
 try{
  const [a,b]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js')]);
  const c=await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
  const fb=a.initializeApp(firebaseConfig);
  firebase={...b,...c,auth:b.getAuth(fb),db:c.getFirestore(fb)};
  b.onAuthStateChanged(firebase.auth,user=>{state.auth=user;state.loading=false;if(user)connectWorkspace();else{cleanup();state.notes=[];state.tasks=[];state.ready=false;render()}},e=>{state.loading=false;notify(e.message);render()});
 }catch(e){state.loading=false;app.innerHTML='<div class="setup"><h1>연결 오류</h1><p>'+esc(e.message)+'</p><button class="btn" id="reload">다시 시도</button></div>';$('#reload').onclick=()=>location.reload()}
}
function cleanup(){state.unsubs.forEach(fn=>fn());state.unsubs=[]}
const wref=()=>firebase.doc(firebase.db,'workspaces','samsung-interview');
const coll=(k)=>firebase.collection(firebase.db,'workspaces','samsung-interview',k);
async function connectWorkspace(){
 cleanup();state.ready=false;render();
 try{
  const snap=await firebase.getDoc(wref());
  if(!snap.exists()){
   state.owner=false;state.members=[];state.ready='new';render();return;
  }
  state.members=Array.isArray(snap.data().members)?snap.data().members:[];
  state.owner=snap.data().ownerUid===state.auth.uid;
  const email=state.auth.email?.toLowerCase();
  if(!state.members.includes(email)){state.ready='blocked';render();return}
  state.unsubs.push(firebase.onSnapshot(wref(),s=>{if(s.exists()){state.members=s.data().members||[];state.owner=s.data().ownerUid===state.auth?.uid;if(!state.members.includes(state.auth?.email?.toLowerCase())){cleanup();state.ready='blocked';render()}else if(state.page==='settings')render()}},()=>{}));
  for(const kind of ['notes','tasks']){
   state.unsubs.push(firebase.onSnapshot(coll(kind),s=>{
    state[kind]=s.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    state.ready=true;render()
   },e=>{state.ready='error';notify(e.message);render()}))
  }
 }catch(e){state.ready=e.code==='permission-denied'?'blocked':'error';if(state.ready==='error')notify(e.message);render()}
}
async function createWorkspace(){
 try{
  const email=state.auth.email?.toLowerCase();
  await firebase.setDoc(wref(),{ownerUid:state.auth.uid,members:[email],createdAt:new Date().toISOString()});
  notify('공유 워크스페이스 생성 완료');connectWorkspace()
 }catch(e){notify('생성 실패: '+e.message)}
}
async function signIn(){try{await firebase.signInWithPopup(firebase.auth,new firebase.GoogleAuthProvider())}catch(e){notify('로그인 실패: '+e.message)}}
async function signOut(){await firebase.signOut(firebase.auth)}
async function write(kind,item){try{
 if(state.mode==='demo'){
  const i=state[kind].findIndex(v=>v.id===item.id);
  if(i>=0)state[kind][i]={...state[kind][i],...item};else state[kind].unshift(item);
  saveLocal();render();
 }else{
  await firebase.setDoc(firebase.doc(coll(kind),item.id),item,{merge:true})
 }
 notify('저장했습니다.')
}catch(e){notify('저장 실패: '+e.message)}}
async function remove(kind,id){if(!confirm('정말 삭제하시겠습니까?'))return;try{
 if(state.mode==='demo'){state[kind]=state[kind].filter(v=>v.id!==id);saveLocal();render()}
 else await firebase.deleteDoc(firebase.doc(coll(kind),id));
 notify('삭제했습니다.')
}catch(e){notify('삭제 실패: '+e.message)}}
function nav(p){state.page=p;state.filter='';state.category='all';state.status='all';render();window.scrollTo({top:0,behavior:'smooth'})}
function count(status){return state.tasks.filter(t=>t.status===status).length}
const statusNames={todo:'할 일',doing:'진행 중',done:'완료'};
function header(){
 const labels={home:'대시보드',notes:'공유 노트',tasks:'작업 관리',settings:'팀 설정'};
 const navs=[['home','대시보드'],['notes','공유 노트'],['tasks','작업 관리'],['settings','팀 설정']];
 return '<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-symbol">S</div><div>SAMSUNG NOTE<small>SHARED WORKSPACE</small></div></div><div><div class="nav-section-label">WORKSPACE</div><nav class="nav">'+navs.map(([p,label])=>'<button data-nav="'+p+'" class="'+(state.page===p?'active':'')+'">'+svg(p)+label+'</button>').join('')+'</nav></div><div class="sidebar-bottom"><div class="user-line"><div class="avatar">'+esc((state.auth?.displayName||'나')[0])+'</div><span>'+esc(state.auth?.displayName||'내 브라우저')+'</span></div>'+(state.mode==='cloud'?'<button data-action="logout">로그아웃</button>':'<p>이 브라우저에만 저장됩니다.</p>')+'</div></aside><div class="mobile-header">'+navs.map(([p,label])=>'<button data-nav="'+p+'" class="'+(state.page===p?'active':'')+'">'+label+'</button>').join('')+'</div><main class="main"><div class="topline"><span class="eyebrow">INTERVIEW PREPARATION / 2026</span><div class="top-actions"><span class="pill '+(state.mode==='demo'?'demo':'')+'">'+(state.mode==='demo'?'체험 모드 · 비공유':'실시간 공유')+'</span></div></div>';
}
function pageHead(title,sub,action){return '<div class="page-head"><div><span class="eyebrow">SAMSUNG C&T · ENGINEERING</span><h1>'+title+'</h1><p>'+sub+'</p></div>'+(action||'')+'</div>'}
function alert(){return state.mode==='demo'?'<div class="alert">현재는 <b>체험 모드</b>입니다. 데이터는 이 브라우저에만 저장되며 다른 팀원과 공유되지 않습니다. 실시간 공동 작업에는 Firebase 설정이 필요합니다.</div>':''}
function taskRow(t){return '<div class="list-row"><input class="check" type="checkbox" data-check="'+esc(t.id)+'" '+(t.status==='done'?'checked':'')+' aria-label="작업 완료 변경"><div class="item-main"><button class="item-title '+(t.status==='done'?'done':'')+'" data-edit-task="'+esc(t.id)+'">'+esc(t.title)+'</button><div class="item-meta"><span>'+esc(t.assignee||'미배정')+'</span><span>'+date(t.due)+'</span><span>'+esc(statusNames[t.status]||'할 일')+'</span></div></div><span class="tag '+esc(t.priority||'')+'">'+({high:'높음',medium:'보통',low:'낮음'}[t.priority]||'보통')+'</span></div>'}
function noteCard(n){return '<button class="note-card" data-edit-note="'+esc(n.id)+'"><span class="note-category">'+esc(n.category||'기타')+'</span><strong>'+esc(n.title)+'</strong><p>'+esc(n.content||'내용 없음')+'</p><span class="note-date">'+date(n.updatedAt||n.createdAt)+'</span></button>'}
function home(){
 const recent=[...state.tasks].filter(t=>t.status!=='done').slice(0,5);
 return pageHead('함께 준비하는 공간','삼성물산 건설부문 반도체 생산설비 · 전기전자 면접 준비 현황','<button class="btn primary" data-action="new-note">+ 새 노트 작성</button>')
 +alert()+'<section class="stats"><div class="stat"><div class="label">전체 작업</div><div class="value">'+state.tasks.length+'</div><div class="foot">등록된 모든 작업</div></div><div class="stat"><div class="label">진행 중</div><div class="value">'+count('doing')+'</div><div class="foot">현재 진행하는 작업</div></div><div class="stat"><div class="label">공유 노트</div><div class="value">'+state.notes.length+'</div><div class="foot">기록된 학습 자료</div></div></section><div class="content-grid"><section class="panel"><div class="panel-heading"><h2>남은 작업</h2><button class="link-button" data-nav="tasks">모든 작업 보기 →</button></div><div class="row-list">'+(recent.length?recent.map(taskRow).join(''):'<div class="empty">남은 작업이 없습니다.<br>새 작업을 추가해 보세요.</div>')+'</div></section><section class="panel"><div class="panel-heading"><h2>최근 공유 노트</h2><button class="link-button" data-nav="notes">노트 전체 보기 →</button></div><div class="row-list">'+(state.notes.slice(0,4).length?state.notes.slice(0,4).map(n=>'<div class="list-row"><div class="item-main"><button class="item-title" data-edit-note="'+esc(n.id)+'">'+esc(n.title)+'</button><div class="item-meta">'+esc(n.category||'기타')+' · '+date(n.updatedAt||n.createdAt)+'</div></div></div>').join(''):'<div class="empty">아직 작성된 노트가 없습니다.</div>')+'</div></section></div>';
}
function notes(){
 const cats=['all',...new Set(state.notes.map(n=>n.category||'기타'))];
 const q=state.filter.toLowerCase();
 const found=state.notes.filter(n=>(state.category==='all'||(n.category||'기타')===state.category)&&[n.title,n.content,n.category].some(s=>val(s).toLowerCase().includes(q)));
 return pageHead('공유 노트','학습 내용과 면접 질문을 한곳에 정리하세요.','<button class="btn primary" data-action="new-note">+ 새 노트</button>')
 +alert()+'<div class="toolbar"><input class="search" id="search" placeholder="노트 제목, 내용 검색" value="'+esc(state.filter)+'" aria-label="노트 검색"><select class="filter" id="category-filter" aria-label="노트 분류">'+cats.map(c=>'<option value="'+esc(c)+'" '+(c===state.category?'selected':'')+'>'+(c==='all'?'전체 분류':esc(c))+'</option>').join('')+'</select></div><div class="notes-grid">'+(found.length?found.map(noteCard).join(''):'<div class="panel empty">조건에 맞는 노트가 없습니다.</div>')+'</div>';
}
function taskCard(t){
 return '<div class="task-card"><span class="tag '+esc(t.priority||'')+'">'+({high:'높음',medium:'보통',low:'낮음'}[t.priority]||'보통')+'</span><strong>'+esc(t.title)+'</strong>'+(t.description?'<p>'+esc(t.description)+'</p>':'')+'<div class="item-meta"><span>담당: '+esc(t.assignee||'미배정')+'</span><span>'+date(t.due)+'</span></div><div class="card-actions"><button class="mini" data-edit-task="'+esc(t.id)+'">수정</button>'+(t.status!=='todo'?'<button class="mini" data-move="'+esc(t.id)+'" data-status="todo">할 일로</button>':'')+(t.status!=='doing'?'<button class="mini" data-move="'+esc(t.id)+'" data-status="doing">진행 중으로</button>':'')+(t.status!=='done'?'<button class="mini" data-move="'+esc(t.id)+'" data-status="done">완료로</button>':'')+'</div></div>';
}
function tasks(){
 const q=state.filter.toLowerCase();
 const found=state.tasks.filter(t=>[t.title,t.description,t.assignee].some(x=>val(x).toLowerCase().includes(q)));
 return pageHead('작업 관리','할 일을 나누고 진행 상태를 함께 확인하세요.','<button class="btn primary" data-action="new-task">+ 새 작업</button>')
 +alert()+'<div class="toolbar"><input class="search" id="search" placeholder="작업, 담당자 검색" value="'+esc(state.filter)+'" aria-label="작업 검색"></div><div class="task-board">'+Object.entries(statusNames).map(([id,name])=>'<section class="task-column"><h2>'+name+'<span>'+found.filter(t=>t.status===id).length+'</span></h2>'+(found.filter(t=>t.status===id).map(taskCard).join('')||'<div class="empty">작업이 없습니다.</div>')+'</section>').join('')+'</div>';
}
function settings(){
 return pageHead('팀 설정','같이 준비할 팀원을 관리합니다.')+alert()+
 (state.mode==='demo'?'<section class="panel"><div class="panel-heading"><h2>실시간 공유 활성화</h2></div><div style="padding:0 24px 25px" class="help-list"><p>현재는 브라우저 내부 저장만 가능합니다.</p><p>GitHub의 <code>firebase-config.js</code>에 Firebase 프로젝트 설정값을 입력하고 <code>firestore.rules</code>를 배포하면 Google 로그인과 팀 공유가 활성화됩니다.</p><p>자세한 설명은 GitHub 저장소의 README를 확인하세요.</p></div></section>':
 '<section class="panel"><div class="panel-heading"><h2>허용된 팀원</h2></div><div style="padding:0 24px 24px"><p class="permission">등록된 Google 계정만 노트와 작업에 접근할 수 있습니다.</p><div class="row-list">'+state.members.map(m=>'<div class="list-row"><div class="item-main">'+esc(m)+'</div>'+(state.owner&&m!==state.auth.email?.toLowerCase()?'<button class="mini" data-remove-member="'+esc(m)+'">삭제</button>':'')+'</div>').join('')+'</div>'+(state.owner?'<form id="invite-form" class="toolbar" style="margin-top:20px"><input class="search" name="email" type="email" required placeholder="초대할 Google 계정 이메일"><button class="btn primary" type="submit">팀원 추가</button></form>':'<p class="permission">팀원 추가·삭제는 최초 생성자만 가능합니다.</p>')+'</div></section>');
}
function render(){
 if(state.loading){app.innerHTML='<div class="loading-screen">로그인 확인 중…</div>';return}
 if(configured&&!state.auth){app.innerHTML='<div class="login-screen"><section class="login-card"><div class="brand-symbol">S</div><h1>Samsung Share Note</h1><p>삼성물산 면접 준비를 위한 공유 노트입니다.<br>팀에 등록된 Google 계정으로 로그인하세요.</p><button class="btn primary" data-action="login">Google 계정으로 로그인</button></section></div>';bind();return}
 if(configured&&state.ready!=='true'&&state.ready!==true){
  if(state.ready==='new')app.innerHTML='<div class="setup"><h1>새 워크스페이스 생성</h1><p>아직 공유 공간이 없습니다. 첫 로그인 계정이 관리자(생성자)가 됩니다.</p><p><b>'+esc(state.auth.email)+'</b></p><button class="btn primary" data-action="create-workspace">워크스페이스 시작하기</button><button class="btn ghost" data-action="logout">로그아웃</button></div>';
  else if(state.ready==='blocked')app.innerHTML='<div class="setup"><h1>접근 권한이 없습니다</h1><p>현재 로그인한 <b>'+esc(state.auth.email)+'</b> 계정이 멤버 목록에 없습니다. 관리자에게 이메일 등록을 요청하세요.</p><button class="btn" data-action="logout">다른 계정으로 로그인</button></div>';
  else if(state.ready==='error')app.innerHTML='<div class="setup"><h1>데이터를 불러올 수 없습니다</h1><p>Firestore 데이터베이스와 보안 규칙을 확인하세요.</p><button class="btn" data-action="retry">다시 시도</button></div>';
  else app.innerHTML='<div class="loading-screen">공유 자료를 동기화하는 중…</div>';
  bind();return
 }
 state.mode=configured?'cloud':'demo';
 app.innerHTML=header()+({home,notes,tasks,settings}[state.page]||home)()+'</main></div>';
 bind();
}
function bind(){
 app.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>nav(el.dataset.nav));
 app.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{
  const a=el.dataset.action;
  if(a==='login')signIn();if(a==='logout')signOut();if(a==='create-workspace')createWorkspace();if(a==='retry')connectWorkspace();
  if(a==='new-note')edit('notes');if(a==='new-task')edit('tasks');
 });
 app.querySelectorAll('[data-edit-note]').forEach(el=>el.onclick=()=>edit('notes',state.notes.find(x=>x.id===el.dataset.editNote)));
 app.querySelectorAll('[data-edit-task]').forEach(el=>el.onclick=()=>edit('tasks',state.tasks.find(x=>x.id===el.dataset.editTask)));
 app.querySelectorAll('[data-check]').forEach(el=>el.onchange=()=>{let t=state.tasks.find(x=>x.id===el.dataset.check);if(t)write('tasks',{...t,status:el.checked?'done':'todo',updatedAt:new Date().toISOString()})});
 app.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{let t=state.tasks.find(x=>x.id===el.dataset.move);if(t)write('tasks',{...t,status:el.dataset.status,updatedAt:new Date().toISOString()})});
 const search=$('#search');if(search)search.oninput=e=>{const pos=e.target.selectionStart;state.filter=e.target.value;render();const x=$('#search');x.focus();x.setSelectionRange(pos,pos)};
 const category=$('#category-filter');if(category)category.onchange=e=>{state.category=e.target.value;render()};
 const invite=$('#invite-form');if(invite)invite.onsubmit=async e=>{
  e.preventDefault();const email=invite.elements.email.value.trim().toLowerCase();if(!email)return;
  if(state.members.includes(email)){notify('이미 등록된 팀원입니다.');return}
  try{await firebase.updateDoc(wref(),{members:[...state.members,email]});invite.reset();notify('팀원을 등록했습니다.')}catch(err){notify('등록 실패: '+err.message)}
 };
 app.querySelectorAll('[data-remove-member]').forEach(el=>el.onclick=async()=>{if(!confirm(el.dataset.removeMember+' 계정을 제외할까요?'))return;try{await firebase.updateDoc(wref(),{members:state.members.filter(m=>m!==el.dataset.removeMember)});notify('팀원을 제외했습니다.')}catch(e){notify(e.message)}});
}
function field(label,name,value='',type='text',options){
 if(type==='select')return '<label class="form-field">'+label+'<select name="'+name+'">'+options.map(([v,l])=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>';
 if(type==='textarea')return '<label class="form-field">'+label+'<textarea name="'+name+'" maxlength="20000">'+esc(value)+'</textarea></label>';
 return '<label class="form-field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(name==='title'?'required maxlength="140"':'')+'></label>';
}
function edit(kind,item){
 const isNote=kind==='notes',old=item||{},title=item?'수정':'새로 작성';
 dialog.innerHTML='<form class="modal-content" id="edit-form"><h2>'+(isNote?'노트 ':'작업 ')+title+'</h2><p>변경 내용은 '+(state.mode==='demo'?'현재 브라우저에':'공유 워크스페이스에')+' 저장됩니다.</p>'
 +field('제목','title',old.title||'')
 +(isNote?field('분류','category',old.category||'전기 기초','select',[['전기 기초','전기 기초'],['반도체 설비','반도체 설비'],['PT 면접','PT 면접'],['임원 면접','임원 면접'],['기타','기타']])+field('내용','content',old.content||'','textarea')
 :field('설명','description',old.description||'','textarea')+field('담당자','assignee',old.assignee||'')+field('마감일','due',old.due||'','date')+field('상태','status',old.status||'todo','select',Object.entries(statusNames))+field('우선순위','priority',old.priority||'medium','select',[['low','낮음'],['medium','보통'],['high','높음']]))
 +'<div class="modal-actions">'+(item?'<button class="btn danger" type="button" id="delete-item">삭제</button>':'<span></span>')+'<div class="right"><button class="btn" type="button" id="cancel-item">취소</button><button class="btn primary" type="submit">저장</button></div></div></form>';
 dialog.showModal();$('#cancel-item').onclick=()=>dialog.close();
 if(item)$('#delete-item').onclick=()=>{dialog.close();remove(kind,item.id)};
 $('#edit-form').onsubmit=async e=>{
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.target).entries());
  const value={...old,...data,id:old.id||uid(),createdAt:old.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  dialog.close();await write(kind,value)
 };
}
init();