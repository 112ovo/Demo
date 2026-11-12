"""生成桌面应用图标 app/icon.ico（仅打包时需要，运行游戏不需要 Pillow）。

图标就是把游戏里的箭塔造型压成小尺寸：灰色台基 + 蓝色桁架塔身 + 城垛 + 旗帜。
8 倍尺度绘制再缩小，得到干净的抗锯齿边缘。

用法：
    python app/make-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 8  # 超采样倍数
SIZE = 256
OUT = Path(__file__).resolve().parent / "icon.ico"

BG = "#f2f6fc"
BG_BORDER = "#d6dfec"
STONE = "#9aa4b4"
STONE_DARK = "#7c8798"
BLUE = "#2f6fed"
BLUE_LIGHT = "#5a92f5"
BLUE_DARK = "#1f4aa8"
POLE = "#5c6573"


def px(*points):
    return [(x * S, y * S) for x, y in points]


def main():
    img = Image.new("RGBA", (SIZE * S, SIZE * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角底板
    d.rounded_rectangle(
        [6 * S, 6 * S, (SIZE - 6) * S, (SIZE - 6) * S],
        radius=54 * S,
        fill=BG,
        outline=BG_BORDER,
        width=3 * S,
    )

    # 石质台基
    d.polygon(px((72, 212), (184, 212), (170, 188), (86, 188)), fill=STONE)
    d.polygon(px((72, 212), (184, 212), (184, 200), (72, 200)), fill=STONE_DARK)

    # 塔身（外亮内暗的桁架）
    d.polygon(px((100, 188), (156, 188), (146, 92), (110, 92)), fill=BLUE)
    d.polygon(px((112, 188), (144, 188), (138, 98), (118, 98)), fill=BLUE_DARK)
    # 交叉斜撑
    for y1, y2 in ((176, 150), (146, 120), (116, 96)):
        d.line(px((112, y1), (144, y2)), fill=BLUE_LIGHT, width=5 * S)
        d.line(px((144, y1), (112, y2)), fill=BLUE_LIGHT, width=5 * S)

    # 平台与城垛
    d.polygon(px((102, 92), (154, 92), (150, 76), (106, 76)), fill=BLUE_LIGHT)
    for x in (104, 120, 136):
        d.rectangle(px((x, 60), (x + 11, 76)), fill=BLUE_LIGHT)

    # 旗杆与旗
    d.line(px((128, 76), (128, 34)), fill=POLE, width=5 * S)
    d.polygon(px((132, 36), (186, 50), (132, 64)), fill=BLUE)

    icon = img.resize((SIZE, SIZE), Image.LANCZOS)
    icon.save(
        OUT,
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )
    # 顺带存一张预览图，方便检查
    icon.save(OUT.with_name("icon-preview.png"))
    print(f"icon written: {OUT}")


if __name__ == "__main__":
    main()
