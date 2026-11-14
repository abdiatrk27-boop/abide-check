/* รูปในห้องแชท: เก็บชั่วคราว 24 ชม. แล้วลบอัตโนมัติ
   - id = <เวลาหมดอายุ(ms 13 หลัก)>-<สุ่ม 32 hex> จึงรู้เวลาหมดอายุจากชื่อ และเดาลิงก์ไม่ได้
   - ฝั่งไคลเอนต์ย่อ/บีบอัดเป็น JPEG มาก่อนแล้ว (ไม่เกินราว 280 KB) */
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

export const IMG_TTL = 24 * 3600e3;
export const IMG_ID = /^\d{13}-[a-f0-9]{32}$/;
const MAX_B64 = 420000;
export const imgStore = () => getStore('chatimg');

export function parseImg(data) {
  const s = String(data || '');
  if (s.length > MAX_B64) return { error: 'รูปใหญ่เกินไป ลองรูปอื่นน้า' };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) return { error: 'รูปไม่ถูกต้อง' };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return { error: 'รูปไม่ถูกต้อง' };
  return { buf };
}
export async function saveImg(data) {
  const p = parseImg(data); if (p.error) return p;
  const exp = Date.now() + IMG_TTL, id = exp + '-' + randomBytes(16).toString('hex');
  const ab = p.buf.buffer.slice(p.buf.byteOffset, p.buf.byteOffset + p.buf.byteLength);
  await imgStore().set(id, ab);
  return { id, exp };
}
export async function delImg(id) { if (IMG_ID.test(String(id || ''))) await imgStore().delete(id).catch(() => {}); }
