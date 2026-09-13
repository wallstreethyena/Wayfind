export const RAIL_RENDER_STATE = Object.freeze({
  CONTENT: "content",
  LOADING: "loading",
  ERROR: "error",
  HIDDEN: "hidden",
});

export function railRenderState(items, { loading = false, error = false } = {}) {
  if (Array.isArray(items) && items.length > 0) return RAIL_RENDER_STATE.CONTENT;
  if (error) return RAIL_RENDER_STATE.ERROR;
  if (loading) return RAIL_RENDER_STATE.LOADING;
  return RAIL_RENDER_STATE.HIDDEN;
}

export function visibleRails(rails, itemsKey) {
  if (!Array.isArray(rails)) return [];
  return rails.filter((rail) => railRenderState(rail?.[itemsKey]) === RAIL_RENDER_STATE.CONTENT);
}
