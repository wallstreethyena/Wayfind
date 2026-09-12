// Editorial mode for dated decision briefs.
//
// A normal Wayfind guide is a discovery page: choose-quickly shortcuts, a
// bookable rail, live deal cards, weather "right now", and keep-exploring
// paths. A dated brief is a story. The flag lives on the guide object so a
// new brief opts in without a slug `if` in JSX, and every other guide keeps
// its existing commerce chrome.
//
// Expire promotion. Never break a published /guides URL.

export const GUIDE_COMMERCE_CHROME = Object.freeze({
  chooseQuickly: true,
  exploreBridge: true,
  bookableHighlights: true,
  liveNow: true,
  liveDeals: true,
  keepExploring: true,
});

const EDITORIAL_CHROME = Object.freeze({
  chooseQuickly: false,
  exploreBridge: false,
  bookableHighlights: false,
  liveNow: false,
  liveDeals: false,
  keepExploring: false,
});

export function isEditorialGuide(guide) {
  return !!(guide && guide.editorialMode === true);
}

export function guideCommerceChrome(guide) {
  return isEditorialGuide(guide) ? EDITORIAL_CHROME : GUIDE_COMMERCE_CHROME;
}
