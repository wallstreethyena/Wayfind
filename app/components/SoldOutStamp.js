// A red rubber stamp "SOLD OUT" laid over a sold out event's photo (owner
// 2026-11-20: "a stamp on it that's sold out so that the user knows").
// Coded, not a picture file: no image rights question, crisp at any size.
// Solid ink with a slightly rough edge (an SVG displacement filter); speckled
// ink was unreadable on busy night photos (live check 2026-11-20). It never takes
// clicks (pointer-events: none) and carries the words for screen readers.
export const SOLD_OUT_STAMP_CSS = `
.wf-soldout{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(20,4,8,.45)}
.wf-soldout svg{width:min(78%,360px);height:auto;transform:rotate(-12deg);filter:drop-shadow(0 0 1px rgba(255,255,255,.55)) drop-shadow(0 3px 8px rgba(0,0,0,.5))}
`;

export default function SoldOutStamp({ id = "wf-soldout" }) {
  const f = id + "-ink";
  return (
    <div className="wf-soldout" data-sold-out-stamp="" role="img" aria-label="Sold out">
      <svg viewBox="0 0 400 130" aria-hidden="true">
        <defs>
          <filter id={f} x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="3" result="w" />
            <feDisplacementMap in="SourceGraphic" in2="w" scale="2.5" />
          </filter>
        </defs>
        <g filter={`url(#${f})`} fill="none" stroke="#E0262C">
          <rect x="6" y="6" width="388" height="118" rx="22" strokeWidth="9" />
          <rect x="20" y="20" width="360" height="90" rx="12" strokeWidth="3" />
          <text x="200" y="88" textAnchor="middle" fill="#E0262C" stroke="none" fontFamily="'Arial Black','Helvetica Neue',Impact,sans-serif" fontWeight="900" fontSize="62" letterSpacing="4">SOLD OUT</text>
        </g>
      </svg>
    </div>
  );
}
