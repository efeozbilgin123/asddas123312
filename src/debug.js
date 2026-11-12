import {timingSafeEqual} from 'node:crypto';
export function safeSecretMatch(value,secret){
 if(typeof value!=='string'||!secret||value.length>1024)return false;
 const a=Buffer.from(value),b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function debugOnly(room,player,authorized){
 if(!room?.settings?.practice||player?.seat!==room.hostSeat||!authorized)throw Error('Bu işlem yalnızca yetkili test odasında yapılabilir.');
}
export function debugSteal(room,player,source,tileId){
 if(room.phase!=='playing')throw Error('Oyun başlamalı.');
 if(player.hand.length>=32)throw Error('Test ıstakası en fazla 32 taş alabilir.');
 const pool=source==='stock'?room.stock:room.players.find(p=>p.bot&&p.seat===Number(source))?.hand;
 if(!pool)throw Error('Yalnızca stoktan veya botlardan taş alınabilir.');
 const index=pool.findIndex(t=>t.id===String(tileId));if(index<0)throw Error('Bu taş artık mevcut değil.');
 const [tile]=pool.splice(index,1);player.hand.push(tile);
 room.lastMove='Test aracıyla taş taşındı.';
 return tile;
}
