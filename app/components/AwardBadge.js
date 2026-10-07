// app/components/AwardBadge.js — THE Wayfind annual award badge. One design,
// reused every year (owner, 2026-10-06: "save this badge design permanently so
// we can re-use it every year").
//
// Master artwork: public/brand/awards/wayfind-award-badge-master.png (owner
// supplied). The laurel below is traced 1:1 from that file on its 1254x1254
// canvas, the pin and year sit at the master's exact positions, and the year
// fits inside the wreath WITHOUT touching a leaf (owner, 2026-10-06: "make sure
// the number is not on top of the leafs, make it fit perfectly"). Do not
// redraw it by hand; change only the year / title / area props.
//
// variant="sticker": laurel + pin + year, no words. Sits on a place photo.
// variant="full":    adds the award title and "IN <AREA>" lines (shares, posts).
// The pin never spins (Wayfind CTA rule).
import { useId } from "react";

export const AWARD_LAUREL_PATH = "M851,820 841,820 817,838 793,853 761,870 738,880 731,882 731,884 741,886 750,886 775,874 801,859 819,847 851,822ZM401,820 401,822 407,828 425,842 450,859 472,872 501,886 510,886 520,884 520,882 510,879 483,866 481,866 454,851 424,831 411,820ZM981,827 966,820 942,813 929,812 928,811 910,811 909,812 897,813 878,819 864,826 829,852 815,860 815,862 834,870 858,877 873,878 874,879 885,879 886,878 896,878 906,876 930,868 947,859 973,839 981,831ZM269,828 269,830 279,840 304,859 323,869 349,877 364,878 365,879 386,878 405,874 435,863 435,860 419,850 393,830 377,821 358,814 348,812 341,812 340,811 314,812 300,815 285,820ZM1066,712 1055,711 1054,710 1044,710 1043,709 1015,710 995,714 976,721 956,733 944,743 915,775 898,791 898,793 911,792 912,791 960,792 961,791 977,789 999,781 1022,767 1044,746 1061,723 1066,714ZM185,712 188,720 205,744 229,767 252,781 271,788 291,792 338,791 339,792 353,793 353,791 331,770 322,759 301,738 284,726 270,719 248,712 237,711 236,710 225,710 224,709 198,710 197,711ZM929,595 927,595 924,598 912,616 904,632 897,653 895,663 895,671 894,672 894,692 895,693 895,702 896,703 896,711 898,721 898,734 895,750 889,766 882,778 870,794 860,803 860,812 862,812 884,790 912,755 929,728 937,712 945,690 948,675 948,647 947,646 947,641 941,620ZM322,595 309,622 304,641 302,666 303,667 303,677 306,691 312,708 323,730 343,761 369,792 391,814 394,814 394,806 379,791 369,778 360,761 356,750 354,741 354,732 353,731 354,711 355,710 356,693 357,692 357,672 356,671 356,663 354,653 349,637 341,620 324,595ZM1105,580 1089,581 1059,589 1040,598 1020,612 1009,623 998,637 989,652 977,677 961,702 961,704 964,704 973,699 988,694 1007,690 1027,683 1046,673 1058,664 1076,645 1089,625 1100,600ZM146,580 148,591 152,603 163,627 177,648 194,665 215,679 240,689 263,694 280,700 288,705 290,705 289,701 271,672 256,642 247,629 232,613 214,600 194,590 167,582 157,581 156,580ZM947,488 939,515 938,529 937,530 937,546 938,547 938,554 940,564 944,576 953,594 965,612 971,626 972,646 966,667 968,667 979,644 989,613 993,593 993,586 994,585 994,563 989,541 978,519 963,500 950,488ZM304,488 301,488 285,503 271,522 261,543 257,560 257,587 258,588 258,594 261,609 270,639 282,665 284,665 279,647 279,629 280,625 286,612 298,594 306,578 310,567 314,546 314,530 313,529 312,516ZM1101,444 1098,444 1085,450 1062,465 1045,481 1034,496 1027,509 1021,525 1013,568 1007,589 1007,593 1009,593 1023,582 1043,571 1056,562 1071,548 1083,532 1091,517 1099,493 1100,483 1101,482 1101,474 1102,473ZM150,444 149,447 149,474 150,475 151,489 158,513 167,531 177,545 190,558 203,568 228,582 242,593 244,593 236,561 234,544 230,526 226,514 218,498 209,485 191,467 171,453 158,446ZM919,379 920,392 924,410 928,422 935,437 948,456 961,469 982,485 995,499 999,506 1002,515 1004,536 1006,536 1006,531 1007,530 1007,493 1006,492 1005,473 1001,454 996,440 990,428 980,414 969,403 960,396 947,388 934,382 924,379ZM332,378 315,383 291,396 272,413 259,432 249,458 246,474 245,492 244,493 244,530 245,531 245,536 247,536 247,527 250,512 256,499 268,486 289,470 303,456 317,435 323,422 328,406 331,391ZM1045,321 1041,322 1030,335 1022,347 1011,370 1007,385 1007,390 1006,391 1006,418 1014,457 1015,476 1018,476 1025,465 1044,442 1055,421 1060,404 1061,391 1062,390 1060,362 1056,346ZM207,321 196,344 191,363 191,369 190,370 190,398 191,399 191,404 197,423 206,440 228,468 232,475 235,476 236,474 237,455 245,415 245,389 238,364 230,348 213,324 210,321ZM866,278 867,285 877,306 890,325 905,340 916,348 938,359 955,365 967,372 980,386 987,398 990,406 992,406 986,385 975,358 967,342 951,318 931,299 910,287 888,280 877,279 876,278ZM386,278 369,279 344,286 330,293 317,302 298,322 284,344 267,381 260,404 263,403 266,395 276,380 286,371 301,363 306,362 329,352 348,339 361,326 373,309 382,292 386,282ZM973,220 964,238 958,259 957,287 958,288 959,299 966,319 981,347 987,362 989,362 994,348 1002,332 1008,310 1008,285 1002,262 993,244 982,228 975,220ZM281,220 279,220 274,225 260,245 252,261 248,273 245,288 245,308 246,309 247,319 251,332 260,351 263,361 266,361 271,348 289,314 296,288 297,274 296,273 295,256 288,234ZM832,160 832,165 844,196 850,208 862,226 877,241 898,255 913,262 920,267 932,280 943,294 945,294 938,277 933,248 929,234 920,215 909,200 894,186 882,178 856,166ZM423,160 404,164 377,175 357,188 344,201 335,213 325,234 320,252 316,275 307,296 310,295 321,280 332,268 339,263 352,257 370,246 389,229 397,219 409,199 421,170Z";

