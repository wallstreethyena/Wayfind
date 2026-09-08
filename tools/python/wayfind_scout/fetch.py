"""Bounded HTTPS fetcher with redirects, SSRF checks, and DNS pinning."""

from __future__ import annotations

import http.client
import socket
import ssl
from urllib.parse import urljoin, urlsplit

from .policy import ScoutError, assert_public_host, normalized_host

MAX_BYTES = 1_000_000
MAX_REDIRECTS = 3
REDIRECTS = {301, 302, 303, 307, 308}


def _connection(host, ip, timeout):
    """Connect to the validated IP while TLS still verifies the original host."""
    connection = http.client.HTTPSConnection(
        host, 443, timeout=timeout, context=ssl.create_default_context()
    )
    create_connection = connection._create_connection
    connection._create_connection = lambda address, *args, **kwargs: create_connection(
        (ip, address[1]), *args, **kwargs
    )
    return connection


def _request(current, host, addresses, timeout, connection_factory):
    parsed = urlsplit(current)
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    last_error = None
    for address in addresses:
        connection = connection_factory(host, address, timeout)
        try:
            connection.request(
                "GET",
                target,
                headers={
                    "Accept": "application/ld+json, application/json, text/calendar, application/rss+xml, application/atom+xml, text/html;q=0.8",
                    "User-Agent": "WayfindScout/0.1 (+https://gowayfind.com)",
                },
            )
            return connection, connection.getresponse()
        except (OSError, TimeoutError, ssl.SSLError, http.client.HTTPException) as exc:
            last_error = exc
            connection.close()
    raise ScoutError("Source request failed") from last_error


def fetch_https(
    url,
    approved_hosts,
    *,
    timeout=8,
    resolver=socket.getaddrinfo,
    connection_factory=_connection,
):
    hosts = {str(host).rstrip(".").casefold() for host in approved_hosts}
    current = str(url)
    for _ in range(MAX_REDIRECTS + 1):
        host = normalized_host(current)
        if host not in hosts:
            raise ScoutError("Fetch or redirect host is not approved")
        addresses = assert_public_host(host, resolver=resolver)
        connection, response = _request(current, host, addresses, timeout, connection_factory)
        try:
            if response.status in REDIRECTS:
                location = response.getheader("Location")
                if not location:
                    raise ScoutError("Source redirect omitted its destination")
                current = urljoin(current, location)
                continue
            if not 200 <= response.status < 300:
                raise ScoutError(f"Source returned HTTP {response.status}")
            length = response.getheader("Content-Length")
            try:
                declared_length = int(length) if length is not None else None
            except ValueError as exc:
                raise ScoutError("Source returned an invalid content length") from exc
            if declared_length is not None and declared_length > MAX_BYTES:
                raise ScoutError("Source payload exceeds the one-megabyte ceiling")
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ScoutError("Source payload exceeds the one-megabyte ceiling")
            content_type = str(response.getheader("Content-Type") or "").split(";", 1)[0].strip()
            return {"url": current, "content_type": content_type, "body": body}
        finally:
            connection.close()
    raise ScoutError("Source exceeded the redirect ceiling")
