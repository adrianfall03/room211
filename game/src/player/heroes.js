// 可以换的主角：标题画面"更换人物"和暂停菜单里的"人物"都从这里取
//   look 直接传给 createCharacter（见 character.js 里的 opts 说明）
export const HEROES = [
  {
    key: 'denim',
    name: '牛仔夹克',
    desc: '通宵打排位的本尊：短碎发、深蓝牛仔夹克、黑色牛仔裤',
    look: {},
  },
  {
    // 照着一张课本上的涂鸦和一张宿舍里的照片捏的：
    //   涂鸦：短头发斜刘海、眯着眼张大嘴笑、腹肌三道横线、手插在画满星星的大裤衩里，嘴边写着 "Hee-Haw"；
    //   照片：光着膀子光着脚站在宿舍里，蓝白扎染的大裤衩，两只手揣在裤腰里
    key: 'heehaw',
    name: 'Hee-Haw',
    desc: '光膀子、光脚、蓝白扎染大裤衩，两只手揣在裤腰里；一笑就 Hee-Haw',
    look: {
      outfit: 'shorts', abs: true, pose: 'pockets', bubble: 'Hee-Haw!',
      skin: [222, 176, 144], skinColor: '#dcac8c', hair: [18, 15, 14], hairColor: '#120e0c', brow: '#15100d',
      hairStyle: 'fringe', headScale: [0.98, 1.02, 1],
      // 笑起来就是涂鸦上那样：眼睛眯成两道缝、嘴张得老大
      expr: { grin: { eyes: 'smile', mouth: 'laugh', brows: 'raised' } },
    },
  },
];

export const heroOf = (key) => HEROES.find((h) => h.key === key) || HEROES[0];
