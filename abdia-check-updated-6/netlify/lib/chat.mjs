/* ตัวช่วยร่วมของห้องแชท (แก้ไข/ลบ/ตอบกลับ/รีแอคชัน) และกระดานประกาศ (รีแอคชัน/ความคิดเห็น)
   party = ฝ่ายที่กำลังกระทำ: 'p' ผู้ปกครอง / 't' ครู (ห้องผู้ปกครอง) หรือ uid ของครู (ห้องแชทระหว่างครู) */
import { clip } from './common.mjs';

export const RX_OK = ['❤️', '👍', '😊', '🤲', '🙏', '😂', '😮', '😢'];
export const BRX_OK = ['🙏', '❤️', '👍', '🥰', '🌷'];
/* รหัสกันส่งซ้ำจากแอพ (ส่งซ้ำเพราะเน็ตหลุดแล้วไม่ซ้ำในห้อง) */
export const okCid = (c) => (/^[a-z0-9]{6,24}$/.test(String(c || '')) ? String(c) : '');
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/* ข้อความเก่าที่ยังไม่มี id ใช้ id สังเคราะห์จากผู้ส่ง+เวลา (คงที่ทุกครั้ง) */
export const mid = (m) => m.id || (m.f + '_' + m.at);

export function newMsg(f, x, re, im) {
  const m = { id: newId(), f, x, at: Date.now() };
  if (re) m.re = re;
  if (im) m.im = im;
  return m;
}
/* อ้างอิงข้อความที่ตอบกลับ เก็บเฉพาะตัวอย่างสั้นๆ */
export function replyRef(th, reId) {
  if (!reId) return undefined;
  const o = (th.msgs || []).find((z) => mid(z) === String(reId));
  if (!o) return undefined;
  return { id: mid(o), f: o.f, x: o.del ? '' : (o.x ? clip(o.x, 80) : (o.im ? '📷 รูปภาพ' : '')) };
}
/* ข้อความที่ฝ่าย party เห็น (ตัดข้อความที่ "ลบเฉพาะฝั่งฉัน" ออก, ข้อความที่ยกเลิกส่งไม่เปิดเผยเนื้อหา) */
export function viewMsgs(th, party, own = true) {
  const hide = own && th.hide && th.hide[party] ? new Set(th.hide[party]) : null;
  return (th.msgs || []).filter((m) => !(hide && hide.has(mid(m)))).map((m) => {
    const o = { id: mid(m), f: m.f, x: m.del ? '' : m.x, at: m.at };
    if (m.del) o.del = 1;
    if (m.ed) o.ed = m.ed;
    if (m.cid) o.cid = m.cid;
    if (m.im && !m.del) o.im = m.im.exp > Date.now() ? { id: m.im.id, exp: m.im.exp } : { gone: 1 };
    if (m.re) o.re = m.re;
    if (m.rx && Object.keys(m.rx).length) o.rx = m.rx;
    return o;
  });
}
/* id รูปของข้อความ (เรียกก่อน applyAct เพื่อลบไฟล์รูปเมื่อยกเลิกส่ง) */
export const imgOf = (th, id) => { const m = (th.msgs || []).find((z) => mid(z) === String(id || '')); return m && m.im ? m.im.id : null; };
export function lastView(th, party, own = true) {
  const v = viewMsgs(th, party, own), l = v[v.length - 1];
  return l ? { x: l.del ? 'ลบข้อความแล้ว' : (l.x || (l.im ? '📷 รูปภาพ' : '')), f: l.f, at: l.at } : null;
}
/* แก้ไข / ยกเลิกส่ง / ลบฝั่งตัวเอง / รีแอคชัน — คืนข้อความผิดพลาด หรือ null ถ้าสำเร็จ */
export function applyAct(th, party, b) {
  const id = String(b.id || ''), m = (th.msgs || []).find((z) => mid(z) === id);
  if (!m) return 'ไม่พบข้อความนี้';
  const kind = b.act;
  if (kind === 'hide') {
    th.hide = th.hide || {};
    const a = th.hide[party] || []; if (!a.includes(id)) a.push(id);
    th.hide[party] = a.slice(-400); return null;
  }
  if (m.del) return 'ข้อความนี้ถูกลบแล้ว';
  if (kind === 'react') {
    const e = b.emoji ? String(b.emoji) : '';
    if (e && !RX_OK.includes(e)) return 'อีโมจิไม่ถูกต้อง';
    m.rx = m.rx || {};
    if (!e || m.rx[party] === e) delete m.rx[party]; else m.rx[party] = e;
    if (!Object.keys(m.rx).length) delete m.rx;
    return null;
  }
  if (m.f !== party) return 'ทำได้เฉพาะข้อความของตัวเอง';
  if (kind === 'edit') {
    if (m.im) return 'แก้ไขข้อความที่มีรูปไม่ได้';
    const x = clip(String(b.text || '').trim(), 500); if (!x) return 'ยังไม่ได้พิมพ์ข้อความ';
    if (x !== m.x) { m.x = x; m.ed = Date.now(); }
    if (!m.id) m.id = id; return null;
  }
  if (kind === 'unsend') { m.del = true; m.x = ''; delete m.rx; delete m.im; if (!m.id) m.id = id; return null; }
  return 'unknown act';
}

