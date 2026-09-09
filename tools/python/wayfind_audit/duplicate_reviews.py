"""Narrow, sourced review decisions; changed identity must return to review."""

# Official restaurants have different names and premises. A fuzzy suffix match
# (both end in Coconut Grove) is not evidence they are the same business.
DISTINCT_PAIRS = [
    {
        "identities": {
            "ChIJJ-YCrau32YgRrR2M1W_RPF4": "sadelle s coconut grove",
            "ChIJgW_5qc632YgRJp09efZfDEg": "isabelle s coconut grove",
        },
        "category": "food",
        "reviewed_at": "2026-09-09",
        "reason": "Distinct restaurants confirmed from their own contact/location pages.",
        "sources": [
            "https://sadelles.com/coconut-grove-contact",
            "https://www.isabellescoconutgrove.com/contact-location",
        ],
    },
]


def distinct_review(left_id, right_id, left_name, right_name, category):
    identities = {left_id: left_name, right_id: right_name}
    for review in DISTINCT_PAIRS:
        if review["identities"] == identities and review["category"] == category:
            return {k: review[k] for k in ("reviewed_at", "reason", "sources")}
    return None
