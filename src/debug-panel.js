export function installDebugUI(socket,getState,notify){
 let authorized=false,opened=false,snapshot=null,source='stock',overlay=null;
 const create=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
 function rpc(name,data,done){socket.timeout(8000).emit(name,data,(err,res)=>{if(err||!res?.ok)return notify(res?.error||'Debug sunucusu yanıt vermiyor.');done?.(res);});}
 function close(){opened=false;overlay?.remove();overlay=null;}
 function reset(){authorized=false;snapshot=null;close();}
 function update(){rpc('debug:inspect',{},res=>{snapshot=res;render();});}
 function render(){
  const game=getState();if(!opened||!game?.settings.practice||game.you!==game.hostSeat)return close();
  overlay?.remove();overlay=create('div');overlay.id='debug-overlay';
  const shade=create('div','debug-shade');shade.onclick=close;overlay.append(shade);
  const card=create('div','debug-card'),header=create('header');
  header.append(create('span','','⌘ 101 CLUB · ÖZEL TEST PANELİ'));
  const exit=create('button','','×');exit.onclick=close;header.append(exit);card.append(header);
  if(!authorized){
   card.append(create('p','','Bu panel yalnızca test odasının sahibine açık. Sunucu erişim anahtarını gir.'));
   const form=create('form'),secret=create('input');secret.type='password';secret.autocomplete='off';secret.placeholder='Özel erişim anahtarı';secret.required=true;
   const submit=create('button','btn btn-gold','PANELİ AÇ');form.append(secret,submit);
   form.onsubmit=e=>{e.preventDefault();rpc('debug:auth',{key:secret.value},()=>{authorized=true;update();});};card.append(form);
  }else{
   card.append(create('p','debug-good','✓ Yalnızca botlu test odasında etkin.'));
   const row=create('div','debug-row'),sources=create('select'),tiles=create('select');
   const players=snapshot?.players||[];
   const pools=[{id:'stock',label:'Deste',hand:snapshot?.stock||[]},...players.map(p=>({id:String(p.seat),label:p.name,hand:p.hand}))];
   if(!pools.some(p=>p.id===source))source='stock';
   for(const p of pools){const opt=create('option','',p.label+' ('+p.hand.length+')');opt.value=p.id;opt.selected=p.id===source;sources.append(opt);}
   const active=pools.find(p=>p.id===source);
   const labels={red:'Kırmızı',yellow:'Sarı',blue:'Mavi',black:'Siyah'};
   for(const t of active.hand){const opt=create('option','',(t.fake?'Sahte okey':labels[t.color]+' '+t.value)+' · ID '+t.id);opt.value=t.id;tiles.append(opt);}
   sources.onchange=()=>{source=sources.value;render();};
   const sourceLabel=create('label','','TAŞ KAYNAĞI'),tileLabel=create('label','','ALINACAK TAŞ');
   sourceLabel.append(sources);tileLabel.append(tiles);row.append(sourceLabel,tileLabel);card.append(row);
   const actions=create('div','debug-actions');
   const steal=create('button','btn btn-gold','↗ TAŞI ELİME AL');steal.disabled=!active.hand.length;
   steal.onclick=()=>rpc('debug:steal',{source,tileId:tiles.value},update);
   const turn=create('button','btn btn-neutral','↻ SIRAYI BANA VER');turn.onclick=()=>rpc('debug:turn',{},update);
   const refresh=create('button','btn btn-dark','⟳ YENİLE');refresh.onclick=update;
   actions.append(steal,turn,refresh);card.append(actions);
   card.append(create('small','','Taşlar kopyalanmaz: seçilen taş desteden veya bottan alınır. Normal maçlarda debug kapalıdır.'));
  }
  overlay.append(card);document.body.append(overlay);
 }
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&opened){close();return;}
  const s=getState();
  if(e.altKey&&e.shiftKey&&e.code==='KeyD'&&s?.settings.practice&&s.you===s.hostSeat){
   e.preventDefault();opened=!opened;if(opened){render();if(authorized)update();}else close();
  }
 });
 return {reset,close};
}
