// 入口：初始化 canvas、固定时间步游戏循环、鼠标与键盘事件。
// 逻辑更新走固定步长（FIXED_DT），渲染每帧一次。

import { CANVAS, FIXED_DT, MAX_FRAME_DT } from './data.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS.width;
canvas.height = CANVAS.height;

const game = new Game();

function fitCanvas() {
  const scale = Math.min(
    (window.innerWidth - 32) / CANVAS.width,
    (window.innerHeight - 32) / CANVAS.height
  );
  // 逻辑分辨率固定，最多按 1:1 显示，避免放大小数倍导致线条发虚
  const s = Math.max(0.4, Math.min(1, scale));
  canvas.style.width = `${Math.floor(CANVAS.width * s)}px`;
  canvas.style.height = `${Math.floor(CANVAS.height * s)}px`;
}

function toCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (CANVAS.width / rect.width),
    y: (event.clientY - rect.top) * (CANVAS.height / rect.height),
  };
}

canvas.addEventListener('mousemove', (event) => {
  const p = toCanvasCoords(event);
  game.setPointer(p.x, p.y);
});

canvas.addEventListener('mouseleave', () => {
  game.clearPointer();
});

canvas.addEventListener('click', (event) => {
  const p = toCanvasCoords(event);
  game.handleClick(p.x, p.y);
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  game.cancelModes();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') game.cancelModes();
});

window.addEventListener('resize', fitCanvas);
fitCanvas();

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  let delta = (now - lastTime) / 1000;
  lastTime = now;
  if (!Number.isFinite(delta) || delta < 0) delta = 0;
  if (delta > MAX_FRAME_DT) delta = MAX_FRAME_DT;

  accumulator += delta;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 240) {
    game.update(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }

  game.render(ctx);
  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);

// 方便在浏览器控制台手动验证
window.__game = game;
