"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only.
// PageInner aliases cityFixM as "cityFix" locally; this file calls
// ctx.cityFixM directly (same function, already flowing through ctx).
import { C, PlaceScoreChip } from "../kit";
import { HeroPill, HeroIconButton, HeroCta } from "../CollectionHero";
import EditorialLandingHero, { editorialHeroCss } from "../EditorialLandingHero";
import { byTopRated } from "../../../lib/ranking";
import { shareTextFor } from "../../../lib/shareCards";
import { CouponStrip, PerfectRightNow, ScoreDisclosure } from "../ExperienceBlocks";
import { nowContext, siteHourFloat } from "../../../lib/nowContext.js";
import { experienceHeader } from "../../../lib/collectionHeader.js";
import { areaSeasonalContext } from "../../../lib/areaSeasonalContext.js";
import { currentSeason } from "../../../lib/seasons.js";

export default function ExperienceScreen({ ctx }) {
  const { activeBadge, setActiveBadge, EXPERIENCES, expPlaces, expMi, setExpMi, expSort, setExpSort, expTours, expLoading, momentPicks, setBrowseCat, setIntent, setScreen, shareLink, listShareUrl, locName, showToast, logEvent, giveawayMark, setMapListOverride, hookLikes, toggleHookLike, saveHookList, ViatorRail, Loader, SortControl, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, blurbs, openExperience, openCuisine, PlaceCard, cityFixM, intentScopeLabel, center, weather, clipCoupon, setWalletOpen } = ctx;
          const exp = EXPERIENCES[activeBadge];
          let list = expPlaces || [];
          if (expMi < 60) list = list.filter((p) => p.distMi == null || p.distMi <= expMi);
          if (expSort === "near") list = [...list].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
          else if (expSort === "rated") list = [...list].sort(byTopRated); // v6.42 (owner, PERMANENT): Top rated = displayed Wayfind Score ONLY. The old distance penalty (-1.3/mi past 4, cap 30) is REMOVED — it made 9.4 sit above 9.8 ("Top Rated Near You", Parrish repro)
          else if (expSort === "price") list = [...list].sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0)));
          else list = [...list].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          // The eight home category chips use the beach-inspired editorial
          // header system while preserving this screen's exact PlaceCard list.
          // Back and Share remain primary; map and save move directly below the
          // hero so the headline stays concise.
          //
          // EXPERIENCES rows carry no heroImage (app/home.js:880), so the photo
          // comes from the list itself, falling back to a tour image. A hero
          // with no photo still renders: the scrim alone reads as a deliberate
          // dark title block, never as a broken image.
          //
          // Sourced from expPlaces (the UNSORTED, UNFILTERED pool), not from
          // `list`: reading the sorted view would swap the hero photo every time
          // the user changes sort or drags the radius, which is a full image
          // reload behind the headline for no informational gain.
          // v6.72: an EXPERIENCES row MAY now declare a fixed heroImage, and it wins.
            // Great Outdoors was rendering whatever photo the top result carried,
            // which surfaced a theme-park MAP rather than a photograph — not a weak
            // photo, the wrong kind of image. The dynamic chain below is unchanged,
            // so every row WITHOUT a heroImage behaves exactly as it did.
            const heroImg = (exp && exp.heroImage) || (((expPlaces || []).find((pp) => pp && pp.photo) || {}).photo) || ((expTours || []).find((t) => t && t.image_url) || {}).image_url || null;
          const listLiked = hookLikes.has("badge-" + activeBadge);
          const mappable = list.filter((pp) => pp && pp.lat != null);
          const shareThisList = () => { shareLink(cityFixM(exp.title), listShareUrl(activeBadge, cityFixM(exp.title), list.length, locName), () => showToast("Link copied"), shareTextFor(activeBadge, cityFixM(exp.title)), () => { try { logEvent("share", null, { kind: "list", theme: activeBadge }); } catch (e) {} giveawayMark("list:" + activeBadge); }); };
          const headerCity = locName ? locName.split(",")[0] : "your area";
          const headerArea = areaSeasonalContext(headerCity, currentSeason());
          const header = experienceHeader(activeBadge, exp, headerCity, headerArea);
          const momentContext = nowContext({ city: headerCity, weather });
          return (
            <div>
              <style dangerouslySetInnerHTML={{ __html: editorialHeroCss("wf-experience-editorial") }} />
              <EditorialLandingHero
                prefix="wf-experience-editorial"
                heroImg={heroImg}
                imageKicker={header.imageKicker}
                imageTitle={header.imageTitle}
                toplineLeft={header.eyebrow}
                toplineRight={headerCity}
                headlineId="wf-experience-title"
                headline={header.title}
                dekLead={header.dekLead}
                dekBody={header.deck}
                backControl={(
                  <HeroPill ariaLabel="Back" onClick={() => { setActiveBadge(null); setIntent(null); setBrowseCat(null); setScreen("suggested"); try { window.scrollTo(0, 0); } catch (e) {} }}>‹ Back</HeroPill>
                )}
                actionSlot={<HeroCta accent={C.accent} ariaLabel="Share list" onClick={shareThisList}>↗ Share this list</HeroCta>}
                trustLines={[]}
              />
              <div aria-label="List tools" style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "0 0 12px" }}>
                {mappable.length ? (
                  <HeroIconButton ariaLabel="See this list on the map" title="See on map" onClick={() => { setMapListOverride(mappable.slice(0, 20)); setScreen("map"); try { logEvent("maps_list", null, { theme: activeBadge, n: Math.min(list.length, 20), inapp: 1 }); } catch (e) {} }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg>
                  </HeroIconButton>
                ) : null}
                <HeroIconButton active={listLiked} ariaLabel={listLiked ? "Saved to lists" : "Save to lists"} title={listLiked ? "Saved to lists" : "Save to lists"} onClick={() => { toggleHookLike("badge-" + activeBadge); saveHookList({ id: "badge-" + activeBadge, key: activeBadge, title: cityFixM(exp.title), label: cityFixM(exp.title) }, list); }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={listLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                </HeroIconButton>
              </div>
              {/* v6.17 deals strip, v6.72 EXTRACTED. The markup moved to
                  app/components/ExperienceBlocks.js so all nine intent pages and
                  this sheet render one strip from one file. Behaviour is
                  unchanged: live, verified coupons tagged for this moment
                  (lib/coupons.js `intents`), expired ones auto-hidden by
                  couponsForIntent, soonest-ending first, absent when there are
                  none. */}
              <CouponStrip intentId={activeBadge} lat={ctx.center && ctx.center.lat} lng={ctx.center && ctx.center.lng} onOpenCoupons={(coupon) => { if (coupon) clipCoupon(coupon); setWalletOpen(!!coupon); setScreen("coupons"); }} onLog={logEvent} />
              {EXPERIENCES[activeBadge] && EXPERIENCES[activeBadge].viator && <ViatorRail title={EXPERIENCES[activeBadge].viatorMode === "gems" ? "Hidden gem experiences" : "Top-rated experiences"} items={expTours} theme={activeBadge} onLog={logEvent} onOpenExternal={ctx.openExternal} />}
              {/* v6.72 EXTRACTED — same rank number, name, PlaceScoreChip and
                  `why` line, now shared with every intent page. The badge match
                  stays HERE because it is this screen's concern: momentPicks is
                  fetched per badge and a stale payload from the previous badge
                  must not render under the new one. */}
              {!expLoading && momentPicks && momentPicks.badge === activeBadge
                ? <PerfectRightNow picks={momentPicks.picks} places={expPlaces} durablePlaces={list} context={momentContext} onOpenPlace={openDetail} />
                : null}
              {/* Moment fix (MOMENT_PICKS_DIAGNOSIS.md, Phase 3): never instruct
                  "Tap any" at zero — the count line only shows when there's
                  something to tap. */}
              {!expLoading && list.length > 0 && <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>{list.length} curated pick{list.length === 1 ? "" : "s"} · Tap any to see full details</div>}
              {expLoading && <Loader label="Curating the best spots" pad="8px 2px" />}
              {/* v4.98 GLOBAL RULE (user direction): every list — browse,
                  sheets, experiences — shows ONE control: the standard
                  SortControl (Top rated default, 17-mi default radius). No
                  extra chip bars, no "Open now" toggle, no dice chip on
                  list views, here or anywhere else. */}
              {!expLoading && (expPlaces || []).length > 0 && (
                <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <SortControl sortBy={expSort} onSort={setExpSort} mi={expMi} onMi={setExpMi} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={false} dealsOnly={false} onDeals={null} />
                </div>
              )}
              {!expLoading && activeBadge === "instagram" && (expPlaces || []).length > 0 && (() => {
                // Owner (2026-07-21): "the photo tip needs to be easier to
                // understand" — plain words, one action each, no jargon.
                // NOT a recommendation bucket — this is solar position, and it
                // legitimately needs finer granularity than morning/afternoon/
                // night (golden hour is ~90 minutes). It still takes its hour
                // from the one source so it cannot drift from the rest of the
                // page by a timezone.
                const h = siteHourFloat();
                let light;
                if (h < 8) light = "Soft morning light right now. Keep the sun off to one side — never shoot straight into it.";
                else if (h < 11) light = "Put the sun behind you, so faces come out bright and even.";
                else if (h < 15) light = "Harsh midday sun right now. Step into shade — no squinting, no hard shadows.";
                else if (h < 18) light = "Good light right now. Let the sun hit your subject from the side, not from behind you.";
                else if (h < 20) light = "Golden hour — the best light of the day. Put the sun behind them, then tap their face on screen so it brightens.";
                else light = "It's dark. Rest your phone on something steady, and use the city lights or sky as the background.";
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.pink, marginBottom: 8 }}>📸 Get the shot — right now</div>
                    <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: 8, fontWeight: 600 }}>{light}</div>
                    <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.6 }}>
                      <div style={{ marginBottom: 4 }}>🎯 Don't center them — place your subject a little off to one side.</div>
                      <div style={{ marginBottom: 4 }}>🚶 Skip the stiff pose. Have them walk, laugh, or look away from the camera.</div>
                      <div>📐 Crouch down — a low angle makes people and places look bigger.</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>General tips based on the time of day — not specific to each spot.</div>
                  </div>
                );
              })()}
              {/* Moment fix (Phase 3): the empty state states the scope that was
                  ACTUALLY searched (expMi + intent + place), never a fixed
                  "60 miles" the view didn't search, and offers one useful
                  action: widen the radius. It only renders after the fetch
                  finished (expLoading false), so there's no flash of false
                  "nothing" during loading. */}
              {!expLoading && list.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{exp.icon}</div>
                  <strong style={{ display: "block", color: C.light }}>No {intentScopeLabel ? intentScopeLabel(activeBadge) : "spots"} within {expMi} miles of {locName ? locName.split(",")[0] : "you"} yet</strong>
                  <span style={{ fontSize: 13 }}>We searched {expMi} miles and nothing cleared the bar. {expMi < 60 ? "Widen the range and we'll keep looking." : "Try another moment, or move the map."}</span>
                  {expMi < 60 && (
                    <div style={{ marginTop: 14 }}>
                      <button onClick={() => setExpMi(60)} style={{ padding: "9px 16px", borderRadius: 999, background: C.adim, border: `1px solid ${C.border}`, color: C.light, fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 44 }}>Search within 60 miles</button>
                    </div>
                  )}
                </div>
              )}
              {!expLoading && list.map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} selectedBadge={activeBadge} />
              ))}
              <ScoreDisclosure />
            </div>
          );
}
