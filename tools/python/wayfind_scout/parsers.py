"""Strict structured-data parsers. RSS dates are discovery timestamps only."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin
from xml.etree import ElementTree
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .policy import ScoutError


def _clean(value, limit=1000):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def _hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _iso(value):
    raw = _clean(value, 80)
    if not re.match(r"^\d{4}-\d{2}-\d{2}(?:T|$)", raw):
        return None
    try:
        datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return raw


class _JsonLdScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag.casefold() != "script":
            return
        values = {k.casefold(): v for k, v in attrs}
        if str(values.get("type") or "").casefold() == "application/ld+json":
            self.active = True
            self.parts = []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag.casefold() == "script" and self.active:
            self.scripts.append("".join(self.parts))
            self.active = False


def _nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from _nodes(item)
    elif isinstance(value, dict):
        graph = value.get("@graph")
        if graph is not None:
            yield from _nodes(graph)
            if "@type" not in value:
                return
        yield value


def _explicitly_empty_jsonld(value):
    if value == []:
        return True
    return (
        isinstance(value, dict)
        and value.get("@graph") == []
        and set(value).issubset({"@context", "@graph"})
    )


def parse_jsonld(body, source_url):
    text = body.decode("utf-8", errors="strict")
    payloads = []
    if text.lstrip().startswith(("{", "[")):
        payloads = [text]
    else:
        parser = _JsonLdScripts()
        parser.feed(text)
        payloads = parser.scripts
        if not payloads:
            raise ScoutError("HTML source contained no JSON-LD payload")
    if len(payloads) > 50:
        raise ScoutError("JSON-LD script ceiling reached; refusing a partial result")
    records = []
    decoded = 0
    nonempty_payload = False
    for raw in payloads:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        decoded += 1
        nonempty_payload = nonempty_payload or not _explicitly_empty_jsonld(parsed)
        for node in _nodes(parsed):
            kinds = node.get("@type", [])
            kinds = [kinds] if isinstance(kinds, str) else kinds
            kinds = {str(x).casefold() for x in kinds if isinstance(x, str)}
            if "event" in kinds:
                start = _iso(node.get("startDate"))
                if not _clean(node.get("name")) or not start:
                    continue
                location = node.get("location") if isinstance(node.get("location"), dict) else {}
                record = {
                    "kind": "event",
                    "title": _clean(node.get("name"), 240),
                    "start": start,
                    "end": _iso(node.get("endDate")),
                    "description": _clean(node.get("description")),
                    "location_name": _clean(location.get("name"), 240),
                    "event_url": urljoin(source_url, str(node.get("url") or source_url)),
                }
            elif kinds.intersection(
                {"place", "localbusiness", "touristattraction", "museum", "park"}
            ):
                if not _clean(node.get("name")):
                    continue
                record = {
                    "kind": "place",
                    "title": _clean(node.get("name"), 240),
                    "description": _clean(node.get("description")),
                    "event_url": urljoin(source_url, str(node.get("url") or source_url)),
                }
            else:
                continue
            evidence = json.dumps(record, sort_keys=True, separators=(",", ":"))
            record["evidence_sha256"] = _hash(evidence)
            records.append(record)
    if payloads and decoded == 0:
        raise ScoutError("JSON-LD source contained no valid JSON payload")
    if nonempty_payload and not records:
        raise ScoutError("JSON-LD source contained no usable place or event records")
    return records


def _unfold_ics(text):
    lines = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _ics_date(value):
    raw = value.strip()
    for pattern, output in (
        (r"^\d{8}$", "%Y%m%d"),
        (r"^\d{8}T\d{6}Z$", "%Y%m%dT%H%M%SZ"),
        (r"^\d{8}T\d{6}$", "%Y%m%dT%H%M%S"),
    ):
        if re.match(pattern, raw):
            try:
                parsed = datetime.strptime(raw, output)
                return parsed.strftime("%Y-%m-%d" + ("T%H:%M:%S" if "T" in raw else "")) + (
                    "Z" if raw.endswith("Z") else ""
                )
            except ValueError:
                return None
    return None


def parse_ics(body, source_url):
    decoded = body.decode("utf-8", errors="strict")
    if "BEGIN:VCALENDAR" not in decoded or "END:VCALENDAR" not in decoded:
        raise ScoutError("ICS source is missing its VCALENDAR envelope")
    events, current, seen = [], None, 0
    for line in _unfold_ics(decoded):
        if line == "BEGIN:VEVENT":
            seen += 1
            current = {}
            continue
        if line == "END:VEVENT":
            if current and current.get("title") and current.get("start"):
                evidence = json.dumps(current, sort_keys=True, separators=(",", ":"))
                current["evidence_sha256"] = _hash(evidence)
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        left, value = line.split(":", 1)
        key = left.split(";", 1)[0].upper()
        value = value.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";")
        if key == "SUMMARY":
            current["kind"] = "event"
            current["title"] = _clean(value, 240)
        elif key == "DTSTART":
            current["start"] = _ics_date(value)
            match = re.search(r"(?:^|;)TZID=([^;:]+)", left, flags=re.IGNORECASE)
            if match:
                timezone_name = match.group(1)
                try:
                    ZoneInfo(timezone_name)
                except ZoneInfoNotFoundError:
                    current["start"] = None
                else:
                    current["timezone"] = timezone_name
        elif key == "DTEND":
            current["end"] = _ics_date(value)
        elif key == "DESCRIPTION":
            current["description"] = _clean(value)
        elif key == "LOCATION":
            current["location_name"] = _clean(value, 240)
        elif key == "URL":
            current["event_url"] = urljoin(source_url, value.strip())
    for event in events:
        event.setdefault("event_url", source_url)
    if seen and not events:
        raise ScoutError("ICS source contained no usable VEVENT records")
    return events


def parse_rss(body, source_url):
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError as exc:
        raise ScoutError("RSS/Atom source is malformed XML") from exc
    root_kind = root.tag.rsplit("}", 1)[-1].casefold()
    if root_kind not in ("rss", "feed"):
        raise ScoutError("RSS/Atom source has the wrong document type")
    leads = []
    items = list(root.iter("item")) + [x for x in root.iter() if x.tag.endswith("entry")]
    for item in items:
        values = {}
        for child in item:
            key = child.tag.rsplit("}", 1)[-1].casefold()
            if key == "link" and child.get("href"):
                values[key] = child.get("href")
            elif child.text:
                values[key] = child.text
        title = _clean(values.get("title"), 240)
        raw_link = _clean(values.get("link"), 1000)
        if not title or not raw_link:
            continue
        link = urljoin(source_url, raw_link)
        published = _clean(
            values.get("pubdate") or values.get("published") or values.get("updated"), 100
        )
        evidence = json.dumps(
            {"title": title, "link": link, "published": published}, sort_keys=True
        )
        leads.append(
            {
                "kind": "discovery_lead",
                "title": title,
                "event_url": link,
                "published_at": published or None,
                "start": None,
                "date_authority": "not_event_date",
                "evidence_sha256": _hash(evidence),
            }
        )
    if items and not leads:
        raise ScoutError("RSS/Atom source contained no usable entries")
    return leads


def parse_source(fmt, body, source_url):
    if fmt == "ics":
        return parse_ics(body, source_url)
    if fmt == "jsonld":
        return parse_jsonld(body, source_url)
    if fmt in ("rss", "atom"):
        return parse_rss(body, source_url)
    raise ScoutError("Unsupported source format")
