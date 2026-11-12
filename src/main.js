import './style.css';
import {createTable3D} from './table3d.js';
import {io} from 'socket.io-client';
import {COLORS,validateMeld} from './engine.js';
import {installDebugUI} from './debug-panel.js';
const app=document.getElementById('app');
const socket=io({autoConnect:true,reconnection:true,reconnectionAttempts:Infinity});
let state=null,selected=new Set(),staged=[],pickedMeld=null,order=[],chat=[];
let name=localStorage.getItem('club_name')||'';
let folding=true,teams=true,rounds=5,practice=false;
let roomCode=localStorage.getItem('club_room')||'',roomToken=localStorage.getItem('club_token')||'';
let roomInput='',toastTimer=null,leavingRoom=false,flatRackVisible=false,cameraView=0;
const labels={red:'Kırmızı',yellow:'Sarı',blue:'Mavi',black:'Siyah'};
const htmlSafe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message,error=false){const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.className='toast visible '+(error?'bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',4300)}
function rpc(event,payload={},cb=()=>{}){socket.timeout(8000).emit(event,payload,(err,res)=>{if(err)return toast('Sunucu yanıt vermedi. Tekrar dene.',true);if(!res?.ok)return toast(res?.error||'İşlem başarısız.',true);cb(res)})}
const debugUI=installDebugUI(socket,()=>state,message=>toast(message,true));
function persist(res){roomCode=res.code;roomToken=res.token;localStorage.setItem('club_room',roomCode);localStorage.setItem('club_token',roomToken);localStorage.setItem('club_name',name)}
function clearLocalRoom(message=''){
 roomCode='';roomToken='';
 localStorage.removeItem('club_room');localStorage.removeItem('club_token');
 state=null;selected.clear();staged=[];pickedMeld=null;order=[];chat=[];
 debugUI.reset();
 if(scene3d){scene3d.destroy();scene3d=null;}
 renderHome();if(message)toast(message,true);
}
function leaveRoom(){
 if(leavingRoom)return;
 if(state?.phase!=='lobby'&&!window.confirm('Maç devam ederken ayrılırsan masa kapanacak. Ana menüye dönmek istiyor musun?'))return;
 leavingRoom=true;
 if(!socket.connected){clearLocalRoom();leavingRoom=false;return;}
 socket.timeout(5500).emit('room:leave',{},(err,res)=>{
  clearLocalRoom(err||!res?.ok?'Ana menüye döndün; sunucuyla çıkış onaylanamadı.':'');
  leavingRoom=false;
 });
}
function reconnect(){if(roomCode&&roomToken)rpc('room:join',{code:roomCode,token:roomToken,name},persist)}
socket.on('connect',()=>{debugUI.reset();reconnect()});socket.on('replaced',()=>toast('Aynı hesap başka sekmede açıldı.',true));
socket.on('room:closed',({message}={})=>{clearLocalRoom(message||'Masa kapatıldı.');leavingRoom=false;});
socket.on('state',s=>{if(leavingRoom)return;const changedRound=state?.round!==s.round||state?.phase==='lobby'&&s.phase==='playing';state=s;if(changedRound){selected.clear();staged=[];pickedMeld=null;order=[]}syncOrder();render()});
socket.on('chat',m=>{chat.push(m);if(chat.length>30)chat.shift();renderChat()});
function syncOrder(){if(!state)return;const ids=new Set(state.hand.map(t=>t.id));order=order.filter(id=>ids.has(id));for(const t of state.hand)if(!order.includes(t.id))order.push(t.id);selected=new Set([...selected].filter(id=>ids.has(id)));staged=staged.filter(g=>g.ids.every(id=>ids.has(id)));}
function tileEl(t){const isOk=t.color===state?.okey?.color&&t.value===state?.okey?.value&&!t.fake;return `<div class="tile ${selected.has(t.id)?'chosen':''} ${isOk?'joker':''}" role="button" tabindex="0" draggable="false" data-id="${t.id}" title="${t.fake?'Sahte okey':isOk?'Okey':labels[t.color]+' '+t.value}"><span class="tile-top">${isOk?'✦':''}</span><strong style="color:var(--tile-${t.fake?'fake':t.color})">${t.fake?'★':t.value}</strong><span class="tile-bottom" style="color:var(--tile-${t.fake?'fake':t.color})">${t.fake?'★':isOk?'✦':'●'}</span></div>`}
function smallTile(t){const joker=!t.fake&&state?.okey?.color===t.color&&state?.okey?.value===t.value;return `<span class="mini-tile" style="--c:var(--tile-${t.fake?'fake':t.color})">${t.fake?'★':t.value}${joker?'✦':''}</span>`}
const myPlayer=()=>state?.players.find(p=>p.seat===state.you);
const isMyTurn=()=>state?.phase==='playing'&&state?.turn===state.you;
const hasDrawn=()=>isMyTurn()&&state?.drawn;
function render(){if(!state){renderHome();return;}renderGame();}
function renderHome(){app.innerHTML=`<main class="landing"><div class="land-noise"></div><nav class="landing-nav"><a class="logo"><span class="logo-mark">✣</span> 101<span>CLUB</span></a><span class="nav-status"><i></i> ONLINE MULTIPLAYER</span></nav><div class="land-content"><section class="hero"><div class="eyebrow"><span class="small-line"></span> TÜRKİYE'NİN YENİ OKEY MASASI</div><h1>MASADA<br><em>YERİN HAZIR.</em></h1><p>Arkadaşlarını topla. Taşlarını diz. Masaya hükmet. Gerçek zamanlı, 3 boyutlu 101 Okey deneyimi.</p><div class="hero-features"><span>◈ 3D OYUN MASASI</span><span>◈ 4 OYUNCU</span><span>◈ EŞLİ & KATLAMALI</span></div></section><section class="entry-card"><div class="card-mini-title">MASAYA HOŞ GELDİN</div><h2>Oyuna başla <span>✳</span></h2><label>OYUNCU ADIN</label><input id="name" maxlength="20" placeholder="İsmin veya rumuzun" value="${htmlSafe(name)}" autocomplete="nickname"/><div class="config-title">MASA AYARLARI <span>SADECE ODA KURARKEN</span></div><div class="opt-row"><div><b>Katlamalı oyun</b><small>Açılış barajı her seferinde yükselir</small></div><button type="button" id="folding" class="toggle ${folding?'on':''}" role="switch" aria-checked="${folding}"><span></span></button></div><div class="opt-row"><div><b>Eşli oyun</b><small>Karşılıklı oturanlar aynı takım</small></div><button type="button" id="teams" class="toggle ${teams?'on':''}" role="switch" aria-checked="${teams}"><span></span></button></div><div class="opt-row"><div><b>Tek kişilik test modu</b><small>Diğer koltukları 3 bot doldurur · sadece sana özel oda</small></div><button type="button" id="practice" class="toggle ${practice?'on':''}" role="switch" aria-checked="${practice}"><span></span></button></div><div class="opt-row"><div><b>El sayısı</b><small>Maç kaç el sürecek?</small></div><select id="rounds"><option value="3" ${rounds===3?'selected':''}>3 el</option><option value="5" ${rounds===5?'selected':''}>5 el</option><option value="11" ${rounds===11?'selected':''}>11 el</option></select></div><button class="btn btn-gold full" id="create">✣ &nbsp; YENİ MASA KUR</button><div class="or"><span>VEYA</span></div><div class="join-row"><input id="roomcode" placeholder="6 HANELİ ODA KODU" maxlength="6" value="${htmlSafe(roomInput)}"/><button class="btn btn-outline" id="join">KATIL ↗</button></div><div class="card-foot">Ücretsiz • İndirme gerekmez • Oda koduyla davet</div></section></div><footer class="landing-footer">101 CLUB <span>♦</span> ARKADAŞLARINLA GERÇEK MASA HEYECANI</footer></main><div id="toast" class="toast"></div>`;
 document.getElementById('folding').onclick=()=>{folding=!folding;renderHome()};document.getElementById('teams').onclick=()=>{teams=!teams;renderHome()};document.getElementById('practice').onclick=()=>{practice=!practice;renderHome()};
 document.getElementById('rounds').onchange=e=>rounds=Number(e.target.value);
 document.getElementById('name').oninput=e=>name=e.target.value;
 document.getElementById('roomcode').oninput=e=>roomInput=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
 document.getElementById('create').onclick=()=>{name=document.getElementById('name').value.trim()||'Oyuncu';rpc('room:create',{name,settings:{folding,teams,rounds,practice}},persist)};
 document.getElementById('join').onclick=()=>{name=document.getElementById('name').value.trim()||'Oyuncu';const c=document.getElementById('roomcode').value.trim().toUpperCase();if(c.length!==6)return toast('6 haneli oda kodu gir.',true);rpc('room:join',{code:c,name},persist)};
}
function renderPlayers(){return Array.from({length:4},(_,seat)=>{
 const p=state.players.find(p=>p.seat===seat);const rel=(seat-state.you+4)%4;
 const pos=['bottom','left','top','right'][rel];const team=state.settings.teams?`<span class="team-indicator">TAKIM ${seat%2===state.you%2?'A':'B'}</span>`:'';
 return `<div class="seat seat-${pos} ${state.turn===seat&&state.phase==='playing'?'active':''} ${!p?'empty-seat':''}"><div class="avatar">${p?htmlSafe(p.name[0]?.toUpperCase()||'?'):'+'}</div><div class="seat-details"><b>${p?htmlSafe(p.name):'Boş koltuk'}${p?.bot?' 🤖':''}${state.you===seat?' (Sen)':''}</b><small>${p?`${p.count} taş · ${p.total} puan`:'Bekleniyor...'} ${p&&!p.online?'· Çevrimdışı':''}</small>${team}</div>${state.turn===seat&&state.phase==='playing'?'<span class="turn-dot"></span>':''}</div>`}).join('')}
