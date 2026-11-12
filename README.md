# 塔防 Demo（MVP）

纯原生 **HTML + Canvas 2D + 原生 JavaScript ES Modules** 写的塔防小游戏。零第三方依赖、零外部素材（塔与敌人全部用多边形几何绘制，low-poly 硬表面风格）、无构建步骤，附带一个零依赖的桌面启动器。

- 建塔 → 杀怪 → 赚钱 → 升级 → 撑过 5 波：完整闭环
- 两种塔（单体投射物 / 范围减速脉冲）× 两种敌人（普通兵 / 快速兵）
- 固定时间步循环、逻辑与渲染分离、所有数值集中在 `js/data.js`

---

## 快速开始

### 桌面版（推荐，双击即玩）

双击 **`app\启动塔防.vbs`**（或桌面上生成的「塔防 Demo」快捷方式）。

它会起一个只监听 `127.0.0.1` 的本地服务，然后用 Chrome / Edge 的「应用窗口」打开游戏——没有地址栏和标签页，就是一个独立窗口，标题栏显示「塔防 Demo」。**关闭窗口即退出**，后台进程和临时配置会一起清理。

> 依赖：本机已装 Node.js 18+ 和 Chrome/Edge（都已装好，无需再装任何东西）。

### 浏览器版（开发用）

```bash
python -m http.server 8000
# 打开 http://localhost:8000/index.html
```

或者 `npm run serve`。任意静态服务器都行，项目本身不需要安装任何东西。

### 为什么不能直接双击 `index.html`

ES Modules 在 `file://` 下会被浏览器的同源策略拦截，页面会白屏、控制台报 CORS 错误。这是**预期行为**，必须经 `http://` 访问——桌面启动器就是替你做了这件事。

---

## 玩法

| 操作 | 说明 |
| --- | --- |
| 点顶部「箭塔 / 冰塔」按钮 | 进入放置模式，格子显示半透明幽灵模型与射程圈 |
| 左键点空格 | 建塔；绿色=可建，红色=不可建（路径 / 已有塔 / 金币不足，会给出原因） |
| `Esc` 或右键 | 取消放置 / 取消选中 |
| 点已建的塔 | 弹出面板：等级、升级后属性变化、升级价格、出售返还 |
| 顶部「提前开始」 | 跳过准备时间直接开下一波，按剩余秒数给金币奖励 |
| 结算遮罩「重新开始」 | 重置全部状态 |

- **箭塔**（50 金币）：单体高频，向射程内最靠前的敌人发射直线投射物。
- **冰塔**（70 金币）：以自身为中心释放范围脉冲，造成伤害并减速（速度 ×0.55，1.5 秒）。
- 都能升到 3 级，出售返还总投入的 70%。
- 5 波敌人，波间 8 秒准备；生命归零失败，第 5 波清空胜利。

---

## 数值都在 `js/data.js`

| 配置 | 位置 |
| --- | --- |
| 网格 / 画布 / 固定步长（16.67ms）/ HUD 高度 | `GRID` `CANVAS` `FIXED_DT` `MAX_FRAME_DT` `HUD_HEIGHT` |
| 路径折线节点（格坐标） | `PATH_NODES` |
| 初始金币 120、生命 10、8s 准备、70% 返还、每波奖励 | `ECONOMY` |
| 塔的价格/伤害/射程/攻速/升级价/减速参数 | `TOWER_TYPES` |
| 敌人血量/速度/赏金/体积 | `ENEMY_TYPES` |
| 每波敌人构成 | `WAVES` |
| 血量随波次缩放系数（`1 + 0.15 × (N-1)`） | `ENEMY_HP_SCALE_PER_WAVE` |
| 同一波内出兵间隔 | `SPAWN_INTERVAL` |

调参建议：第 1 波太紧就加 `ECONOMY.startGold` 或减 `WAVES[0].normal`；后期太松就改 `ENEMY_HP_SCALE_PER_WAVE` 或 `ECONOMY.waveClearRewards`。**不要改攻击逻辑**。

当前数值沿用设计文档给的起点。用脚本跑「铺满塔 + 不升级」的策略可以满血通关，说明后期偏宽松——要压紧只改上面几项即可。

---

## 目录结构

