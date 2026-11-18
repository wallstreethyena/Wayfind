// Home landing: the seasonal poster opens itself only on a visitor's FIRST visit (owner, 2026-11-16).
// "Image 1 is great for when the user first goes to wayfind. But when they go back to the page" they should see
// the poster shelf. A returning visit lands on the shelf; a Back navigation or reload inside 30 minutes still
// restores whatever poster the visitor had open (wf_poster_position), exactly as before.
//
// Decided BEFORE paint by a tiny head script (the home page is statically rendered with the poster open), which
// marks <html data-wf-shelf>. CSS hides the server-rendered open poster while the mark is present, and
// DaypartRail closes it and removes the mark in a layout effect, so a returning visitor never sees it flash.

export const HOME_VISITED_KEY = "wf_home_visited";
export const HOME_SHELF_ATTR = "data-wf-shelf";
export const POSTER_RESUME_KEY = "wf_poster_position";
export const POSTER_RESUME_MS = 30 * 60 * 1000;

/**
 * The same decision the head script makes, as a pure function for tests.
 * @returns {boolean} true when this landing should show the shelf instead of opening the seasonal poster.
 */
export function landsOnShelf({ pathname, visitedBefore, savedPoster, nowMs }) {
  if (pathname !== "/") return false;
  if (!visitedBefore) return false;
  if (savedPoster && Number.isFinite(Number(savedPoster.ts)) && nowMs - Number(savedPoster.ts) < POSTER_RESUME_MS) return false;
  return true;
}

/** Inline head script. Marks the first visit, and the shelf landing for every visit after it. */
export function homeShelfScript() {
  return "(function(){try{if(location.pathname!=='/')return;var k='" + HOME_VISITED_KEY + "';var seen=localStorage.getItem(k);"
    + "localStorage.setItem(k,String(Date.now()));if(!seen)return;var s=null;try{s=JSON.parse(sessionStorage.getItem('" + POSTER_RESUME_KEY + "')||'null')}catch(e){}"
    + "if(s&&isFinite(s.ts)&&Date.now()-s.ts<" + POSTER_RESUME_MS + ")return;"
    + "document.documentElement.setAttribute('" + HOME_SHELF_ATTR + "','1')}catch(e){}})();";
}

/** While the mark is present, the server-rendered open poster stays hidden and the shelf looks unselected. */
export const HOME_SHELF_CSS = "html[" + HOME_SHELF_ATTR + "] .wf8.is-open .wf8-menusec{display:none}"
  + "html[" + HOME_SHELF_ATTR + "] .wf8.is-open .wf8-tile,html[" + HOME_SHELF_ATTR + "] .wf8.is-open .wf8-tile.is-sel{opacity:1;filter:none;transform:none;animation:none}"
  + "html[" + HOME_SHELF_ATTR + "] .wf8.is-open .wf8-railhint{display:block}";