function renderStaged(){const e=document.getElementById('staged');if(!e)return;
 e.innerHTML=staged.length?staged.map((g,i)=>`<div class="staged-group"><div class="staged-label">${g.kind==='pair'?'ÇİFT':'PER'} ${i+1}</div>${g.ids.map(id=>state.hand.find(t=>t.id===id)).filter(Boolean).map(smallTile).join('')} <button title="Geri al" data-remove="${i}">×</button></div>`).join(''):`<div class="empty-stage">Taş seçip <b>PER HAZIRLA</b> veya <b>ÇİFT HAZIRLA</b> ile açılışını hazırla.</div>`;
 e.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{staged.splice(Number(b.dataset.remove),1);renderGame()});
}
function renderRack(){const e=document.getElementById('rack');if(!e)return;
 const handById=Object.fromEntries(state.hand.map(t=>[t.id,t]));
 e.innerHTML=order.map(id=>handById[id]).filter(Boolean).map(tileEl).join('');
 e.querySelectorAll('.tile').forEach(el=>{
   el.onclick=()=>{const id=el.dataset.id;if(selected.has(id))selected.delete(id);else selected.add(id);updateSelection()};
   el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click()}};
   el.ondragstart=e=>e.preventDefault();
   el.oncontextmenu=e=>e.preventDefault();
 });
}
function updateSelection(){document.querySelectorAll('#rack .tile').forEach(el=>el.classList.toggle('chosen',selected.has(el.dataset.id)));scene3d?.setSelected(selected);
 const n=document.getElementById('selection-count');if(n)n.textContent=selected.size?`${selected.size} TAŞ SEÇİLİ`:'TAŞ SEÇ';
}
function moveSelected(delta){
 if(selected.size!==1)return toast('Sıralamak için tek taş seç.',true);
 const id=[...selected][0],i=order.indexOf(id),target=i+delta;
 if(i<0||target<0||target>=order.length)return;
 order.splice(i,1);order.splice(target,0,id);
 renderRack();scene3d?.update(state);
}
function sortRack(by){const map=Object.fromEntries(state.hand.map(t=>[t.id,t]));if(by==='color')order.sort((a,b)=>(COLORS.indexOf(map[a].color)-COLORS.indexOf(map[b].color))||(map[a].value-map[b].value));else order.sort((a,b)=>(map[a].value-map[b].value)||(COLORS.indexOf(map[a].color)-COLORS.indexOf(map[b].color)));renderRack();scene3d?.update(state)}
function picked(){return state.hand.filter(t=>selected.has(t.id));}
function prepare(kind){if(!isMyTurn()||!state.drawn)return toast('Önce sıranın gelmesini ve taş çekmeyi bekle.',true);
 const all=picked();const v=validateMeld(all,state.okey,kind);if(!v)return toast(kind==='pair'?'İki aynı taş seçerek çift oluştur.':'En az üç taşla geçerli seri/per seç.',true);
 if(staged.length&&staged[0].kind!==kind)return toast('Aynı açılışta per ve çift karıştırılamaz.',true);
 const used=new Set(staged.flatMap(g=>g.ids));if(all.some(t=>used.has(t.id)))return toast('Taş zaten açılışa eklendi.',true);
 staged.push({ids:all.map(t=>t.id),kind,score:v.score});selected.clear();renderGame();toast(`${kind==='pair'?'Çift':'Per'} açılışa eklendi.`)
}
function openHand(){if(!staged.length)return toast('Önce per veya çift hazırla.',true);
 const kind=staged[0].kind;rpc('game:open',{kind,groups:staged.map(g=>g.ids)},()=>{staged=[];selected.clear()})}
