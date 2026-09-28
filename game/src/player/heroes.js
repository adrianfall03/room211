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
    //   涂鸦：头发往一边堆起一大蓬，眯着眼张大嘴笑，两只手插在画满星星的大裤衩里，嘴边写着 "Hee-Haw"；
    //   照片：光着膀子光着脚站在宿舍里，皮肤晒得偏黑（小麦色），稍微有点胖、有点小肚子，
    //         蓝白扎染的大裤衩松松垮垮，两只手从裤腰前面插进裤裆里
    key: 'jigo',
    name: 'jigo',
    desc: '小麦色皮肤、稍微有点胖；光膀子光脚、蓝白扎染大裤衩，两只手插在裤裆里，一笑就 Hee-Haw',
    look: {
      outfit: 'shorts', pose: 'crotch', bubble: 'Hee-Haw!',
      skin: [200, 148, 112], skinColor: '#c79270', hair: [18, 15, 14], hairColor: '#120e0c', brow: '#15100d',
      hairStyle: 'fringe',
      // 脸：比 bingo 圆一点，腮帮子有肉，下巴不尖
      headScale: [1.03, 1, 1.02],
      face: { jaw: 0.24, chin: 0.13, drop: 0.007, cheek: 0.006, long: 0.02, full: 0.007 },
      // 身材：比 bingo 壮一圈——腰和胯最明显，有个小肚子；胳膊腿粗一点，脖子粗短
      build: { shoulder: 1.03, chest: 1.04, waist: 1.1, hip: 1.07, arm: 1.08, leg: 1.1, neck: 0, neckR: 1.12, belly: 0.03 },
      // 笑起来就是涂鸦上那样：眼睛眯成两道缝、嘴张得老大
      expr: { grin: { eyes: 'smile', mouth: 'laugh', brows: 'raised' } },
    },
  },
  {
    // 照着一张黑白照片捏的：瘦瘦的男生，刚把一罐水举过头顶往自己头上浇，短短的刺猬头湿成一撮一撮往上支棱，
    //   眼睛使劲闭着、眉头拧成一团，嘴张得老大哇哇地哭；黑色长袖运动衫，胸口一块白色印花，左手腕上一块黑色电子表
    key: 'neptune',
    name: 'neptune',
    desc: '瘦瘦的、刺猬头湿漉漉的；黑色长袖运动衫，左手攥着一罐饮料——一激动就举过头顶往自己头上浇，哇地哭出来',
    laugh: 'sob', // 招牌动作的声音（见 game._onHeroLaugh）
    look: {
      outfit: 'sport', print: 'trident', pants: '#5d6068', watch: true, can: true, signature: 'pour',
      skin: [218, 168, 138], skinColor: '#d6a386', hair: [22, 19, 18], hairColor: '#141011', brow: '#17110e',
      hairStyle: 'spiky', hairGloss: 0.32, // 刚浇过水，头发湿亮
      // 脸：比 bingo 瘦长一点，下巴窄
      headScale: [0.97, 1.02, 1],
      face: { jaw: 0.33, chin: 0.13, drop: 0.007, cheek: 0.004, long: 0.03, full: 0 },
      // 身材：比 bingo 单薄一圈
      build: { shoulder: 0.96, chest: 0.94, waist: 0.92, hip: 0.95, arm: 0.92, leg: 0.93, neck: 0.01, neckR: 0.95 },
      // 平时眉头也有点往上挑（一副要哭不哭的样子）；"笑"起来就是照片上那样：眼睛挤成一条缝、嘴张得老大，两道眼泪
      expr: {
        neutral: { brows: 'worried' },
        grin: { eyes: 'squeeze', mouth: 'cry', brows: 'worried', tears: true },
      },
    },
  },
];

// 以前存档里的旧名字
const ALIAS = { denim: 'bingo', heehaw: 'jigo' };
export const heroOf = (key) => HEROES.find((h) => h.key === (ALIAS[key] || key)) || HEROES[0];
