# Social acquisition conveyor v1

This job finds indexed short-video links without fetching Instagram, TikTok,
Facebook, or YouTube pages. It uses SerpAPI's documented Google Short Videos
result, normalizes the links, and stores them in the private
`wf_social_discoveries` inbox.

For each query region, the job reads only the matching owned-inventory metros
and applies the existing conservative identity resolver. A unique literal place
name becomes a private location candidate. It is not marked verified and cannot
publish; official place/address evidence must still confirm it.

The job refuses to search unless SerpAPI's account endpoint proves all of the
following at runtime:

- the account is active;
- the monthly plan price is exactly $0;
- enough free searches remain for the requested run;
- Wayfind's atomic provider ledger accepts the call under its four-call daily
  ceiling.

An indexed title and observed view count can create a trend signal. They cannot
create a card. Search results do not prove likes, shares, a destination, an
event date, ticket availability, or display rights. Those facts remain null
until a permitted source actually supplies them.

The next stage promotes only leads that pass `fl-fall-v1`: explicit seasonal
evidence plus either an owner-approved creator or a strictly observed like
count greater than 1,000. Location and current-year facts must then be verified
against Wayfind inventory and an official organizer, venue, booking, ticketing,
or structured source before publication.
