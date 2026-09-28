// 各章的名字（标题画面"上次玩到第几章"、结算面板的每章用时都用这一份；插章的时候只改这里）
export const CHAPTER_NAMES = ['', 'REVERIE', 'LOST', 'ADRIFT', 'BELOW', 'HUSH', 'EMBER', 'HOMEBOUND'];
const CN = '零一二三四五六七八九十';
export const chapterNum = (n) => `第${CN[n] || n}章`;
export const chapterLabel = (n) => `${String(n).padStart(2, '0')} · ${CHAPTER_NAMES[n] || ''}`;
