import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Test actual room handlers with lightweight Socket.IO mocks.
function extractFunction(code,name){
 const start=code.indexOf('function '+name+'(');
 if(start<0)throw Error('Missing function '+name);
 const brace=code.indexOf('{',start);let depth=0;
 for(let i=brace;i<code.length;i++){
  if(code[i]==='{')depth++;
  if(code[i]==='}'&&--depth===0)return code.slice(start,i+1);
 }
 throw Error('Unclosed function '+name);
}
function fixture(phase='lobby',count=3){
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const rooms=new Map(),clients=new Map(),messages=[];
 const room={code:'ABC123',phase,hostSeat:0,players:Array.from({length:count},(_,seat)=>({seat,name:'Person '+seat,token:'token'+seat,socketId:'sock'+seat,hand:[]})),settings:{practice:false}};
 rooms.set(room.code,room);
 for(const p of room.players){
  const sid=p.socketId;
  clients.set(sid,{data:{code:room.code,token:p.token},leave(code){messages.push({sid,type:'leave',code})},emit(event,data){messages.push({sid,type:event,data})}});
 }
 const io={sockets:{sockets:clients},to(id){return {emit(event,data){messages.push({sid:id,type:event,data})}}}};
 const ctx={rooms,io,clearTimeout,stateFor:(r,p)=>({host:r.hostSeat,you:p.seat,players:r.players.map(q=>q.seat)})};
 runInNewContext(['notify','closeRoom','leaveRoom'].map(name=>extractFunction(source,name)).join('\n'),ctx);
 return {room,rooms,clients,messages,leave:(seat)=>{const p=room.players.find(x=>x.seat===seat);assert.ok(p);return ctx.leaveRoom(clients.get(p.socketId),room,p)}};
}
test('lobby: guest departure closes seat gap',()=>{
 const f=fixture();f.leave(1);
 assert.equal(f.room.players.length,2);
 assert.deepEqual([...f.room.players.map(p=>p.seat)],[0,1]);
 assert.equal(f.room.hostSeat,0);
 assert.equal(f.rooms.size,1);
 assert.ok(f.messages.some(m=>m.sid==='sock2'&&m.type==='state'&&m.data.you===1));
});
test('lobby: host departure transfers ownership and last departure removes room',()=>{
 const f=fixture();f.leave(0);
 assert.equal(f.room.players.length,2);
 assert.equal(f.room.players[0].name,'Person 1');
 assert.equal(f.room.hostSeat,0);
 assert.equal(f.rooms.size,1);
 f.leave(1);f.leave(0);assert.equal(f.rooms.size,0);
});
test('active match: departure closes room and informs remaining players',()=>{
 const f=fixture('playing',4);f.leave(1);
 assert.equal(f.rooms.size,0);
 for(const id of ['sock0','sock2','sock3'])assert.ok(f.messages.some(m=>m.sid===id&&m.type==='room:closed'));
 for(const client of f.clients.values())assert.equal(Object.keys(client.data).length,0);
});
