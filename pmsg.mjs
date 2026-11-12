/* กล่องข้อความผู้ปกครองฝั่งครู (ต้องล็อกอินแอปเช็คงาน)
   POST /api/pmsg { idToken, op }
     op 'list'                 รายการบทสนทนาของครูคนนี้ (ผู้ดูแลเห็นทั้งหมด)
     op 'read' { no, tuid? }   อ่านบทสนทนา ล้างตัวนับฝั่งครู
     op 'reply' { no, text }   ตอบผู้ปกครอง → แจ้งเตือนผู้ปกครองในแอประบบอับดียะฮ์
     op 'board'                อ่านกระดานแจ้งผู้ปกครอง
     op 'bpost' { title, text, color, emoji, pin }  โพสต์ประกาศ
     op 'bdel' { id }          ลบประกาศ (เจ้าของโพสต์/ผู้ดูแล)
     op 'bpin' { id, pin }     ปักหมุด/เลิกปักหมุด */
import { getStore } from '@netlify/blobs';
import { json, verify, clip, after } from '../lib/common.mjs';
import { pingSig } from '../lib/parent-data.mjs';

const APP = process.env.ABDIYAH_APP_URL || 'https://abdiyah-app.netlify.app';

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const me = await verify(b.idToken);
  if (!me || !['admin', 'teacher'].includes(me.role)) return json({ error: 'unauthorized' }, 401);
  const ms = getStore('pmsg'), admin = me.role === 'admin';
  /* ---- กระดานแจ้งผู้ปกครอง ---- */
  if (['board', 'bpost', 'bdel', 'bpin'].includes(b.op)) {
    const bs = getStore('board');
    const posts = (await bs.get('posts', { type: 'json' }).catch(() => null)) || [];
    const sorted = (a) => a.slice().sort((p, q) => (q.pin ? 1 : 0) - (p.pin ? 1 : 0) || q.at - p.at);
    if (b.op === 'board') return json({ posts: sorted(posts), admin });
    if (b.op === 'bpost') {
      const title = clip(String(b.title || '').trim(), 60), x = clip(String(b.text || '').trim(), 1000);
      if (!title && !x) return json({ error: 'ยังไม่ได้พิมพ์ประกาศ' }, 400);
      const COLORS = ['pink', 'peach', 'butter', 'mint', 'sky', 'lav'];
      const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, x, at: Date.now(), by: me.uid, byName: clip(me.name || 'ครู', 60),
        color: COLORS.includes(b.color) ? b.color : 'pink', emoji: clip(b.emoji || '📌', 8), pin: !!b.pin };
      const next = sorted([p, ...posts]).slice(0, 80);
      await bs.setJSON('posts', next);
      return json({ posts: next, admin });
    }
    const i = posts.findIndex((p) => p.id === String(b.id || ''));
    if (i < 0) return json({ error: 'ไม่พบประกาศนี้' }, 404);
    if (!admin && posts[i].by !== me.uid) return json({ error: 'แก้ไขได้เฉพาะประกาศของตัวเอง' }, 403);
    if (b.op === 'bdel') posts.splice(i, 1); else posts[i].pin = !!b.pin;
    await bs.setJSON('posts', posts);
    return json({ posts: sorted(posts), admin });
  }
  if (b.op === 'list') {
    const { blobs } = await ms.list({ prefix: 'th/' }), out = [];
    for (const { key } of blobs.filter((x) => admin || x.key.endsWith('/' + me.uid)).slice(-400)) {
      const th = await ms.get(key, { type: 'json' }).catch(() => null); if (!th || !th.msgs || !th.msgs.length) continue;
      const last = th.msgs[th.msgs.length - 1];
      out.push({ no: th.no, sname: th.sname, tuid: th.tuid, tn: th.tuid === me.uid ? th.tn || 0 : 0, last: clip(last.x, 80), lf: last.f, at: last.at });
    }
    out.sort((a, c) => c.at - a.at);
    return json({ list: out, unread: out.reduce((s, x) => s + x.tn, 0) });
  }
  const no = String(b.no || ''); if (!/^\d{1,5}$/.test(no)) return json({ error: 'bad no' }, 400);
  const tuid = admin && b.tuid ? String(b.tuid) : me.uid, k = `th/${no}/${tuid}`;
  const th = await ms.get(k, { type: 'json' }).catch(() => null);
  if (!th) return json({ error: 'ไม่พบบทสนทนา' }, 404);
  if (b.op === 'read') {
    if (tuid === me.uid && th.tn) { th.tn = 0; await ms.setJSON(k, th); }
    return json({ msgs: th.msgs, sname: th.sname, mine: tuid === me.uid });
  }
  if (b.op === 'reply') {
    if (tuid !== me.uid) return json({ error: 'ตอบได้เฉพาะข้อความที่ส่งถึงตัวเอง' }, 403);
    const x = clip(String(b.text || '').trim(), 500); if (!x) return json({ error: 'ยังไม่ได้พิมพ์ข้อความ' }, 400);
    const now = Date.now();
    th.msgs.push({ f: 't', x, at: now }); th.msgs = th.msgs.slice(-200); th.pn = (th.pn || 0) + 1; th.tn = 0; th.at = now;
    await ms.setJSON(k, th);
    await after(ctx, fetch(APP + '/api/samanping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ no, t: now, sig: pingSig(no, now), teacher: me.name || 'ครูสามัญ' }) }).catch((e) => console.log('ping fail', e.message)));
    return json({ msgs: th.msgs });
  }
  return json({ error: 'unknown op' }, 400);
};
export const config = { path: '/api/pmsg' };
