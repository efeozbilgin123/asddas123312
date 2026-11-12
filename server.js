import express from 'express';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {newTiles,setupRound,stateFor,ensureHand,canOpen,validateMeld,minimumOpen,settle,isJoker,publicTile} from './src/engine.js';
import {botOpening,botDiscard} from './src/bots.js';
import {safeSecretMatch,debugOnly,debugSteal} from './src/debug.js';
const root=dirname(fileURLToPath(import.meta.url));
const app=express();app.disable('x-powered-by');
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));
app.use(express.static(join(root,'dist'),{index:'index.html'}));
app.get('*',(req,res)=>res.sendFile(join(root,'dist','index.html')));
const httpServer=createServer(app);
const io=new Server(httpServer,{cors:{origin:process.env.NODE_ENV==='production'?false:true},maxHttpBufferSize:20000});
const rooms=new Map();
const DEBUG_ADMIN_KEY=process.env.DEBUG_ADMIN_KEY||'';
function botPlayer(seat){
 return {seat,name:'Test Botu '+seat,bot:true,token:null,socketId:null,hand:[],total:0,openedKind:null,openValue:0,roundPenalty:0};
}
function scheduleBots(room){
 if(!room.settings.practice||room.phase!=='playing'||room.botTimer)return;
 const p=room.players.find(x=>x.seat===room.turn);if(!p?.bot)return;
 room.botTimer=setTimeout(()=>{
  room.botTimer=null;if(room.phase!=='playing'||room.turn!==p.seat)return;
  try{
   if(!room.drawn){
    if(!room.stock.length){settle(room,null,null);notify(room);return;}
    p.hand.push(room.stock.pop());room.drawn=true;room.lastMove=p.name+' ortadan taş çekti.';
   }
   const open=botOpening(room,p);
   if(open){
    const ids=new Set(open.ids);p.hand=p.hand.filter(t=>!ids.has(t.id));
    for(const meld of open.checked)room.melds.push({...meld,id:token().slice(0,9),owner:p.seat});
    p.openedKind=open.kind;p.openValue=open.amount;
    room.lastMove=p.name+' açılış yaptı.';
   }
   if(!p.hand.length){settle(room,p.seat,null);notify(room);return;}
   const tile=botDiscard(p.hand,room.okey);
   p.hand.splice(p.hand.findIndex(t=>t.id===tile.id),1);
   room.discard.push(tile);room.lastMove=p.name+' bir taş attı.';
   advance(room,p,tile);notify(room);scheduleBots(room);
  }catch(error){console.error('Bot error:',error);room.lastMove='Bot hamlesi başarısız oldu.';notify(room);}
 },700);
}

