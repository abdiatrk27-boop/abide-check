/* ลบรูปแชทที่หมดอายุ (เกิน 24 ชม.) ทุกชั่วโมง */
import { IMG_ID, imgStore } from '../lib/chatimg.mjs';

export default async () => {
  const st = imgStore(), { blobs } = await st.list(), now = Date.now();
  let n = 0;
  for (const { key } of blobs) {
    if (IMG_ID.test(key) && +key.slice(0, 13) <= now) { await st.delete(key).catch(() => {}); n++; }
  }
  console.log('chatimg cleaned', n);
};
export const config = { schedule: '@hourly' };
