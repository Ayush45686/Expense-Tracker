(function(){
/* ---- Supabase connection (the publishable key is safe to keep in the browser) ---- */
const SUPABASE_URL='https://bcxwomijoubhmwcxdvzu.supabase.co';
const SUPABASE_KEY='sb_publishable_wO1fvu9vKIRGb_UVElGPeA_Vny6pcOy';
const sb=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null;
let user=null; // null = guest mode (nothing is saved)
const DEFAULT_CATS=['Food','Transport','Groceries','Bills','Shopping','Health','Other'];
const MIN_MONTH='2026-01';

const monthLabelEl=document.getElementById('monthLabel'), monthTotalEl=document.getElementById('totalMonth'), monthTotalLabelEl=document.getElementById('totalMonthLabel'), todayTotalEl=document.getElementById('totalToday'), toastEl=document.getElementById('toast');
const prevBtn=document.getElementById('prevMonth'), nextBtn=document.getElementById('nextMonth');
const listEl=document.getElementById('list');
const catBtn=document.getElementById('catBtn'), catBtnLabel=document.getElementById('catBtnLabel'), catPanel=document.getElementById('catPanel'), catItems=document.getElementById('catItems');
const newCatInput=document.getElementById('newCatInput'), addCatBtn=document.getElementById('addCatBtn');
const dateBtn=document.getElementById('dateBtn'), dateBtnLabel=document.getElementById('dateBtnLabel'), calPanel=document.getElementById('calPanel'), calGrid=document.getElementById('calGrid'), calMonthLabel=document.getElementById('calMonthLabel');
const recordsToggle=document.getElementById('recordsToggle'), recordsBody=document.getElementById('recordsBody');
const tabBtns=document.querySelectorAll('.tab-btn'), homeView=document.getElementById('homeView'), vizView=document.getElementById('vizView');
const chartWrap=document.getElementById('chartWrap'), vizAvg=document.getElementById('vizAvg'), vizHighest=document.getElementById('vizHighest'), vizHighestMonth=document.getElementById('vizHighestMonth'), vizTotal=document.getElementById('vizTotal');

function normalize(r){return {id:Number(r.id),amount:Number(r.amount),category:r.category,date:r.date,note:r.note||''};}
function fmt(n){return '₹'+n.toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});}
function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function todayIso(){return new Date().toISOString().slice(0,10);}
function monthLabelFor(ym){const[y,m]=ym.split('-');return new Date(y,m-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});}
function dayLabel(iso){const d=new Date(iso+'T00:00:00');const t=todayIso();const y=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(iso===t)return'Today'; if(iso===y)return'Yesterday';
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}

let expenses=[];
let customCats=[];
let activeMonth=todayIso().slice(0,7);
let selectedCategory=DEFAULT_CATS[0];
let selectedDate=todayIso();
let calViewMonth=selectedDate.slice(0,7);
let editingId=null;

function allCats(){return DEFAULT_CATS.concat(customCats);}

/* ---- month nav ---- */
function shiftMonth(ym,delta){const[y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function refreshMonthNav(){
  monthLabelEl.textContent=monthLabelFor(activeMonth);
  const total=expenses.filter(e=>e.date.startsWith(activeMonth)).reduce((s,e)=>s+e.amount,0);
  monthTotalEl.textContent=fmt(total);
  monthTotalLabelEl.textContent=activeMonth===todayIso().slice(0,7)?'This month':'Spent in '+monthLabelFor(activeMonth);
  todayTotalEl.textContent=fmt(expenses.filter(e=>e.date===todayIso()).reduce((s,e)=>s+e.amount,0));
  prevBtn.disabled=activeMonth<=MIN_MONTH;
}
let toastTimer;
function showToast(msg,ms){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),ms||2000);}
prevBtn.addEventListener('click',()=>{if(activeMonth>MIN_MONTH){activeMonth=shiftMonth(activeMonth,-1);editingId=null;render();}});
nextBtn.addEventListener('click',()=>{activeMonth=shiftMonth(activeMonth,1);editingId=null;render();});