const code=()=>randomBytes(3).toString('hex').toUpperCase();
const token=()=>randomBytes(24).toString('hex');
const cleanName=n=>String(n||'Misafir').replace(/[<>]/g,'').trim().slice(0,20)||'Misafir';
const ackErr=(ack,e)=>ack?.({ok:false,error:e?.message||String(e)});
const ackOK=(ack,p={})=>ack?.({ok:true,...p});
const socketFind=sock=>{const {code,token}=sock.data||{};const room=rooms.get(code);const player=room?.players.find(p=>p.token===token);return {room,player};};
function notify(room){for(const p of room.players){if(p.socketId)io.to(p.socketId).emit('state',stateFor(room,p));}}
function checkTurn(room,p){if(room.phase!=='playing')throw Error('Oyun devam etmiyor.');if(room.turn!==p.seat)throw Error('Sıra sende değil.');}
function checkDrawing(room){if(!room.drawn)throw Error('Önce taş çekmelisin.');}
function advance(room,p,discard){
 if(p.hand.length===0){settle(room,p.seat,discard);return;}
 if(room.stock.length===0){settle(room,null,null);return;}
 room.turn=(room.turn+1)%4;room.drawn=false;
}
function bindSocket(sock,room,p){if(p.bot)throw Error('Bot oturumuna bağlanılamaz.');if(p.socketId&&p.socketId!==sock.id)io.to(p.socketId).emit('replaced'); p.socketId=sock.id;sock.data={code:room.code,token:p.token,debugAuthorized:false};sock.join(room.code);}
function doAction(sock,ack,fn){try{const {room,player}=socketFind(sock);if(!room||!player)throw Error('Odaya bağlı değilsin.');fn(room,player);notify(room);ackOK(ack);scheduleBots(room);}catch(e){ackErr(ack,e);}}
io.on('connection',sock=>{
 sock.on('room:create',(data={},ack)=>{try{
   let c;do{c=code()}while(rooms.has(c));
   const p={seat:0,name:cleanName(data.name),token:token(),socketId:sock.id,hand:[],total:0,openedKind:null,openValue:0,roundPenalty:0};
   const s=data.settings||{};const settings={folding:!!s.folding,teams:!!s.teams,practice:!!s.practice,rounds:[3,5,11].includes(Number(s.rounds))?Number(s.rounds):5};
   const room={code:c,players:[p],hostSeat:0,settings,phase:'lobby',round:0,turn:0,drawn:false,stock:[],discard:[],melds:[],lastResult:null,lastMove:'Oyuncular bekleniyor.'};
   rooms.set(c,room);bindSocket(sock,room,p);notify(room);ackOK(ack,{code:c,token:p.token});
 }catch(e){ackErr(ack,e)}});
 sock.on('room:join',(data={},ack)=>{try{
   const c=String(data.code||'').toUpperCase().trim();const room=rooms.get(c);if(!room)throw Error('Oda bulunamadı.');
   let p=data.token?room.players.find(p=>p.token===data.token):null;
   if(!p){if(room.settings.practice)throw Error('Bu oda özel bot test odası.');if(room.phase!=='lobby')throw Error('Oyun başladı; yeni oyuncu katılamaz.');if(room.players.length>=4)throw Error('Oda dolu.');
     p={seat:room.players.length,name:cleanName(data.name),token:token(),socketId:null,hand:[],total:0,openedKind:null,openValue:0,roundPenalty:0};room.players.push(p);
   }
   bindSocket(sock,room,p);notify(room);ackOK(ack,{code:c,token:p.token});
 }catch(e){ackErr(ack,e)}});
 sock.on('room:leave',(_,ack)=>{try{const {room,player}=socketFind(sock);if(room&&player&&player.socketId===sock.id){player.socketId=null;sock.leave(room.code);if(room.settings.practice&&player.seat===room.hostSeat){if(room.botTimer)clearTimeout(room.botTimer);rooms.delete(room.code);}else notify(room);}sock.data={};ackOK(ack);}catch(e){ackErr(ack,e)}});
 sock.on('room:settings',(data={},ack)=>doAction(sock,ack,(r,p)=>{if(r.phase!=='lobby'||p.seat!==r.hostSeat)throw Error('Bu ayarları sadece oda sahibi değiştirebilir.');r.settings.folding=!!data.folding;r.settings.teams=!!data.teams;r.settings.rounds=[3,5,11].includes(Number(data.rounds))?Number(data.rounds):5;}));
 sock.on('room:start',(_,ack)=>doAction(sock,ack,(r,p)=>{if(p.seat!==r.hostSeat)throw Error('Odayı yalnız kurucu başlatabilir.');if(r.phase!=='lobby')throw Error('Oyun zaten başladı.');if(r.settings.practice){while(r.players.length<4)r.players.push(botPlayer(r.players.length));}
   if(r.players.length!==4)throw Error('Başlamak için 4 oyuncu gerekli.');if(r.players.some(x=>!x.socketId&&!x.bot))throw Error('Tüm oyuncular bağlı olmalı.');r.round=1;setupRound(r);}));
 sock.on('game:draw',(data={},ack)=>doAction(sock,ack,(r,p)=>{
   checkTurn(r,p);if(r.drawn)throw Error('Bu sırada zaten bir taşın var.');
   if(data.from==='discard'){
     if(!r.discard.length)throw Error('Yerde taş yok.');
     const taken=r.discard.pop();p.hand.push(taken);r.lastMove=`${p.name} yandan taş aldı.`;
     // Restrict picking discarded tile until opening to simplify and protect fair play:
     // Rule requires opening with it during this turn. Tracked for discard check.
     if(!p.openedKind)p.mustOpenWith=taken.id;
   }else{
     if(!r.stock.length)throw Error('Taş kalmadı.');p.hand.push(r.stock.pop());r.lastMove=`${p.name} ortadan taş çekti.`;
   }
   r.drawn=true;
 }));
 sock.on('game:open',(data={},ack)=>doAction(sock,ack,(r,p)=>{
   checkTurn(r,p);checkDrawing(r);
   const kind=data.kind==='pair'?'pair':'normal';
   const result=canOpen(r,p,data.groups,kind);if(!result.ok)throw Error(result.error);
   if(p.mustOpenWith&&!result.ids.includes(p.mustOpenWith))throw Error('Yandan aldığın taşı açarken kullanmalısın.');
   const idset=new Set(result.ids);p.hand=p.hand.filter(t=>!idset.has(t.id));
   for(const meld of result.checked)r.melds.push({...meld,id:token().slice(0,9),owner:p.seat});
   p.openedKind=kind;p.openValue=result.amount;p.mustOpenWith=null;
   r.lastMove=`${p.name} ${kind==='pair'?result.amount+' çift':result.amount+' puan'} açtı!`;
 }));
 sock.on('game:meld',(data={},ack)=>doAction(sock,ack,(r,p)=>{
   checkTurn(r,p);checkDrawing(r);if(!p.openedKind)throw Error('Önce elini açmalısın.');
   const ids=[...new Set((data.ids||[]).map(String))];if(!ids.length||ids.length>13)throw Error('Taş seç.');
   const ts=ids.map(id=>p.hand.find(t=>t.id===id));if(ts.some(t=>!t))throw Error('Taş sende değil.');
   const kind=data.kind==='pair'?'pair':'normal';if(p.openedKind==='pair'&&kind==='normal')throw Error('Çift açan oyuncu yeni seri açamaz.');
   const result=validateMeld(ts,r.okey,kind);if(!result)throw Error('Bu per geçersiz.');
   if(p.hand.length<=ts.length)throw Error('Bitirmek için atacak taş bırak.');
   const chosen=new Set(ids);p.hand=p.hand.filter(t=>!chosen.has(t.id));
   r.melds.push({...result,id:token().slice(0,9),owner:p.seat});r.lastMove=`${p.name} masaya per koydu.`;
 }));
 sock.on('game:layoff',(data={},ack)=>doAction(sock,ack,(r,p)=>{
   checkTurn(r,p);checkDrawing(r);if(!p.openedKind)throw Error('İşlemek için önce el aç.');
   const i=p.hand.findIndex(t=>t.id===String(data.tileId));if(i<0)throw Error('Taş bulunamadı.');
   const meld=r.melds.find(m=>m.id===data.meldId);if(!meld)throw Error('Per bulunamadı.');
   const raw=meld.tiles.map(t=>({id:t.id,color:t.color,value:t.value,fake:t.fake}));raw.push(p.hand[i]);
   const checked=validateMeld(raw,r.okey,meld.kind==='pair'?'pair':'normal');
   if(!checked||checked.kind!==meld.kind)throw Error('Taş bu pere işlenemez.');
   if(p.hand.length===1)throw Error('Son taşını atmak için sakla.');
   p.hand.splice(i,1);meld.tiles=checked.tiles;meld.score=checked.score;
   r.lastMove=`${p.name} bir taş işledi.`;
 }));
 sock.on('game:discard',(data={},ack)=>doAction(sock,ack,(r,p)=>{
   checkTurn(r,p);checkDrawing(r);
   if(p.mustOpenWith)throw Error('Yandan taş aldıysan o tur açmalısın.');
   const i=p.hand.findIndex(t=>t.id===String(data.id));if(i<0)throw Error('Taş elinde yok.');
   const [t]=p.hand.splice(i,1);r.discard.push(t);r.lastMove=`${p.name} taş attı.`;
   advance(r,p,t);
 }));
 sock.on('game:next',(_,ack)=>doAction(sock,ack,(r,p)=>{
   if(p.seat!==r.hostSeat)throw Error('Yeni eli oda sahibi başlatabilir.');
   if(r.phase!=='roundEnd')throw Error('El sona ermedi.');r.round++;setupRound(r);
 }));
 sock.on('debug:auth',(data={},ack)=>{try{
  const {room,player}=socketFind(sock);
  if(!room?.settings.practice||player?.seat!==room.hostSeat)throw Error('Debug yalnızca test odasının sahibine açık.');
  if(!DEBUG_ADMIN_KEY)throw Error('Sunucuda debug anahtarı tanımlı değil.');
  if(!safeSecretMatch(data.key,DEBUG_ADMIN_KEY))throw Error('Geçersiz debug erişim anahtarı.');
  sock.data.debugAuthorized=true;ackOK(ack);
 }catch(e){ackErr(ack,e)}});
 sock.on('debug:inspect',(_,ack)=>{try{
  const {room,player}=socketFind(sock);if(!room||!player)throw Error('Oda bulunamadı.');
  debugOnly(room,player,sock.data.debugAuthorized);
  ackOK(ack,{players:room.players.filter(p=>p.bot).map(p=>({seat:p.seat,name:p.name,hand:p.hand.map(publicTile)})),stock:room.stock.map(publicTile),turn:room.turn});
 }catch(e){ackErr(ack,e)}});
 sock.on('debug:steal',(data={},ack)=>doAction(sock,ack,(r,p)=>{
  debugOnly(r,p,sock.data.debugAuthorized);debugSteal(r,p,data.source,data.tileId);
 }));
 sock.on('debug:turn',(_,ack)=>doAction(sock,ack,(r,p)=>{
  debugOnly(r,p,sock.data.debugAuthorized);if(r.phase!=='playing')throw Error('Oyun başlamalı.');
  if(r.botTimer){clearTimeout(r.botTimer);r.botTimer=null;}
  r.turn=p.seat;r.drawn=p.hand.length>21;r.lastMove='Test modu: sıra test kullanıcısına geçirildi.';
 }));
 sock.on('chat:send',(data={})=>{const {room,player}=socketFind(sock);if(!room||!player)return;const msg=String(data.text||'').trim().replace(/[<>]/g,'').slice(0,140);if(msg)io.to(room.code).emit('chat',{name:player.name,text:msg});});
 sock.on('disconnect',()=>{const {room,player}=socketFind(sock);if(room&&player&&player.socketId===sock.id){player.socketId=null;notify(room);}});
});
const PORT=Number(process.env.PORT)||3001;
httpServer.listen(PORT,'0.0.0.0',()=>console.log(`101 Club ready :${PORT}`));