const PIN_PATH = "M623.5 627 L507.4 488.9 A151.5 151.5 0 1 1 739.6 488.9 Z";
// The app's own face (app/fonts.js) at its heaviest weight; a CSS var only
// resolves through `style`, never through an SVG presentation attribute.
const TYPE = { fontFamily: "var(--wf-sans), Inter, 'Arial Black', system-ui, sans-serif" };

// Shrinks a long line to the badge width instead of letting it overflow.
function fitAttrs(text, size, track, max) {
  const w = text.length * size * 0.74 + text.length * track;
  return w > max ? { textLength: max, lengthAdjust: "spacingAndGlyphs" } : {};
}

export default function AwardBadge({ year, title = "", area = "", variant = "sticker", className, style, label }) {
  const rid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gid = "wfAwardGrad" + rid;
  const full = variant === "full";
  const yr = String(year || "");
  const t = String(title).toUpperCase();
  const a = area ? ("IN " + area).toUpperCase() : "";
  const aria = label || (yr + " Wayfind award" + (title ? ", " + title : "") + (area ? " in " + area : ""));
  return (
    <svg
      viewBox={full ? "40 130 1174 990" : "120 140 1014 770"}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={aria}
      className={className}
      style={style}
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="470" y1="600" x2="800" y2="300">
          <stop offset="0" stopColor="#FFD000" />
          <stop offset=".3" stopColor="#FF8A00" />
          <stop offset=".55" stopColor="#FF2E7A" />
          <stop offset=".8" stopColor="#F516E8" />
          <stop offset="1" stopColor="#8A2BFF" />
        </linearGradient>
      </defs>
      <path d={AWARD_LAUREL_PATH} fill="#FF7F0F" />
      <path d={PIN_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth="32" strokeLinejoin="round" />
      <circle cx="623.5" cy="391" r="62" fill="none" stroke={`url(#${gid})`} strokeWidth="32" />
      <text x="627" y="804" textAnchor="middle" style={TYPE} fontWeight="900" fontSize="196" textLength="448" lengthAdjust="spacingAndGlyphs" fill="#FDF0E1">{yr}</text>
      {full && t ? (
        <text x="630" y="1012" textAnchor="middle" style={TYPE} fontWeight="900" fontSize="92" letterSpacing="9" fill="#FDF0E1" {...fitAttrs(t, 92, 9, 1080)}>{t}</text>
      ) : null}
      {full && a ? (
        <text x="631" y="1090" textAnchor="middle" style={TYPE} fontWeight="800" fontSize="56" letterSpacing="13" fill="#FFD16E" {...fitAttrs(a, 56, 13, 1080)}>{a}</text>
      ) : null}
    </svg>
  );
}
