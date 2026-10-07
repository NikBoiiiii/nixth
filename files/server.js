const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws'),{Table}=require('./engine');
const rooms=new Map(), TURN=+process.env.TURN_SECONDS||20, BETTING=['preflop','flop','turn','river'];
const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end(fs.readFileSync(path.join(__dirname,'index.html')));});
const wss=new WebSocketServer({server:srv});
// ICE servers (STUN + TURN relay) so video connects through strict networks. Configure via env:
// ICE_SERVERS='[{"urls":"turn:...","username":"..","credential":".."}]'  OR  METERED_DOMAIN + METERED_API_KEY (free at metered.ca)
async function iceServers(){ const base=[{urls:'stun:stun.l.google.com:19302'}];
  try{ if(process.env.ICE_SERVERS) return [...base,...JSON.parse(process.env.ICE_SERVERS)];
    if(process.env.METERED_DOMAIN&&process.env.METERED_API_KEY){ const r=await fetch(`https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`); return [...base,...await r.json()]; }
  }catch(e){ console.error('ICE config error',e.message); } return base; }
const send=(ws,o)=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
const push=R=>R.clients.forEach((ws,tok)=>send(ws,{t:'state',s:{...R.table.view(tok),host:R.host===tok,paused:R.paused,now:Date.now(),code:R.code}}));
function sync(R){ clearTimeout(R.timer); const T=R.table; if(R.paused) return push(R); // paused: no timers run
  if(BETTING.includes(T.phase)&&T.turn>=0){ T.deadline=Date.now()+TURN*1000; const p=T.seats[T.turn]; // server owns the clock
    R.timer=setTimeout(()=>{T.act(p.id,T.legal(p).canCheck?'check':'fold');sync(R);},TURN*1000); }
  else if(T.phase==='showdown') R.timer=setTimeout(()=>{T.start();sync(R);},6000);
  push(R); }
wss.on('connection',ws=>{
  ws.on('message',async raw=>{ let m; try{m=JSON.parse(raw);}catch{return;}
    if(m.t==='join'){ const code=String(m.room||'').toUpperCase().slice(0,8); if(!code||!m.tok) return;
      let R=rooms.get(code); if(!R){R={code,host:m.tok,paused:false,banned:new Set(),clients:new Map(),table:new Table({sb:10,bb:20,stack:1000,max:9})};rooms.set(code,R);}
      if(R.banned.has(m.tok)) return send(ws,{t:'kicked'});
      ws.ctx={R,tok:m.tok,name:String(m.name||'Player').slice(0,16)}; send(ws,{t:'ice',servers:await iceServers()}); R.clients.set(m.tok,ws);
      const p=R.table.players().find(p=>p.id===m.tok); if(p) p.connected=true; return push(R); }
    const c=ws.ctx; if(!c) return; const {R,tok}=c, T=R.table;
    if(m.t==='sit'){ if(!T.sit(tok,c.name,m.seat)) send(ws,{t:'err',m:'Seat unavailable'}); push(R); }
    else if(m.t==='pause'){ if(tok!==R.host) return; R.paused=!R.paused; sync(R); }
    else if(m.t==='kick'){ if(tok!==R.host) return; const p=T.seats[m.seat]; if(!p||p.id===tok) return; R.banned.add(p.id);
      const w=R.clients.get(p.id); if(w){ send(w,{t:'kicked'}); R.clients.delete(p.id); w.close(); } T.leave(p.id); sync(R); }
    else if(m.t==='start'){ if(R.paused) return send(ws,{t:'err',m:'Game is paused'}); if(tok!==R.host) return send(ws,{t:'err',m:'Only the host can start'}); if(!BETTING.includes(T.phase)){ if(!T.start()) send(ws,{t:'err',m:'Need 2+ players with chips'}); sync(R);} }
    else if(m.t==='act'){ if(R.paused) return send(ws,{t:'err',m:'Game is paused'}); const e=T.act(tok,m.type,m.amount); if(e) send(ws,{t:'err',m:e}); else sync(R); }
    else if(m.t==='signal'){ const me=T.players().find(p=>p.id===tok), to=T.seats[m.to]; if(me&&to) send(R.clients.get(to.id),{t:'signal',from:me.seat,data:m.data}); } });
  ws.on('close',()=>{ const c=ws.ctx; if(!c) return; if(c.R.clients.get(c.tok)===ws){ c.R.clients.delete(c.tok);
    const p=c.R.table.players().find(p=>p.id===c.tok); if(p) p.connected=false; push(c.R); } }); });
srv.listen(process.env.PORT||3000,()=>console.log('Poker Night on http://localhost:'+(process.env.PORT||3000)));
