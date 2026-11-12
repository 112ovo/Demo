// UI 与绘制层：地图、塔、敌人、投射物、浮字、HUD、塔面板、放置预览、胜负遮罩。
// 本模块只负责「画」与「算出可点击的矩形」，不修改游戏状态。

import { CANVAS, FLOAT_TEXT, GRID, HUD_HEIGHT, TOWER_TYPES } from './data.js';
import { CELL, PATH } from './map.js';

const UI_FONT = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';

const C = {
  bg: '#eef2f7',
  grid: '#dfe6ef',
  gridStrong: '#d2dbe7',
  pathOuter: '#c2cddd',
  pathInner: '#d7dfe9',
  pathDash: '#9fb0c4',
  panel: '#ffffff',
  panelBorder: '#d7dfe9',
  text: '#1f2937',
  textWeak: '#7b8798',
  gold: '#b57d05',
  lives: '#d64545',
  ok: '#2f9e63',
  bad: '#d64545',
  shopDisabled: '#cbd4e0',
  shopDisabledText: '#8f9bab',
};

const HUD_LAYOUT = {
  blocks: [
    { key: 'lives', x: 18, label: '生命' },
    { key: 'gold', x: 92, label: '金币' },
    { key: 'wave', x: 186, label: '波次' },
    { key: 'timer', x: 268, label: '下一波' },
  ],
  earlyStart: { x: 398, y: 11, w: 106, h: 34 },
  shops: [
    { type: 'arrow', x: 516, y: 11, w: 112, h: 34 },
    { type: 'frost', x: 636, y: 11, w: 112, h: 34 },
  ],
};

function font(size, weight = 500) {
  return `${weight} ${size}px ${UI_FONT}`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function hitRect(rect, x, y) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/* ---------------------------------------------------------------- 布局 */

export function hudLayout(game) {
  const shops = HUD_LAYOUT.shops.map((item) => {
    const def = TOWER_TYPES[item.type];
    return {
      type: item.type,
      rect: { x: item.x, y: item.y, w: item.w, h: item.h },
      price: def.price,
      name: def.name,
      affordable: game.gold >= def.price,
      active: game.placing === item.type,
    };
  });
  const earlyStart =
    game.state === 'playing' && game.wave.isPrepping
      ? {
          rect: { ...HUD_LAYOUT.earlyStart },
          bonus: game.wave.pendingEarlyBonus,
        }
      : null;
  return { shops, earlyStart };
}

export function panelLayout(tower) {
  const w = 216;
  const h = 150;
  let x = tower.x + 28;
  let y = tower.y - h / 2;
  x = Math.min(Math.max(8, x), CANVAS.width - w - 8);
  y = Math.min(Math.max(8, y), GRID.rows * CELL - h - 8);
  return {
    rect: { x, y, w, h },
    upgrade: { x: x + 12, y: y + 106, w: 92, h: 30 },
    sell: { x: x + 112, y: y + 106, w: 92, h: 30 },
  };
}

export function overlayLayout() {
  const w = 420;
  const h = 212;
  const x = (CANVAS.width - w) / 2;
  const y = HUD_HEIGHT + (CANVAS.height - HUD_HEIGHT - h) / 2;
  return {
    card: { x, y, w, h },
    restart: { x: x + (w - 160) / 2, y: y + h - 60, w: 160, h: 38 },
  };
}

/* ---------------------------------------------------------------- 地图 */

export function drawMap(ctx) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CANVAS.width, GRID.rows * CELL);

  // 网格
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < GRID.cols; c += 1) {
    ctx.moveTo(c * CELL + 0.5, 0);
    ctx.lineTo(c * CELL + 0.5, GRID.rows * CELL);
  }
  for (let r = 1; r < GRID.rows; r += 1) {
    ctx.moveTo(0, r * CELL + 0.5);
    ctx.lineTo(CANVAS.width, r * CELL + 0.5);
  }
  ctx.stroke();

  // 路径：外层加内层，形成干净的道路
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  for (let i = 1; i < PATH.length; i += 1) ctx.lineTo(PATH[i].x, PATH[i].y);
  ctx.strokeStyle = C.pathOuter;
  ctx.lineWidth = 36;
  ctx.stroke();
  ctx.strokeStyle = C.pathInner;
  ctx.lineWidth = 30;
  ctx.stroke();

  // 路径中线（虚线，指示行进方向）
  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = C.pathDash;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // 终点标记
  const end = PATH[PATH.length - 1];
  ctx.strokeStyle = C.pathDash;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(end.x - 6, end.y - 14);
  ctx.lineTo(end.x - 6, end.y + 14);
  ctx.stroke();
}

