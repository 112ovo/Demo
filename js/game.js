// 游戏状态机：持有全部实体与数值，负责 update / render 调度、输入处理与胜负判定。
// update() 只改数值；render(ctx) 只绘制。两者互不混杂。

import { CANVAS, ECONOMY, FLOAT_TEXT, GRID, HUD_HEIGHT, TOWER_TYPES } from './data.js';
import { checkBuildable, towerAt, worldToCell } from './map.js';
import { Tower } from './tower.js';
import { WaveManager } from './wave.js';
import * as ui from './ui.js';

export class Game {
  constructor() {
    this.centerX = CANVAS.width / 2;
    this.centerY = (GRID.rows * GRID.cell) / 2;
    this.reset();
  }

  reset() {
    this.gold = ECONOMY.startGold;
    this.lives = ECONOMY.startLives;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.floats = [];
    this.wave = new WaveManager(this);
    this.state = 'playing'; // 'playing' | 'victory' | 'defeat'
    this.placing = null; // 正在放置的塔类型 key
    this.selected = null; // 选中的塔
    this.hoverCell = null;
    this.pointer = { x: -1, y: -1, inside: false };
    this.time = 0;
    this.stats = { kills: 0, leaked: 0 };
  }

  /* ------------------------------------------------------------ 输入 */

  setPointer(x, y) {
    this.pointer = { x, y, inside: true };
    this.hoverCell =
      y >= HUD_HEIGHT ? worldToCell(x, y - HUD_HEIGHT) : null;
  }

  clearPointer() {
    this.pointer = { x: -1, y: -1, inside: false };
    this.hoverCell = null;
  }

  cancelModes() {
    this.placing = null;
    this.selected = null;
  }

  handleClick(x, y) {
    this.setPointer(x, y);

    if (this.state !== 'playing') {
      const layout = ui.overlayLayout();
      if (ui.hitRect(layout.restart, x, y)) this.reset();
      return;
    }

    if (y < HUD_HEIGHT) {
      const layout = ui.hudLayout(this);
      for (const shop of layout.shops) {
        if (ui.hitRect(shop.rect, x, y)) {
          this.togglePlacing(shop.type);
          return;
        }
      }
      if (layout.earlyStart && ui.hitRect(layout.earlyStart.rect, x, y)) {
        this.wave.startEarly();
      }
      return;
    }

    if (this.selected) {
      const panel = ui.panelLayout(this.selected);
      if (ui.hitRect(panel.upgrade, x, y)) {
        this.upgradeSelected();
        return;
      }
      if (ui.hitRect(panel.sell, x, y)) {
        this.sellSelected();
        return;
      }
      if (ui.hitRect(panel.rect, x, y)) return;
    }

    const cell = worldToCell(x, y - HUD_HEIGHT);

    if (this.placing) {
      this.tryPlace(cell.col, cell.row);
      return;
    }

    this.selected = towerAt(this.towers, cell.col, cell.row);
  }

  /* ------------------------------------------------------------ 建造 / 升级 / 出售 */

  togglePlacing(type) {
    const def = TOWER_TYPES[type];
    if (!def) return;
    if (this.placing === type) {
      this.placing = null;
      return;
    }
    if (this.gold < def.price) return; // 金币不足，按钮置灰，点击无效
    this.placing = type;
    this.selected = null;
  }

  /** 放置合法性：地图内 / 非路径 / 无塔 / 金币足够 */
  checkPlacement(col, row) {
    const base = checkBuildable(this.towers, col, row);
    if (!base.ok) return base;
    const def = TOWER_TYPES[this.placing];
    if (!def) return { ok: false, reason: '' };
    if (this.gold < def.price) return { ok: false, reason: '金币不足' };
    return { ok: true, reason: '' };
  }

  tryPlace(col, row) {
    const check = this.checkPlacement(col, row);
    if (!check.ok) return false;
    const def = TOWER_TYPES[this.placing];
    this.gold -= def.price;
    this.towers.push(new Tower(this.placing, col, row));
    if (this.gold < def.price) this.placing = null;
    return true;
  }

  upgradeSelected() {
    const tower = this.selected;
    if (!tower) return false;
    const cost = tower.getUpgradeCost();
    if (cost === null || this.gold < cost) return false;
    this.gold -= cost;
    tower.upgrade();
    return true;
  }

  sellSelected() {
    const tower = this.selected;
    if (!tower) return false;
    this.gold += tower.getSellValue();
    this.towers = this.towers.filter((t) => t !== tower);
    this.selected = null;
    return true;
  }

  /* ------------------------------------------------------------ 更新 */

  update(dt) {
    this.time += dt;
    this.updateFloats(dt);

    if (this.state !== 'playing') return;

    this.wave.update(dt);

    for (const enemy of this.enemies) {
      enemy.update(dt);
      if (enemy.escaped) {
        this.lives -= 1;
        this.stats.leaked += 1;
      }
    }

    for (const tower of this.towers) tower.update(dt, this);
    for (const projectile of this.projectiles) projectile.update(dt);

    this.collectDeadEnemies();

    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.enemies = this.enemies.filter((e) => !e.escaped && !(e.dead && e.rewarded));

    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'defeat';
    }
  }

  updateFloats(dt) {
    for (const item of this.floats) item.t += dt;
    this.floats = this.floats.filter((item) => item.t < FLOAT_TEXT.life);
  }

  collectDeadEnemies() {
    for (const enemy of this.enemies) {
      if (!enemy.dead || enemy.rewarded) continue;
      enemy.rewarded = true;
      this.gold += enemy.bounty;
      this.stats.kills += 1;
      const pos = enemy.getPosition();
      this.floats.push({ x: pos.x, y: pos.y, text: `+${enemy.bounty}`, t: 0, big: false });
    }
  }

  /* ------------------------------------------------------------ 渲染 */

  render(ctx) {
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);

    ctx.save();
    ctx.translate(0, HUD_HEIGHT);
    ui.drawMap(ctx);

    const hoveredTower =
      !this.placing && this.hoverCell
        ? towerAt(this.towers, this.hoverCell.col, this.hoverCell.row)
        : null;

    // 塔按 y 排序，靠下（更近）的后绘制，形成前后遮挡关系
    const ordered = [...this.towers].sort((a, b) => a.y - b.y);
    for (const tower of ordered) {
      ui.drawTower(ctx, tower, {
        selected: tower === this.selected,
        hovered: tower === hoveredTower,
      });
    }
    // 敌人始终绘制在塔之上，避免被高模型挡住看不清
    for (const enemy of this.enemies) ui.drawEnemy(ctx, enemy);
    for (const projectile of this.projectiles) ui.drawProjectile(ctx, projectile);

    ui.drawFloats(ctx, this.floats);
    ui.drawPlacement(ctx, this);
    ui.drawPanel(ctx, this);
    ctx.restore();

    ui.drawHud(ctx, this);
    if (this.state !== 'playing') ui.drawOverlay(ctx, this);
  }
}
