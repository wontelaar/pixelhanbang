"""Build rss.xml from the site's guide and tool pages (for Naver Search Advisor RSS 제출).

Each item takes its title and description from the page's own <title> and meta
description, and its date from the commit that first added the page, so a page keeps
the same date however often it is edited. Newest pages come first.

Run from the repo root after adding or renaming a page, before committing:
    python tools/build-rss.py
"""
import email.utils
import html
import pathlib
import re
import subprocess
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://pixelhanbang.com/"
# 안내·정책 페이지는 새 글 알림에 넣지 않는다.
SKIP = {"index.html", "404.html", "about.html", "contact.html", "privacy.html", "terms.html"}
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
DESCRIPTION = re.compile(r'<meta name="description" content="([^"]*)"')


def added_date(path):
    out = subprocess.run(
        ["git", "log", "--diff-filter=A", "--follow", "--format=%aI", "--", path.name],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    # 아직 커밋하지 않은 새 페이지는 지금 시각을 쓴다.
    return datetime.fromisoformat(out[-1]) if out else datetime.now().astimezone()


def main():
    items = []
    for page in ROOT.glob("*.html"):
        if page.name in SKIP:
            continue
        text = page.read_text(encoding="utf-8")
        title = TITLE.search(text)
        description = DESCRIPTION.search(text)
        if not title or not description:
            continue
        name = html.unescape(title.group(1).strip()).replace(" | 픽셀한방", "")
        items.append((added_date(page), page.name, name, html.unescape(description.group(1))))
    items.sort(key=lambda item: (item[0], item[1]), reverse=True)

    def esc(value):
        return html.escape(value, quote=False)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        "  <title>픽셀한방</title>",
        f"  <link>{SITE}</link>",
        "  <description>설치 없이 쓰는 무료 사진 도구와 상품사진·SNS 이미지 실전 가이드</description>",
        "  <language>ko</language>",
        f'  <atom:link href="{SITE}rss.xml" rel="self" type="application/rss+xml"/>',
        f"  <lastBuildDate>{email.utils.format_datetime(items[0][0])}</lastBuildDate>",
    ]
    for date, file_name, title, description in items:
        url = SITE + file_name
        lines += [
            "  <item>",
            f"    <title>{esc(title)}</title>",
            f"    <link>{url}</link>",
            f'    <guid isPermaLink="true">{url}</guid>',
            f"    <description>{esc(description)}</description>",
            f"    <pubDate>{email.utils.format_datetime(date)}</pubDate>",
            "  </item>",
        ]
    lines += ["</channel>", "</rss>", ""]
    (ROOT / "rss.xml").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"rss.xml: {len(items)} items")


if __name__ == "__main__":
    main()
