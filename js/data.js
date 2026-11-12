// 全部平衡数值集中在本文件。调整数值不需要改动任何逻辑代码。

export const GRID = { cols: 16, rows: 10, cell: 48 };

// 顶部 HUD 高度（画布上方留白，地图区域仍是 16×10 格 = 768×480）
export const HUD_HEIGHT = 56;

export const CANVAS = {
  width: GRID.cols * GRID.cell,
  height: GRID.rows * GRID.cell + HUD_HEIGHT,
};

// 固定时间步长：逻辑更新按 60Hz 累积执行，渲染每帧执行
export const FIXED_DT = 1 / 60;
// 单帧允许累积的最大真实时间，防止切后台回来后一次补算过多步
export const MAX_FRAME_DT = 0.25;

// 固定的 S 形折线路径（格坐标，格中心为落点）
// 从左侧画布外进入，向右 → 下 → 左 → 下 → 右 → 出右侧画布外
export const PATH_NODES = [
  { c: -1, r: 2 },
  { c: 12, r: 2 },
  { c: 12, r: 5 },
  { c: 3, r: 5 },
  { c: 3, r: 8 },
  { c: 13, r: 8 },
  { c: 16, r: 8 },
];

export const ECONOMY = {
  startGold: 120,
  startLives: 10,
  sellRefundRate: 0.7,
  prepTime: 8,
  // 提前开始下一波：每剩余 1 秒奖励的金币
  earlyStartBonusPerSecond: 2,
  // 按波次索引（0 起）发放的波次清空奖励，随波次递增
  waveClearRewards: [45, 60, 75, 90, 105],
};

// 同一波内两个敌人的生成间隔（秒）
export const SPAWN_INTERVAL = 0.7;

export const TOWER_TYPES = {
  arrow: {
    key: 'arrow',
    name: '箭塔',
    role: '单体高频',
    price: 50,
    maxLevel: 3,
    range: 2.5, // 格
    rangePerLevel: 0.3, // 每级 +0.3 格
    damage: 18,
    damagePerLevel: 1.5, // 每级伤害 ×1.5
    interval: 0.6, // 秒
    attack: 'projectile',
    color: '#2f6fed',
    upgradeCosts: [60, 90], // 升到 2 级、3 级
  },
  frost: {
    key: 'frost',
    name: '冰塔',
    role: '群体减速',
    price: 70,
    maxLevel: 3,
    range: 1.8,
    rangePerLevel: 0.2,
    damage: 10,
    damagePerLevel: 1.4,
    interval: 1.2,
    attack: 'pulse',
    slowFactor: 0.55, // 速度 ×0.55
    slowDuration: 1.5, // 秒
    pulseDuration: 0.45, // 脉冲圆环动画时长
    color: '#39b7d8',
    upgradeCosts: [80, 110],
  },
};

export const ENEMY_TYPES = {
  normal: {
    key: 'normal',
    name: '普通兵',
    hp: 60,
    speed: 1.2, // 格/秒
    bounty: 12,
    radius: 13,
    shape: 'circle',
    color: '#e05c5c',
  },
  fast: {
    key: 'fast',
    name: '快速兵',
    hp: 35,
    speed: 2.2,
    bounty: 8,
    radius: 11,
    shape: 'triangle',
    color: '#e8a33d',
  },
};

// 第 N 波敌人血量 = 基准血量 ×（1 + 0.15 × (N - 1)），速度与赏金不缩放
export const ENEMY_HP_SCALE_PER_WAVE = 0.15;

// 5 波构成，顺序即为波次顺序
export const WAVES = [
  { normal: 6, fast: 0 },
  { normal: 8, fast: 0 },
  { normal: 6, fast: 4 },
  { normal: 10, fast: 0 },
  { normal: 10, fast: 6 },
];

export const PROJECTILE = { speed: 640, radius: 4 };

export const FLOAT_TEXT = { life: 0.6 };