function discard(){if(selected.size!==1)return toast('Atmak için 1 taş seç.',true);rpc('game:discard',{id:[...selected][0]},()=>{selected.clear()})}
function addMeld(kind){const all=picked();if(!all.length)return toast('Önce taş seç.',true);rpc('game:meld',{kind,ids:all.map(t=>t.id)},()=>selected.clear())}
function layoff(){if(selected.size!==1)return toast('İşlemek için tek taş seç.',true);if(!pickedMeld)return toast('Önce masadaki bir peri seç.',true);rpc('game:layoff',{tileId:[...selected][0],meldId:pickedMeld},()=>{selected.clear();pickedMeld=null})}
function renderGame(){const me=myPlayer();const lobby=state.phase==='lobby';const end=state.phase==='roundEnd'||state.phase==='finished';const yourTurn=isMyTurn();const stagePts=staged.reduce((s,g)=>s+(g.kind==='pair'?1:g.score),0);const stageKind=staged[0]?.kind;const teamLabel=state.settings.teams?'EŞLİ':'TEKLİ';
 app.innerHTML=`<div class="game"><header class="game-header"><div class="logo"><span class="logo-mark">✣</span> 101<span>CLUB</span></div><div class="header-center"><span class="mode-pill">${state.settings.folding?'KATLAMALI':'KATLAMASIZ'}</span><span class="mode-pill">${teamLabel}</span><span class="mode-pill">${state.settings.rounds} EL</span>${state.settings.practice?'<span class="mode-pill">🤖 TEST</span>':''}</div><div class="header-right"><div class="room-code" id="copy-code" title="Oda kodunu kopyala">ODA <b>${state.code}</b> <span>▣</span></div><span class="round-pill">${lobby?'LOBI':`EL ${state.round}/${state.settings.rounds}`}</span><button class="leave-room-btn" id="new-room" title="Ana menüye dön" aria-label="Ana menüye dön">← <span>ANA MENÜ</span></button><button class="icon-btn" id="help" title="Kurallar">?</button></div></header><div class="game-main"><section class="table-zone"><div id="scene"></div><button id="camera-view" class="camera-view" type="button" title="3D kamera açısını değiştir">◈ 3D KAMERA</button><div class="table-top-caption">${lobby?(state.settings.practice?'BOTLU TEST MASASI':'OYUNCULAR BEKLENİYOR'):end?'EL SONU':yourTurn?'SIRA SENDE':`${htmlSafe(state.players[state.turn]?.name||'')} OYNUYOR`}</div>${renderPlayers()}<div class="table-tip">${htmlSafe(state.lastMove)}</div><div class="table-indicator"><span>GÖSTERGE</span>${state.indicator?smallTile(state.indicator):'<b>—</b>'}</div><div class="table-okey"><span>OKEY</span>${state.okey?smallTile(state.okey):'<b>—</b>'}</div>${lobby?`<div class="lobby-panel"><div class="eyebrow">${state.settings.practice?'SOLO PLAYTEST':'ÖZEL MASA'}</div><h2>${state.settings.practice?'Botlara karşı test et':'Arkadaşlarını davet et'}</h2><p>${state.settings.practice?'Tek başına başlat, 3 bot otomatik katılsın.':'Oda kodunu gönder, diğer 3 kişi katılsın.'}</p><div class="big-code" id="big-copy">${state.code} <span>▣</span></div><div class="lobby-summary"><span>${state.settings.folding?'✓ Katlamalı':'Katlamasız'}</span><span>${state.settings.teams?'✓ Eşli':'Tekli'}</span><span>${state.settings.rounds} el</span></div><div class="player-slots">${[0,1,2,3].map(i=>`<div class="player-slot ${state.players[i]?'filled':''}">${state.players[i]?htmlSafe(state.players[i].name):'Oyuncu bekleniyor'}<span>${state.players[i]?'✓':'◌'}</span></div>`).join('')}</div>${state.you===state.hostSeat?`<button class="btn btn-gold full" id="start" ${!state.settings.practice&&(state.players.length!==4||state.players.some(p=>!p.online))?'disabled':''}>${state.settings.practice?'🤖 3 BOTLA TESTE BAŞLA':state.players.length===4?'✣ OYUNU BAŞLAT':`${state.players.length}/4 OYUNCU · BEKLENİYOR`}</button>`:'<div class="waiting-hint">Oda sahibinin oyunu başlatması bekleniyor.</div>'}<button class="btn btn-outline full lobby-leave" data-leave-room>← ANA MENÜYE DÖN</button></div>`:''}${end?`<div class="result-panel"><div class="eyebrow">EL ${state.round} SONU</div><h2>${state.winner===null?'Taşlar tükendi':state.winner===state.you?'Tebrikler, bitirdin!':`${htmlSafe(state.players.find(p=>p.seat===state.winner)?.name)} bitirdi!`}</h2><div class="results">${(state.lastResult?.changes||[]).map(c=>`<div><span>${htmlSafe(c.name)}</span><b class="${c.delta<0?'positive':''}">${c.delta>0?'+':''}${c.delta}</b><strong>${c.total} toplam</strong></div>`).join('')}</div>${state.settings.teams?`<div class="team-score">TAKIM A: ${state.players.filter(p=>p.seat%2===0).reduce((s,p)=>s+p.total,0)} &nbsp; • &nbsp; TAKIM B: ${state.players.filter(p=>p.seat%2===1).reduce((s,p)=>s+p.total,0)}</div>`:''}${state.phase==='finished'?'<div class="waiting-hint">MAÇ TAMAMLANDI</div>':state.you===state.hostSeat?'<button class="btn btn-gold full" id="next">SONRAKİ EL ↗</button>':'<div class="waiting-hint">Oda sahibi sonraki eli başlatacak.</div>'}</div>`:''}</section><section class="dashboard"><div class="dashboard-section-title">OYUN DURUMU <span class="gold">● CANLI</span></div><div class="scoreboard">${state.players.map(p=>`<div class="score-row ${state.you===p.seat?'mine':''}"><span class="player-chip">${htmlSafe(p.name[0]?.toUpperCase()||'?')}</span><div><b>${htmlSafe(p.name)}</b><small>${p.openedKind?`${p.openValue} ${p.openedKind==='pair'?'çift':'puan'} açtı`:'Açmadı'} ${state.settings.teams?`· TAKIM ${p.seat%2===0?'A':'B'}`:''}</small></div><strong>${p.total}</strong></div>`).join('')}</div><div class="dashboard-section-title">MASA BİLGİSİ</div><div class="stats-grid"><div><small>ORTADAKİ TAŞ</small><strong>${state.stockCount}</strong></div><div><small>EL AÇMA</small><strong>${state.minimumNormal || 101}<span>puan</span></strong></div><div><small>ÇİFT AÇMA</small><strong>${state.minimumPair || 5}<span>çift</span></strong></div><div><small>MASADAKİ PER</small><strong>${state.melds?.length||0}</strong></div></div><div class="dashboard-section-title">MASADAKİ PERLER <span>${state.melds?.length||0}</span></div><div id="meld-list" class="meld-list">${state.melds?.length?state.melds.map((m,i)=>`<button class="meld-item ${pickedMeld===m.id?'is-picked':''}" data-meld="${m.id}"><span class="meld-index">${i+1}</span><span>${m.tiles.map(smallTile).join('')}</span><span class="meld-kind">${m.kind==='pair'?'ÇİFT':m.score}</span></button>`).join(''):'<div class="empty-melds">Henüz masaya per açılmadı.</div>'}</div><div class="dashboard-bottom"><div class="chat-header">MASA SOHBETİ <span>◉</span></div><div class="chat-log" id="chat-log"></div><form class="chat-form" id="chat-form"><input id="chat-input" maxlength="140" placeholder="Bir şeyler yaz..." autocomplete="off"/><button aria-label="Gönder">↗</button></form></div></section></div>${lobby?'':`<section class="rack-zone"><div class="rack-head"><div><b>ISTAKAN</b><span id="selection-count">TAŞ SEÇ</span></div><div class="rack-head-right"><span class="turn-state ${yourTurn?'turn-mine':''}">${yourTurn?'✳ SIRA SENDE':'◌ SIRA BEKLENİYOR'}</span><button class="text-btn" id="move-left" type="button" title="Seçili taşı sola kaydır">← TAŞ</button><button class="text-btn" id="move-right" type="button" title="Seçili taşı sağa kaydır">TAŞ →</button><button class="text-btn" id="toggle-flat-rack" type="button" title="Alternatif 2D ıstaka görünümü">2D ISTAKA</button><button class="text-btn" id="sort-color">RENK SIRALA</button><button class="text-btn" id="sort-num">SAYI SIRALA</button></div></div><div class="rack-surface flat-rack" id="flat-rack" hidden><div id="rack" class="rack"></div></div><div class="rack-3d-hint">◈ 3D masadaki taşlarına sol tıkla · Sağ tık ile sürükleme kapalı</div><div class="staging-bar"><div class="stage-head"><span>HAZIRLANAN PERLER</span>${staged.length?`<span class="gold">${stagePts} ${stageKind==='pair'?'ÇİFT':'PUAN'}</span>`:''}</div><div class="staged" id="staged"></div></div><div class="actions"><div class="actions-left"><button class="btn btn-neutral" id="draw" ${!yourTurn||state.drawn?'disabled':''}>↧ ORTADAN ÇEK</button><button class="btn btn-neutral" id="take" ${!yourTurn||state.drawn||!state.discards.length?'disabled':''}>↟ YANDAN AL</button></div><div class="action-divider"></div><div class="actions-middle"><button class="btn btn-dark" id="prep-normal" ${!hasDrawn()||!!me?.openedKind?'disabled':''}>+ PER HAZIRLA</button><button class="btn btn-dark" id="prep-pair" ${!hasDrawn()||!!me?.openedKind?'disabled':''}>+ ÇİFT HAZIRLA</button><button class="btn btn-gold" id="open" ${!hasDrawn()||!!me?.openedKind||!staged.length?'disabled':''}>✣ EL AÇ</button><button class="btn btn-dark" id="new-meld" ${!hasDrawn()||!me?.openedKind||me?.openedKind==='pair'?'disabled':''}>+ PER KOY</button><button class="btn btn-dark" id="new-pair" ${!hasDrawn()||!me?.openedKind?'disabled':''}>+ ÇİFT KOY</button><button class="btn btn-dark" id="layoff" ${!hasDrawn()||!me?.openedKind?'disabled':''}>↗ İŞLE</button></div><div class="actions-right"><button class="btn btn-red" id="discard" ${!hasDrawn()?'disabled':''}>TAŞ AT ↗</button></div></div></section>`}<div id="toast" class="toast"></div><div id="modal" class="modal hidden"></div></div>`;
 document.getElementById('copy-code').onclick=copyCode;
 document.getElementById('big-copy')?.addEventListener('click',copyCode);
 document.getElementById('help').onclick=showHelp;
 document.getElementById('new-room').onclick=leaveRoom;document.querySelectorAll('[data-leave-room]').forEach(el=>el.addEventListener('click',leaveRoom));
 document.getElementById('start')?.addEventListener('click',()=>rpc('room:start'));
 document.getElementById('next')?.addEventListener('click',()=>rpc('game:next'));
 document.querySelectorAll('[data-meld]').forEach(el=>el.onclick=()=>{pickedMeld=pickedMeld===el.dataset.meld?null:el.dataset.meld;document.querySelectorAll('[data-meld]').forEach(x=>x.classList.toggle('is-picked',x.dataset.meld===pickedMeld));scene3d?.highlightMeld(pickedMeld)});
 document.getElementById('sort-color')?.addEventListener('click',()=>sortRack('color'));
 document.getElementById('sort-num')?.addEventListener('click',()=>sortRack('number'));
 document.getElementById('prep-normal')?.addEventListener('click',()=>prepare('normal'));
 document.getElementById('prep-pair')?.addEventListener('click',()=>prepare('pair'));
 document.getElementById('open')?.addEventListener('click',openHand);
 document.getElementById('new-meld')?.addEventListener('click',()=>addMeld('normal'));
 document.getElementById('layoff')?.addEventListener('click',layoff);
 document.getElementById('new-pair')?.addEventListener('click',()=>addMeld('pair'));
 document.getElementById('draw')?.addEventListener('click',()=>rpc('game:draw',{from:'stock'}));
 document.getElementById('take')?.addEventListener('click',()=>rpc('game:draw',{from:'discard'}));
 document.getElementById('discard')?.addEventListener('click',discard);
 document.getElementById('chat-form').onsubmit=e=>{e.preventDefault();const input=document.getElementById('chat-input');const text=input.value.trim();if(!text)return;socket.emit('chat:send',{text});input.value=''};
 const flat=document.getElementById('flat-rack');
 if(flat)flat.hidden=!flatRackVisible;
 document.getElementById('move-left')?.addEventListener('click',()=>moveSelected(-1));
 document.getElementById('move-right')?.addEventListener('click',()=>moveSelected(1));
 document.querySelector('.rack-zone')?.addEventListener('contextmenu',e=>e.preventDefault());
 document.getElementById('toggle-flat-rack')?.addEventListener('click',()=>{
  flatRackVisible=!flatRackVisible;
  const rack=document.getElementById('flat-rack');if(rack)rack.hidden=!flatRackVisible;
 });
 document.getElementById('camera-view')?.addEventListener('click',e=>{
  if(scene3d){cameraView=(cameraView+1)%3;e.currentTarget.textContent='◈ '+scene3d.setView();}
 });
 renderRack();renderStaged();renderChat();initScene();
}
function renderChat(){const el=document.getElementById('chat-log');if(!el)return;el.innerHTML=chat.slice(-18).map(m=>`<div><b>${htmlSafe(m.name)}</b> ${htmlSafe(m.text)}</div>`).join('')||'<span class="chat-placeholder">Henüz mesaj yok. Bir selam ver! 👋</span>';el.scrollTop=el.scrollHeight}
function copyCode(){navigator.clipboard?.writeText(state.code).then(()=>toast('Oda kodu kopyalandı!')).catch(()=>toast(`Oda kodu: ${state.code}`))}
function showHelp(){const modal=document.getElementById('modal');modal.classList.remove('hidden');modal.innerHTML=`<div class="modal-bg"></div><div class="help-card"><button id="modal-close">×</button><div class="eyebrow">101 CLUB · REHBER</div><h2>Nasıl oynanır?</h2><p><b>1.</b> Sıran gelince ortadan taş çek veya son atılan taşı al. Oyuna başlayan oyuncuda zaten 22 taş bulunur.</p><p><b>2.</b> Istakadan taşları seçip <b>Per Hazırla</b> ile birden fazla seri/grup hazırla. <b>El Aç</b> diyerek 101 puanı (katlamalıysa barajı) geç.</p><p><b>3.</b> Aynı renk ve sayıdan iki taş seçip <b>Çift Hazırla</b> diyerek en az 5 çiftle de açabilirsin.</p><p><b>4.</b> Açtıktan sonra per koyabilir veya masadaki bir per ile elinden bir taşı seçip <b>İşle</b> diyebilirsin.</p><p><b>5.</b> Sıranı bir taş atarak tamamla. Elinde hiç taş kalmazsa eli kazanırsın. Eşli modda karşıdaki oyuncu takım arkadaşın.</p><p class="help-note">Okey joker taşları göstergenin bir sonraki sayısıdır. Perler 1–13 arası düz sıralanır. Yandan çekilen taşla açılmadan sıra bitirilemez.</p></div>`;modal.querySelector('#modal-close').onclick=()=>modal.classList.add('hidden');modal.querySelector('.modal-bg').onclick=()=>modal.classList.add('hidden')}
let scene3d=null;
function initScene(){if(scene3d)scene3d.destroy();try{scene3d=createScene(document.getElementById('scene'));scene3d.update(state);scene3d.setSelected(selected);for(let i=0;i<cameraView;i++)scene3d.setView();const button=document.getElementById('camera-view');if(button)button.textContent='◈ '+['3D KAMERA','ÜSTTEN','YAKINDAN'][cameraView]}catch(err){console.error('3D unavailable',err);scene3d=null;const fallback=document.getElementById('flat-rack');if(fallback)fallback.hidden=false;const cam=document.getElementById('camera-view');if(cam)cam.hidden=true;document.getElementById('scene').innerHTML='<div class="webgl-warning">WebGL kullanılamıyor. 2D yedek ıstaka açıldı.</div>'}}
function createScene(node){
 return createTable3D(node,{
  getState:()=>state,
  getOrder:()=>order,
  getSelected:()=>selected,
  onSelect:id=>{if(selected.has(id))selected.delete(id);else selected.add(id);updateSelection();},
  onDraw:()=>{if(isMyTurn()&&!state.drawn)rpc('game:draw',{from:'stock'});},
  onTake:()=>{if(isMyTurn()&&!state.drawn)rpc('game:draw',{from:'discard'});},
  onMeld:id=>{
   pickedMeld=pickedMeld===id?null:id;
   document.querySelectorAll('[data-meld]').forEach(x=>x.classList.toggle('is-picked',x.dataset.meld===pickedMeld));
   scene3d?.highlightMeld(pickedMeld);
  }
 });
}

render();
