// 波次管理：准备倒计时、生成队列、波次推进与清空奖励。

import { ECONOMY, SPAWN_INTERVAL, WAVES } from './data.js';
import { Enemy } from './enemy.js';

/** 把一波的构成排成生成队列；混合波次让快速兵均匀插入，避免一波堆在一起 */
export function buildSpawnQueue(composition) {
  const normal = composition.normal || 0;
  const fast = composition.fast || 0;
  if (fast === 0) return Array.from({ length: normal }, () => 'normal');
  if (normal === 0) return Array.from({ length: fast }, () => 'fast');

  const queue = [];
  let n = 0;
  let f = 0;
  while (n < normal || f < fast) {
    const wantFast =
      f < fast && (n >= normal || (f + 1) / fast <= (n + 1) / normal);
    if (wantFast) {
      queue.push('fast');
      f += 1;
    } else {
      queue.push('normal');
      n += 1;
    }
  }
  return queue;
}

export class WaveManager {
  constructor(game) {
    this.game = game;
    this.totalWaves = WAVES.length;
    this.waveNumber = 0; // 已开始的波次数量
    this.state = 'prep'; // 'prep' | 'active' | 'finished'
    this.prepTimer = ECONOMY.prepTime;
    this.spawnQueue = [];
    this.spawnTimer = 0;
  }

  get isPrepping() {
    return this.state === 'prep';
  }

  get pendingEarlyBonus() {
    return Math.round(this.prepTimer * ECONOMY.earlyStartBonusPerSecond);
  }

  startWave() {
    if (this.state === 'finished') return;
    this.waveNumber += 1;
    this.spawnQueue = buildSpawnQueue(WAVES[this.waveNumber - 1]);
    this.spawnTimer = 0;
    this.state = 'active';
  }

  /** 提前开始：按剩余准备时间发放金币奖励 */
  startEarly() {
    if (this.state !== 'prep') return 0;
    const bonus = this.pendingEarlyBonus;
    this.game.gold += bonus;
    this.prepTimer = 0;
    this.startWave();
    return bonus;
  }

  update(dt) {
    if (this.state === 'prep') {
      this.prepTimer = Math.max(0, this.prepTimer - dt);
      if (this.prepTimer <= 0) this.startWave();
      return;
    }

    if (this.state !== 'active') return;

    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const type = this.spawnQueue.shift();
        this.game.enemies.push(new Enemy(type, this.waveNumber));
        this.spawnTimer = SPAWN_INTERVAL;
      }
    }

    if (this.spawnQueue.length === 0 && this.game.enemies.length === 0) {
      this.onWaveClear();
    }
  }

  onWaveClear() {
    const reward = ECONOMY.waveClearRewards[this.waveNumber - 1] || 0;
    this.game.gold += reward;
    this.game.floats.push({
      x: this.game.centerX,
      y: this.game.centerY,
      text: `波次奖励 +${reward}`,
      t: 0,
      big: true,
    });

    if (this.waveNumber >= this.totalWaves) {
      this.state = 'finished';
      this.game.state = 'victory';
      return;
    }
    this.state = 'prep';
    this.prepTimer = ECONOMY.prepTime;
  }
}