```
index.html              画布 + module 入口
js/
  main.js               初始化 canvas、固定时间步循环、鼠标/键盘事件
  data.js               全部数值配置
  game.js               状态机：update/render 调度、输入分发、胜负判定
  map.js                网格与路径几何、格↔世界坐标、可建造性
  tower.js              塔的创建、升级、出售、攻击
  enemy.js              敌人移动（节点插值）、受伤、减速、漏怪
  projectile.js         箭塔投射物
  wave.js               准备计时、生成队列、波次推进与奖励
  ui.js                 低多边形造型、HUD、面板、预览、遮罩（布局 + 绘制）
app/                    桌面应用外壳（零依赖，只用 Node 标准库）
  launcher.mjs          本地静态服务 + 打开应用窗口 + 退出回收
  启动塔防.vbs           双击入口（无控制台窗口）
  启动塔防.bat           排错入口（有控制台输出）
  icon.ico              应用图标
  make-icon.py          图标生成脚本（仅需重新生成图标时用）
  创建桌面快捷方式.ps1    在桌面创建带图标的快捷方式
tests/
  test_tower_defense.py   结构检查 + 逻辑行为仿真断言
  test_desktop_launcher.py 启动器/图标/快捷方式 + 真实 HTTP 服务冒烟
  test_agents_md.py       协作约定文件完整性
  sim/run_sim.mjs         无渲染逻辑仿真（Node 驱动 Game.update）
docs/验收清单.md         逐条验收项与对应验证方式
```

---

## 桌面启动器

`app/launcher.mjs` 只用了 Node 标准库（`http` / `fs` / `child_process`），做三件事：

1. 起静态服务，端口随机（`--port` 可指定），只监听 `127.0.0.1`；仓库内部目录（`.git`、`tests`、`app`、`.workbuddy` 等）一律 404，路径穿越也会被挡住。
2. 探测 Chrome / Edge，用 `--app=<url>` + 独立临时 `user-data-dir` 打开无地址栏窗口。独立配置目录让窗口关闭时浏览器进程随之退出，启动器据此收工。
3. 退出时关闭服务并删除临时配置目录。

可选参数：

```bash
node app/launcher.mjs            # 打开应用窗口
node app/launcher.mjs --no-open  # 只起服务（自动化测试用）
node app/launcher.mjs --port 8765
node app/launcher.mjs --help
```

**限制**：这不是单个 `.exe`，本质是「本地服务 + 浏览器内核的应用窗口」。要真正可分发、双击即用的独立包，需要引入 Electron/Tauri 之类的运行时（几百 MB、需要构建），与项目「零依赖」的设定冲突，所以没做。

---

## 测试

```bash
python -m unittest discover -s tests -v   # 46 项：结构契约 + 逻辑仿真 + 启动器 HTTP 冒烟
node tests/sim/run_sim.mjs                # 单独跑仿真，输出 JSON
```

- `tests/test_tower_defense.py`：目录结构、零外部素材/零第三方 import、`update` 不碰 canvas、渲染不改状态、低多边形造型面数，以及鼠标闭环、经济、升级出售、波次、胜负等行为断言。
- `tests/sim/run_sim.mjs`：在 Node 里直接驱动 `Game.update()`，用 mock 的 canvas context 跑通所有渲染分支（含胜利/失败遮罩），无浏览器也能回归。
- `DesktopLauncherTests`：真实启动 `launcher.mjs --no-open`，断言首页/脚本可访问、内部目录与目录穿越被拦。

---

## 实现要点

- **固定时间步**：`requestAnimationFrame` 只负责计时，逻辑按 `FIXED_DT`（1/60 s）累加执行，渲染每帧一次；单帧最多累积 0.25 s，避免切后台回来补算爆炸。
- **逻辑与渲染分离**：`update(dt)` 只改数值，`render(ctx)` 只绘制；`render` 是纯读操作，跑一遍渲染不会改变游戏状态（测试里有断言）。
- **低多边形造型**：模型以「脚下的地面点」为原点向上生长，靠三档色阶（顶亮 / 正面中 / 侧面暗）与多边形分面伪造体积；塔按 `y` 排序绘制形成遮挡，敌人始终画在塔之上以免被挡住。商店图标、放置预览复用同一套绘制函数。
- **模块职责**：数值（data）→ 几何与规则（map）→ 实体（tower/enemy/projectile/wave）→ 状态机（game）→ 呈现（ui）→ 入口（main），只靠函数调用和参数传递协作，没有事件总线。

---

## 已知边界（MVP 之外）

不做多地图、Boss、科技树、存档、音效、移动端触摸适配、拖拽合成、A\* 寻路（路径固定），也没有对象池 / 粒子等提前抽象。桌面端是「本地服务 + 浏览器应用窗口」，不是独立 exe。