/* ---- category dropdown ---- */
function renderCatItems(){
  catItems.innerHTML=allCats().map(c=>{
    const isDefault=DEFAULT_CATS.includes(c);
    return `<div class="dd-item" data-cat="${esc(c)}"><span>${esc(c)}</span>${isDefault?'':'<button type="button" class="del-cat" data-cat="'+esc(c)+'" aria-label="Delete category">×</button>'}</div>`;
  }).join('');
}
catBtnLabel.textContent=selectedCategory;
renderCatItems();
catBtn.addEventListener('click',(e)=>{e.stopPropagation();closeAllPanels(catPanel);catPanel.classList.toggle('open');});
catItems.addEventListener('click',async(e)=>{
  const del=e.target.closest('.del-cat');
  if(del){e.stopPropagation();const c=del.dataset.cat;
    if(user){const {error}=await sb.from('categories').delete().eq('name',c);if(error){showToast('Could not delete category.');return;}}
    customCats=customCats.filter(x=>x!==c);
    if(selectedCategory===c){selectedCategory=DEFAULT_CATS[0];catBtnLabel.textContent=selectedCategory;}
    renderCatItems();return;}
  const item=e.target.closest('.dd-item');
  if(item){selectedCategory=item.dataset.cat;catBtnLabel.textContent=selectedCategory;catPanel.classList.remove('open');}
});
addCatBtn.addEventListener('click',async()=>{
  const name=newCatInput.value.trim();
  if(!name)return;
  if(allCats().some(c=>c.toLowerCase()===name.toLowerCase())){newCatInput.value='';return;}
  if(user){const {error}=await sb.from('categories').insert({name});if(error){showToast('Could not save category.');return;}}
  customCats.push(name);renderCatItems();newCatInput.value='';newCatInput.focus();
});
newCatInput.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();addCatBtn.click();}});

