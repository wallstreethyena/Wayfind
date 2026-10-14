#!/usr/bin/env python3
"""Strict parse of Wayfind "Remind me" calendar files with real RFC 5545 libraries.

Called by scripts/test-event-reminder-ics.mjs, never by a person. Reads a JSON list
of {"file": path} on argv[1], parses each file with icalendar (strict) and, when
installed, vobject, and prints one JSON object per file with everything the node
side asserts on: UTC instants resolved TWO ways (the library's TZID lookup and
the file's own VTIMEZONE rules), the alarm, the TZIDs used and defined, decoded
text properties, and line-ending / folding facts. Exit code 2 when a file does
not parse. No network, no writes.
"""
import json, sys, re, subprocess
from datetime import datetime, timezone

import icalendar

UTC = timezone.utc


def utc(dt):
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def vtimezone_utc(cal, wall, tzid):
    """UTC of a naive wall time using ONLY the VTIMEZONE block that is in the file."""
    for vtz in cal.walk("VTIMEZONE"):
        if str(vtz.get("TZID")) == tzid:
            tz = vtz.to_tz()
            aware = wall.replace(tzinfo=tz)
            return utc(aware)
    return None


def one(path):
    raw = open(path, "rb").read()
    text = raw.decode("utf-8")
    cal = icalendar.Calendar.from_ical(raw)
    events = cal.walk("VEVENT")
    out = {"file": path, "events": len(events), "parser": "icalendar " + icalendar.__version__}
    out["crlf_only"] = ("\n" not in text.replace("\r\n", ""))
    out["ends_crlf"] = text.endswith("\r\n")
    out["max_octets"] = max(len(line.encode("utf-8")) for line in text.split("\r\n"))
    ev = events[0]
    out["uid"] = str(ev.get("UID"))
    out["summary"] = str(ev.get("SUMMARY"))
    out["location"] = str(ev.get("LOCATION")) if ev.get("LOCATION") else None
    out["description"] = str(ev.get("DESCRIPTION"))
    out["url"] = str(ev.get("URL"))
    out["method"] = str(cal.get("METHOD"))
    out["version"] = str(cal.get("VERSION"))
    ds = ev["DTSTART"]
    de = ev["DTEND"]
    value_type = ds.params.get("VALUE")
    out["dtstart_value"] = value_type
    tzid = ds.params.get("TZID")
    out["dtstart_tzid"] = tzid
    out["dtend_tzid"] = de.params.get("TZID")
    if value_type == "DATE":
        out["dtstart_date"] = ds.dt.isoformat()
        out["dtend_date"] = de.dt.isoformat()
    else:
        start, end = ds.dt, de.dt
        out["dtstart_wall"] = start.replace(tzinfo=None).isoformat()
        out["dtstart_utc"] = utc(start)
        out["dtend_utc"] = utc(end)
        out["dtstart_utc_from_vtimezone"] = vtimezone_utc(cal, start.replace(tzinfo=None), tzid)
        out["dtend_utc_from_vtimezone"] = vtimezone_utc(cal, end.replace(tzinfo=None), de.params.get("TZID"))
    alarms = ev.walk("VALARM")
    out["alarms"] = len(alarms)
    if alarms:
        a = alarms[0]
        trig = a["TRIGGER"]
        out["trigger_value"] = trig.params.get("VALUE")
        out["trigger_is_datetime"] = isinstance(trig.dt, datetime)
        out["trigger_tz_aware"] = isinstance(trig.dt, datetime) and trig.dt.tzinfo is not None
        out["alarm_utc"] = utc(trig.dt) if isinstance(trig.dt, datetime) else None
        out["alarm_action"] = str(a.get("ACTION"))
        out["trigger_raw"] = [l for l in text.split("\r\n") if l.startswith("TRIGGER")][0]
    used = set(re.findall(r"TZID=([^:;\r\n]+)", re.sub(r"\r\n[ \t]", "", text)))
    defined = {str(v.get("TZID")) for v in cal.walk("VTIMEZONE")}
    out["tzids_used"] = sorted(used)
    out["tzids_defined"] = sorted(defined)
    # Round trip: serialise with the library and parse again.
    again = icalendar.Calendar.from_ical(cal.to_ical()).walk("VEVENT")[0]
    out["roundtrip_ok"] = (str(again.get("UID")) == out["uid"] and str(again.get("SUMMARY")) == out["summary"]
                           and again["DTSTART"].dt == ds.dt and again["DTEND"].dt == de.dt)
    # The library's own preview CLI (python -m icalendar.cli): must exit 0 and name the event.
    cli = subprocess.run([sys.executable, "-m", "icalendar.cli", path], capture_output=True, text=True)
    out["cli_rc"] = cli.returncode
    out["cli_has_summary"] = ("Summary" in cli.stdout) and (out["summary"].split("\n")[0][:20] in cli.stdout)
    try:
        import vobject
        v = vobject.readOne(text)
        out["vobject_ok"] = True
        vev = v.vevent
        out["vobject_summary"] = str(vev.summary.value)
        if value_type != "DATE":
            out["vobject_dtstart_utc"] = utc(vev.dtstart.value)
        va = vev.valarm
        out["vobject_alarm_utc"] = utc(va.trigger.value) if isinstance(va.trigger.value, datetime) else None
    except ImportError:
        out["vobject_ok"] = None
    return out


results = []
rc = 0
for case in json.load(open(sys.argv[1])):
    try:
        results.append(one(case["file"]))
    except Exception as exc:  # a file the parser rejects is the finding
        results.append({"file": case["file"], "error": repr(exc)})
        rc = 2
print(json.dumps(results))
sys.exit(rc)
