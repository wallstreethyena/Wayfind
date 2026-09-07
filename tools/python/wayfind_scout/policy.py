"""Manifest validation and source-rights preflight."""

from __future__ import annotations

import ipaddress
import socket
from datetime import date, datetime, timezone
from urllib.parse import urlparse


class ScoutError(ValueError):
    """A controlled scout failure safe to show without source payloads."""


BLOCKED_HOST_SUFFIXES = ("yelp.com", "tripadvisor.com")
ALLOWED_FORMATS = {"ics", "jsonld", "rss", "atom"}
ALLOWED_SOURCE_CLASSES = {
    "official_venue",
    "official_tourism",
    "government",
    "public_library",
    "official_api",
}


def _bool(value, field):
    if type(value) is not bool:
        raise ScoutError(f"{field} must be boolean")
    return value


def normalized_host(url):
    parsed = urlparse(str(url))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ScoutError("Every source URL must be credential-free HTTPS")
    host = parsed.hostname.rstrip(".").casefold()
    if any(host == blocked or host.endswith("." + blocked) for blocked in BLOCKED_HOST_SUFFIXES):
        raise ScoutError("Yelp and Tripadvisor pages are not permitted scout sources")
    if parsed.port not in (None, 443):
        raise ScoutError("Source URLs may use HTTPS port 443 only")
    return host


def assert_public_host(host, resolver=socket.getaddrinfo):
    """Reject local/private/link-local destinations before every live request."""
    try:
        answers = resolver(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ScoutError("Source hostname could not be resolved") from exc
    addresses = {row[4][0].split("%", 1)[0] for row in answers}
    if not addresses:
        raise ScoutError("Source hostname resolved to no addresses")
    for raw in addresses:
        address = ipaddress.ip_address(raw)
        if not address.is_global:
            raise ScoutError("Source hostname resolves outside the public internet")
    return sorted(addresses)


def validate_manifest(data, *, today=None):
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ScoutError("Manifest schema_version must be 1")
    if data.get("mode") != "dry_run":
        raise ScoutError("Scout mode must be dry_run")
    places = data.get("places")
    sources = data.get("sources")
    if not isinstance(places, list) or not isinstance(sources, list):
        raise ScoutError("Manifest places and sources must be arrays")
    if not 1 <= len(places) <= 500:
        raise ScoutError("Pilot must contain 1..500 places")
    if not 1 <= len(sources) <= 25:
        raise ScoutError("Pilot must contain 1..25 approved sources")

    place_ids = set()
    for place in places:
        if not isinstance(place, dict):
            raise ScoutError("Every place must be an object")
        place_id = str(place.get("place_id") or "").strip()
        name = str(place.get("name") or "").strip()
        if not place_id or not name or place_id in place_ids:
            raise ScoutError("Places require unique non-empty place_id and name")
        place_ids.add(place_id)
        if place.get("status") != "OPERATIONAL":
            raise ScoutError("Pilot places must be OPERATIONAL")
        if _bool(place.get("excluded"), "place.excluded") or _bool(
            place.get("needs_review"), "place.needs_review"
        ):
            raise ScoutError("Pilot places must be unflagged")
        for coord, low, high in (("lat", -90, 90), ("lng", -180, 180)):
            value = place.get(coord)
            if value is not None and (type(value) not in (int, float) or not low <= value <= high):
                raise ScoutError(f"place.{coord} is invalid")

    source_ids = set()
    now_date = today or datetime.now(timezone.utc).date()
    for source in sources:
        if not isinstance(source, dict):
            raise ScoutError("Every source must be an object")
        source_id = str(source.get("source_id") or "").strip()
        if not source_id or source_id in source_ids:
            raise ScoutError("Sources require unique non-empty source_id")
        source_ids.add(source_id)
        if source.get("status") != "approved":
            raise ScoutError("Every fetched source must have approved status")
        if source.get("source_class") not in ALLOWED_SOURCE_CLASSES:
            raise ScoutError("Source class is not approved for this pilot")
        if source.get("format") not in ALLOWED_FORMATS:
            raise ScoutError("Source format must be ICS, JSON-LD, RSS, or Atom")
        feed_host = normalized_host(source.get("url"))
        approved_hosts = source.get("approved_hosts")
        if not isinstance(approved_hosts, list) or not approved_hosts:
            raise ScoutError("Every source needs an approved_hosts allowlist")
        hosts = {str(host).rstrip(".").casefold() for host in approved_hosts}
        if feed_host not in hosts:
            raise ScoutError("Source URL host is not approved")
        mapped = source.get("place_ids")
        if (
            not isinstance(mapped, list)
            or not mapped
            or len(mapped) > 50
            or len(set(mapped)) != len(mapped)
            or any(pid not in place_ids for pid in mapped)
        ):
            raise ScoutError("Every source place_id must belong to this pilot")
        max_records = source.get("max_records")
        if type(max_records) is not int or not 1 <= max_records <= 100:
            raise ScoutError("Every source needs a max_records ceiling of 1..100")
        rights = source.get("rights")
        if not isinstance(rights, dict):
            raise ScoutError("Every source needs an explicit rights policy")
        for field in (
            "internal_use",
            "display_allowed",
            "derived_facts_allowed",
            "store_derived",
            "raw_redistribution_allowed",
            "commercial_api_allowed",
        ):
            _bool(rights.get(field), "rights." + field)
        if not rights["internal_use"] or not rights["derived_facts_allowed"]:
            raise ScoutError("Scout sources must permit internal use and derived facts")
        if not rights["store_derived"]:
            raise ScoutError("Scout sources must permit storage of derived candidates")
        if rights["raw_redistribution_allowed"] or rights["commercial_api_allowed"]:
            raise ScoutError("Pilot refuses raw redistribution and commercial API rights")
        if source.get("cost_after_free_micros") != 0:
            raise ScoutError("Pilot sources must have zero provider cost")
        ceiling = source.get("hard_fetch_ceiling_daily")
        if type(ceiling) is not int or not 1 <= ceiling <= 25:
            raise ScoutError("Every source needs a finite daily fetch ceiling of 1..25")
        retention = source.get("retention_days")
        if type(retention) is not int or not 1 <= retention <= 30:
            raise ScoutError("Pilot retention_days must be 1..30")
        try:
            verified = date.fromisoformat(source.get("rights_verified_at"))
        except (TypeError, ValueError) as exc:
            raise ScoutError("rights_verified_at must be an ISO date") from exc
        if verified > now_date or (now_date - verified).days > 90:
            raise ScoutError("Source rights review is future-dated or older than 90 days")
        if not str(source.get("rights_documentation_url") or "").startswith("https://"):
            raise ScoutError("Every source needs rights documentation")
    return data
