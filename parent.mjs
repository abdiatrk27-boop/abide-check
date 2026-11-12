/* หน้าผู้ปกครอง (ดูอย่างเดียว) + ข้อความถึงครูสามัญ + กระดานแจ้งผู้ปกครอง
   POST /api/parent { pt, op }
     op 'data'            ข้อมูลการเรียนของลูก + จำนวนข้อความใหม่จากครูแต่ละท่าน
     op 'unread'          จำนวนข้อความใหม่ + เวลาประกาศล่าสุดบนกระดาน (เบา ใช้โพลล์)
     op 'thread' { to }   อ่านข้อความกับครู to (uid) แล้วล้างตัวนับฝั่งผู้ปกครอง
     op 'send' { to, text }  ส่งข้อความถึงครู (แจ้งเตือนเครื่องครูทันที)
     op 'board'           อ่านประกาศบนกระดาน */
import { getStore } from '@netlify/blobs';
import { json, initPush, send, allSubs, clip, after } from '../lib/common.mjs';
import { checkPtWhy, PT_MSG, studentData } from '../lib/parent-data.mjs';

const key = (tuid, no) => `th/${no}/${tuid}`;

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const who = checkPtWhy(b.pt);
  if (!who.no) return json({ error: PT_MSG[who.why] || PT_MSG.nolink, expired: true, why: who.why }, 401);
  const ms = getStore('pmsg');
  const boardOf = async () => (await getStore('board').get('posts', { type: 'json' }).catch(() => null)) || [];
  const unreadOf = async () => {
    const { blobs } = await ms.list({ prefix: `th/${who.no}/` }), u = {};
    const ths = await Promise.all(blobs.slice(0, 40).map(({ key: k }) => ms.get(k, { type: 'json' }).catch(() => null)));
    ths.forEach((th) => { if (th && th.pn) u[th.tuid] = th.pn; });
    return u;
  };
  if (b.op === 'unread') {
    const [unread, posts] = await Promise.all([unreadOf(), boardOf()]);
    return json({ unread, bl: posts.reduce((m, p) => Math.max(m, p.at || 0), 0) });
  }
  if (b.op === 'board') return json({ posts: await boardOf() });

  const to = String(b.to || '');
  /* ข้อความ: ถ้ามีบทสนทนาอยู่แล้ว ไม่ต้องโหลดข้อมูลนักเรียนทั้งระบบอีก (เร็วขึ้นมาก) */
  if (b.op === 'thread' || b.op === 'send') {
    const k = key(to, who.no);
    let th = await ms.get(k, { type: 'json' }).catch(() => null);
    if (b.op === 'thread') {
      if (!th) return json({ msgs: [] });
      if (th.pn) { th.pn = 0; await ms.setJSON(k, th); }
      return json({ msgs: th.msgs });
    }
    const x = clip(String(b.text || '').trim(), 500);
    if (!x) return json({ error: 'ยังไม่ได้พิมพ์ข้อความ' }, 400);
    if (!th) {
      let d;
      try { d = await studentData(who.no); } catch (e) { return json({ error: e.message || 'อ่านข้อมูลไม่ได้' }, 500); }
      if (!d) return json({ error: 'ยังไม่พบนักเรียนรหัส ' + who.no + ' ในแอปเช็คงาน (รหัสนักเรียนต้องตรงกับเลขประจำตัว)' }, 404);
      if (!d.teachers.find((t) => t.id === to)) return json({ error: 'ครูท่านนี้ไม่ได้สอนนักเรียนคนนี้' }, 403);
      th = { no: who.no, sname: d.name, tuid: to, msgs: [], tn: 0, pn: 0 };
    }
    const now = Date.now();
    if (th.msgs.filter((m) => m.f === 'p' && now - m.at < 3600e3).length >= 30) return json({ error: 'ส่งถี่เกินไป ลองใหม่ภายหลัง' }, 429);
    th.msgs.push({ f: 'p', x, at: now }); th.msgs = th.msgs.slice(-200); th.tn = (th.tn || 0) + 1; th.pn = 0; th.at = now;
    await ms.setJSON(k, th);
    /* แจ้งเตือนครูเบื้องหลัง ไม่ให้ผู้ปกครองต้องรอ */
    const sname = th.sname;
    await after(ctx, (async () => {
      if (!initPush()) return;
      const store = getStore('subs'), subs = (await allSubs(store)).filter((s) => s.rec.uid === to);
      await Promise.all(subs.map((s) => send(store, s.key, s.rec, { title: '💌 คุณครูมีข้อความจากผู้ปกครองน้าา', body: 'ผู้ปกครองของ ' + clip(sname, 60) + ': ' + clip(x, 120), tag: 'pmsg', data: { pmsg: 1 } })));
    })());
    return json({ msgs: th.msgs });
  }

  let d;
  try { d = await studentData(who.no); } catch (e) { return json({ error: e.message || 'อ่านข้อมูลไม่ได้' }, 500); }
  if (!d) return json({ error: 'ยังไม่พบนักเรียนรหัส ' + who.no + ' ในแอปเช็คงาน (รหัสนักเรียนต้องตรงกับเลขประจำตัว)' }, 404);
  if (b.op === 'data') { const [unread, posts] = await Promise.all([unreadOf(), boardOf()]); return json(Object.assign(d, { unread, bl: posts.reduce((m, p) => Math.max(m, p.at || 0), 0) })); }
  return json({ error: 'unknown op' }, 400);
};
export const config = { path: '/api/parent' };
