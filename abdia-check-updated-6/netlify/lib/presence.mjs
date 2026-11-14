/* สถานะออนไลน์ของครู: แอพส่ง heartbeat ทุก 1 นาทีตอนเปิดหน้าจอ · ฝั่งอ่านตัดสินว่าออนไลน์ถ้าเกิน 150 วินาทีถือว่าออฟไลน์ */
import { getStore } from '@netlify/blobs';

export const PRES_OK = /^[A-Za-z0-9_-]{6,128}$/;
const store = () => getStore('presence');
export async function presBeat(uid, at = Date.now()) { await store().setJSON(uid, { at }); }
/* คืน { uid: อายุ(ms) นับจาก heartbeat ล่าสุด } เฉพาะคนที่เคยมี heartbeat */
export async function presOf(ids) {
  const st = store(), now = Date.now(), out = {};
  const a = (Array.isArray(ids) ? ids : []).map(String).filter((x) => PRES_OK.test(x)).slice(0, 40);
  await Promise.all(a.map(async (id) => { const r = await st.get(id, { type: 'json' }).catch(() => null); if (r && r.at) out[id] = Math.max(0, now - r.at); }));
  return out;
}
