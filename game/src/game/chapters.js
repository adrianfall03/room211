// 章节表：第一章的逻辑写在 game.js 里，第二、三、四、五章各自一个模块
import { CH2 } from './chapter2.js';
import { CH3 } from './chapter3.js';
import { CH4 } from './chapter4.js';
import { CH5 } from './chapter5.js';

export const CHAPTERS = { 2: CH2, 3: CH3, 4: CH4, 5: CH5 };
// 一共几章（最后一章出门就是结局）
export const LAST_CHAPTER = 5;
