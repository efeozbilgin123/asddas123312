/** Authoritative 101 Okey game rules. Tile identity is server-only except your own hand. */
export const COLORS=['red','yellow','blue','black'];
export const HAND_COUNT=21;
export const MAX_PLAYERS=4;
export const roundScore=tile=>tile.fake ? 0 : tile.value;
export function newTiles(){
  const out=[]; let id=0;
  for (let copy=0;copy<2;copy++) for (let color of COLORS) for (let value=1;value<=13;value++) out.push({id:String(id++),color,value});
  out.push({id:String(id++),fake:true},{id:String(id++),fake:true});
  return out;
}
export function shuffle(list,rng=Math.random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function indicatorFrom(stock){const i=stock.findIndex(t=>!t.fake); if(i===-1) throw Error('Gösterge bulunamadı');return stock.splice(i,1)[0];}
export function jokerFace(indicator){return {color:indicator.color,value:(indicator.value%13)+1};}
export function face(tile,okey){if(tile.fake) return {...okey};return {color:tile.color,value:tile.value};}
export function isJoker(tile,okey){return !tile.fake && tile.color===okey.color && tile.value===okey.value;}
export function tilePoints(tile,okey){return isJoker(tile,okey)?101:face(tile,okey).value;}
export function publicTile(tile){return {id:tile.id,color:tile.color,value:tile.value,fake:!!tile.fake};}
function assigned(tile,okey,sub){return sub ?? face(tile,okey);}
function checkRun(faces){if(faces.length<3 || faces.length>13 || faces.some(f=>f.color!==faces[0].color)) return false;
 const values=faces.map(f=>f.value).sort((a,b)=>a-b);if(new Set(values).size!==values.length)return false;
 // No arbitrary circular wrapping. Standard 1..13 consecutive runs.
 return values.every((v,i)=>i===0||v===values[i-1]+1);
}
function checkSet(faces){return faces.length>=3&&faces.length<=4&&faces.every(f=>f.value===faces[0].value)&&new Set(faces.map(f=>f.color)).size===faces.length;}
function checkPair(faces){return faces.length===2&&faces[0].color===faces[1].color&&faces[0].value===faces[1].value;}
/** Resolve wildcards to legal per shapes; score = resolved face values. */
export function validateMeld(tiles,okey,kind='normal'){
 if(!Array.isArray(tiles)||tiles.length<(kind==='pair'?2:3)||tiles.length>(kind==='pair'?2:13))return null;
 const wild=tiles.map((t,i)=>isJoker(t,okey)?i:-1).filter(i=>i!==-1);
 if(wild.length>2)return null;
 const possibilities=[];for(const color of COLORS)for(let value=1;value<=13;value++)possibilities.push({color,value});
 const options=wild.length?possibilities:[null];let best=null;
 const evalTry=(subs)=>{
  const resolved=tiles.map((t,i)=>assigned(t,okey,subs[i]));
  const valid=kind==='pair'?checkPair(resolved):(checkSet(resolved)||checkRun(resolved));
  if(!valid)return;
  const score=resolved.reduce((s,f)=>s+f.value,0);
  if(!best||score>best.score)best={tiles:tiles.map((t,i)=>({...publicTile(t),as:resolved[i]})),score,kind:kind==='pair'?'pair':(checkSet(resolved)?'set':'run')};
 };
 for (let a of options){if(wild.length===0){evalTry({});break;}if(wild.length===1){evalTry({[wild[0]]:a});continue;}for(let b of possibilities)evalTry({[wild[0]]:a,[wild[1]]:b});}
 return best;
}
export function minimumOpen(state,player,kind='normal'){
 if(!state.settings.folding) return kind==='pair'?5:101;
 const eligible=state.players.filter(p=>!state.settings.teams||p.seat%2!==player.seat%2);
 const vals=eligible.filter(p=>p.openedKind===kind).map(p=>p.openValue);
 return Math.max(kind==='pair'?5:101,vals.length?Math.max(...vals)+1:0);
}
export function canOpen(state,player,meldGroups,kind){
 if(player.openedKind)return {ok:false,error:'Elini zaten açtın.'};
 if(!Array.isArray(meldGroups)||!meldGroups.length)return {ok:false,error:'Önce per hazırla.'};
 if(!['normal','pair'].includes(kind))return {ok:false,error:'Geçersiz açılış.'};
 let all=[];let checked=[];
 for(const group of meldGroups){
   if(!Array.isArray(group)||group.length>13)return {ok:false,error:'Geçersiz per.'};
   const ids=group.map(String);if(ids.some(id=>all.includes(id)))return {ok:false,error:'Aynı taşı iki kez kullandın.'};
   const own=ids.map(id=>player.hand.find(t=>t.id===id));if(own.some(t=>!t))return {ok:false,error:'Taş elinde bulunamadı.'};
   const v=validateMeld(own,state.okey,kind);if(!v)return {ok:false,error:kind==='pair'?'Geçersiz çift.':'Geçersiz seri veya per.'};
   all.push(...ids);checked.push(v);
 }
 if(player.hand.length-all.length<1)return {ok:false,error:'Bitirmek için atacak bir taşın kalmalı.'};
 const amount=kind==='pair'?checked.length:checked.reduce((s,m)=>s+m.score,0);
 const minimum=minimumOpen(state,player,kind);
 if(amount<minimum)return {ok:false,error:`Açmak için ${minimum} ${kind==='pair'?'çift':'puan'} gerekli. Şu an: ${amount}.`};
 return {ok:true,checked,amount,ids:all};
}
export function ensureHand(state,seat){const player=state.players.find(p=>p.seat===seat);if(!player)throw Error('Oyuncu bulunamadı');return player;}
export function setupRound(state){
 const tiles=shuffle(newTiles());const indicator=indicatorFrom(tiles);const okey=jokerFace(indicator);
 const starter=(state.round-1)%4;
 for(const p of state.players){p.hand=[];p.openedKind=null;p.openValue=0;p.roundPenalty=0; p.mustOpenWith=null;}
 for(let i=0;i<21;i++)for(const p of state.players)p.hand.push(tiles.pop());
 state.players.find(p=>p.seat===starter).hand.push(tiles.pop());
 Object.assign(state,{indicator:publicTile(indicator),okey,stock:tiles,turn:starter,starter,drawn:true,discard:[],melds:[],phase:'playing',winner:null,lastMove:'Yeni el başladı.',lastResult:null});
}
export function settle(state,winnerSeat=null,lastDiscard=null){
 const winner=winnerSeat===null?null:ensureHand(state,winnerSeat);
 const winnerBonus=winner?(winner.openedKind==='pair'?-202:-101)*(lastDiscard&&isJoker(lastDiscard,state.okey)?2:1):0;
 const changes=state.players.map(p=>{
  let delta;
  if(winner && (p.seat===winnerSeat || (state.settings.teams && p.seat%2===winnerSeat%2)))delta=winnerBonus;
  else if(!p.openedKind)delta=202;
  else delta=p.hand.reduce((s,t)=>s+tilePoints(t,state.okey),0)*(p.openedKind==='pair'?2:1);
  if(!(winner&&(p.seat===winnerSeat || (state.settings.teams && p.seat%2===winnerSeat%2))))delta+=p.roundPenalty||0;
  p.total+=delta;
  return {seat:p.seat,name:p.name,delta,total:p.total};
 });
 state.phase=state.round>=state.settings.rounds?'finished':'roundEnd';state.winner=winnerSeat;state.lastResult={changes,winnerSeat};state.lastMove=winner?`${winner.name} eli bitirdi!`:'Destede taş kalmadı, el hesaplandı.';
}
export function stateFor(state,player){
 return {code:state.code,phase:state.phase,settings:state.settings,round:state.round,hostSeat:state.hostSeat,
   players:state.players.map(p=>({seat:p.seat,name:p.name,online:!!p.socketId,count:p.hand.length,total:p.total,openedKind:p.openedKind,openValue:p.openValue,roundPenalty:p.roundPenalty})),
   you:player?.seat??null,hand:player?player.hand.map(publicTile):[],turn:state.turn,drawn:state.drawn,starter:state.starter,
   stockCount:state.stock?.length??0,indicator:state.indicator,okey:state.okey,discards:state.discard.map(publicTile),
   melds:state.melds.map(m=>({...m})),lastMove:state.lastMove,winner:state.winner,lastResult:state.lastResult,
   minimumNormal:player?minimumOpen(state,player,'normal'):101,minimumPair:player?minimumOpen(state,player,'pair'):5};
}
