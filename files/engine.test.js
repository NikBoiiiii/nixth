const {test}=require('node:test'),assert=require('node:assert'),{Table,best,cmp}=require('./engine');
const C=s=>s.split(' ').map(x=>'23456789TJQKA'.indexOf(x[0])+'cdhs'.indexOf(x[1])*13);
test('ranking',()=>{assert(cmp(best(C('As Ks Qs Js Ts 2c 3d')),best(C('9c 9d 9h 9s Ac 2c 3d')))>0);
  assert(cmp(best(C('Ac 2d 3h 4s 5c 9d Kd')),best(C('2c 3c 4c 5c 7d 9d Kd')))>0); // wheel beats K-high
  assert(cmp(best(C('Ac Ad Ah Kc Kd 2c 3d')),best(C('2c 3c 4c 5c 9c Kd Qd')))>0);}); // boat beats flush
test('side pots + fold + blinds',()=>{
  // rig deck: pops from end. Seats 0,1,2; dealer->1, sb=2, bb=0.
  const t=new Table({max:3,stack:100,rng:()=>[]}); ['a','b','c'].forEach((n,i)=>t.sit(n,n,i)); t.seats[1].stack=50; t.seats[2].stack=20;
  const d=C('2c 7d 9h Jc Qd 3c 4d 5h 6s Ks 8c 8d Ac Ad').reverse(); // seat1 gets Ad Ac ... order set below
  t.rng=()=>d; t.start(); assert.equal(t.dealer,0); assert.equal(t.sbSeat,1); assert.equal(t.bbSeat,2);
  assert.equal(t.turn,0); assert.equal(t.act('b','call'),'Not your turn');
  assert.equal(t.act('a','allin'),null); assert.equal(t.act('b','call'),null); // c (bb, 20) already all-in
  assert.equal(t.phase,'showdown'); assert.equal(t.players().reduce((s,p)=>s+p.stack,0),170);}); // chips conserved
test('illegal actions',()=>{const t=new Table({max:2,rng:()=>[...Array(52).keys()]});t.sit('a','a',0);t.sit('b','b',1);t.start();
  const p=t.seats[t.turn]; assert.equal(t.act(p.id,'check'),'Cannot check'); assert.equal(t.act(p.id,'raise',25),'Illegal raise size');
  assert.equal(t.act(p.id,'raise',40),null);});
test('heads-up: fold ends hand, pot to winner',()=>{const t=new Table({max:2});t.sit('a','a',0);t.sit('b','b',1);t.start();
  const p=t.seats[t.turn];t.act(p.id,'fold');assert.equal(t.phase,'showdown');assert.equal(t.players().reduce((s,p)=>s+p.stack,0),2000);});
test('hidden cards never in other views',()=>{const t=new Table({max:2});t.sit('a','a',0);t.sit('b','b',1);t.start();
  assert.deepEqual(t.view('a').seats[1].cards,[-1,-1]);});
