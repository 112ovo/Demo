// 无渲染的逻辑仿真：直接驱动 Game.update(FIXED_DT) 跑各种场景，
// 把结果以 JSON 打到 stdout，供 tests/test_tower_defense.py 断言。
// 不涉及任何 canvas / DOM。

import {
  ECONOMY,
  ENEMY_TYPES,
  FIXED_DT,
  GRID,
  HUD_HEIGHT,
  PATH_NODES,
  TOWER_TYPES,
  WAVES,
} from '../../js/data.js';
import { Game } from '../../js/game.js';
import { Enemy } from '../../js/enemy.js';
import {
  PATH,
  PATH_CELLS,
  PATH_LENGTH,
  SEGMENT_LENGTHS,
  checkBuildable,
  isPathCell,
} from '../../js/map.js';
import { buildSpawnQueue } from '../../js/wave.js';
import * as ui from '../../js/ui.js';

const out = {};

function newGame() {
  const game = new Game();
  // 默认关掉波次自动生成，场景自行摆放敌人
  game.wave.state = 'finished';
  return game;
}

function steps(game, seconds) {
  const count = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < count; i += 1) game.update(FIXED_DT);
  return count;
}

/* ------------------------------------------------------------ 地图几何 */

out.map = {
  cols: GRID.cols,
  rows: GRID.rows,
  cell: GRID.cell,
  pathLengthCells: PATH_LENGTH / GRID.cell,
  pathCellCount: PATH_CELLS.size,
  segments: SEGMENT_LENGTHS.length,
  buildableEmptyCell: checkBuildable([], 0, 0).ok,
  buildablePathCell: checkBuildable([], PATH_NODES[1].c, PATH_NODES[1].r).ok,
  buildableOutOfGrid: checkBuildable([], -1, 0).ok,
  // 路径格之外的格子数
  freeCells: GRID.cols * GRID.rows - [...PATH_CELLS].length,
  isPathCellOnFirstRun: isPathCell(5, 2),
  isPathCellOnBuildRow: isPathCell(5, 0),
  isPathCellOnLastRun: isPathCell(5, 8),
};

/* ------------------------------------------------------------ 配置齐全性 */

out.config = {
  waves: WAVES.length,
  waveTotals: WAVES.map((w) => (w.normal || 0) + (w.fast || 0)),
  queueWave3: buildSpawnQueue(WAVES[2]),
  queueWave5: buildSpawnQueue(WAVES[4]),
  startGold: ECONOMY.startGold,
  startLives: ECONOMY.startLives,
  prepTime: ECONOMY.prepTime,
  sellRefundRate: ECONOMY.sellRefundRate,
  arrowPrice: TOWER_TYPES.arrow.price,
  frostPrice: TOWER_TYPES.frost.price,
  arrowUpgrades: TOWER_TYPES.arrow.upgradeCosts,
  frostUpgrades: TOWER_TYPES.frost.upgradeCosts,
  normalHp: ENEMY_TYPES.normal.hp,
  fastSpeed: ENEMY_TYPES.fast.speed,
  wave1NormalHp: new Enemy('normal', 1).maxHp,
  wave5NormalHp: new Enemy('normal', 5).maxHp,
  fixedDt: FIXED_DT,
};

/* ------------------------------------------------------------ 敌人行走与漏怪 */

{
  const game = newGame();
  game.enemies.push(new Enemy('normal', 1));
  const startLives = game.lives;
  let elapsed = 0;
  while (game.enemies.length > 0 && elapsed < 120) {
    game.update(FIXED_DT);
    elapsed += FIXED_DT;
  }
  out.enemyWalk = {
    startLives,
    livesAfterLeak: game.lives,
    leaked: game.stats.leaked,
    secondsToFinish: Number(elapsed.toFixed(2)),
    remaining: game.enemies.length,
  };
}

/* ------------------------------------------------------------ 箭塔：单体伤害 / 击杀给金币 / 浮字 */

