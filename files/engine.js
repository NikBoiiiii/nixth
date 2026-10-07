// Server-authoritative No-Limit Hold'em engine. No I/O; fully testable.
// Cards are ints 0..51: rank = c%13+2 (2..14), suit = floor(c/13).
const crypto = require('crypto');
const NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
const STREETS = ['preflop','flop','turn','river'];
const shuffle = () => { const d=[...Array(52).keys()]; for(let i=51;i>0;i--){const j=crypto.randomInt(i+1);[d[i],d[j]]=[d[j],d[i]];} return d; };

function eval5(c){
  const r=c.map(x=>x%13+2).sort((a,b)=>b-a), fl=c.every(x=>(x/13|0)===(c[0]/13|0));
  let st=0; if(new Set(r).size===5){ if(r[0]-r[4]===4) st=r[0]; else if(r[0]===14&&r[1]===5) st=5; } // wheel
  const cnt={}; r.forEach(x=>cnt[x]=(cnt[x]||0)+1);
  const g=Object.entries(cnt).map(([k,v])=>[v,+k]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]), k=g.map(x=>x[1]);
  if(st&&fl) return [8,st]; if(g[0][0]===4) return [7,...k];
  if(g[0][0]===3&&g[1][0]===2) return [6,...k]; if(fl) return [5,...r]; if(st) return [4,st];
  if(g[0][0]===3) return [3,...k]; if(g[0][0]===2&&g[1][0]===2) return [2,...k];
  if(g[0][0]===2) return [1,...k]; return [0,...r];
}
const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;};
function best(cards){ let b=null; // best 5 of 7: skip every pair of cards
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
    const s=eval5(cards.filter((_,x)=>x!==i&&x!==j)); if(!b||cmp(s,b)>0) b=s; } return b; }

