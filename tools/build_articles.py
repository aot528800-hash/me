#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 assets/articles.html 的文章模板生成独立静态文章页、sitemap 与 robots。

设计原则：
1. assets/articles.html 中的 <template data-art="..."> 是唯一内容源，不在别处维护正文；
   index.html 只作页面外壳，首屏不内联 25 篇文章，体积减半；
2. 生成页仍是完整站点副本，只改 head 元信息、默认路由与正文占位，
   这样 CSS / 灯箱 / 导航全部复用，不引入第二套样式；
3. 生成页地址为 /me/blog/<slug>/，每页有独立 title、description、OG、canonical，
   解决 hash 路由在微信转发与搜索引擎中只显示首页卡片的问题。
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "index.html"
ARTICLES_SRC = BASE / "assets" / "articles.html"
OUT = BASE / "blog"
SITE = "https://aot528800-hash.github.io/me"

# 注释里的示例模板，不是真文章
FAKE_SLUGS = {"唯一英文短名", "slug"}


def esc(value: str) -> str:
    """属性转义，避免标题/摘要中的引号破坏 HTML。"""
    return html.escape(value, quote=True)


def iso_date(value: str) -> str:
    """把 2026.11.15 转成 2026-11-15，用于 JSON-LD 与 sitemap。"""
    parts = value.split(".")
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        return "-".join(p.zfill(2) if i else p for i, p in enumerate(parts))
    return ""


def load_posts(source: str):
    """解析所有文章模板，返回按出现顺序排列的字典列表。"""
    posts = []
    pattern = re.compile(r"<template\s+([^>]*)>(.*?)</template>", re.S)
    for attrs, body in pattern.findall(source):
        data = dict(re.findall(r'([\w-]+)="([^"]*)"', attrs))
        slug = data.get("data-art", "")
        if not slug or slug in FAKE_SLUGS:
            continue
        posts.append(
            {
                "slug": slug,
                "topic": data.get("data-topic", ""),
                "title": data.get("data-title", ""),
                "date": data.get("data-date", ""),
                "desc": data.get("data-desc", ""),
                "body": body.strip(),
            }
        )
    return posts


def first_image(body: str, fallback: str) -> str:
    """优先用文章首图做 OG 图，没有则用站点统一分享图。"""
    match = re.search(r'<img[^>]+src="assets/([^"]+)"', body)
    if match:
        return f"{SITE}/assets/{match.group(1)}"
    return fallback


def build_page(source: str, post: dict) -> str:
    """把通用站点副本改造成某一篇文章的独立页面。"""
    page = source
    slug = post["slug"]
    url = f"{SITE}/blog/{slug}/"
    title = post["title"]
    desc = post["desc"]
    image = first_image(post["body"], f"{SITE}/assets/og-home.png")
    date_iso = iso_date(post["date"])

    # 1. 根标签加默认路由：生成页不带 # 也能直接落到文章视图
    page = page.replace(
        '<html lang="zh-CN" data-route="/">',
        f'<html lang="zh-CN" data-route="/post" '
        f'data-default-route="/post" data-default-slug="{esc(slug)}">',
        1,
    )

    # 2. head 元信息：标题、描述、OG、canonical、结构化数据全部文章级
    page = page.replace(
        "<title>Chew Teck Wai</title>",
        f"<title>{esc(title)} — Chew Teck Wai</title>",
        1,
    )
    page = re.sub(
        r'<meta name="description" content="[^"]*">',
        f'<meta name="description" content="{esc(desc)}">',
        page,
        count=1,
    )
    page = re.sub(
        r'(<meta property="og:title" content=")[^"]*(">)',
        lambda m: m.group(1) + esc(title) + m.group(2),
        page,
        count=1,
    )
    page = re.sub(
        r'(<meta property="og:description" content=")[^"]*(">)',
        lambda m: m.group(1) + esc(desc) + m.group(2),
        page,
        count=1,
    )
    page = re.sub(
        r'(<meta property="og:url" content=")[^"]*(">)',
        lambda m: m.group(1) + url + m.group(2),
        page,
        count=1,
    )
    page = re.sub(
        r'(<meta property="og:image" content=")[^"]*(">)',
        lambda m: m.group(1) + image + m.group(2),
        page,
        count=1,
    )
    page = re.sub(
        r'(<link rel="canonical" href=")[^"]*(">)',
        lambda m: m.group(1) + url + m.group(2),
        page,
        count=1,
    )
    ld = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": desc,
        "datePublished": date_iso,
        "author": {"@type": "Person", "name": "Chew Teck Wai"},
    }
    page = re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        '<script type="application/ld+json">'
        + json.dumps(ld, ensure_ascii=False)
        + "</script>",
        page,
        count=1,
        flags=re.S,
    )

    # 3. 正文落位：写入真实文章，并打 data-slug 防止脚本二次渲染覆盖
    page = page.replace(
        '<h1 class="h1" id="post-h1">文章</h1>',
        f'<h1 class="h1" id="post-h1">{esc(title)}</h1>',
        1,
    )
    page = page.replace(
        '<p class="post-lede" id="post-lede"></p>',
        f'<p class="post-lede" id="post-lede">{esc(desc)}</p>',
        1,
    )
    meta_text = f'{post["date"]}'
    page = page.replace(
        '<p class="post-meta" id="post-meta"></p>',
        f'<p class="post-meta" id="post-meta">{esc(meta_text)}</p>',
        1,
    )
    page = page.replace(
        '<div class="post-body" id="post-body"></div>',
        f'<div class="post-body" id="post-body" data-slug="{esc(slug)}">'
        f"{post['body']}</div>",
        1,
    )
    page = page.replace(
        '<span id="post-foot-note"></span>',
        f'<span id="post-foot-note">{esc(post["date"])}</span>',
        1,
    )

    # 4. 生成页在 /me/blog/<slug>/ 下，所有资源改绝对路径
    page = page.replace('src="assets/', 'src="/me/assets/')
    page = page.replace('srcset="assets/', 'srcset="/me/assets/')
    # srcset 里的第二个候选仍是相对路径，一并改绝对
    page = re.sub(r"(,\s*)assets/", r"\1/me/assets/", page)
    page = page.replace('href="assets/', 'href="/me/assets/')

    # 5. 只改 HTML 属性里的 hash 链接，不动脚本字符串
    cut = page.find('<script>\n(function () {')
    head_body, script = page[:cut], page[cut:]
    rewrite = {
        'href="#/"': 'href="/me/"',
        'href="#/story"': 'href="/me/#/story"',
        'href="#/football"': 'href="/me/#/football"',
        'href="#/blog"': 'href="/me/#/blog"',
        'href="#/tips"': 'href="/me/#/tips"',
    }
    for old, new in rewrite.items():
        head_body = head_body.replace(old, new)
    page = head_body + script
    return page


