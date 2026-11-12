// 网格与路径几何：格↔世界坐标转换、路径节点、可建造性判断。
// 本模块只负责几何与规则，不涉及任何绘制或游戏状态。

import { GRID, PATH_NODES } from './data.js';

export const CELL = GRID.cell;

/** 格坐标 → 该格中心的世界坐标（像素） */
export function cellCenter(col, row) {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

/** 世界坐标 → 格坐标 */
export function worldToCell(x, y) {
  return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
}

export function isInsideGrid(col, row) {
  return col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;
}

/** 路径节点的世界坐标（敌人沿这些点直线插值移动） */
export const PATH = PATH_NODES.map((n) => cellCenter(n.c, n.r));

/** 每段路径的长度（像素），长度 = PATH.length - 1 */
export const SEGMENT_LENGTHS = PATH.slice(1).map((node, i) =>
  Math.hypot(node.x - PATH[i].x, node.y - PATH[i].y)
);

export const PATH_LENGTH = SEGMENT_LENGTHS.reduce((sum, len) => sum + len, 0);

function buildPathCells() {
  const cells = new Set();
  for (let i = 0; i < PATH_NODES.length - 1; i += 1) {
    const a = PATH_NODES[i];
    const b = PATH_NODES[i + 1];
    if (a.r === b.r) {
      const from = Math.min(a.c, b.c);
      const to = Math.max(a.c, b.c);
      for (let c = from; c <= to; c += 1) cells.add(`${c},${a.r}`);
    } else {
      const from = Math.min(a.r, b.r);
      const to = Math.max(a.r, b.r);
      for (let r = from; r <= to; r += 1) cells.add(`${a.c},${r}`);
    }
  }
  return cells;
}

/** 路径占据的格子集合（格式 "col,row"），这些格子不可建造 */
export const PATH_CELLS = buildPathCells();

export function isPathCell(col, row) {
  return PATH_CELLS.has(`${col},${row}`);
}

export function towerAt(towers, col, row) {
  return towers.find((t) => t.col === col && t.row === row) || null;
}

/**
 * 格子是否可以建塔。
 * @returns {{ok: boolean, reason: string}}
 */
export function checkBuildable(towers, col, row) {
  if (!isInsideGrid(col, row)) return { ok: false, reason: '超出地图' };
  if (isPathCell(col, row)) return { ok: false, reason: '路径上不可建造' };
  if (towerAt(towers, col, row)) return { ok: false, reason: '该格已有塔' };
  return { ok: true, reason: '' };
}