{
  const game = newGame();
  game.gold = 500;
  game.togglePlacing('arrow');
  const placed = game.tryPlace(2, 3);
  const goldAfterBuild = game.gold;
  game.enemies.push(new Enemy('normal', 1));

  const killsBefore = game.stats.kills;
  let elapsed = 0;
  let sawFloat = false;
  let sawProjectile = false;
  while (game.enemies.length > 0 && elapsed < 60) {
    game.update(FIXED_DT);
    elapsed += FIXED_DT;
    if (game.floats.length > 0) sawFloat = true;
    if (game.projectiles.length > 0) sawProjectile = true;
  }
  out.arrowTower = {
    placed,
    goldAfterBuild,
    kills: game.stats.kills - killsBefore,
    goldGained: game.gold - goldAfterBuild,
    bounty: ENEMY_TYPES.normal.bounty,
    sawFloatingText: sawFloat,
    sawProjectile,
    livesLost: game.stats.leaked,
    secondsToKill: Number(elapsed.toFixed(2)),
  };
}

/* ------------------------------------------------------------ 非法放置 */

{
  const game = newGame();
  game.gold = 500;
  game.togglePlacing('arrow');
  const onPath = game.tryPlace(PATH_NODES[1].c, PATH_NODES[1].r);
  const firstOk = game.tryPlace(2, 3);
  const onTower = game.tryPlace(2, 3);
  const outOfGrid = game.tryPlace(-2, 4);

  const poorGame = newGame();
  poorGame.gold = 10;
  poorGame.togglePlacing('arrow');
  const poorPlace = poorGame.tryPlace(2, 3);
  const poorModeEntered = poorGame.placing;

  out.placement = {
    onPath,
    firstOk,
    onTower,
    outOfGrid,
    poorPlace,
    poorModeEntered,
    towerCount: game.towers.length,
    goldSpent: 500 - game.gold,
  };
}

/* ------------------------------------------------------------ 冰塔：范围伤害 + 减速 */

{
  const game = newGame();
  game.gold = 500;
  game.togglePlacing('frost');
  game.tryPlace(0, 3); // 紧贴第一段路径（row 2），敌人生成时就在射程内
  const enemy = new Enemy('normal', 1);
  game.enemies.push(enemy);
  const hpBefore = enemy.hp;
  const baseSpeed = enemy.getSpeed();

  // 冰塔第一次开火在进入射程的那一帧，跑 0.3s 足够结算一次脉冲
  steps(game, 0.3);

  out.frostTower = {
    hpBefore,
    hpAfter: enemy.hp,
    damaged: enemy.hp < hpBefore,
    slowTimer: Number(enemy.slowTimer.toFixed(2)),
    slowFactor: enemy.slowFactor,
    baseSpeed: Number(baseSpeed.toFixed(1)),
    slowedSpeed: Number(enemy.getSpeed().toFixed(1)),
    pulses: game.towers[0].pulses.length,
  };
}

/* ------------------------------------------------------------ 升级 / 出售经济 */

{
  const game = newGame();
  game.gold = 1000;
  game.togglePlacing('arrow');
  game.tryPlace(2, 3);
  const tower = game.towers[0];
  const level1Damage = tower.getDamage();
  const level1Range = tower.getRange();

  game.selected = tower;
  const goldBeforeUpgrade = game.gold;
  game.upgradeSelected();
  const cost2 = TOWER_TYPES.arrow.upgradeCosts[0];
  const damage2 = tower.getDamage();
  const range2 = tower.getRange();

  game.upgradeSelected();
  const cost3 = TOWER_TYPES.arrow.upgradeCosts[1];
  const damage3 = tower.getDamage();

  const canUpgradeAgain = tower.getUpgradeCost();
  const invested = tower.invested;
  const sellValue = tower.getSellValue();
  const goldBeforeSell = game.gold;
  game.sellSelected();

  out.upgradeSell = {
    level1Damage: Number(level1Damage.toFixed(1)),
    level1RangeCells: Number((level1Range / GRID.cell).toFixed(2)),
    cost2,
    damage2: Number(damage2.toFixed(1)),
    range2Cells: Number((range2 / GRID.cell).toFixed(2)),
    cost3,
    damage3: Number(damage3.toFixed(1)),
    level: tower.level,
    canUpgradeAgain,
    goldSpentOnUpgrades: goldBeforeUpgrade - goldBeforeSell + 0,
    invested,
    sellValue,
    goldGainOnSell: game.gold - goldBeforeSell,
    towersLeft: game.towers.length,
    selectedCleared: game.selected === null,
    refundMatchesRate: sellValue === Math.floor(invested * ECONOMY.sellRefundRate),
  };
}