/* ---------------------------------------------------------------- 塔 */

/* ---------------------------------------------------------------- 低多边形造型工具 */
// 参考图的建模是 low-poly 硬表面：靠「顶面亮、正面中、侧面暗」三档色阶 + 多边形分面
// 在纯 Canvas 下伪造体积感。所有造型都从「脚下的地面点」(0,0) 向上生长。

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function fillEllipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function fillRoundRect(ctx, x, y, w, h, r, fill) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

const STONE = { light: '#b3bcc9', mid: '#95a0af', dark: '#76818f' };

/** 箭塔：石台基 + 蓝色桁架塔身 + 城垛平台 + 旗帜 */
function drawArrowModel(ctx, def) {
  const c = def.color;
  const light = shade(c, 0.3);
  const mid = c;
  const dark = shade(c, -0.34);

  // 台基
  polygon(ctx, [[-14, -7], [14, -7], [11.5, -11], [-11.5, -11]], STONE.light);
  ctx.fillStyle = STONE.mid;
  ctx.fillRect(-14, -7, 28, 7);
  ctx.fillStyle = STONE.dark;
  ctx.fillRect(10.5, -7, 3.5, 7);

  // 塔身：暗的内腔 + 两根立柱 + 亮色交叉斜撑
  polygon(ctx, [[-10, -11], [10, -11], [7.5, -33], [-7.5, -33]], dark);
  polygon(ctx, [[-10, -11], [-6.4, -11], [-5, -33], [-7.5, -33]], mid);
  polygon(ctx, [[6.4, -11], [10, -11], [7.5, -33], [5, -33]], shade(c, -0.16));

  ctx.strokeStyle = light;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-7.6, -13.5);
  ctx.lineTo(6.2, -20.5);
  ctx.moveTo(7.6, -13.5);
  ctx.lineTo(-6.2, -20.5);
  ctx.moveTo(-6.9, -22.5);
  ctx.lineTo(5.7, -29.5);
  ctx.moveTo(6.9, -22.5);
  ctx.lineTo(-5.7, -29.5);
  ctx.moveTo(-5.9, -31);
  ctx.lineTo(4.7, -33);
  ctx.moveTo(5.9, -31);
  ctx.lineTo(-4.7, -33);
  ctx.stroke();

  // 平台 + 城垛
  polygon(ctx, [[-8.6, -33], [8.6, -33], [9.6, -37], [-9.6, -37]], mid);
  polygon(ctx, [[-9.6, -37], [9.6, -37], [8.6, -39.6], [-8.6, -39.6]], light);
  ctx.fillStyle = light;
  for (const x of [-9.2, -3.4, 2.4, 7.8]) ctx.fillRect(x, -43.4, 3.4, 4);

  // 旗杆与旗
  ctx.strokeStyle = '#5c6573';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -43.4);
  ctx.lineTo(0, -50.4);
  ctx.stroke();
  polygon(ctx, [[0.8, -50], [11, -46.4], [0.8, -42.8]], shade(c, -0.12));
}

