// 章节表：第一章的逻辑写在 game.js 里，第二到第七章各自一个模块
//   2 废弃的 211 → 3 船舱 211 → 4 地铁 211 → 5 雨林 211 → 6 冰封 211 → 7 太空舱 211 → 结局
import { CH2 } from './chapter2.js';
import { CH3 } from './chapter3.js';
import { CH4 } from './chapter4.js';
import { CH5 } from './chapter5.js';
import { CH6 } from './chapter6.js';
import { CH7 } from './chapter7.js';

export const CHAPTERS = { 2: CH2, 3: CH3, 4: CH4, 5: CH5, 6: CH6, 7: CH7 };
// 一共几章（最后一章出门就是结局）
export const LAST_CHAPTER = 7;
