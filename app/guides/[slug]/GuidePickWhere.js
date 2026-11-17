import { guideWhereForRecord } from "../../../lib/guidePlaceAddress.js";

const line = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 14px",
  alignItems: "baseline",
  margin: "0 0 12px",
  color: "#cbd5e1",
  fontSize: 14.5,
  lineHeight: 1.45,
};
const link = {
  color: "#fdba74",
  fontWeight: 700,
  textUnderlineOffset: 3,
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
};

export function GuidePickWhere({ where }) {
  if (!where?.address || !where?.mapsUrl) return null;
  return (
    <p className="wf-guide-where" style={line}>
      <span>{where.address}</span>
      <a href={where.mapsUrl} target="_blank" rel="noopener noreferrer" style={link}>Directions</a>
    </p>
  );
}

export function guidePickWhere(pick, slug) {
  return guideWhereForRecord(pick, { slug });
}
