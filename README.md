# 塔防 Demo（MVP）

纯原生 HTML + Canvas 2D + 原生 JavaScript ES Modules 写的塔防小游戏。零第三方依赖、零外部素材（全部用几何图形绘制）、无构建步骤。

## 运行

ES Modules 在 `file://` 下会被浏览器的同源策略拦截，必须通过本地静态服务器打开：

```bash
python -m http.server 8000
# 浏览器打开 http://localhost:8000/index.html
```

任意静态服务器都可以（`npx serve`、nginx、IDE 内置预览等），项目本身不需要安装任何东西。

> `package.json` 里只有 `"type": "module"`，作用是让 Node 用 ESM 方式加载 `js/` 下的模块（自动化测试要 import 这些模块）。它没有依赖、没有 scripts、没有构建步骤。

## 玩法

| 操作 | 说明 |
| --- | --- |
| 点顶部「箭塔 / 冰塔」按钮 | 进入放置模式，鼠标悬停显示半透明预览与射程圈 |
| 左键点空格 | 建塔；绿色=可建，红色=不可建（路径/已有塔/金币不足，会给出原因） |
| `Esc` 或右键 | 取消放置 / 取消选中 |
| 点已建的塔 | 弹出面板：等级、升级后属性变化、升级价格、出售返还 |
| 顶部「提前开始」 | 跳过准备时间直接开下一波，按剩余秒数给金币奖励 |
| 结算遮罩「重新开始」 | 重置全部状态 |

- 两种塔：**箭塔**（单体高频，直线投射物）与 **冰塔**（以自身为中心的范围脉冲 + 减速）。射程圈、脉冲圆环、命中闪白都是可见反馈。
- 敌人：**普通兵**（中等血量/速度）、**快速兵**（低血量高速度低赏金）。走到终点扣 1 点生命，死亡给赏金并飘出 `+金币` 浮字。
- 5 波，每波之间 8 秒准备时间；清空一波发放波次奖励，金额随波次递增。生命归零失败，第 5 波清空胜利。

## 数值都在 `js/data.js`

所有平衡数值集中在一个文件里，改数值不需要碰逻辑代码：

| 配置 | 位置 |
| --- | --- |
| 网格 / 画布 / 固定步长（16.67ms）/ HUD 高度 | `GRID` `CANVAS` `FIXED_DT` `MAX_FRAME_DT` `HUD_HEIGHT` |
| 路径折线节点（格坐标） | `PATH_NODES` |
| 初始金币 120、初始生命 10、8s 准备、70% 返还、每波奖励 | `ECONOMY` |
| 塔的价格/伤害/射程/攻速/升级价/减速参数 | `TOWER_TYPES` |
| 敌人血量/速度/赏金/体积 | `ENEMY_TYPES` |
| 每波敌人构成 | `WAVES` |
| 血量随波次缩放系数（`1 + 0.15 × (N-1)`） | `ENEMY_HP_SCALE_PER_WAVE` |
| 同一波内的出兵间隔 | `SPAWN_INTERVAL` |

调参建议：如果第 1 波太紧，先加 `ECONOMY.startGold` 或降 `WAVES[0].normal`；如果后期太松，先改 `ENEMY_HP_SCALE_PER_WAVE` 或 `ECONOMY.waveClearRewards`，**不要动攻击逻辑**。

当前数值直接采用设计文档给的起点。用脚本跑「全塔铺满 + 不升级」的策略可以满血通关，说明后期偏宽松——真要靠试玩把它压紧，只需调上面这几项。

## 文件结构

```
index.html          画布与 module 入口
js/main.js          初始化 canvas、固定时间步循环、鼠标/键盘事件
js/data.js          全部数值配置
js/game.js          状态机：update/render 调度、输入分发、胜负判定
js/map.js           网格与路径几何、格↔世界坐标、可建造性
js/tower.js         塔的创建、升级、出售、攻击
js/enemy.js         敌人移动（节点插值）、受伤、减速、漏怪
js/projectile.js    箭塔投射物
js/wave.js          准备计时、生成队列、波次推进与奖励
js/ui.js            HUD、商店按钮、塔面板、放置预览、浮字、胜负遮罩（布局与绘制）
tests/              自动化测试
```

## 实现要点

- **固定时间步**：`requestAnimationFrame` 只负责计时，逻辑按 `FIXED_DT`（1/60 s）累加执行，渲染每帧一次；单帧最多累积 0.25s，避免切后台回来补算爆炸。
- **逻辑与渲染分离**：`update(dt)` 只改数值，`render(ctx)` 只绘制，`update` 里不出现任何 canvas 调用；`render` 是纯读操作，跑一遍渲染不会改变游戏状态。
- **模块职责**：数值（data）→ 几何与规则（map）→ 实体（tower/enemy/projectile/wave）→ 状态机（game）→ 呈现（ui）→ 入口（main），只靠函数调用和参数传递协作，没有事件总线。

## 测试

```bash
python -m unittest discover -s tests -v      # 静态结构检查 + 逻辑行为仿真
node tests/sim/run_sim.mjs                   # 单独跑仿真，输出 JSON
```

- `tests/test_tower_defense.py`：检查目录结构、零外部素材/零第三方 import、`update` 不碰 canvas、渲染不改状态，并断言鼠标闭环、经济、升级出售、波次、胜负等行为。
- `tests/sim/run_sim.mjs`：在 Node 里直接驱动 `Game.update()`，用 mock 的 canvas context 跑通所有渲染分支（含胜利/失败遮罩），用于无浏览器环境下的回归验证。

## 已知边界（MVP 之外）

不做多地图、Boss、科技树、存档、音效、移动端触摸适配、拖拽合成、A\* 寻路（路径固定），也没有对象池/粒子等提前抽象。
