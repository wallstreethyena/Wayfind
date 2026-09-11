#!/usr/bin/env python3
"""Stdlib regression tests for the starvation audit's trust boundary."""
from __future__ import annotations

import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("audit_candidate_starvation.py")
SPEC = importlib.util.spec_from_file_location("candidate_starvation_audit", MODULE_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(AUDIT)


def valid_measurement():
    return {
        "measurementVersion": 1,
        "surface": "sample",
        "route": "app/api/sample/route.js",
        "lat": 27.1,
        "lng": -82.2,
        "categories": ["food", "nightlife"],
        "old": {"reachedClassifier": 2, "qualified": 1},
        "next": {
            "rowsRead": {"food": 2, "nightlife": 1},
            "rows": 3, "servable": 3, "withinRadius": 2, "qualified": 2,
            "sourceFailures": 0, "unknownFailures": 0,
            "truncated": False, "complete": True,
        },
        "readEvidence": {
            "perCategory": {
                "food": {"status": "fulfilled", "rows": 2, "truncated": False, "error": None},
                "nightlife": {"status": "fulfilled", "rows": 1, "truncated": False, "error": None},
            },
            "sourceFailures": 0, "unknownFailures": 0, "failures": [],
            "actualTruncated": False, "complete": True,
        },
        "recovered": 1,
        "rails": [{"id": "dinner", "old": 1, "next": 2}],
    }


SURFACE = {
    "id": "sample", "route": "app/api/sample/route.js",
    "categories": ["food", "nightlife"], "rails": ["dinner"],
    "railsNotMeasured": None,
}


class MetroTests(unittest.TestCase):
    def test_deduplicates_valid_metros_in_order(self):
        self.assertEqual(AUDIT.parse_metros("tampa,parrish,tampa"), ["tampa", "parrish"])

    def test_rejects_empty_and_unknown_metros(self):
        for value in ("", ",", "tampa,", "tampa,unknown", "unknown"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                AUDIT.parse_metros(value)


class MeasurementTests(unittest.TestCase):
    def test_accepts_complete_identity_bound_evidence(self):
        self.assertEqual(AUDIT.validate_measurement(valid_measurement(), SURFACE, 27.1, -82.2), [])

    def test_rejects_identity_coordinates_and_count_corruption(self):
        changes = [
            ("surface", "other"),
            ("lat", 27.2),
            ("lat", float("nan")),
            ("lng", float("inf")),
            ("categories", ["food"]),
        ]
        for key, value in changes:
            result = valid_measurement()
            result[key] = value
            with self.subTest(key=key):
                self.assertTrue(AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2))
        result = valid_measurement()
        result["next"]["qualified"] = 4
        self.assertIn("next admission counts are inconsistent", AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2))

    def test_rejects_missing_per_category_and_fake_completeness(self):
        result = valid_measurement()
        del result["readEvidence"]["perCategory"]["nightlife"]
        self.assertTrue(AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2))

        result = valid_measurement()
        item = result["readEvidence"]["perCategory"]["nightlife"]
        item.update(status="rejected", rows=None, truncated=None, error="timeout")
        result["readEvidence"].update(sourceFailures=1, unknownFailures=1,
                                      failures=[{"category": "nightlife", "error": "timeout"}],
                                      actualTruncated=None, complete=False)
        result["next"].update(rowsRead={"food": 2, "nightlife": None}, sourceFailures=1,
                              unknownFailures=1, truncated=None, complete=False)
        self.assertEqual(AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2), [])
        result["next"]["complete"] = True
        self.assertTrue(AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2))

    def test_accepts_honestly_reported_truncation_as_incomplete(self):
        result = valid_measurement()
        result["readEvidence"]["perCategory"]["food"]["truncated"] = True
        result["readEvidence"].update(actualTruncated=True, complete=False)
        result["next"].update(truncated=True, complete=False)
        self.assertEqual(AUDIT.validate_measurement(result, SURFACE, 27.1, -82.2), [])


class WatchlistTests(unittest.TestCase):
    def test_labels_source_only_and_detects_changed_and_retired_shapes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "app/api/intent-candidates/route.js"
            target.parent.mkdir(parents=True)
            target.write_text("serveFromInventory(cat, lat, lng, radius, PER_CAT_N); return places.slice(0, limit);", encoding="utf8")
            rows = AUDIT.evaluate_watchlist(root)
            first = rows[0]
            self.assertEqual(first["classification"], "SOURCE_HYPOTHESIS")
            self.assertEqual(first["sourceStatus"], "MATCHED")
            target.write_text("return completeOwnedCandidates;", encoding="utf8")
            self.assertEqual(AUDIT.evaluate_watchlist(root)[0]["sourceStatus"], "CHANGED")
            target.unlink()
            self.assertEqual(AUDIT.evaluate_watchlist(root)[0]["sourceStatus"], "RETIRED")


if __name__ == "__main__":
    unittest.main()
