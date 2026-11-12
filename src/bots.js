import {isJoker,validateMeld,canOpen,minimumOpen} from './engine.js';

function groupsFor(hand,okey){
 const groups=[];
 for(const n of [3,4]){
  for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++)for(let k=j+1;k<hand.length;k++){
   const variants=n===3?[[hand[i],hand[j],hand[k]]]:hand.slice(k+1).map(t=>[hand[i],hand[j],hand[k],t]);
   for(const arr of variants){
    const wild=arr.filter(t=>isJoker(t,okey));if(wild.length>1)continue;
    const plain=arr.filter(t=>!isJoker(t,okey));
    if(!wild.length){
     const set=plain.every(t=>t.value===plain[0].value)&&new Set(plain.map(t=>t.color)).size===n;
     const sorted=[...plain].sort((a,b)=>a.value-b.value);
     const run=sorted.every(t=>t.color===sorted[0].color)&&sorted.every((t,i)=>i===0||t.value===sorted[i-1].value+1);
     if(!set&&!run)continue;
    }
    const m=validateMeld(arr,okey,'normal');
    if(m)groups.push({ids:arr.map(t=>t.id),score:m.score});
   }
  }
 }
 return groups.sort((a,b)=>b.score-a.score).slice(0,65);
}
export function botOpening(room,player){
 if(player.openedKind)return null;
 const groups=groupsFor(player.hand,room.okey),need=minimumOpen(room,player,'normal');
 let searched=0,result=null;
 function scan(start,selected,used,score){
  if(++searched>8000||result)return;
  if(score>=need){
   const c=canOpen(room,player,selected.map(x=>x.ids),'normal');
   if(c.ok){result={...c,kind:'normal'};return;}
  }
  if(selected.length>=6)return;
  for(let i=start;i<groups.length;i++){
   const g=groups[i];
   if(g.ids.some(id=>used.has(id))||used.size+g.ids.length>=player.hand.length)continue;
   g.ids.forEach(id=>used.add(id));selected.push(g);
   scan(i+1,selected,used,score+g.score);
   selected.pop();g.ids.forEach(id=>used.delete(id));
   if(result)return;
  }
 }
 scan(0,[],new Set(),0);
 if(result)return result;
 const bucket=new Map();for(const t of player.hand){
  if(isJoker(t,room.okey))continue;
  const key=t.fake?'fake':t.color+':'+t.value;
  if(!bucket.has(key))bucket.set(key,[]);
  bucket.get(key).push(t.id);
 }
 const pairs=[];for(const ids of bucket.values())if(ids.length>=2)pairs.push(ids.slice(0,2));
 const pair=canOpen(room,player,pairs,'pair');
 return pair.ok?{...pair,kind:'pair'}:null;
}
export function botDiscard(hand,okey){
 const weight=t=>{
  if(isJoker(t,okey))return 999;
  const others=hand.filter(x=>x.id!==t.id&&!x.fake);
  return others.filter(x=>x.value===t.value&&x.color!==t.color).length*3+
   others.filter(x=>x.color===t.color&&Math.abs(x.value-t.value)<=2).length*4+
   others.filter(x=>x.color===t.color&&x.value===t.value).length*6-t.value*.04;
 };
 return [...hand].sort((a,b)=>weight(a)-weight(b))[0];
}
