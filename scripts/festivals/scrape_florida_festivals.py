#!/usr/bin/env python3
"""Scrape Florida festival listings from Festival Guides and Reviews into CSV.

LEADS ONLY. This page is an aggregator. Nothing it says is published by
Wayfind until an agent confirms it on the ORGANIZER's own page (see
docs/FLORIDA_FESTIVALS_IMPORT.md). Rows marked with an asterisk on the source
are flagged unconfirmed by the source itself.

Usage:
  python3 scripts/festivals/scrape_florida_festivals.py --out scripts/festivals/florida_festivals.csv

2026-09-18 fix: the source wraps every event title in its own <a>, so reading
the container with get_text("\\n") split each listing into three lines and only
link-free rows matched (1 of ~1,370). Blocks are now read one at a time with
inline children joined, and every month header may carry the year marker.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_URL = "https://festivalguidesandreviews.com/florida-festivals/"
DEFAULT_OUT = "florida_festivals.csv"
DATE_PREFIX = re.compile(r"^(\d{1,2}/\d{1,2})(?:-(\d{1,2}/\d{1,2}))?(\*?)(?:\s*\(([^)]*)\))?\s*$")
YEAR_MARKER = re.compile(r"\((20\d{2})\)")
EVENT_LINE = re.compile(r"^\d{1,2}/\d{1,2}")
MONTH_HEADER = re.compile(
    r"^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b", re.I
)
FIELDS = [
    "start_date", "end_date", "date_text", "event_name", "city", "status", "unconfirmed",
    "date_notes", "notes", "source_url", "source_domain", "source_page",
]


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def month_day_to_iso(md: str, year: int) -> str:
    m, d = (int(x) for x in md.split("/"))
    return date(year, m, d).isoformat()


def parse_date_part(date_part: str, year: int) -> dict:
    raw = clean_text(date_part).replace("*-", "*")
    m = DATE_PREFIX.match(raw)
    if not m:
        return {"start_date": "", "end_date": "", "unconfirmed": "*" in raw, "date_notes": raw}
    start_md, end_md, star, notes = m.groups()
    end_year = year
    if end_md and int(end_md.split("/")[0]) < int(start_md.split("/")[0]):
        end_year += 1
    try:
        start = month_day_to_iso(start_md, year)
        end = month_day_to_iso(end_md, end_year) if end_md else start
    except ValueError:
        return {"start_date": "", "end_date": "", "unconfirmed": True, "date_notes": raw}
    return {"start_date": start, "end_date": end, "unconfirmed": bool(star), "date_notes": notes or ""}


def parse_event_line(line: str, year: int, anchor_map: dict, source_page: str) -> dict | None:
    line = clean_text(line)
    if not EVENT_LINE.match(line):
        return None
    parts = [clean_text(p) for p in re.split(r"\s*[–—]\s+|\s+[–—]\s*", line) if clean_text(p)]
    if len(parts) < 3:
        return None
    date_text, event_name, city = parts[0], parts[1], parts[2]
    tail = " | ".join(parts[3:]) if len(parts) > 3 else ""
    tail = re.sub(r"\bMy Review\b", "", tail, flags=re.I).strip(" |")

    status = "cancelled" if "CANCELLED" in line.upper() else "active"
    if tail == "?" or line.rstrip().endswith("?"):
        status = "needs_verification"

    info = parse_date_part(date_text, year)

    source_url = anchor_map.get(event_name, "")
    if not source_url:
        norm = re.sub(r"[^a-z0-9]+", "", event_name.lower())
        for label, href in anchor_map.items():
            if re.sub(r"[^a-z0-9]+", "", label.lower()) == norm:
                source_url = href
                break

    return {
        "start_date": info["start_date"], "end_date": info["end_date"], "date_text": date_text,
        "event_name": event_name, "city": city, "status": status, "unconfirmed": info["unconfirmed"],
        "date_notes": info["date_notes"], "notes": tail, "source_url": source_url,
        "source_domain": urlparse(source_url).netloc if source_url else "", "source_page": source_page,
    }


def scrape(url: str, timeout: int = 30) -> list[dict]:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; WayfindFestivalResearch/1.0; +https://www.gowayfind.com/)"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    anchor_map: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        label = clean_text(a.get_text(" ", strip=True))
        if label:
            anchor_map.setdefault(label, urljoin(url, a["href"]))

    for br in soup.find_all("br"):
        br.replace_with("\n")

    container = soup.find("main") or soup.find("article") or soup.body or soup
    lines: list[str] = []
    for block in container.find_all(["p", "li", "h1", "h2", "h3", "h4"]):
        if block.find(["p", "li"]):
            continue
        for part in block.get_text("").split("\n"):
            part = clean_text(part)
            if part:
                lines.append(part)

    current_year = 2026
    rows: list[dict] = []
    seen: set = set()
    for line in lines:
        if MONTH_HEADER.match(line):
            ym = YEAR_MARKER.search(line)
            if ym:
                current_year = int(ym.group(1))
            continue
        row = parse_event_line(line, current_year, anchor_map, url)
        if not row:
            continue
        key = (row["date_text"], row["event_name"], row["city"])
        if key in seen:
            continue
        seen.add(key)
        rows.append(row)
    return rows


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=DEFAULT_URL)
    p.add_argument("--out", default=DEFAULT_OUT)
    p.add_argument("--timeout", type=int, default=30)
    p.add_argument("--min-rows", type=int, default=200, help="fail if fewer rows parse (layout change)")
    args = p.parse_args()
    try:
        rows = scrape(args.url, args.timeout)
    except Exception as exc:
        print(f"Scrape failed: {exc}", file=sys.stderr)
        return 1
    if len(rows) < args.min_rows:
        print(f"Scrape parsed only {len(rows)} rows (< {args.min_rows}); source layout probably changed", file=sys.stderr)
        return 2
    out = Path(args.out)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"Saved {len(rows)} festival rows to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
