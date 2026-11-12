"""桌面启动器与打包产物的验收测试。

覆盖：
1. 文件齐备：启动器、双击入口、图标、快捷方式脚本、验收清单。
2. 启动器脚本能通过 Node 语法检查。
3. 双击入口（.vbs / .bat）指向 launcher.mjs，且 .vbs 为纯 ASCII 无 BOM（Windows
   Script Host 按 ANSI 解析，带 BOM 或中文会解析失败）。
4. 真实拉起 `node app/launcher.mjs --no-open`，验证首页/脚本可访问、仓库内部目录
   与目录穿越被拦截，退出后进程干净结束。
"""

import json
import re
import shutil
import subprocess
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"
LAUNCHER = APP_DIR / "launcher.mjs"
VBS = APP_DIR / "启动塔防.vbs"
BAT = APP_DIR / "启动塔防.bat"
ICON = APP_DIR / "icon.ico"
SHORTCUT_PS1 = APP_DIR / "创建桌面快捷方式.ps1"
CHECKLIST = REPO_ROOT / "docs" / "验收清单.md"

NODE = shutil.which("node")


class DesktopLauncherFilesTests(unittest.TestCase):
    def test_app_files_exist(self):
        for path in [LAUNCHER, VBS, BAT, ICON, SHORTCUT_PS1, CHECKLIST]:
            self.assertTrue(path.is_file(), f"缺少 {path.relative_to(REPO_ROOT)}")

    def test_launcher_syntax(self):
        if NODE is None:
            self.skipTest("未找到 node")
        result = subprocess.run(
            [NODE, "--check", str(LAUNCHER)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_vbs_is_ascii_without_bom(self):
        raw = VBS.read_bytes()
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"), ".vbs 不能带 UTF-8 BOM")
        self.assertTrue(all(byte < 128 for byte in raw), ".vbs 必须是纯 ASCII")
        text = raw.decode("ascii")
        self.assertIn("launcher.mjs", text)
        self.assertIn("shell.Run", text)
        self.assertIn("MsgBox", text, "缺少 Node 未安装时的提示")

    def test_bat_launches_launcher(self):
        # 中文 .bat 用系统 ANSI 代码页（GBK）保存最稳，UTF-8 会让 cmd 解析断行
        text = BAT.read_bytes().decode("gbk")
        self.assertIn("launcher.mjs", text)
        self.assertIn("where node", text, "应检查 Node 是否存在")
        self.assertNotIn("chcp", text, "GBK 编码下不需要切换代码页")
        self.assertIn("cd /d \"%~dp0..\"", text, "应切到仓库根目录再启动")

    def test_icon_is_multi_size_ico(self):
        data = ICON.read_bytes()
        self.assertEqual(data[:4], b"\x00\x00\x01\x00", "不是合法的 ICO 头")
        self.assertGreaterEqual(data[4] | (data[5] << 8), 5, "ICO 应包含多种尺寸")

    def test_package_json_has_no_dependencies(self):
        pkg = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertNotIn("dependencies", pkg)
        self.assertNotIn("devDependencies", pkg)
        self.assertEqual(pkg.get("type"), "module")
        scripts = pkg.get("scripts", {})
        self.assertEqual(set(scripts) - {"start", "serve", "test"}, set(), f"意外的脚本: {scripts}")
        self.assertIn("launcher.mjs", scripts.get("start", ""))


class StaticServerTests(unittest.TestCase):
    """真的把启动器跑起来，验证它提供的 HTTP 服务。"""

    @classmethod
    def setUpClass(cls):
        if NODE is None:
            raise unittest.SkipTest("未找到 node")
        cls.proc = subprocess.Popen(
            [NODE, str(LAUNCHER), "--no-open"],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        cls.url = cls._wait_for_url()
        # 绕过系统代理，直连本地服务
        cls.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    @classmethod
    def _wait_for_url(cls):
        deadline = time.time() + 20
        while time.time() < deadline:
            line = cls.proc.stdout.readline()
            if not line:
                break
            match = re.search(r"(http://127\.0\.0\.1:\d+/index\.html)", line)
            if match:
                return match.group(1)
        cls.tearDownClass()
        raise AssertionError("启动器没有在 20s 内输出本地地址")

    @classmethod
    def tearDownClass(cls):
        proc = getattr(cls, "proc", None)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover
                proc.kill()

    def fetch(self, path):
        request = urllib.request.Request(self.url.replace("/index.html", path))
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, response.headers.get("Content-Type", ""), response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers.get("Content-Type", ""), b""

    def test_index_is_served(self):
        status, content_type, body = self.fetch("/index.html")
        self.assertEqual(status, 200)
        self.assertIn("text/html", content_type)
        self.assertIn(b'<canvas id="game">', body)

    def test_root_serves_index(self):
        status, _, body = self.fetch("/")
        self.assertEqual(status, 200)
        self.assertIn(b'type="module"', body)

    def test_modules_are_served_as_javascript(self):
        for path in ["/js/main.js", "/js/data.js", "/js/ui.js"]:
            status, content_type, _ = self.fetch(path)
            self.assertEqual(status, 200, path)
            self.assertIn("javascript", content_type, path)

    def test_internal_directories_are_hidden(self):
        for path in ["/.git/config", "/tests/test_tower_defense.py", "/app/launcher.mjs", "/.workbuddy/"]:
            status, _, _ = self.fetch(path)
            self.assertEqual(status, 404, path)

    def test_path_traversal_is_blocked(self):
        for path in ["/..%2f..%2fWindows/win.ini", "/%2e%2e/%2e%2e/Windows/win.ini", "/js/..%2f..%2fpackage.json"]:
            status, _, body = self.fetch(path)
            self.assertIn(status, (403, 404), path)
            self.assertNotIn(b"[extensions]", body)


if __name__ == "__main__":
    unittest.main()
