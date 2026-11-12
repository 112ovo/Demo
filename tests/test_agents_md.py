"""AGENTS.md 协作约定的完整性校验。

依据 AGENTS.md「注意事项」第 2 条：每次改动后都必须编写或更新相关测试，
并在交付给用户前确保所有测试和验证全部通过。
本测试覆盖该文件本身，确保两条约定不会被误删或改写。
"""

import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
AGENTS_MD = REPO_ROOT / "AGENTS.md"


class AgentsMdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = (
            AGENTS_MD.read_text(encoding="utf-8") if AGENTS_MD.is_file() else ""
        )

    def test_file_exists(self):
        self.assertTrue(AGENTS_MD.is_file(), f"缺少约定文件: {AGENTS_MD}")

    def test_file_not_empty(self):
        self.assertTrue(self.content.strip(), "AGENTS.md 不应为空")

    def test_has_notice_section(self):
        self.assertIn("注意事项", self.content)

    def test_rule_1_git_commit(self):
        self.assertIn("每次改动完成后", self.content)
        self.assertIn("Git commit", self.content)
        self.assertIn("追踪和回滚", self.content)

    def test_rule_2_tests_and_verification(self):
        self.assertIn("每次改动后", self.content)
        self.assertIn("编写或更新相关测试", self.content)
        self.assertIn("确保所有测试和验证全部通过", self.content)


if __name__ == "__main__":
    unittest.main()
