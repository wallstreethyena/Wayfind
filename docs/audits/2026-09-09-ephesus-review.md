# Ephesus identity review

Reviewed September 9, 2026. The production `wf_inventory` rows are:

| Place ID | Name | Coordinates | State |
| --- | --- | --- | --- |
| `ChIJNblf529rw4gRV-g7pW90fGI` | Ephesus Mediterranean Delights | `27.3194297, -82.5783096` | `OPERATIONAL`, unexcluded, no review flag |
| `ChIJj1pZOABrw4gRDH0EH8jmQa4` | Ephesus Mediterranean Delights II | `27.3181834, -82.5784783` | `OPERATIONAL`, unexcluded, no review flag |

The records are approximately 139.6 m apart and share the `food` category. [SRQ Magazine's September 2026 profile](https://www.srqmagazine.com/articles/2426/The%20Sweet%20Layers%20of%20the%20Mediterranean) has a dedicated “Ephesus Mediterranean Delights II” section. It quotes General Manager Kerim Dagli as overseeing both locations, “Ephesus I and II,” around the bend from each other. The same article identifies Ephesus I at 27 N Boulevard of the Presidents, Sarasota, FL 34236, and gives phone 352-217-3195.

The [St. Armands Circle municipal BID directory](https://uploads-ssl.webflow.com/633c69ed1c04965b20dca03d/63e17a596f32dd84d7432090_DIRECTORY%20BLUE%20LARGEtext%2011x17%20NEW%20QR%20CODE%20REVISED%20FEB23%20NEW%20no%20crops%20%281%29.pdf), created February 6, 2023, independently lists Ephesus Mediterranean Delights in the West Quadrant. Current [Uber Eats](https://www.ubereats.com/store/ephesus-mediterranean-delights/tMSYnok2TPeSMDpinwZP-g) and [Tripadvisor](https://www.tripadvisor.co.uk/Restaurant_Review-g34618-d23587331-Reviews-Ephesus_Mediterranean_Delights-Sarasota_Florida.html) listings corroborate Ephesus I at that address.

## Decision

These are two locations of the same operator, not duplicate pins for one premise. Preserve both inventory records and suppress this pair from the active duplicate queue with an identity-scoped reviewed-distinct decision. The exact numbered street address for Ephesus II was not published by the current profile; do not infer one from its coordinate.
