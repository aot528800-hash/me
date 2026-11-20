#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为博客正文图生成 640w 派生图，并给 index.html 的图片加 srcset/sizes。

背景：正文栏桌面只有 600px 宽（容器 680px - 左右各 40px），
但原图统一 1200px；手机上下载 1200px 属于明显超采。
派生图走 WebP，质量 82，肉眼无差。
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent.parent
BLOG_DIR = BASE / "assets" / "blog"
SRC = BASE / "index.html"

SIZES = "(max-width: 767px) calc(100vw - 68px), 600px"


def make_thumbs() -> list[str]:
    """生成 -640.webp，返回被处理的文件名列表。"""
    done = []
    for src in sorted(BLOG_DIR.glob("*.webp")):
        if src.stem.endswith("-640"):
            continue
        target = src.with_name(f"{src.stem}-640.webp")
        if target.exists():
            done.append(src.name)
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            width = 640
            height = max(1, round(im.height * width / im.width))
            im.resize((width, height), Image.Resampling.LANCZOS).save(
                target, "WEBP", quality=82, method=6
            )
        done.append(src.name)
    return done


def patch_html() -> int:
    """给正文图补 srcset 与 sizes，已加过的跳过，保证可重复执行。"""
    text = SRC.read_text(encoding="utf-8")

    def repl(match: re.Match[str]) -> str:
        tag = match.group(0)
        name = match.group(1)
        if "srcset=" in tag:
            return tag
        small = f"{Path(name).stem}-640.webp"
        addition = (
            f' srcset="assets/blog/{small} 640w, assets/blog/{name} 1200w"'
            f' sizes="{SIZES}"'
        )
        # 插在 width 属性之前，保持 alt / width / height / loading 原有顺序
        return tag.replace(" width=", addition + " width=", 1)

    pattern = re.compile(r'<img[^>]+src="assets/blog/([^"/]+\.webp)"[^>]*>')
    new_text, count = pattern.subn(repl, text)
    if new_text != text:
        SRC.write_text(new_text, encoding="utf-8")
    return count


def main() -> None:
    files = make_thumbs()
    count = patch_html()
    print(f"派生图就绪：{len(files)} 张；已为 {count} 个 img 标签补 srcset")


if __name__ == "__main__":
    main()
