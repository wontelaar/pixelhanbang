"""Stamp every local .js/.css reference in the site's HTML with a content hash (?v=...).

Browsers keep site files for up to 10 minutes (GitHub Pages max-age=600). Without a
version, a visitor can get a new page together with an old script, and the two disagree
(e.g. the brightness slider showed 10 steps but the old script stopped it at 5).
The hash changes only when the file's content changes, so unchanged files stay cached.

Run from the repo root before every commit that changes a .js or .css file:
    python tools/version-assets.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = re.compile(r'((?:src|href)=")([^"#:?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")')


def file_hash(path, cache={}):
    if path not in cache:
        cache[path] = hashlib.sha1(path.read_bytes()).hexdigest()[:10]
    return cache[path]


def main():
    changed = 0
    for page in sorted(ROOT.glob("*.html")):
        text = page.read_text(encoding="utf-8")

        def stamp(match):
            asset = ROOT / match.group(2)
            if not asset.is_file():
                return match.group(0)
            return f"{match.group(1)}{match.group(2)}?v={file_hash(asset)}{match.group(3)}"

        updated = REF.sub(stamp, text)
        if updated != text:
            page.write_text(updated, encoding="utf-8", newline="")
            changed += 1
    print(f"versioned assets in {changed} page(s)")


if __name__ == "__main__":
    main()