/* ---- date picker ---- */
function renderCal(){
  calMonthLabel.textContent=monthLabelFor(calViewMonth);
  const[y,m]=calViewMonth.split('-').map(Number);
  const first=new Date(y,m-1,1);
  const startDow=first.getDay();
  const daysInMonth=new Date(y,m,0).getDate();
  const daysInPrev=new Date(y,m-1,0).getDate();
  let cells=[];
  for(let i=startDow-1;i>=0;i--) cells.push({d:daysInPrev-i,other:true});
  for(let d=1;d<=daysInMonth;d++) cells.push({d,other:false,iso:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`});
  while(cells.length%7!==0) cells.push({d:cells.length,other:true});
  const dow=['S','M','T','W','T','F','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('');
  const t=todayIso();
  const cellsHtml=cells.map(c=>{
    if(c.other) return `<button type="button" class="cal-day other" disabled>${c.d}</button>`;
    const cls=['cal-day']; if(c.iso===t)cls.push('today'); if(c.iso===selectedDate)cls.push('selected');
    return `<button type="button" class="${cls.join(' ')}" data-iso="${c.iso}">${c.d}</button>`;
  }).join('');
  calGrid.innerHTML=dow+cellsHtml;
}
function setDate(iso){selectedDate=iso;dateBtnLabel.textContent=new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
setDate(selectedDate);
dateBtn.addEventListener('click',(e)=>{e.stopPropagation();closeAllPanels(calPanel);calViewMonth=selectedDate.slice(0,7);renderCal();calPanel.classList.toggle('open');});
document.getElementById('calPrev').addEventListener('click',()=>{calViewMonth=shiftMonth(calViewMonth,-1);renderCal();});
document.getElementById('calNext').addEventListener('click',()=>{calViewMonth=shiftMonth(calViewMonth,1);renderCal();});
calGrid.addEventListener('click',(e)=>{const b=e.target.closest('.cal-day:not(.other)');if(!b)return;setDate(b.dataset.iso);calPanel.classList.remove('open');});

function closeAllPanels(except){[catPanel,calPanel].forEach(p=>{if(p!==except)p.classList.remove('open');});}
document.addEventListener('click',()=>closeAllPanels(null));
catPanel.addEventListener('click',(e)=>e.stopPropagation());
calPanel.addEventListener('click',(e)=>e.stopPropagation());

/* ---- tabs (desktop nav + mobile drawer) ---- */
const drawerItems=document.querySelectorAll('.drawer-item'), hamburgerBtn=document.getElementById('hamburgerBtn'), mobileDrawer=document.getElementById('mobileDrawer'), drawerBackdrop=document.getElementById('drawerBackdrop');

function switchTab(tab){
  tabBtns.forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  drawerItems.forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const isHome=tab==='home';
  homeView.hidden=!isHome; vizView.hidden=isHome;
  if(!isHome) renderViz();
}
tabBtns.forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
drawerItems.forEach(btn=>btn.addEventListener('click',()=>{switchTab(btn.dataset.tab);closeDrawer();}));

function openDrawer(){mobileDrawer.classList.add('open');drawerBackdrop.classList.add('open');}
function closeDrawer(){mobileDrawer.classList.remove('open');drawerBackdrop.classList.remove('open');}
hamburgerBtn.addEventListener('click',openDrawer);
drawerBackdrop.addEventListener('click',closeDrawer);

/* ---- trust counter ---- */
async function loadTrustCount(){
  const el=document.getElementById('trustCount');
  if(!sb){el.textContent='—';return;}
  try{
    const {data,error}=await sb.rpc('get_user_count');
    el.textContent=(!error&&typeof data==='number')?data.toLocaleString('en-IN'):'—';
  }catch(e){el.textContent='—';}
}
loadTrustCount();

/* ---- visualization ---- */
function last12Months(){
  const out=[]; let ym=todayIso().slice(0,7);
  for(let i=0;i<12;i++){out.unshift(ym); ym=shiftMonth(ym,-1);}
  return out;
}
function renderViz(){
  const months=last12Months();
  const totals=months.map(ym=>expenses.filter(e=>e.date.startsWith(ym)).reduce((s,e)=>s+e.amount,0));
  const grand=totals.reduce((a,b)=>a+b,0);
  const avg=grand/12;
  let bestIdx=0; totals.forEach((t,i)=>{if(t>totals[bestIdx])bestIdx=i;});
  vizAvg.textContent=fmt(avg);
  vizTotal.textContent=fmt(grand);
  vizHighest.textContent=fmt(totals[bestIdx]);
  vizHighestMonth.textContent=totals[bestIdx]>0?monthLabelFor(months[bestIdx]):'No data yet';

  const w=Math.max(320,months.length*54), h=220, padB=34, padT=14, barW=30;
  const max=Math.max(...totals,1);
  const bars=months.map((ym,i)=>{
    const x=i*(w/months.length)+((w/months.length)-barW)/2;
    const barH=Math.round((totals[i]/max)*(h-padB-padT));
    const y=h-padB-barH;
    const cls=i===bestIdx&&totals[i]>0?'bar-col best':'bar-col';
    const label=new Date(ym+'-01T00:00:00').toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
    const valTxt=totals[i]>0?(totals[i]>=1000?Math.round(totals[i]/1000)+'k':Math.round(totals[i])):'';
    return `<rect class="${cls}" x="${x}" y="${y}" width="${barW}" height="${Math.max(barH,totals[i]>0?3:0)}" rx="5"></rect>
      <text class="bar-val" x="${x+barW/2}" y="${y-5}" text-anchor="middle">${valTxt}</text>
      <text class="bar-label" x="${x+barW/2}" y="${h-12}" text-anchor="middle">${label}</text>`;
  }).join('');
  chartWrap.innerHTML=`<svg viewBox="0 0 ${w} ${h}" width="100%" style="min-width:${w}px;display:block"><line x1="0" y1="${h-padB}" x2="${w}" y2="${h-padB}" stroke="var(--line)"></line>${bars}</svg>`;
}

/* ---- records toggle ---- */
recordsToggle.addEventListener('click',()=>{
  const open=recordsBody.classList.toggle('open');
  recordsToggle.classList.toggle('open',open);
});

/* ---- render list ---- */
function render(){
  refreshMonthNav();
  const monthExpenses=expenses.filter(e=>e.date.startsWith(activeMonth));
  if(monthExpenses.length===0){
    listEl.innerHTML=`<div class="empty-state"><span>Nothing logged for ${monthLabelFor(activeMonth)}</span>Add an expense above to start this month's ledger.</div>`;
    return;
  }
  const sorted=[...monthExpenses].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
  const groups={};
  sorted.forEach(e=>{(groups[e.date]=groups[e.date]||[]).push(e);});
  listEl.innerHTML=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(date=>{
    const items=groups[date];
    const dayTotal=items.reduce((s,e)=>s+e.amount,0);
    const rows=items.map(e=>e.id===editingId?editRowHtml(e):`
      <div class="entry" data-id="${e.id}">
        <span class="cat">${esc(e.category)}</span>
        <span class="note">${e.note?esc(e.note):'<span class="empty">No note</span>'}</span>
        <span class="amt">${fmt(e.amount)}</span>
        <span class="actions">
          <button class="edit" aria-label="Edit entry" title="Edit">✎</button>
          <button class="del" aria-label="Delete entry" title="Delete">×</button>
        </span>
      </div>`).join('');
    return `<div class="day-group"><div class="day-heading"><span>${dayLabel(date)}</span><span>${fmt(dayTotal)}</span></div>${rows}</div>`;
  }).join('');
}
function editRowHtml(e){
  const opts=allCats().map(c=>`<option ${c===e.category?'selected':''}>${esc(c)}</option>`).join('');
  return `<div class="edit-row" data-id="${e.id}">
    <div class="row">
      <div class="field"><label>Amount</label><input type="number" step="0.01" min="0" class="ed-amount" value="${e.amount}"></div>
      <div class="field"><label>Date</label><input type="date" class="ed-date" value="${e.date}"></div>
    </div>
    <div class="row"><div class="field"><label>Category</label><select class="ed-category">${opts}</select></div></div>
    <div class="row"><div class="field grow2"><label>Note</label><input type="text" class="ed-note" value="${e.note?esc(e.note):''}"></div></div>
    <div class="edit-actions"><button type="button" class="save">Save</button><button type="button" class="cancel">Cancel</button></div>
  </div>`;
}

form_submit();
function form_submit(){
  document.getElementById('entryForm').addEventListener('submit',async(ev)=>{
    ev.preventDefault();
    const amount=parseFloat(document.getElementById('amount').value);
    if(!amount||amount<=0)return;
    const rec={amount,category:selectedCategory,date:selectedDate,note:document.getElementById('note').value.trim()};
    if(user){
      const {data,error}=await sb.from('expenses').insert(rec).select().single();
      if(error){showToast('Could not save. Please try again.');return;}
      expenses.push(normalize(data));
    } else expenses.push({id:Date.now(),...rec});
    activeMonth=selectedDate.slice(0,7);
    render();
    showToast('Expense Added');
    document.getElementById('amount').value='';document.getElementById('note').value='';document.getElementById('amount').focus();
  });
}

listEl.addEventListener('click',async(ev)=>{
  const delBtn=ev.target.closest('.del'), editBtn=ev.target.closest('.edit'), saveBtn=ev.target.closest('.save'), cancelBtn=ev.target.closest('.cancel');
  if(delBtn){const id=Number(delBtn.closest('.entry').dataset.id);
    if(user){const {error}=await sb.from('expenses').delete().eq('id',id);if(error){showToast('Could not delete. Please try again.');return;}}
    expenses=expenses.filter(e=>e.id!==id);render();return;}
  if(editBtn){editingId=Number(editBtn.closest('.entry').dataset.id);render();return;}
  if(cancelBtn){editingId=null;render();return;}
  if(saveBtn){
    const row=saveBtn.closest('.edit-row'); const id=Number(row.dataset.id);
    const amount=parseFloat(row.querySelector('.ed-amount').value);
    const date=row.querySelector('.ed-date').value;
    const category=row.querySelector('.ed-category').value;
    const note=row.querySelector('.ed-note').value.trim();
    if(!amount||amount<=0||!date)return;
    if(user){const {error}=await sb.from('expenses').update({amount,date,category,note}).eq('id',id);if(error){showToast('Could not save changes.');return;}}
    const idx=expenses.findIndex(e=>e.id===id);
    if(idx>-1)expenses[idx]={id,amount,date,category,note};
    editingId=null; activeMonth=date.slice(0,7); render();
  }
});

/* ---- auth: guests can use the app but nothing is saved; logged-in users are saved per account ---- */
const overlay=document.getElementById('authOverlay'), guestBtns=document.getElementById('guestBtns'), userBar=document.getElementById('userBar'), guestNotice=document.getElementById('guestNotice');
const authForm=document.getElementById('authForm'), authError=document.getElementById('authError'), authSubmit=document.getElementById('authSubmit');
const tabLogin=document.getElementById('tabLogin'), tabSignup=document.getElementById('tabSignup');
const nameField=document.getElementById('nameField'), confirmField=document.getElementById('confirmField');
const authTitle=document.getElementById('authTitle'), authSub=document.getElementById('authSub');
let authMode='login', loggedIn=false;

function setAuthMode(mode){
  authMode=mode; authError.textContent=''; authError.classList.remove('ok');
  tabLogin.classList.toggle('active',mode==='login'); tabSignup.classList.toggle('active',mode==='signup');
  nameField.hidden=confirmField.hidden=(mode==='login');
  authSubmit.textContent=mode==='login'?'Log in':'Create account';
  document.getElementById('authPass').autocomplete=mode==='login'?'current-password':'new-password';
  authTitle.textContent=mode==='login'?'Welcome back':'Create your account';
  authSub.textContent=mode==='login'?'Log in to keep your expenses synced everywhere.':'Sign up to save your expenses and access them anywhere.';
}
function openAuth(mode){authForm.reset();setAuthMode(mode);overlay.hidden=false;document.getElementById('authEmail').focus();}
function closeAuth(){overlay.hidden=true;}
tabLogin.addEventListener('click',()=>setAuthMode('login'));
tabSignup.addEventListener('click',()=>setAuthMode('signup'));
document.getElementById('openLogin').addEventListener('click',()=>openAuth('login'));
document.getElementById('openSignup').addEventListener('click',()=>openAuth('signup'));
document.getElementById('noticeLogin').addEventListener('click',(e)=>{e.preventDefault();openAuth('login');});
document.getElementById('noticeSignup').addEventListener('click',(e)=>{e.preventDefault();openAuth('signup');});
document.getElementById('authClose').addEventListener('click',closeAuth);
overlay.addEventListener('click',(e)=>{if(e.target===overlay)closeAuth();});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!overlay.hidden)closeAuth();});

