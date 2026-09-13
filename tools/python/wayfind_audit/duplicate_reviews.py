"""Narrow, sourced review decisions; changed identity must return to review."""

# Official businesses have different names and premises. A fuzzy suffix match
# is not evidence they are the same business.
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
    {
        "identities": {
            "ChIJNblf529rw4gRV-g7pW90fGI": "ephesus mediterranean delights",
            "ChIJj1pZOABrw4gRDH0EH8jmQa4": "ephesus mediterranean delights ii",
        },
        "category": "food",
        "reviewed_at": "2026-09-09",
        "reason": "A September 2026 local profile quotes the general manager identifying Ephesus I and II as two locations around the bend from each other; the city BID directory independently lists the Ephesus storefront in St. Armands' West Quadrant.",
        "sources": [
            "https://www.srqmagazine.com/articles/2426/The%20Sweet%20Layers%20of%20the%20Mediterranean",
            "https://uploads-ssl.webflow.com/633c69ed1c04965b20dca03d/63e17a596f32dd84d7432090_DIRECTORY%20BLUE%20LARGEtext%2011x17%20NEW%20QR%20CODE%20REVISED%20FEB23%20NEW%20no%20crops%20%281%29.pdf",
        ],
    },
]


def distinct_review(left_id, right_id, left_name, right_name, category):
    identities = {left_id: left_name, right_id: right_name}
    for review in DISTINCT_PAIRS:
        if review["identities"] == identities and review["category"] == category:
            return {k: review[k] for k in ("reviewed_at", "reason", "sources")}
    return None