class Table {
  constructor(o={}){ this.o={sb:10,bb:20,stack:1000,max:9,...o}; this.seats=Array(this.o.max).fill(null);
    this.dealer=-1; this.turn=-1; this.phase='waiting'; this.board=[]; this.results=null; this.rng=o.rng||shuffle; }
  players(){ return this.seats.filter(Boolean); }
  live(){ return this.players().filter(p=>p.inHand&&!p.folded); }
  next(from,f){ for(let i=1;i<=this.o.max;i++){const p=this.seats[(from+i+this.o.max)%this.o.max]; if(p&&f(p)) return p.seat;} return -1; }
  sit(id,name,seat){ if(seat<0||seat>=this.o.max||this.seats[seat]||this.players().some(p=>p.id===id)) return false;
    this.seats[seat]={id,name,seat,stack:this.o.stack,bet:0,total:0,folded:false,allin:false,acted:false,cards:[],inHand:false,shown:false,connected:true}; return true; }
  leave(id){ const p=this.players().find(p=>p.id===id); if(!p) return; p.connected=false;
    if(!p.inHand){ this.seats[p.seat]=null; return; }
    p.gone=true; // stays seated until next hand so its bets remain in the pot
    if(STREETS.includes(this.phase)&&!p.folded){
      if(this.turn===p.seat) this.act(id,'fold'); else { p.folded=true; if(this.live().length===1) this.award(); } } }
  post(p,a){ a=Math.min(a,p.stack); p.stack-=a; p.bet+=a; p.total+=a; if(!p.stack) p.allin=true; }
  start(){
    this.players().filter(p=>p.gone).forEach(p=>this.seats[p.seat]=null);
    const el=this.players().filter(p=>p.stack>0); if(el.length<2){this.phase='waiting';return false;}
    this.players().forEach(p=>Object.assign(p,{bet:0,total:0,folded:false,allin:false,acted:false,cards:[],shown:false,inHand:p.stack>0}));
    this.deck=this.rng(); this.board=[]; this.results=null;
    this.dealer=this.next(this.dealer,p=>p.inHand);
    const sb=el.length===2?this.dealer:this.next(this.dealer,p=>p.inHand), bb=this.next(sb,p=>p.inHand); // heads-up: dealer posts SB
    this.sbSeat=sb; this.bbSeat=bb; this.post(this.seats[sb],this.o.sb); this.post(this.seats[bb],this.o.bb);
    el.forEach(p=>p.cards=[this.deck.pop(),this.deck.pop()]);
    this.phase='preflop'; this.cur=this.o.bb; this.minRaise=this.o.bb; this.turn=bb; this.after(); return true; }
  legal(p){ const toCall=Math.min(this.cur-p.bet,p.stack), max=p.bet+p.stack;
    return {toCall,canCheck:this.cur<=p.bet,canRaise:max>this.cur,min:Math.min(this.cur+this.minRaise,max),max}; }
  act(id,type,amt){
    const p=this.seats[this.turn]; if(!p||p.id!==id||!STREETS.includes(this.phase)) return 'Not your turn';
    const L=this.legal(p);
    if(type==='fold') p.folded=true;
    else if(type==='check'){ if(!L.canCheck) return 'Cannot check'; }
    else if(type==='call') this.post(p,L.toCall);
    else if(type==='raise'||type==='bet'||type==='allin'){
      amt=type==='allin'?L.max:Math.floor(+amt);
      if(!L.canRaise){ if(type!=='allin') return 'Cannot raise'; this.post(p,L.toCall); }
      else { if(!(amt<=L.max&&(amt>=L.min||amt===L.max))||amt<=this.cur) return 'Illegal raise size';
        const diff=amt-this.cur; this.post(p,amt-p.bet); this.cur=amt;
        if(diff>=this.minRaise){ this.minRaise=diff; this.players().forEach(q=>{if(q!==p)q.acted=false;}); } } // short all-in doesn't reopen
    } else return 'Unknown action';
    p.acted=true; this.after(); return null; }
  after(){
    const lv=this.live(); if(lv.length===1) return this.award();
    const ac=lv.filter(p=>!p.allin); let need=ac.filter(p=>!p.acted||p.bet<this.cur);
    if(ac.length<=1&&(!ac[0]||ac[0].bet>=this.cur)) need=[]; // nobody left to bet against
    if(need.length){ this.turn=this.next(this.turn,p=>need.includes(p)); return; }
    this.street(); }
  street(){
    this.players().forEach(p=>{p.bet=0;p.acted=false;}); this.cur=0; this.minRaise=this.o.bb;
    const i=STREETS.indexOf(this.phase); if(i===3) return this.award();
    this.phase=STREETS[i+1]; this.deck.pop(); // burn
    const n=this.phase==='flop'?3:1; for(let k=0;k<n;k++) this.board.push(this.deck.pop());
    this.turn=this.dealer; this.after(); }
  // Build main/side pots from per-player total contributions, award each to best eligible hand.
  award(){
    const lv=this.live(), all=this.players().filter(p=>p.total>0), res=[]; this.turn=-1;
    if(lv.length>1){ while(this.board.length<5) this.board.push(this.deck.pop()); lv.forEach(p=>{p.score=best([...p.cards,...this.board]);p.shown=true;}); }
    let prev=0;
    for(const lvl of [...new Set(all.map(p=>p.total))].sort((a,b)=>a-b)){
      const pot=all.reduce((s,p)=>s+Math.max(0,Math.min(p.total,lvl)-prev),0); prev=lvl;
      let el=lv.filter(p=>p.total>=lvl); if(!el.length) el=all.filter(p=>p.total>=lvl); // uncalled excess is refunded
      const top=el.reduce((b,p)=>!b||(p.score&&cmp(p.score,b)>0)?p.score||b:b,null);
      const w=lv.length>1?el.filter(p=>cmp(p.score,top)===0):el, share=Math.floor(pot/w.length);
      w.forEach((p,i)=>{const a=share+(i===0?pot-share*w.length:0); p.stack+=a; res.push({seat:p.seat,amount:a,hand:p.score?NAMES[p.score[0]]:'Uncontested'});});
    }
    this.results=res; this.phase='showdown'; }
  // What a given player is allowed to know. Hidden cards of others never leave the server.
  view(id){
    const me=this.players().find(p=>p.id===id), mine=me&&this.turn===me.seat&&STREETS.includes(this.phase);
    return {phase:this.phase,board:this.board,dealer:this.dealer,sb:this.sbSeat,bb:this.bbSeat,turn:this.turn,cur:this.cur,
      pot:this.players().reduce((s,p)=>s+p.total,0),deadline:this.deadline,results:this.results,me:me?me.seat:-1,o:this.o,
      legal:mine?this.legal(me):null,
      seats:this.seats.map(p=>p&&{seat:p.seat,name:p.name,stack:p.stack,bet:p.bet,folded:p.folded,allin:p.allin,inHand:p.inHand,connected:p.connected,
        cards:p===me||p.shown?p.cards:(p.inHand&&!p.folded?[-1,-1]:[])})}; }
}
module.exports={Table,eval5,best,cmp,NAMES};