def build_sitemap(posts: list[dict]) -> str:
    """站点地图：首页 + 全部文章独立页。"""
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f"  <url><loc>{SITE}/</loc></url>",
    ]
    for post in posts:
        lastmod = iso_date(post["date"])
        loc = f"{SITE}/blog/{post['slug']}/"
        if lastmod:
            lines.append(
                f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>"
            )
        else:
            lines.append(f"  <url><loc>{loc}</loc></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def asset_version(name: str) -> str:
    """用资产内容指纹做缓存失效参数，改了就变，不用手记版本号。"""
    return hashlib.md5((BASE / "assets" / name).read_bytes()).hexdigest()[:8]


def stamp_assets(source: str, write: bool) -> str:
    """把 CSS/JS 的 ?v= 统一成当前指纹；check 模式只算不落盘。"""
    pairs = (
        (r"assets/site\.css(?:\?v=[0-9a-z]+)?", f"assets/site.css?v={asset_version('site.css')}"),
        (r"assets/site\.js(?:\?v=[0-9a-z]+)?", f"assets/site.js?v={asset_version('site.js')}"),
    )
    stamped = source
    for pattern, repl in pairs:
        stamped = re.sub(pattern, repl, stamped)
    if write and stamped != source:
        SRC.write_text(stamped, encoding="utf-8")
    return stamped


def strip_ver(text: str) -> str:
    """比对时忽略版本戳，否则每次指纹变化都会被当成正文差异。"""
    return re.sub(r"\?v=[0-9a-z]+", "", text)


def main() -> None:
    check = "--check" in sys.argv
    source = stamp_assets(SRC.read_text(encoding="utf-8"), write=not check)
    posts = load_posts(ARTICLES_SRC.read_text(encoding="utf-8"))
    if not posts:
        raise SystemExit("未解析到任何文章，构建终止")

    OUT.mkdir(parents=True, exist_ok=True)
    stale = []
    for post in posts:
        target = OUT / post["slug"] / "index.html"
        content = build_page(source, post)
        if check:
            actual = target.read_text(encoding="utf-8") if target.exists() else ""
            if strip_ver(actual) != strip_ver(content):
                stale.append(str(target.relative_to(BASE)))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            print(f"生成 {target.relative_to(BASE)}")

    sitemap = build_sitemap(posts)
    robots = f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n"

    if check:
        for name, content in (("sitemap.xml", sitemap), ("robots.txt", robots)):
            path = BASE / name
            actual = path.read_text(encoding="utf-8") if path.exists() else ""
            if actual != content:
                stale.append(name)
        if stale:
            print("以下产物与 index.html 不同步，请运行 python tools/build_articles.py：")
            for item in stale:
                print(" -", item)
            raise SystemExit(1)
        print(f"全部同步：{len(posts)} 篇文章 + sitemap + robots")
        return

    (BASE / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    (BASE / "robots.txt").write_text(robots, encoding="utf-8")
    print(f"完成：{len(posts)} 篇文章，sitemap.xml，robots.txt")


if __name__ == "__main__":
    main()
