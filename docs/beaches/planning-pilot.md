# Beach planning pilot

Five beaches were selected from actual FDOH Caspio county results fetched on September 7, 2026: Coquina (north and south stations), Cortez, Manatee Public Beach North, Lido Casino Beach and Siesta Key Beach. All six matched station rows returned collection date August 31, 2026. These observations establish coverage only; no measurement is embedded as a live fixture.

Entry points: `/beach-conditions`, the Sarasota/Anna Maria ranking page and geographically matched beach detail cards. The selected beach can be linked using `?beach=coquina`, `cortez`, `manatee`, `lido` or `siesta`.

## Evidence rules

- Each station retains its own collection date and reported advisory field; missing advisory markup parses as null. The newest matching dated row wins, regardless of response order. Missing/NR results remain unknown.
- Swimming advisories are explicitly scoped to the sample report. This pilot does not claim a live all-clear or independently monitor local closures. Closure status stays Unknown and flags Unavailable until a verified official feed is integrated.
- FWC displays the original abundance category, sampling location, date and distance. No mapping of “background” into “not present.” Evidence outside eight days or ten miles is excluded. Nearby sampling never stands in for on-beach sampling.
- NWS forecast issuance is distinct from retrieval time. More than six-hour-old forecasts produce no period comparison. Alerts older than five minutes or unavailable suppress comparisons; known hazards remain prominent.
- Ordinary code compares daylight rain probabilities <=30%, with no storm wording. Any storm in the next 24 hours, official alert, reported advisory, Poor sample or closure suppresses the comparison. This is not a validated comfort model.
- No safety score, inferred rip-current risk from waves, lightning countdown, seaweed inference or paid per-view model call.
- Existing marine hero now refuses to call missing weather or missing/malformed alerts “great.”

## Sources and operation

FDOH program: https://www.floridahealth.gov/environmental-health/beach-water-quality/index.html
FDOH results widget: https://b3.caspio.com/dp/cb8a100003f7272d1f294c7b8cc9
FWC: https://myfwc.com/research/redtide/statewide/
NWS API: https://www.weather.gov/documentation/services-web-api
NWS thunder guidance: https://www.weather.gov/safety/lightning-tips

Read-only pilot. No database migration, Google Places fetch, new subscription or model use. NWS documents free use with rate limits. Normal hosting requests still consume resources. Cached county results and one regional FWC query reduce upstream work; weather cached ten minutes, alerts one minute. Every upstream request has a seven-second timeout. Client requests time out after 25 seconds, clear old state on failure or beach change and refresh once a minute. All displayed retrieval dates belong to the cached fetch result, not the browser's refresh clock.

## Release preflight

On September 7 main at 14b52a83 was confirmed READY on Vercel deployment dpl_GEKe8nDPYshKjmM1kW2xSiV6DnpA, assigned to gowayfind.com and www.gowayfind.com. Open PRs #1134, #1144 and #1145 reported mergeable=false; #1144 additionally documents an inactive Maps Embed API, #1145 outstanding browser/build gates. #1142 is a draft design prototype, not a finished booking integration. No open change was blindly merged as a prerequisite to this pilot.