/** 冰塔：冷色台基 + 三段收分塔身（每段带出檐）+ 冰冠尖角与中央冰锥 */
function drawFrostModel(ctx, def) {
  const ice = '#eafbfe';
  const light = shade(def.color, 0.6);
  const mid = shade(def.color, 0.24);
  const dark = shade(def.color, -0.02);

  // 台基
  polygon(ctx, [[-15, -6], [15, -6], [12.5, -10], [-12.5, -10]], light);
  ctx.fillStyle = mid;
  ctx.fillRect(-15, -6, 30, 6);
  ctx.fillStyle = dark;
  ctx.fillRect(11.6, -6, 3.4, 6);

  // 三段塔身：每段上宽下窄并带出檐，形成「层叠鼓形」轮廓
  const tiers = [
    [-10, -16.8, 11.6, 12.4],
    [-16.8, -23, 10.9, 11.7],
    [-23, -28.4, 10.2, 11],
  ];
  for (const [y1, y2, bottom, top] of tiers) {
    polygon(ctx, [[-bottom, y1], [bottom, y1], [top, y2], [-top, y2]], mid);
    polygon(
      ctx,
      [[bottom - 2.6, y1], [bottom, y1], [top, y2], [top - 2, y2]],
      dark
    );
    polygon(
      ctx,
      [[-top, y2], [top, y2], [top - 1.2, y2 - 1.4], [-top + 1.2, y2 - 1.4]],
      shade(def.color, 0.42)
    );
    ctx.fillStyle = light;
    ctx.fillRect(-top - 0.4, y2 - 1.7, (top + 0.4) * 2, 1.7);
  }

  // 冰冠：四角尖冰 + 中央冰锥
  const iceDark = '#c9eaf4';
  for (const [x, h, half] of [
    [-7.4, 5.6, 2.6],
    [-3.9, 7.4, 2.8],
    [3.9, 7.4, 2.8],
    [7.4, 5.6, 2.6],
  ]) {
    polygon(ctx, [[x - half, -28.8], [x + half, -28.8], [x, -28.8 - h]], ice);
    polygon(ctx, [[x, -28.8 - h], [x + half, -28.8], [x, -28.8]], iceDark);
  }
  polygon(ctx, [[-3.4, -28.8], [3.4, -28.8], [0, -41]], ice);
  polygon(ctx, [[0, -41], [3.4, -28.8], [0, -28.8]], iceDark);
}

/** 普通兵：圆胖红色机身 + 深色面罩 + 短腿短手 */
function drawNormalModel(ctx, def) {
  const c = def.color;
  const light = shade(c, 0.24);
  const mid = c;
  const dark = shade(c, -0.32);

  // 腿
  fillRoundRect(ctx, -7.2, -8, 5.6, 8, 2.2, dark);
  fillRoundRect(ctx, 1.6, -8, 5.6, 8, 2.2, dark);

  // 手臂
  fillRoundRect(ctx, -14.4, -18, 5, 10, 2.4, dark);
  fillRoundRect(ctx, 9.4, -18, 5, 10, 2.4, dark);

  // 身体：主色 + 左上高光 + 右下暗面，模拟硬表面分面
  fillEllipse(ctx, 0, -15, 10.6, 11.2, mid);
  ctx.globalAlpha = 0.55;
  fillEllipse(ctx, -3.2, -18, 6.6, 7.2, light);
  ctx.globalAlpha = 0.4;
  fillEllipse(ctx, 4.4, -13.5, 6, 8.6, dark);
  ctx.globalAlpha = 1;

  // 面罩与眼睛
  fillRoundRect(ctx, -7.6, -20.4, 15.2, 5.6, 2.6, '#2b2b33');
  ctx.fillStyle = '#f4f7fa';
  ctx.fillRect(-4.8, -18.6, 2.5, 2.5);
  ctx.fillRect(1.6, -18.6, 2.5, 2.5);
}

