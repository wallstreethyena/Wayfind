# Google Ads account for Wayfind

**Audit the right account.** Every Wayfind Google Ads campaign lives in customer ID **553-622-6713**, the account named "Wayfind" and verified to WAYFIND LLC. That includes the Florida campaigns:

- WF | Florida Guides | Search
- WF | Florida Video | Demand Gen

**Account 505-826-0233 is not the Wayfind campaign account.** On 2026-09-22 an audit read 505-826-0233 through a connector. It found zero campaigns and zero conversion actions, and briefly concluded that the Florida campaign might be missing. It was not missing: the audit had looked at the wrong account. Never draw campaign, billing, delivery or conversion conclusions from 505-826-0233.

## How the site reports to that account

- **Conversion tag:** `AW-18342267447`. This is `DEFAULT_ADS_ID` in `lib/analytics.js`, overridable by `NEXT_PUBLIC_GOOGLE_ADS_ID`.
- **Partner-click conversion:** one conversion action, `affiliate_click`, labelled by `NEXT_PUBLIC_ADS_LABEL_AFFILIATE`. It is sent for:
  - the seven legacy `*_out` events;
  - `partner_click`, which only `CommerceClickBeacon` sends. The beacon sends it only after checking that the click really goes through one of our four partner redirect routes. Owner, internal and bot browsers are skipped.
- **Pages the beacon is mounted on:**
  - every `/guides` route, through `app/guides/layout.js`;
  - `/go/florida`;
  - `/florida-events`.

## Before any Google Ads audit

1. Open account 553-622-6713, either in the Ads UI (`ocid=8425026675`) or through a connector pointed at that customer ID. Confirm the account name is "Wayfind".
2. Confirm the conversion tag in that account is `AW-18342267447`, and that the `affiliate_click` action's label matches `NEXT_PUBLIC_ADS_LABEL_AFFILIATE` in Vercel Production.
3. Only then read campaigns, spend, billing status or conversions.
