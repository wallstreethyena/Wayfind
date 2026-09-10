// One honesty rule for event imagery that is a REPRESENTATIVE scene rather
// than a photograph of the named event. app/api/events sets imageScene only
// when a curated event had no real image and received the category+city stock
// fallback. The reader must be told that whenever that exact image is shown.
//
// This is intentionally pure so the disclosure can be regression-tested
// without rendering the entire events screen.
export const EVENT_SCENE_LABEL = "Scene photo";
export const EVENT_SCENE_TITLE = "Representative scene for this event category and city, not a photo of the named event.";

export function eventSceneChip(event, selectedImage) {
  if (!event || event.imageScene !== true) return null;
  const stockImage = typeof event.image === "string" ? event.image : "";
  if (!stockImage || !selectedImage || selectedImage !== stockImage) return null;
  return {
    key: "scene-photo",
    icon: "◌",
    label: EVENT_SCENE_LABEL,
    title: EVENT_SCENE_TITLE,
  };
}