/* ------------------------------------------------------------ 波次推进 / 准备倒计时 / 奖励 */

{
  const game = new Game();
  const prepAtStart = game.wave.prepTimer;
  steps(game, 1);
  const prepAfter1s = game.wave.prepTimer;
  const earlyBonus = game.wave.pendingEarlyBonus;
  const goldBeforeEarly = game.gold;
  const grantedBonus = game.wave.startEarly();
  const stateAfterEarly = game.wave.state;

  let elapsed = 0;
  while (game.wave.state === 'active' && elapsed < 180) {
    game.update(FIXED_DT);
    elapsed += FIXED_DT;
  }

  out.waveFlow = {
    prepAtStart,
    prepAfter1s: Number(prepAfter1s.toFixed(2)),
    earlyBonus,
    grantedBonus,
    goldBeforeEarly,
    goldAfterEarly: goldBeforeEarly + grantedBonus,
    stateAfterEarly,
    waveNumber: game.wave.waveNumber,
    stateAfterClear: game.wave.state,
    rewardFirstWave: ECONOMY.waveClearRewards[0],
    secondsWave1: Number(elapsed.toFixed(1)),
    prepAfterClear: game.wave.prepTimer,
  };
}

/* ------------------------------------------------------------ 通关：程序化建塔策略 */

function playStrategy({ upgrades = true, towerSpots }) {
  const game = new Game();
  const spots = towerSpots;
  let nextSpot = 0;
  let elapsed = 0;

  const trySpend = () => {
    // 先补塔位，再升级已有塔
    while (nextSpot < spots.length && game.gold >= TOWER_TYPES.arrow.price) {
      const [col, row] = spots[nextSpot];
      if (game.towers.some((t) => t.col === col && t.row === row)) {
        nextSpot += 1;
        continue;
      }
      game.togglePlacing('arrow');
      if (!game.tryPlace(col, row)) break;
      nextSpot += 1;
    }
    if (!upgrades) return;
    for (const tower of game.towers) {
      const cost = tower.getUpgradeCost();
      if (cost !== null && game.gold >= cost) {
        game.selected = tower;
        game.upgradeSelected();
      }
    }
    game.selected = null;
  };

  while (game.state === 'playing' && elapsed < 900) {
    game.update(FIXED_DT);
    elapsed += FIXED_DT;
    if (Math.round(elapsed / FIXED_DT) % 30 === 0) trySpend();
  }

  return {
    result: game.state,
    lives: game.lives,
    gold: game.gold,
    wave: game.wave.waveNumber,
    kills: game.stats.kills,
    towers: game.towers.length,
    levels: game.towers.map((t) => t.level),
    seconds: Number(elapsed.toFixed(1)),
  };
}

const SPOTS = [
  [2, 3],
  [6, 3],
  [10, 3],
  [5, 4],
  [9, 4],
  [5, 7],
  [9, 7],
  [13, 4],
  [14, 7],
];

out.balancedRun = playStrategy({ upgrades: true, towerSpots: SPOTS });
out.naiveRun = playStrategy({ upgrades: false, towerSpots: SPOTS });