/* ---------------- กระดาน: รีแอคชัน + ความคิดเห็น ---------------- */
/* viewer = { kind:'p'|'t', key, admin, uid }  key = 'p:<เลขที่>' หรือ 't:<uid>'
   ครูเห็นชื่อทุกคน / ผู้ปกครองเห็นชื่อครู ส่วนผู้ปกครองท่านอื่นแสดงแบบไม่ระบุชื่อ (กันข้อมูลนักเรียนรั่ว) */
export function postView(p, v) {
  const rx = p.rx || {}, counts = {}, who = [];
  for (const k in rx) {
    const r = rx[k], me = k === v.key;
    counts[r.e] = counts[r.e] || { n: 0, mine: false }; counts[r.e].n++; if (me) counts[r.e].mine = true;
    who.push({ e: r.e, r: r.r, me, at: r.at, n: me ? 'คุณ' : (r.r === 't' || v.kind === 't' ? r.n : 'ผู้ปกครองท่านอื่น') });
  }
  who.sort((a, b) => (a.at || 0) - (b.at || 0));
  return {
    id: p.id, title: p.title, x: p.x, at: p.at, by: p.by, byName: p.byName, color: p.color, emoji: p.emoji, pin: !!p.pin, ed: p.ed || undefined,
    rx: counts, who,
    cm: (p.cm || []).map((c) => ({
      id: c.id, r: c.r, x: c.x, at: c.at, mine: c.k === v.key,
      n: c.k === v.key ? 'คุณ' : (c.r === 't' || v.kind === 't' ? c.n : 'ผู้ปกครอง'),
      can: c.k === v.key || (v.kind === 't' && (!!v.admin || p.by === v.uid))
    }))
  };
}
export const postsView = (posts, v) => posts.map((p) => postView(p, v));

/* ทำ op ของกระดานที่เกี่ยวกับรีแอคชัน/ความคิดเห็น คืน { post } หรือ { error, status } */
export function boardSocial(op, p, b, v, who) {
  if (op === 'brx') {
    const e = String(b.emoji || '');
    if (!BRX_OK.includes(e)) return { error: 'อีโมจิไม่ถูกต้อง', status: 400 };
    p.rx = p.rx || {};
    if (p.rx[v.key] && p.rx[v.key].e === e) delete p.rx[v.key];
    else p.rx[v.key] = { e, r: v.kind, n: clip(who, 60), at: Date.now() };
  } else if (op === 'bcm') {
    const x = clip(String(b.text || '').trim(), 300); if (!x) return { error: 'ยังไม่ได้พิมพ์ความคิดเห็น', status: 400 };
    p.cm = p.cm || [];
    const mine = p.cm.filter((c) => c.k === v.key && Date.now() - c.at < 600e3).length;
    if (mine >= 15) return { error: 'ส่งถี่เกินไป ลองใหม่ภายหลัง', status: 429 };
    p.cm.push({ id: newId(), k: v.key, r: v.kind, n: clip(who, 60), x, at: Date.now() });
    p.cm = p.cm.slice(-100);
  } else if (op === 'bcdel') {
    const i = (p.cm || []).findIndex((c) => c.id === String(b.cid || ''));
    if (i < 0) return { error: 'ไม่พบความคิดเห็น', status: 404 };
    const c = p.cm[i];
    if (!(c.k === v.key || (v.kind === 't' && (v.admin || p.by === v.uid)))) return { error: 'ลบได้เฉพาะความคิดเห็นของตัวเอง', status: 403 };
    p.cm.splice(i, 1);
  }
  return { post: p };
}
