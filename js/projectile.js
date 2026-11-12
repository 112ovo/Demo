// 箭塔投射物：追踪目标当前位置，命中即扣血。
// update() 只改自身坐标与目标血量。

import { PROJECTILE } from './data.js';

export class Projectile {
  constructor(x, y, target, damage) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = PROJECTILE.speed;
    this.radius = PROJECTILE.radius;
    this.dead = false;
  }

  update(dt) {
    if (this.dead) return;
    const target = this.target;
    if (!target || !target.alive) {
      this.dead = true;
      return;
    }

    const pos = target.getPosition();
    const dx = pos.x - this.x;
    const dy = pos.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (dist <= step + target.radius) {
      this.x = pos.x;
      this.y = pos.y;
      target.takeDamage(this.damage);
      this.dead = true;
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }
}
