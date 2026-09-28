// 可以换的主角：标题画面"更换人物"和暂停菜单里的"人物"都从这里取
//   look 直接传给 createCharacter（见 character.js 里的 opts 说明）
export const HEROES = [
  {
    key: 'bingo',
    name: 'bingo',
    desc: '通宵打排位的本尊：短碎发、深蓝牛仔夹克、黑色牛仔裤',
    look: {},
  },
  {
    // 照着一张课本上的涂鸦和一张宿舍里的照片捏的：
    //   涂鸦：长脸尖下巴、脖子细长，头发往一边堆起一大蓬；窄肩、长长的直筒身子、细胳膊细腿，
    //         眯着眼张大嘴笑、腹肌三道横线、手插在画满星星的大裤衩里，嘴边写着 "Hee-Haw"；
    //   照片：光着膀子光着脚站在宿舍里，很瘦，腰细、胳膊腿都细，蓝白扎染的大裤衩松松垮垮，两只手揣在裤腰里
    key: 'jigo',
    name: 'jigo',
    desc: '瘦长条、长脸尖下巴；光膀子光脚、蓝白扎染大裤衩，两只手揣在裤腰里，一笑就 Hee-Haw',
    look: {
      outfit: 'shorts', abs: true, pose: 'pockets', bubble: 'Hee-Haw!',
      skin: [228, 186, 156], skinColor: '#e2b89c', hair: [18, 15, 14], hairColor: '#120e0c', brow: '#15100d',
      hairStyle: 'fringe',
      // 脸：比 bingo 窄、长，下巴尖、往前翘，颧骨略高
      headScale: [0.93, 1.04, 0.97],
      face: { jaw: 0.37, chin: 0.18, drop: 0.012, cheek: 0.009, long: 0.07 },
      // 身材：窄肩、胸腔和腰都细一圈（腰最细），胯窄，胳膊腿细，脖子细长
      build: { shoulder: 0.9, chest: 0.87, waist: 0.83, hip: 0.9, arm: 0.78, leg: 0.8, neck: 0.025, neckR: 0.84 },
      // 笑起来就是涂鸦上那样：眼睛眯成两道缝、嘴张得老大
      expr: { grin: { eyes: 'smile', mouth: 'laugh', brows: 'raised' } },
    },
  },
];

// 以前存档里的旧名字
const ALIAS = { denim: 'bingo', heehaw: 'jigo' };
export const heroOf = (key) => HEROES.find((h) => h.key === (ALIAS[key] || key)) || HEROES[0];