/* ------------------------------------------------------------ 失败：完全不建塔 */

{
  const game = new Game();
  let elapsed = 0;
  while (game.state === 'playing' && elapsed < 900) {
    game.update(FIXED_DT);
    elapsed += FIXED_DT;
  }
  out.noTowerRun = {
    result: game.state,
    lives: game.lives,
    leaked: game.stats.leaked,
    wave: game.wave.waveNumber,
    seconds: Number(elapsed.toFixed(1)),
  };
}

/* ------------------------------------------------------------ 鼠标闭环：点击 HUD 商店 → 放置 → 选中 → 升级 → 出售 → 提前开始 → 重开 */

{
  const game = new Game();
  const mid = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  const cellPoint = (col, row) => ({
    x: (col + 0.5) * GRID.cell,
    y: (row + 0.5) * GRID.cell + HUD_HEIGHT,
  });

  const hud = ui.hudLayout(game);
  const arrowShop = hud.shops.find((s) => s.type === 'arrow');
  game.handleClick(...Object.values(mid(arrowShop.rect)));
  const enteringPlacing = game.placing;

  const target = cellPoint(2, 3);
  game.handleClick(target.x, target.y);
  const builtCount = game.towers.length;
  const goldAfterBuild = game.gold;
  const stillPlacing = game.placing;

  // 取消放置后才允许选中塔
  game.cancelModes();
  game.handleClick(target.x, target.y);
  const selected = game.selected ? game.selected.type : null;

  const panel = ui.panelLayout(game.selected);
  const upMid = mid(panel.upgrade);
  game.handleClick(upMid.x, upMid.y);
  const levelAfterUpgrade = game.towers[0].level;

  const sellMid = mid(panel.sell);
  const goldBeforeSell = game.gold;
  game.handleClick(sellMid.x, sellMid.y);
  const soldTowers = game.towers.length;
  const goldGainOnSell = game.gold - goldBeforeSell;

  // 点击 HUD 空白处不应放置/选中任何东西
  game.handleClick(8, 8);
  const afterHudClick = { placing: game.placing, selected: game.selected };

  const early = ui.hudLayout(game).earlyStart;
  const goldBeforeEarly = game.gold;
  game.handleClick(...Object.values(mid(early.rect)));
  const earlyState = game.wave.state;
  const earlyGain = game.gold - goldBeforeEarly;

  // 失败 → 点重新开始
  game.lives = 0;
  game.update(FIXED_DT);
  const stateAfterLifeZero = game.state;
  const overlay = ui.overlayLayout();
  game.handleClick(...Object.values(mid(overlay.restart)));
  const stateAfterRestart = game.state;
  const goldAfterRestart = game.gold;

  out.clickLoop = {
    enteringPlacing,
    builtCount,
    goldAfterBuild,
    stillPlacing,
    selected,
    levelAfterUpgrade,
    soldTowers,
    goldGainOnSell,
    afterHudClick,
    earlyState,
    earlyGain,
    stateAfterLifeZero,
    stateAfterRestart,
    goldAfterRestart,
    livesAfterRestart: game.lives,
  };
}

/* ------------------------------------------------------------ 造型分面数：塔与敌人应为多面低多边形，而不是单块图形 */

