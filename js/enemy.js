// 敌人：沿固定路径插值移动、受伤、减速、漏怪标记。
// update() 只改数值，不碰 canvas。

import { ENEMY_HP_SCALE_PER_WAVE, ENEMY_TYPES, GRID } from './data.js';
import { PATH, SEGMENT_LENGTHS } from './map.js';

export class Enemy {
  constructor(typeKey, waveNumber = 1) {
    const def = ENEMY_TYPES[typeKey];
    if (!def) throw new Error(`未知敌人类型: ${typeKey}`);
    this.type = typeKey;
    this.def = def;
    this.waveNumber = waveNumber;

    // 血量随波次缩放，速度与赏金不缩放
    this.maxHp = Math.round(def.hp * (1 + ENEMY_HP_SCALE_PER_WAVE * (waveNumber - 1)));
    this.hp = this.maxHp;
    this.baseSpeed = def.speed; // 格/秒
    this.bounty = def.bounty;
    this.radius = def.radius;

    // 路径推进：当前目标节点索引 + 该段上的进度 0..1
    this.targetIndex = 1;
    this.progress = 0;
    this.distanceTravelled = 0;
    this.angle = 0;

    this.slowTimer = 0;
    this.slowFactor = 1;

    this.dead = false;
    this.escaped = false;
    this.rewarded = false;
    this.hitFlash = 0;
  }

  get alive() {
    return !this.dead && !this.escaped;
  }

  /** 当前世界坐标（由 targetIndex / progress 插值得到，纯函数） */
  getPosition() {
    const idx = Math.min(Math.max(this.targetIndex, 1), PATH.length - 1);
    const from = PATH[idx - 1];
    const to = PATH[idx];
    const p = Math.min(Math.max(this.progress, 0), 1);
    return {
      x: from.x + (to.x - from.x) * p,
      y: from.y + (to.y - from.y) * p,
    };
  }

  get slowed() {
    return this.slowTimer > 0;
  }

  /** 像素/秒的当前速度（含减速） */
  getSpeed() {
    const factor = this.slowTimer > 0 ? this.slowFactor : 1;
    return this.baseSpeed * GRID.cell * factor;
  }

  applySlow(factor, duration) {
    // 取更强的减速与更长的剩余时间，避免叠加把速度压到 0
    const current = this.slowTimer > 0 ? this.slowFactor : 1;
    this.slowFactor = Math.min(current, factor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this.hitFlash = 0.08; // 命中闪白一帧多
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(dt) {
    if (!this.alive) return;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.slowFactor = 1;
      }
    }

    const before = this.getPosition();
    let budget = this.getSpeed() * dt;

    while (budget > 0 && this.targetIndex < PATH.length) {
      const segLength = SEGMENT_LENGTHS[this.targetIndex - 1];
      const left = (1 - this.progress) * segLength;
      if (budget < left) {
        this.progress += budget / segLength;
        budget = 0;
      } else {
        budget -= left;
        this.targetIndex += 1;
        this.progress = 0;
      }
    }

    if (this.targetIndex >= PATH.length) {
      // 走到路径终点：漏怪
      this.targetIndex = PATH.length - 1;
      this.progress = 1;
      this.escaped = true;
    }

    const after = this.getPosition();
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    this.distanceTravelled += Math.hypot(dx, dy);
    if (dx !== 0 || dy !== 0) this.angle = Math.atan2(dy, dx);
  }
}
