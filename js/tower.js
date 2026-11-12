// 塔：创建、升级、出售、攻击。
// 箭塔对射程内最靠前的敌人发投射物；冰塔以自身为中心做范围脉冲并减速。
// update() 只改数值，不碰 canvas。

import { ECONOMY, TOWER_TYPES } from './data.js';
import { CELL, cellCenter } from './map.js';
import { Projectile } from './projectile.js';

export class Tower {
  constructor(typeKey, col, row) {
    const def = TOWER_TYPES[typeKey];
    if (!def) throw new Error(`未知塔类型: ${typeKey}`);
    this.type = typeKey;
    this.def = def;
    this.col = col;
    this.row = row;

    const center = cellCenter(col, row);
    this.x = center.x;
    this.y = center.y;

    this.level = 1;
    this.invested = def.price;
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.pulses = []; // 冰塔脉冲圆环动画 { t }
    this.recoil = 0; // 箭塔开火时的后坐动画 0..1
  }

  get name() {
    return this.def.name;
  }

  get maxLevel() {
    return this.def.maxLevel;
  }

  getRange() {
    return this.getRangeAtLevel(this.level);
  }

  getRangeAtLevel(level) {
    return (this.def.range + this.def.rangePerLevel * (level - 1)) * CELL;
  }

  getDamage() {
    return this.getDamageAtLevel(this.level);
  }

  getDamageAtLevel(level) {
    return this.def.damage * this.def.damagePerLevel ** (level - 1);
  }

  getUpgradeCost() {
    if (this.level >= this.def.maxLevel) return null;
    return this.def.upgradeCosts[this.level - 1];
  }

  getSellValue() {
    return Math.floor(this.invested * ECONOMY.sellRefundRate);
  }

  /** 由调用方先扣金币，再调用本方法升级 */
  upgrade() {
    if (this.level >= this.def.maxLevel) return false;
    this.invested += this.def.upgradeCosts[this.level - 1];
    this.level += 1;
    return true;
  }

  /** 射程内最靠前（走得最远）的敌人 */
  findTarget(enemies) {
    const range = this.getRange();
    let best = null;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const pos = enemy.getPosition();
      const dist = Math.hypot(pos.x - this.x, pos.y - this.y);
      if (dist > range + enemy.radius) continue;
      if (!best || enemy.distanceTravelled > best.distanceTravelled) best = enemy;
    }
    return best;
  }

  update(dt, game) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 4);

    for (const pulse of this.pulses) pulse.t += dt;
    if (this.pulses.length) {
      this.pulses = this.pulses.filter((p) => p.t < this.def.pulseDuration);
    }

    if (this.cooldown > 0) return;

    if (this.def.attack === 'projectile') {
      const target = this.findTarget(game.enemies);
      if (!target) return;
      const pos = target.getPosition();
      this.angle = Math.atan2(pos.y - this.y, pos.x - this.x);
      game.projectiles.push(new Projectile(this.x, this.y, target, this.getDamage()));
      this.cooldown = this.def.interval;
      this.recoil = 1;
      return;
    }

    // 冰塔：范围脉冲，一次性结算范围内所有敌人
    const range = this.getRange();
    const inRange = [];
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const pos = enemy.getPosition();
      if (Math.hypot(pos.x - this.x, pos.y - this.y) <= range + enemy.radius) {
        inRange.push(enemy);
      }
    }
    if (inRange.length === 0) return;
    for (const enemy of inRange) {
      enemy.takeDamage(this.getDamage());
      enemy.applySlow(this.def.slowFactor, this.def.slowDuration);
    }
    this.pulses.push({ t: 0 });
    this.cooldown = this.def.interval;
  }
}
