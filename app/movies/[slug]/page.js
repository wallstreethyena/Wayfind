// Wayfind movie page: /movies/<registry id>. Server component, statically generated from the
// seasonal movies registry (lib/seasonalMovies.js) and refreshed hourly so Now playing / Opens flips
// on release day. Layout reuses the event detail shell. The buy button is the same attributed
// /api/commerce/go Undercover Tourist movie ticket handoff the rail card sells; the purchase happens at
// the partner. Nearby theaters are intentionally absent: no free, location free theater source exists.
import { notFound } from "next/navigation";
import EventDetailShell from "../../components/EventDetailShell.js";
import EventExperienceStyles from "../../components/EventExperienceStyles.js";
import ShareButton from "../../components/ShareButton.js";
import MovieTicketButton from "./MovieTicketButton.js";
import { pageShareUrl } from "../../../lib/pageShareUrl.js";
import { siteTodayStr } from "../../../lib/siteTime.js";
import { partnerTicketLabel } from "../../../lib/partnerCopy.js";
import {
  allMovieIds, movieById, otherMovies, movieMetadata, movieJsonLd, movieWhen, movieRuntimeLabel,
  movieBuyHref, moviePath, MOVIE_BUY_NOTE, MOVIE_PAGE_SURFACE, MOVIE_TICKET_OFFER,
} from "../../../lib/moviePages.js";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return allMovieIds().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const hit = movieById(params.slug, siteTodayStr());
  if (!hit) return { title: "Movie not found | Wayfind", alternates: { canonical: "https://www.gowayfind.com/" }, robots: { index: false, follow: true } };
  return movieMetadata(hit.movie);
}

const MOVIE_CSS = `
.wf-movie-poster{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#0b0f15}
.wf-event-hero .wf-movie-poster{height:clamp(400px,64vw,560px)}
.wf-movie-poster .wf-movie-bg{position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;filter:blur(26px) saturate(1.2);opacity:.45}
.wf-movie-poster .wf-movie-art{position:relative;width:auto;height:88%;max-width:86%;aspect-ratio:400/592;object-fit:cover;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.14)}
.wf-movie-tile{flex-direction:column;gap:10px;color:#FFC08F;font-size:15px;font-weight:700}
.wf-movie-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0;list-style:none}
.wf-movie-chips li{padding:6px 12px;border:1px solid #394553;border-radius:999px;color:#ffad72;font-size:13px;font-weight:600}
.wf-movie-why{font-size:17px;line-height:1.55;color:#e6edf3;margin:6px 0 0}
.wf-movie-buy{display:flex;flex-direction:column;gap:10px}
.wf-movie-buy p{margin:0;font-size:13.5px;line-height:1.5;color:#c3ccd7}
.wf-movie-more{max-width:980px;margin:34px auto 0}
.wf-movie-more h2{font-size:20px;font-weight:600;margin:0 0 14px;color:#f5f4ef}
.wf-movie-more-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 14px;scroll-snap-type:x proximity;overscroll-behavior-x:contain}
.wf-movie-more-row a{flex:0 0 132px;scroll-snap-align:start;text-decoration:none;color:#e6edf3;display:block}
.wf-movie-more-row img,.wf-movie-more-row .wf-movie-more-ph{display:block;width:132px;aspect-ratio:400/592;object-fit:cover;border-radius:10px;border:1px solid #27313d;background:#141a22}
.wf-movie-more-row b{display:block;margin-top:8px;font-size:13.5px;line-height:1.3;font-weight:650}
.wf-movie-more-row small{display:block;margin-top:3px;font-size:12px;color:#ff9a55;font-weight:600}
@media(max-width:640px){.wf-event-wrap{padding:20px 16px 56px}.wf-event-booking{padding:22px 18px}}
`;

export default function MoviePage({ params }) {
  const today = siteTodayStr();
  const hit = movieById(params.slug, today);
  if (!hit) notFound();
  const { movie } = hit;
  const when = movieWhen(movie);
  const art = movie.art && movie.art.src ? movie.art : null;
  const runtime = movieRuntimeLabel(movie.runtimeMin);
  const others = otherMovies(movie.id, today);
  const label = partnerTicketLabel("Undercover Tourist", { product: "movie-voucher", card: true });

  const media = art
    ? <div className="wf-event-photo wf-movie-poster">
        <img className="wf-movie-bg" src={art.src} alt="" aria-hidden="true" width="400" height="592" />
        <img className="wf-movie-art" src={art.src} alt={`${movie.title} poster`} width="400" height="592" />
      </div>
    : <div className="wf-event-photo wf-movie-poster wf-movie-tile" role="img" aria-label={`${movie.title}: poster coming soon`}><span style={{ fontSize: 44 }}>🎬</span><span>{when.label === "Opens" ? "Coming soon" : "Now playing"}</span></div>;

  return (
    <div className="wf-event-experience">
      <EventExperienceStyles />
      <style dangerouslySetInnerHTML={{ __html: MOVIE_CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(movieJsonLd(movie)) }} />
      <div className="wf-event-wrap">
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
          <a href="/" aria-label="Wayfind home" style={{ display: "inline-flex", alignItems: "center" }}><img src="/brand/wayfind-official-white.png" alt="Wayfind" width="132" height="38" style={{ width: 132, height: "auto", display: "block" }} /></a>
          <a href="/" style={{ color: "#FDBA74", fontWeight: 850, textDecoration: "none", fontSize: 13.5 }}>‹ Back to Wayfind</a>
        </nav>
        <EventDetailShell
          title={movie.title}
          facts={[
            { label: "When", value: when.text },
            { label: "Rated", value: movie.rating || null },
            { label: "Runtime", value: runtime },
          ]}
          story={<>
            <div className="wf-event-story-label">Why go</div>
            <p className="wf-movie-why">{movie.why}</p>
            <ul className="wf-movie-chips" aria-label="Vibes">{movie.vibes.map((v) => <li key={v}>{v}</li>)}</ul>
          </>}
          actions={<>
            <div className="wf-movie-buy">
              <MovieTicketButton href={movieBuyHref(movie.id)} label={label} movieId={movie.id} provider={MOVIE_TICKET_OFFER.provider} offerId={MOVIE_TICKET_OFFER.offerId} surface={MOVIE_PAGE_SURFACE} />
              <p>{MOVIE_BUY_NOTE}</p>
            </div>
            <ShareButton url={pageShareUrl(`/movies/${movie.id}`)} title={`${movie.title} in Theaters`} text={`${movie.title} is ${when.text.toLowerCase()}. On Wayfind.`} label="Share" tone="dark" event="page_share" meta={{ surface: "movie_page", movie: movie.id, placement: "actions" }} />
          </>}
          note={null}
          credit={null}
          media={media}
        />
        {others.length ? (
          <section className="wf-movie-more" id="more-movies" aria-label="Other movies in theaters">
            <h2>Other movies in theaters</h2>
            <div className="wf-movie-more-row" role="region" aria-label="Other movies in theaters" tabIndex={0}>
              {others.map(({ movie: m }) => (
                <a key={m.id} href={moviePath(m.id)} aria-label={m.title}>
                  {m.art && m.art.src ? <img src={m.art.src} alt={`${m.title} poster`} width="132" height="196" loading="lazy" /> : <div className="wf-movie-more-ph" />}
                  <b>{m.title}</b>
                  <small>{movieWhen(m).text}</small>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
