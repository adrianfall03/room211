// 各章的名字（标题画面"上次玩到第几章"、结算面板的每章用时都用这一份；插章的时候只改这里）
export const CHAPTER_NAMES = ['', '211 宿舍', '废弃的 211', '船舱 211', '地铁 211', '雨林 211', '冰封 211', '太空舱 211'];
const CN = '零一二三四五六七八九十';
export const chapterNum = (n) => `第${CN[n] || n}章`;
export const chapterLabel = (n) => `${chapterNum(n)} · ${CHAPTER_NAMES[n] || ''}`;