{
  const countFills = (draw) => {
    let fills = 0;
    const store = {};
    const ctx = new Proxy(store, {
      get(target, prop) {
        if (prop in target) return target[prop];
        const fn = () => {
          if (prop === 'fill') fills += 1;
        };
        target[prop] = fn;
        return fn;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
    draw(ctx);
    return fills;
  };

  const game = newGame();
  game.gold = 500;
  game.placing = null;
  game.togglePlacing('arrow');
  game.tryPlace(2, 3);
  game.placing = null;
  game.togglePlacing('frost');
  game.tryPlace(6, 3);
  game.placing = null;
  const [arrow, frost] = game.towers;

  out.models = {
    arrowFacets: countFills((ctx) => ui.drawTower(ctx, arrow, {})),
    arrowFacetsSelected: countFills((ctx) => ui.drawTower(ctx, arrow, { selected: true })),
    frostFacets: countFills((ctx) => ui.drawTower(ctx, frost, {})),
    normalFacets: countFills((ctx) => ui.drawEnemy(ctx, new Enemy('normal', 3))),
    fastFacets: countFills((ctx) => ui.drawEnemy(ctx, new Enemy('fast', 3))),
    slowedFacets: countFills((ctx) => {
      const enemy = new Enemy('normal', 3);
      enemy.applySlow(0.55, 1.5);
      enemy.hitFlash = 0.05;
      ui.drawEnemy(ctx, enemy);
    }),
  };
}

/* ------------------------------------------------------------ 渲染冒烟：用 mock ctx 跑一遍 render，确认没有 DOM 依赖与调用错误 */

function mockCtx() {
  const calls = [];
  const target = {};
  return new Proxy(target, {
    get(store, prop) {
      if (prop in store) return store[prop];
      let fn;
      if (prop === 'measureText') {
        fn = () => ({ width: 12 });
      } else {
        fn = (...args) => {
          calls.push({ prop: String(prop), args });
        };
      }
      store[prop] = fn;
      return fn;
    },
    set(store, prop, value) {
      store[prop] = value;
      return true;
    },
  });
}

{
  const game = new Game();
  game.gold = 400;
  game.togglePlacing('arrow');
  game.tryPlace(2, 3);
  game.togglePlacing('frost');
  game.tryPlace(0, 3);
  game.enemies.push(new Enemy('normal', 1));
  game.enemies.push(new Enemy('fast', 3));
  steps(game, 1.5);

  const ctx = mockCtx();
  const fingerprint = (goldOverride) =>
    JSON.stringify({
      gold: goldOverride === undefined ? game.gold : goldOverride,
      lives: game.lives,
      enemies: game.enemies.length,
      towers: game.towers.length,
      waves: game.wave.waveNumber,
      floats: game.floats.length,
    });

  const before = fingerprint();
  const goldBeforeScenario = game.gold;
  const scenarios = [];
  const runRender = (label) => {
    try {
      game.render(ctx);
      scenarios.push({ label, ok: true });
    } catch (error) {
      scenarios.push({ label, ok: false, error: String(error && error.message) });
    }
  };

  runRender('playing');
  game.selected = game.towers[0];
  runRender('towerSelected');
  game.placing = 'frost';
  game.setPointer(4 * 48 + 20, 56 + 3 * 48 + 20);
  runRender('placingPreview');
  game.placing = 'arrow';
  game.setPointer(6 * 48 + 20, 56 + 2 * 48 + 20); // 第一段路径上的非法格
  runRender('invalidPreview');
  game.cancelModes();
  game.gold = 10; // 触发商店置灰 + 悬停「金币不足」
  game.pointer = { x: 560, y: 28, inside: true };
  runRender('hudDisabled');

  // 渲染前后游戏状态必须完全一致（gold 是脚本主动改的，用原值归一化）
  const afterRender = fingerprint(goldBeforeScenario);
  game.gold = goldBeforeScenario;
  game.state = 'victory';
  runRender('victoryOverlay');
  game.state = 'defeat';
  runRender('defeatOverlay');

  out.renderSmoke = {
    scenarios,
    allOk: scenarios.every((s) => s.ok),
    stateUnchanged: afterRender === before,
  };
}


{
  const game = newGame();
  game.floats.push({ x: 100, y: 100, text: '+12', t: 0, big: false });
  steps(game, 0.5);
  const aliveAt05 = game.floats.length;
  steps(game, 0.2);
  const aliveAt07 = game.floats.length;
  out.floats = { aliveAt05, aliveAt07 };
}

process.stdout.write(JSON.stringify(out, null, 2));