/** 快速兵：橙色金字塔头 + 锥形身体 + 深色拳套 */
function drawFastModel(ctx, def) {
  const c = def.color;
  const light = shade(c, 0.16);
  const mid = c;
  const dark = shade(c, -0.26);
  const fist = '#4c515b';

  // 腿
  fillRoundRect(ctx, -5.8, -6.5, 4.4, 6.5, 2, dark);
  fillRoundRect(ctx, 1.4, -6.5, 4.4, 6.5, 2, dark);

  // 拳套
  fillEllipse(ctx, -9.4, -11.5, 3.8, 3.8, fist);
  fillEllipse(ctx, 9.4, -11.5, 3.8, 3.8, fist);

  // 身体
  polygon(ctx, [[-6.8, -12], [6.8, -12], [5, -5], [-5, -5]], mid);
  polygon(ctx, [[-6.8, -12], [-2.4, -12], [-2, -5], [-5, -5]], light);

  // 金字塔头：左亮面 / 中面 / 右暗面
  polygon(ctx, [[0, -28], [-8.6, -12], [0, -12]], light);
  polygon(ctx, [[0, -28], [8.6, -12], [0, -12]], dark);
  polygon(ctx, [[0, -28], [-5, -12], [5, -12]], mid);

  // 面罩与眼睛
  fillRoundRect(ctx, -4.8, -19.6, 9.6, 4.2, 2, '#2b2b33');
  ctx.fillStyle = '#f4f7fa';
  ctx.fillRect(-3, -18.6, 2.2, 2.2);
  ctx.fillRect(1, -18.6, 2.2, 2.2);
}

