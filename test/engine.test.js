import test from 'node:test';
import assert from 'node:assert/strict';
import {newTiles,shuffle,jokerFace,face,isJoker,validateMeld,minimumOpen,canOpen,setupRound,settle,stateFor} from '../src/engine.js';
const c=(color,value,id)=>({id:id??`${color}${value}`,color,value});
const okey={color:'red',value:8};
const players=Array.from({length:4},(_,seat)=>({name:`Oyuncu ${seat}`,seat,hand:[],total:0,openedKind:null,openValue:0,roundPenalty:0,socketId:`s${seat}`}));
test('106 physical tiles with exactly 2 fake jokers',()=>{const a=newTiles();assert.equal(a.length,106);assert.equal(a.filter(t=>t.fake).length,2);assert.equal(new Set(a.map(t=>t.id)).size,106);assert.equal(a.filter(t=>t.color==='red'&&t.value===8).length,2)});
test('indicator 13 wraps to 1, actual okey is wildcard, fake acts as printed face',()=>{assert.deepEqual(jokerFace(c('yellow',13)),{color:'yellow',value:1});assert.equal(isJoker(c('red',8),okey),true);assert.deepEqual(face({id:'fake',fake:true},okey),okey)});
test('valid and invalid runs and sets',()=>{
 assert.equal(validateMeld([c('red',2),c('red',3),c('red',4)],okey).score,9);
 assert.equal(validateMeld([c('red',12),c('red',13),c('red',1)],okey),null);
 assert.equal(validateMeld([c('red',4),c('yellow',4),c('blue',4)],okey).score,12);
 assert.equal(validateMeld([c('red',4),c('red',4,'second'),c('blue',4)],okey),null);
 assert.equal(validateMeld([c('red',4),c('red',6),c('red',9)],okey),null);
});
test('joker assigned as missing tile for run and set',()=>{
 const m=validateMeld([c('blue',6),c('red',8),c('blue',8)],okey);assert(m);assert.equal(m.score,21);
 const s=validateMeld([c('red',4),c('yellow',4),c('red',8)],okey);assert(s);assert.equal(s.score,12);
});
test('pairs include real identical stones and a joker, not different colors',()=>{
 assert(validateMeld([c('red',3),c('red',3,'x')],okey,'pair'));
 assert(validateMeld([c('yellow',10),c('red',8)],okey,'pair'));
 assert.equal(validateMeld([c('yellow',10),c('blue',10)],okey,'pair'),null);
});
test('folding opening threshold including team exemptions',()=>{
 const r={settings:{folding:true,teams:false},players:structuredClone(players)};
 assert.equal(minimumOpen(r,r.players[0]),101);r.players[0].openedKind='normal';r.players[0].openValue=111;
 assert.equal(minimumOpen(r,r.players[2]),112);
 r.settings.teams=true;assert.equal(minimumOpen(r,r.players[2]),101);assert.equal(minimumOpen(r,r.players[1]),112);
 r.players[1].openedKind='pair';r.players[1].openValue=6;assert.equal(minimumOpen(r,r.players[3],'pair'),5);
 assert.equal(minimumOpen(r,r.players[2],'pair'),7);
});
test('101 opening with four normal valid melds',()=>{
 const r={okey,settings:{folding:false,teams:false},players:structuredClone(players)};const p=r.players[0];
 p.hand=[...newTiles()].filter(t=> !t.fake&&!isJoker(t,okey));
 const groups=[['red','yellow','blue'].map(x=>p.hand.find(t=>t.color===x&&t.value===13)),['red','yellow','blue'].map(x=>p.hand.find(t=>t.color===x&&t.value===12)),['red','yellow','blue'].map(x=>p.hand.find(t=>t.color===x&&t.value===11))];
 const result=canOpen(r,p,groups.map(g=>g.map(x=>x.id)),'normal');assert(result.ok);assert.equal(result.amount,108);
});
test('round deals 22/21/21/21, keeps 20 in stock + 1 indicator',()=>{
 const r={round:1,settings:{folding:true,teams:true,rounds:3},players:structuredClone(players),phase:'lobby'};setupRound(r);
 assert.equal(r.players[0].hand.length,22);assert.deepEqual(r.players.slice(1).map(p=>p.hand.length),[21,21,21]);assert.equal(r.stock.length,20);
 const all=[...r.stock,r.indicator,...r.players.flatMap(p=>p.hand)];assert.equal(new Set(all.map(t=>t.id)).size,106);
 const a=stateFor(r,r.players[0]);assert.equal(a.hand.length,22);assert.equal(a.players[1].count,21);assert.equal(JSON.stringify(a).includes(r.players[1].hand[0].id+'-'+r.players[1].hand[0].id),false);
});
test('partner wins as a pair when teammate finishes',()=>{
 const r={round:1,settings:{folding:true,teams:true,rounds:5},players:structuredClone(players),okey,phase:'playing',stock:[]};
 r.players[0].openedKind='normal';r.players[1].openedKind='normal';r.players[1].hand=[c('yellow',1)];r.players[2].hand=[c('blue',13)];settle(r,0,c('blue',10));
 assert.equal(r.players[0].total,-101);assert.equal(r.players[2].total,-101);assert.equal(r.players[1].total,1);assert.equal(r.players[3].total,202);assert.equal(r.phase,'roundEnd');
});
