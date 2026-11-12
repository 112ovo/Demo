"""塔防 MVP 的自动化验收测试。

分两层：
1. 静态结构检查：文件结构、零依赖/零外部素材、模块职责边界（update 不碰 canvas）。
2. 行为仿真：用 Node 直接驱动 Game.update() 跑完整游戏逻辑，断言数值与闭环
   （建塔 → 杀怪 → 赚钱 → 升级 → 波次 → 胜负 → 重开）。

运行：
    python -m unittest discover -s tests -v

说明：平衡数值本身是可以在 js/data.js 里随时调的依据设计文档；这里只断言
设计文档明确规定的契约值（初始金币/生命、5 波、2 塔 2 敌人、70% 返还等），
避免因为这些契约被无意改动而破坏玩法。
"""

import json
import re
import shutil
import subprocess
import unittest
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
JS_DIR = REPO_ROOT / "js"
SIM_SCRIPT = REPO_ROOT / "tests" / "sim" / "run_sim.mjs"

MODULES = [
    "data.js",
    "game.js",
    "map.js",
    "tower.js",
    "enemy.js",
    "projectile.js",
    "wave.js",
    "ui.js",
    "main.js",
]

# 逻辑模块：不应触碰 DOM / canvas
LOGIC_MODULES = ["data.js", "game.js", "map.js", "tower.js", "enemy.js", "projectile.js", "wave.js", "ui.js"]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def sim_result() -> dict:
    node = shutil.which("node")
    if node is None:
        raise unittest.SkipTest("未找到 node，跳过逻辑仿真测试")
    proc = subprocess.run(
        [node, str(SIM_SCRIPT)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"仿真脚本执行失败:\n{proc.stderr}")
    return json.loads(proc.stdout)


class StaticStructureTests(unittest.TestCase):
    def test_entry_files_exist(self):
        for name in ["index.html", "README.md", "package.json"]:
            self.assertTrue((REPO_ROOT / name).is_file(), f"缺少 {name}")

    def test_all_modules_exist(self):
        for name in MODULES:
            self.assertTrue((JS_DIR / name).is_file(), f"缺少 js/{name}")

    def test_index_loads_module_entry(self):
        html = read(REPO_ROOT / "index.html")
        self.assertRegex(html, r'<script\s+type="module"\s+src="\./js/main\.js"\s*>\s*</script>')
        self.assertEqual(len(re.findall(r"<script", html)), 1, "只应通过一个 module 入口加载")

    def test_no_external_assets(self):
        """不得引用图片、音频、字体或任何外部 URL。"""
        pattern = re.compile(
            r"\.(png|jpe?g|gif|webp|svg|bmp|mp3|wav|ogg|m4a|ttf|otf|woff2?)\b"
            r"|new\s+Image\s*\(|new\s+Audio\s*\(|fetch\s*\(|XMLHttpRequest|url\s*\("
            r"|https?://",
            re.IGNORECASE,
        )
        for path in [REPO_ROOT / "index.html"] + sorted(JS_DIR.glob("*.js")):
            text = read(path)
            found = pattern.findall(text)
            self.assertEqual(found, [], f"{path.name} 含有外部资源引用: {found}")

    def test_no_third_party_imports(self):
        """所有 import 必须是相对路径，不引入任何第三方包。"""
        for path in sorted(JS_DIR.glob("*.js")):
            text = read(path)
            specifiers = re.findall(r"from\s+['\"]([^'\"]+)['\"]", text)
            for spec in specifiers:
                self.assertTrue(
                    spec.startswith("./") or spec.startswith("../"),
                    f"{path.name} 引入了非相对模块: {spec}",
                )

    def test_no_build_step(self):
        """package.json 只有 type: module 这类声明，不声明依赖与脚本。"""
        pkg = json.loads(read(REPO_ROOT / "package.json"))
        self.assertEqual(pkg.get("type"), "module")
        self.assertNotIn("dependencies", pkg)
        self.assertNotIn("devDependencies", pkg)
        self.assertNotIn("scripts", pkg)

    def test_main_uses_fixed_timestep(self):
        main = read(JS_DIR / "main.js")
        self.assertIn("requestAnimationFrame", main)
        self.assertIn("accumulator", main)
        self.assertRegex(main, r"while\s*\(accumulator\s*>=\s*FIXED_DT")
        self.assertIn("game.update(FIXED_DT)", main)
        self.assertIn("game.render(ctx)", main)

    def test_logic_modules_do_not_touch_dom(self):
        for name in LOGIC_MODULES:
            text = read(JS_DIR / name)
            for banned in ["document.", "window.", "getContext("]:
                self.assertNotIn(banned, text, f"{name} 不应直接访问 {banned}")

    def test_update_does_not_touch_canvas(self):
        """game.update(dt) 的函数体里不能出现 ctx。"""
        text = read(JS_DIR / "game.js")
        start = text.index("  update(dt) {")
        depth = 0
        body_start = text.index("{", start)
        for i in range(body_start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    body = text[body_start : i + 1]
                    break
        else:  # pragma: no cover
            self.fail("未能定位 update 方法体")
        self.assertNotIn("ctx", body)
        self.assertNotIn("render", body)

    def test_render_does_not_advance_state(self):
        text = read(JS_DIR / "game.js")
        start = text.index("  render(ctx) {")
        body = text[start:]
        for banned in ["this.update(", "gold +=", "lives -="]:
            self.assertNotIn(banned, body, f"render 中不应出现 {banned}")

    def test_balance_values_live_in_data_js(self):
        data = read(JS_DIR / "data.js")
        for key in [
            "startGold",
            "startLives",
            "sellRefundRate",
            "prepTime",
            "waveClearRewards",
            "TOWER_TYPES",
            "ENEMY_TYPES",
            "WAVES",
            "PATH_NODES",
            "SPAWN_INTERVAL",
        ]:
            self.assertIn(key, data, f"data.js 缺少配置项 {key}")
        # 其它模块不应硬编码塔价/敌人血量
        for name in ["game.js", "tower.js", "enemy.js", "wave.js"]:
            self.assertNotRegex(read(JS_DIR / name), r"price\s*[:=]\s*\d", f"{name} 不应硬编码价格")

    def test_readme_documents_run_and_tests(self):
        readme = read(REPO_ROOT / "README.md")
        self.assertIn("http.server", readme)
        self.assertIn("file://", readme)
        self.assertIn("unittest", readme)
        self.assertIn("js/data.js", readme)


class LogicSimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sim = sim_result()

    def test_map_geometry(self):
        m = self.sim["map"]
        self.assertEqual((m["cols"], m["rows"], m["cell"]), (16, 10, 48))
        self.assertGreater(m["pathLengthCells"], 20, "路径太短，玩法会被压缩")
        self.assertGreater(m["segments"], 3, "路径应为折线而非直线")
        self.assertTrue(m["buildableEmptyCell"])
        self.assertFalse(m["buildablePathCell"], "路径格子不可建造")
        self.assertFalse(m["buildableOutOfGrid"])
        self.assertEqual(m["freeCells"], m["cols"] * m["rows"] - m["pathCellCount"])
        self.assertTrue(m["isPathCellOnFirstRun"])
        self.assertFalse(m["isPathCellOnBuildRow"])

    def test_contract_values(self):
        c = self.sim["config"]
        self.assertEqual(c["startGold"], 120)
        self.assertEqual(c["startLives"], 10)
        self.assertEqual(c["prepTime"], 8)
        self.assertAlmostEqual(c["sellRefundRate"], 0.7)
        self.assertEqual(c["waves"], 5)
        self.assertEqual(c["arrowPrice"], 50)
        self.assertEqual(c["frostPrice"], 70)
        self.assertEqual(c["arrowUpgrades"], [60, 90])
        self.assertEqual(c["frostUpgrades"], [80, 110])
        self.assertEqual(c["normalHp"], 60)
        self.assertAlmostEqual(c["fastSpeed"], 2.2)
        self.assertAlmostEqual(c["fixedDt"], 1 / 60)

    def test_waves_composition(self):
        c = self.sim["config"]
        self.assertEqual(c["waveTotals"], [6, 8, 10, 10, 16])
        w3 = c["queueWave3"]
        self.assertEqual(w3.count("normal"), 6)
        self.assertEqual(w3.count("fast"), 4)
        self.assertEqual(w3[0], "normal", "第 3 波应先出普通兵")
        # 快速兵应均匀插入，而不是全部堆在末尾
        first_fast = w3.index("fast")
        self.assertLess(first_fast, len(w3) - 1)

    def test_hp_scaling_formula(self):
        c = self.sim["config"]
        self.assertEqual(c["wave1NormalHp"], 60)
        self.assertEqual(c["wave5NormalHp"], round(60 * (1 + 0.15 * 4)))

    def test_enemy_walks_path_and_costs_life(self):
        w = self.sim["enemyWalk"]
        self.assertEqual(w["livesAfterLeak"], w["startLives"] - 1)
        self.assertEqual(w["leaked"], 1)
        self.assertEqual(w["remaining"], 0)
        self.assertGreater(w["secondsToFinish"], 20)

    def test_arrow_tower_closes_gold_loop(self):
        a = self.sim["arrowTower"]
        self.assertTrue(a["placed"])
        self.assertEqual(a["goldAfterBuild"], 500 - 50)
        self.assertEqual(a["kills"], 1)
        self.assertEqual(a["goldGained"], a["bounty"])
        self.assertTrue(a["sawFloatingText"], "击杀应有 +金币 浮字")
        self.assertTrue(a["sawProjectile"], "箭塔应发射投射物")
        self.assertEqual(a["livesLost"], 0)

    def test_illegal_placement_rejected(self):
        p = self.sim["placement"]
        self.assertFalse(p["onPath"], "路径上不可建造")
        self.assertTrue(p["firstOk"])
        self.assertFalse(p["onTower"], "同一格不能重复建塔")
        self.assertFalse(p["outOfGrid"])
        self.assertFalse(p["poorPlace"], "金币不足不能建塔")
        self.assertIsNone(p["poorModeEntered"], "金币不足不应进入放置模式")
        self.assertEqual(p["towerCount"], 1)
        self.assertEqual(p["goldSpent"], 50)

    def test_frost_tower_aoe_and_slow(self):
        f = self.sim["frostTower"]
        self.assertTrue(f["damaged"], "冰塔脉冲应造成范围伤害")
        self.assertAlmostEqual(f["slowFactor"], 0.55)
        self.assertGreater(f["slowTimer"], 0)
        self.assertLess(f["slowedSpeed"], f["baseSpeed"] * 0.7)
        self.assertGreaterEqual(f["pulses"], 1, "冰塔应有可见脉冲")

    def test_upgrade_and_sell(self):
        u = self.sim["upgradeSell"]
        self.assertAlmostEqual(u["level1Damage"], 18)
        self.assertAlmostEqual(u["damage2"], 27)
        self.assertAlmostEqual(u["damage3"], 40.5)
        self.assertAlmostEqual(u["level1RangeCells"], 2.5)
        self.assertAlmostEqual(u["range2Cells"], 2.8)
        self.assertEqual(u["level"], 3)
        self.assertIsNone(u["canUpgradeAgain"], "3 级为最高级")
        self.assertEqual(u["invested"], 50 + 60 + 90)
        self.assertTrue(u["refundMatchesRate"])
        self.assertEqual(u["goldGainOnSell"], u["sellValue"])
        self.assertEqual(u["towersLeft"], 0)
        self.assertTrue(u["selectedCleared"])

    def test_wave_prep_and_reward(self):
        w = self.sim["waveFlow"]
        self.assertAlmostEqual(w["prepAfter1s"], w["prepAtStart"] - 1, places=2)
        self.assertEqual(w["grantedBonus"], w["earlyBonus"])
        self.assertGreater(w["grantedBonus"], 0)
        self.assertEqual(w["stateAfterEarly"], "active")
        self.assertEqual(w["waveNumber"], 1)
        self.assertEqual(w["stateAfterClear"], "prep", "清空一波后回到准备阶段")
        self.assertAlmostEqual(w["prepAfterClear"], 8)

    def test_victory_and_defeat(self):
        self.assertEqual(self.sim["balancedRun"]["result"], "victory")
        self.assertEqual(self.sim["naiveRun"]["result"], "victory")
        self.assertEqual(self.sim["noTowerRun"]["result"], "defeat")
        self.assertEqual(self.sim["noTowerRun"]["lives"], 0)
        self.assertGreater(self.sim["noTowerRun"]["leaked"], 0)

    def test_mouse_click_loop(self):
        c = self.sim["clickLoop"]
        self.assertEqual(c["enteringPlacing"], "arrow")
        self.assertEqual(c["builtCount"], 1)
        self.assertEqual(c["goldAfterBuild"], 120 - 50)
        self.assertEqual(c["selected"], "arrow")
        self.assertEqual(c["levelAfterUpgrade"], 2)
        self.assertEqual(c["soldTowers"], 0)
        self.assertAlmostEqual(c["goldGainOnSell"], 77)
        self.assertEqual(c["afterHudClick"], {"placing": None, "selected": None})
        self.assertEqual(c["earlyState"], "active")
        self.assertGreater(c["earlyGain"], 0)
        self.assertEqual(c["stateAfterLifeZero"], "defeat")
        self.assertEqual(c["stateAfterRestart"], "playing")
        self.assertEqual(c["goldAfterRestart"], 120)
        self.assertEqual(c["livesAfterRestart"], 10)

    def test_render_smoke_without_dom(self):
        r = self.sim["renderSmoke"]
        self.assertTrue(r["allOk"], f"渲染场景报错: {r['scenarios']}")
        self.assertTrue(r["stateUnchanged"], "渲染不得修改游戏状态")
        labels = {s["label"] for s in r["scenarios"]}
        self.assertIn("victoryOverlay", labels)
        self.assertIn("defeatOverlay", labels)
        self.assertIn("placingPreview", labels)

    def test_floating_text_lifetime(self):
        f = self.sim["floats"]
        self.assertEqual(f["aliveAt05"], 1)
        self.assertEqual(f["aliveAt07"], 0, "浮字应在 0.6s 后消失")


if __name__ == "__main__":
    unittest.main()
