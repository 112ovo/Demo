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

  // 冰塔脉冲圆环
  for (const pulse of tower.pulses) {
    const p = Math.min(1, pulse.t / def.pulseDuration);
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, 14 + (tower.getRange() - 14) * p, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(57, 183, 216, ${0.55 * (1 - p)})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 底座
  roundRect(ctx, tower.x - 17, tower.y - 17, 34, 34, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = selected ? '#2f6fed' : '#c8d2e0';
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.stroke();

  const offset = tower.recoil * 2;
  if (def.attack === 'projectile') {
    ctx.save();
    ctx.translate(tower.x - Math.cos(tower.angle) * offset, tower.y - Math.sin(tower.angle) * offset);
    ctx.rotate(tower.angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 9);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(tower.x, tower.y - offset, 11, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tower.x, tower.y - offset, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#eafaff';
    ctx.fill();
  }

  // 等级点：底座上方三个点，亮起数量 = 等级
  for (let i = 0; i < tower.maxLevel; i += 1) {
    ctx.beginPath();
    ctx.arc(tower.x + (i - 1) * 7, tower.y - 23, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = i < tower.level ? def.color : '#dde4ee';
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
  ctx.fillStyle = ok ? 'rgba(47, 158, 99, 0.35)' : 'rgba(214, 69, 69, 0.35)';
  ctx.fillRect(cell.col * CELL + 2, cell.row * CELL + 2, CELL - 4, CELL - 4);
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

  if (enemy.slowed) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, enemy.radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(57, 183, 216, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  if (def.shape === 'triangle') {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(enemy.angle);
    ctx.moveTo(enemy.radius + 2, 0);
    ctx.lineTo(-enemy.radius, enemy.radius - 2);
    ctx.lineTo(-enemy.radius, -enemy.radius + 2);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();
    if (enemy.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.arc(pos.x, pos.y, enemy.radius, 0, Math.PI * 2);
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : def.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = enemy.hitFlash > 0 ? '#ffffff' : 'rgba(0, 0, 0, 0.12)';
    ctx.stroke();
  }

  // 血条
  const w = 28;
  const h = 4;
  const x = pos.x - w / 2;
  const y = pos.y - enemy.radius - 10;
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

    ctx.font = font(12.5, 700);
    ctx.fillStyle = shop.affordable ? '#ffffff' : C.shopDisabledText;
    ctx.textAlign = 'center';
    ctx.fillText(`${shop.name} ${shop.price}`, rect.x + rect.w / 2, rect.y + 22);
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