function resetView(){
  activeMonth=todayIso().slice(0,7); selectedCategory=DEFAULT_CATS[0]; catBtnLabel.textContent=selectedCategory;
  editingId=null; setDate(todayIso()); renderCatItems(); render();
}
async function enterApp(u){
  // anything entered as a guest this session is carried into the account
  const guestExp=user?[]:expenses, guestCats=user?[]:customCats;
  user=u;
  const [e,c]=await Promise.all([sb.from('expenses').select('*'),sb.from('categories').select('name')]);
  if(e.error||c.error){showToast('Could not load your data. Check your connection.',3500);}
  expenses=(e.data||[]).map(normalize); customCats=(c.data||[]).map(r=>r.name);
  for(const g of guestExp){
    const {data}=await sb.from('expenses').insert({amount:g.amount,category:g.category,date:g.date,note:g.note}).select().single();
    if(data)expenses.push(normalize(data));
  }
  for(const name of guestCats){
    if(customCats.includes(name))continue;
    const {error}=await sb.from('categories').insert({name});
    if(!error)customCats.push(name);
  }
  const name=(u.user_metadata&&u.user_metadata.name)||u.email;
  document.getElementById('userGreeting').textContent='Hi, '+name;
  guestBtns.hidden=guestNotice.hidden=true; userBar.hidden=false;
  resetView();
}
function enterGuest(){
  user=null; expenses=[]; customCats=[];
  guestBtns.hidden=guestNotice.hidden=false; userBar.hidden=true;
  resetView();
}

