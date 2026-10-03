#!/usr/bin/env python3
"""
fetch_substack.py - build blog.json for the Totally Tabular site from a Substack RSS feed.

Usage:
    python3 fetch_substack.py https://YOURNAME.substack.com
    python3 fetch_substack.py https://YOURNAME.substack.com --out blog.json --limit 5
    python3 fetch_substack.py --from-file feed.xml            # parse a saved feed instead of fetching

Every Substack publication serves RSS at <publication url>/feed. This script reads it,
keeps the newest posts, strips HTML from the summaries, and writes the JSON the site's
Blog area reads. Put blog.json next to index.html (or hand it to Claude to republish).

Standard library only, Python 3.8+.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"(?is)<(script|style).*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h[1-6]>|</blockquote>", " ", s)
    s = TAG_RE.sub(" ", s)
    s = html.unescape(s)
    return WS_RE.sub(" ", s).strip()


def excerpt(text, limit=260):
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut + "…"


def feed_url(pub):
    pub = pub.strip().rstrip("/")
    return pub if pub.endswith("/feed") else pub + "/feed"


def fetch(url):
    req = urllib.request.Request(
        url, headers={"User-Agent": "open-time-blog/1.0 (blog.json builder)"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse(xml_bytes, limit, feed):
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        raise SystemExit("That is not an RSS 2.0 feed (no <channel> element).")

    pub_name = (channel.findtext("title") or "").strip()
    pub_url = (channel.findtext("link") or "").strip()

    posts = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        author = (item.findtext("dc:creator", namespaces=NS) or pub_name).strip()
        summary = strip_html(item.findtext("description") or "")
        body = strip_html(item.findtext("content:encoded", namespaces=NS) or "")

        date = ""
        raw = item.findtext("pubDate")
        if raw:
            try:
                date = (
                    parsedate_to_datetime(raw)
                    .astimezone(dt.timezone.utc)
                    .strftime("%Y-%m-%d")
                )
            except (TypeError, ValueError):
                date = raw.strip()

        words = len((body or summary).split())
        posts.append(
            {
                "title": title,
                "url": link,
                "date": date,
                "author": author,
                "excerpt": excerpt(summary or body),
                "wordCount": words,
                "sample": False,
            }
        )

    posts.sort(key=lambda p: p["date"], reverse=True)
    return {
        "publication": {"name": pub_name, "url": pub_url, "feed": feed},
        "updatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "posts": posts[:limit],
    }


def main():
    ap = argparse.ArgumentParser(description="Build blog.json from a Substack RSS feed.")
    ap.add_argument("publication", nargs="?", help="Substack URL, e.g. https://name.substack.com")
    ap.add_argument("--from-file", help="Parse a saved feed.xml instead of fetching")
    ap.add_argument("--out", default="blog.json", help="Output path (default: blog.json)")
    ap.add_argument("--limit", type=int, default=5, help="How many recent posts to keep (default: 5)")
    args = ap.parse_args()

    if args.from_file:
        with open(args.from_file, "rb") as f:
            xml_bytes = f.read()
        feed = args.from_file
    elif args.publication:
        feed = feed_url(args.publication)
        xml_bytes = fetch(feed)
    else:
        ap.error("give a Substack URL or --from-file feed.xml")

    data = parse(xml_bytes, args.limit, feed)

    try:
        with open(args.out, encoding="utf-8") as f:
            old = json.load(f)
        key = lambda d: [(p.get("title"), p.get("url"), p.get("date")) for p in d.get("posts", [])]
        if key(old) == key(data) and old.get("publication", {}).get("url") == data["publication"]["url"]:
            print("no change: %s already has these %d post(s)" % (args.out, len(data["posts"])), file=sys.stderr)
            return
    except (OSError, ValueError):
        pass

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    n = len(data["posts"])
    latest = data["posts"][0]["title"] if n else "(no posts yet)"
    print("wrote %s: %d post(s), latest: %s" % (args.out, n, latest), file=sys.stderr)


if __name__ == "__main__":
    main()