export function drawRange(ctx, x, y, range, color) {
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(47, 111, 237, 0.06)';
  ctx.fill();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawTower(ctx, tower, options = {}) {
  const def = tower.def;
  const { selected = false, hovered = false } = options;

  if (selected || hovered) {
    drawRange(ctx, tower.x, tower.y, tower.getRange(), 'rgba(47, 111, 237, 0.55)');
  }

  // 冰塔脉冲：贴地扩散的圆环
  for (const pulse of tower.pulses) {
    const p = Math.min(1, pulse.t / def.pulseDuration);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, 14 + (tower.getRange() - 14) * p, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(57, 183, 216, ${0.55 * (1 - p)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 地面阴影 + 选中脚环
  fillEllipse(ctx, tower.x, tower.y + 1.5, 15, 4.8, 'rgba(15, 23, 42, 0.13)');
  if (selected) {
    ctx.beginPath();
    ctx.ellipse(tower.x, tower.y + 1.5, 17, 6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(tower.x, tower.y + tower.recoil * 1.4);
  if (def.attack === 'projectile') drawArrowModel(ctx, def);
  else drawFrostModel(ctx, def);
  ctx.restore();

  // 等级点：脚下三个点，亮起数量 = 等级
  for (let i = 0; i < tower.maxLevel; i += 1) {
    ctx.beginPath();
    ctx.arc(tower.x + (i - 1) * 6, tower.y + 12, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = i < tower.level ? def.color : '#d5dde8';
    ctx.fill();
  }
}

export function drawPlacement(ctx, game) {
  if (!game.placing) return;
  const def = TOWER_TYPES[game.placing];
  const cell = game.hoverCell;
  if (!cell) return;

  const cx = (cell.col + 0.5) * CELL;
  const cy = (cell.row + 0.5) * CELL;
  drawRange(ctx, cx, cy, (def.range + 0) * CELL, 'rgba(47, 111, 237, 0.5)');

  const ok = game.checkPlacement(cell.col, cell.row).ok;
  ctx.fillStyle = ok ? 'rgba(47, 158, 99, 0.18)' : 'rgba(214, 69, 69, 0.22)';
  ctx.fillRect(cell.col * CELL + 2, cell.row * CELL + 2, CELL - 4, CELL - 4);

  // 半透明模型预览
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.translate(cx, cy);
  if (def.attack === 'projectile') drawArrowModel(ctx, def);
  else drawFrostModel(ctx, def);
  ctx.restore();

  ctx.strokeStyle = ok ? 'rgba(47, 158, 99, 0.9)' : 'rgba(214, 69, 69, 0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cell.col * CELL + 2, cell.row * CELL + 2, CELL - 4, CELL - 4);

  if (!ok) {
    const reason = game.checkPlacement(cell.col, cell.row).reason;
    ctx.font = font(12, 600);
    const pillW = ctx.measureText(reason).width + 18;
    const pillH = 21;
    const pillX = Math.min(
      Math.max(4, cx - pillW / 2),
      CANVAS.width - pillW - 4
    );
    let pillY = cell.row * CELL + CELL + 4;
    if (pillY + pillH > GRID.rows * CELL - 4) pillY = cell.row * CELL - pillH - 4;

    roundRect(ctx, pillX, pillY, pillW, pillH, 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 69, 69, 0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#c93f3f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(reason, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

/* ---------------------------------------------------------------- 敌人 */

export function drawEnemy(ctx, enemy) {
  const pos = enemy.getPosition();
  const def = enemy.def;
  const fast = def.shape === 'triangle';

  // 地面阴影
  fillEllipse(ctx, pos.x, pos.y + 1, 10.5, 4.2, 'rgba(15, 23, 42, 0.14)');

  // 减速：贴地冷色环
  if (enemy.slowed) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 1, 12.5, 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(57, 183, 216, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(pos.x, pos.y);
  if (fast) drawFastModel(ctx, def);
  else drawNormalModel(ctx, def);

  // 命中闪白：按整体轮廓盖一层白，持续 0.08s
  if (enemy.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, enemy.hitFlash / 0.08) * 0.72;
    if (fast) polygon(ctx, [[0, -28], [9, -4], [-9, -4]], '#ffffff');
    else fillEllipse(ctx, 0, -15, 11, 12.5, '#ffffff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 血条
  const w = 28;
  const h = 4;
  const x = pos.x - w / 2;
  const y = pos.y - (fast ? 33 : 31);
  const ratio = Math.max(0, enemy.hp / enemy.maxHp);
  ctx.fillStyle = 'rgba(31, 41, 55, 0.22)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ratio > 0.35 ? '#4caf50' : '#e8913a';
  ctx.fillRect(x, y, w * ratio, h);
}

/* ---------------------------------------------------------------- 其它世界层 */

export function drawProjectile(ctx, projectile) {
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2f6fed';
  ctx.fill();
}

export function drawFloats(ctx, floats) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const item of floats) {
    const p = Math.min(1, item.t / FLOAT_TEXT.life);
    ctx.globalAlpha = 1 - p;
    ctx.font = font(item.big ? 16 : 14, 700);
    ctx.fillStyle = item.big ? '#2f6fed' : C.gold;
    ctx.fillText(item.text, item.x, item.y - 18 * p);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ---------------------------------------------------------------- 塔面板 */

export function drawPanel(ctx, game) {
  const tower = game.selected;
  if (!tower) return;
  const layout = panelLayout(tower);
  const { rect } = layout;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  roundRect(ctx, rect.x + 2, rect.y + 4, rect.w, rect.h, 10);
  ctx.fill();

  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = C.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = tower.def.color;
  ctx.beginPath();
  ctx.arc(rect.x + 18, rect.y + 21, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = font(14, 700);
  ctx.fillStyle = C.text;
  ctx.fillText(`${tower.name}  Lv.${tower.level}`, rect.x + 30, rect.y + 26);

  ctx.font = font(12, 500);
  ctx.fillStyle = C.textWeak;
  ctx.fillText(`${tower.def.role} · 攻速 ${tower.def.interval.toFixed(1)}s`, rect.x + 30, rect.y + 44);

  const nextLevel = Math.min(tower.level + 1, tower.maxLevel);
  const curDamage = Math.round(tower.getDamage());
  const nextDamage = Math.round(tower.getDamageAtLevel(nextLevel));
  const curRange = (tower.getRangeAtLevel(tower.level) / CELL).toFixed(1);
  const nextRange = (tower.getRangeAtLevel(nextLevel) / CELL).toFixed(1);

  ctx.font = font(12, 600);
  ctx.fillStyle = C.text;
  if (tower.level < tower.maxLevel) {
    ctx.fillText(`伤害 ${curDamage} → ${nextDamage}`, rect.x + 14, rect.y + 68);
    ctx.fillText(`射程 ${curRange} → ${nextRange} 格`, rect.x + 14, rect.y + 88);
  } else {
    ctx.fillStyle = C.textWeak;
    ctx.fillText('伤害 / 射程 已满级', rect.x + 14, rect.y + 68);
    if (tower.type === 'frost') {
      ctx.fillText(`减速 ×${tower.def.slowFactor}`, rect.x + 14, rect.y + 88);
    }
  }

  // 升级按钮
  const cost = tower.getUpgradeCost();
  const up = layout.upgrade;
  const canUpgrade = cost !== null && game.gold >= cost;
  roundRect(ctx, up.x, up.y, up.w, up.h, 8);
  ctx.fillStyle = cost === null ? '#e7ecf3' : canUpgrade ? C.ok : C.shopDisabled;
  ctx.fill();
  ctx.font = font(12.5, 700);
  ctx.fillStyle = cost === null ? C.textWeak : canUpgrade ? '#ffffff' : C.shopDisabledText;
  ctx.textAlign = 'center';
  ctx.fillText(cost === null ? '已满级' : `升级 ${cost}`, up.x + up.w / 2, up.y + 20);
  ctx.textAlign = 'left';

  // 出售按钮
  const sell = layout.sell;
  roundRect(ctx, sell.x, sell.y, sell.w, sell.h, 8);
  ctx.fillStyle = '#f4f6fa';
  ctx.fill();
  ctx.strokeStyle = C.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = font(12.5, 700);
  ctx.fillStyle = C.textWeak;
  ctx.textAlign = 'center';
  ctx.fillText(`出售 +${tower.getSellValue()}`, sell.x + sell.w / 2, sell.y + 20);
  ctx.textAlign = 'left';
}

/* ---------------------------------------------------------------- HUD */

function hudValues(game) {
  const wave = game.wave;
  const valueFor = {
    lives: String(game.lives),
    gold: String(game.gold),
    wave: `${Math.max(1, wave.waveNumber)}/${wave.totalWaves}`,
  };
  if (wave.state === 'active') {
    return { ...valueFor, timer: `剩 ${game.enemies.length}`, timerLabel: '本波剩余' };
  }
  if (wave.state === 'finished') {
    return { ...valueFor, timer: '—', timerLabel: '全部结束' };
  }
  return { ...valueFor, timer: `${wave.prepTimer.toFixed(1)}s`, timerLabel: '下一波' };
}

export function drawHud(ctx, game) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS.width, HUD_HEIGHT);
  ctx.fillStyle = C.gridStrong;
  ctx.fillRect(0, HUD_HEIGHT - 1, CANVAS.width, 1);

  const values = hudValues(game);
  const colors = { lives: C.lives, gold: C.gold, wave: C.text, timer: C.text };

  for (const block of HUD_LAYOUT.blocks) {
    const label = block.key === 'timer' ? values.timerLabel : block.label;
    ctx.font = font(11, 500);
    ctx.fillStyle = C.textWeak;
    ctx.fillText(label, block.x, 24);
    ctx.font = font(18, 700);
    ctx.fillStyle = colors[block.key];
    ctx.fillText(values[block.key], block.x, 45);
  }

  const layout = hudLayout(game);

  if (layout.earlyStart) {
    const r = layout.earlyStart.rect;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fillStyle = '#2f9e63';
    ctx.fill();
    ctx.font = font(12.5, 700);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`提前开始 +${layout.earlyStart.bonus}`, r.x + r.w / 2, r.y + 22);
    ctx.textAlign = 'left';
  }

  for (const shop of layout.shops) {
    const { rect } = shop;
    const hovered = hitRect(rect, game.pointer.x, game.pointer.y);
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    if (!shop.affordable) {
      ctx.fillStyle = C.shopDisabled;
    } else {
      ctx.fillStyle = TOWER_TYPES[shop.type].color;
      ctx.globalAlpha = shop.active ? 1 : hovered ? 0.88 : 1;
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    if (shop.active) {
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      roundRect(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 7);
      ctx.stroke();
    }

    // 模型小图标（白底圆片，避免和按钮同色糊在一起）
    ctx.beginPath();
    ctx.arc(rect.x + 22, rect.y + rect.h / 2, 12.5, 0, Math.PI * 2);
    ctx.fillStyle = shop.affordable ? 'rgba(255, 255, 255, 0.94)' : '#eef2f7';
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = shop.affordable ? 1 : 0.55;
    ctx.translate(rect.x + 22, rect.y + rect.h / 2 + 9);
    ctx.scale(0.4, 0.4);
    if (shop.type === 'arrow') drawArrowModel(ctx, TOWER_TYPES.arrow);
    else drawFrostModel(ctx, TOWER_TYPES.frost);
    ctx.restore();

    ctx.font = font(12.5, 700);
    ctx.fillStyle = shop.affordable ? '#ffffff' : C.shopDisabledText;
    ctx.textAlign = 'center';
    ctx.fillText(`${shop.name} ${shop.price}`, rect.x + 70, rect.y + 22);
    ctx.textAlign = 'left';

    // 金币不足提示
    if (!shop.affordable && hovered) {
      const tipW = 84;
      const tipH = 24;
      const tx = Math.min(rect.x + rect.w - tipW, CANVAS.width - tipW - 6);
      const ty = HUD_HEIGHT + 6;
      roundRect(ctx, tx, ty, tipW, tipH, 6);
      ctx.fillStyle = 'rgba(31, 41, 55, 0.92)';
      ctx.fill();
      ctx.font = font(12, 600);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('金币不足', tx + tipW / 2, ty + 16);
      ctx.textAlign = 'left';
    }
  }

  // 放置模式提示（左下角常驻徽标，避免压住路径）
  if (game.placing) {
    const text = '左键建造 · Esc / 右键取消';
    ctx.font = font(12, 600);
    const w = ctx.measureText(text).width + 24;
    const x = 12;
    const y = CANVAS.height - 42;
    roundRect(ctx, x, y, w, 28, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(47, 111, 237, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#2f6fed';
    ctx.fillText(text, x + 12, y + 19);
  }
}

/* ---------------------------------------------------------------- 胜负遮罩 */

export function drawOverlay(ctx, game) {
  const win = game.state === 'victory';
  // 只压暗地图区域，顶部 HUD 保持可见
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.fillRect(0, HUD_HEIGHT, CANVAS.width, CANVAS.height - HUD_HEIGHT);

  const layout = overlayLayout();
  const { card } = layout;

  roundRect(ctx, card.x, card.y, card.w, card.h, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = font(28, 800);
  ctx.fillStyle = win ? C.ok : C.bad;
  ctx.fillText(win ? '胜利' : '失败', card.x + card.w / 2, card.y + 54);

  ctx.font = font(13, 500);
  ctx.fillStyle = C.textWeak;
  const waveText = `${game.wave.waveNumber}/${game.wave.totalWaves}`;
  ctx.fillText(
    win
      ? `${game.wave.totalWaves} 波敌军全部清空，防线守住了`
      : `坚持到第 ${waveText} 波，生命耗尽`,
    card.x + card.w / 2,
    card.y + 84
  );
  ctx.fillText(
    `击杀 ${game.stats.kills}  ·  漏怪 ${game.stats.leaked}`,
    card.x + card.w / 2,
    card.y + 110
  );

  const r = layout.restart;
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = win ? C.ok : C.bad;
  ctx.fill();
  ctx.font = font(14, 700);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('重新开始', r.x + r.w / 2, r.y + 25);
  ctx.textAlign = 'left';
}