authForm.addEventListener('submit',async(ev)=>{
  ev.preventDefault(); authError.textContent=''; authError.classList.remove('ok');
  if(!sb){authError.textContent='Could not reach the server. Check your internet connection and refresh.';return;}
  const email=document.getElementById('authEmail').value.trim().toLowerCase();
  const pass=document.getElementById('authPass').value;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){authError.textContent='Please enter a valid email.';return;}
  if(pass.length<6){authError.textContent='Password must be at least 6 characters.';return;}
  authSubmit.disabled=true;
  try{
    if(authMode==='signup'){
      const name=document.getElementById('authName').value.trim();
      if(!name){authError.textContent='Please enter your name.';return;}
      if(pass!==document.getElementById('authPass2').value){authError.textContent='Passwords do not match.';return;}
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{name}}});
      if(error){authError.textContent=error.message;return;}
      if(data.user&&data.user.identities&&data.user.identities.length===0){authError.textContent='An account with this email already exists. Try logging in.';return;}
      if(!data.session){
        setAuthMode('login'); authError.textContent='Account created! Check your email to confirm it, then log in.'; authError.classList.add('ok'); return;
      }
      closeAuth(); await enterApp(data.user); loadTrustCount();
    } else {
      const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error){authError.textContent=/confirm/i.test(error.message)?'Please confirm your email first (check your inbox).':'Incorrect email or password.';return;}
      closeAuth(); await enterApp(data.user);
    }
  } catch(err){
    console.error(err); authError.textContent='Something went wrong. Please try again.';
  } finally { authSubmit.disabled=false; }
});

document.getElementById('logoutBtn').addEventListener('click',async()=>{
  if(sb){try{await sb.auth.signOut();}catch(e){console.error(e);}}
  enterGuest();
});

(async function init(){
  enterGuest();
  if(!sb)return;
  const {data}=await sb.auth.getSession();
  if(data&&data.session) await enterApp(data.session.user);
})();
})();
