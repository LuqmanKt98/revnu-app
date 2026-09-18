"use client";
import React from "react";
// =================================================================
//  FloorPlan — clean schematic unit floor plan (SVG), parametrised by
//  unit type (bedrooms / baths / area / levels). Architectural line-art
//  with room labels, balcony/terrace tied to the design accent, north
//  arrow, scale bar and a stair glyph on multi-floor units.
//
//  window.FloorPlan({ type, palette, view, level })  → one level's <svg>
//  window.unitLevels(type)         → number of floors (1 for flats)
//  window.unitLevelName(type, i)   → label for floor i
// =================================================================

const INK = "#2A2622";
const WALL = 3;
const LIGHT = "#F4F1EA", LIGHTK = "#ECE7DC", LIGHTB = "#E4EDEE", HALL = "#F0EDE6";

function arLabel(label) {
  if (!(window.I18N && window.I18N.isAR)) return label;
  const M = { "Living / Dining": "معيشة / طعام", "Kitchen": "مطبخ", "Entry": "مدخل", "Stair": "درج",
    "Master Bedroom": "غرفة النوم الرئيسية", "Ensuite": "حمّام خاص", "Bath": "حمّام", "Balcony": "شرفة",
    "Terrace": "تراس", "Guest Bedroom": "غرفة ضيوف", "Powder / Study": "ضيوف / مكتب", "Lounge": "جلوس",
    "Powder": "دورة مياه", "Family": "عائلية" };
  if (M[label]) return M[label];
  const bm = label.match(/^Bedroom (\d+)$/);
  if (bm) return "غرفة نوم " + bm[1];
  return label;
}
function unitLevels(type) { return (type && type.levels) || 1; }
function unitLevelName(type, i) {
  if (type && type.levelNames && type.levelNames[i]) return type.levelNames[i];
  return "Floor " + (i + 1);
}

// ---- single-floor flat ------------------------------------------------
function buildFlat(bed, bath, accent) {
  const W = 520, H = 360, m = 20;
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  const rooms = [];
  const balW = 40;
  rooms.push({ x: x1 - balW, y: y0, w: balW, h: y1 - y0, label: "Balcony", fill: accent, balcony: true });
  const rx1 = x1 - balW;
  const interiorW = rx1 - x0;
  const leftW = Math.round(interiorW * (bed >= 3 ? 0.46 : 0.52));
  const midX = x0 + leftW;
  const totalH = y1 - y0;
  const livH = Math.round(totalH * 0.62);
  rooms.push({ x: x0, y: y0, w: leftW, h: livH, label: "Living / Dining", fill: LIGHT, big: true });
  const kW = Math.round(leftW * 0.56);
  rooms.push({ x: x0, y: y0 + livH, w: kW, h: totalH - livH, label: "Kitchen", fill: LIGHTK });
  rooms.push({ x: x0 + kW, y: y0 + livH, w: leftW - kW, h: totalH - livH, label: "Entry", fill: HALL, small: true });
  const rightW = rx1 - midX;
  const bedH = Math.floor(totalH / bed);
  for (let i = 0; i < bed; i++) {
    const by = y0 + i * bedH;
    const h = (i === bed - 1) ? (y1 - by) : bedH;
    const label = i === 0 ? "Master Bedroom" : ("Bedroom " + (i + 1));
    if (i < bath) {
      const bw = Math.round(rightW * 0.33);
      rooms.push({ x: midX, y: by, w: rightW - bw, h, label, fill: LIGHT });
      rooms.push({ x: midX + (rightW - bw), y: by, w: bw, h, label: i === 0 ? "Ensuite" : "Bath", fill: LIGHTB, small: true });
    } else {
      rooms.push({ x: midX, y: by, w: rightW, h, label, fill: LIGHT });
    }
  }
  return { W, H, x0, y0, x1, y1, rooms, entry: true };
}

// ---- duplex / multi-floor --------------------------------------------
function buildLevel(bed, bath, accent, lvl) {
  const W = 520, H = 360, m = 20;
  const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
  const rooms = [];
  const stripW = 38;
  const isUpper = lvl >= 1;
  rooms.push({ x: x1 - stripW, y: y0, w: stripW, h: y1 - y0, label: isUpper ? "Balcony" : "Terrace", fill: accent, balcony: true });
  const rx1 = x1 - stripW;
  const iw = rx1 - x0, ih = y1 - y0;

  if (!isUpper) {
    // LOWER — entertaining level
    const hasGuest = bed >= 4;
    const leftW = Math.round(iw * 0.56);
    const livH = Math.round(ih * 0.60);
    rooms.push({ x: x0, y: y0, w: leftW, h: livH, label: "Living / Dining", fill: LIGHT, big: true });
    const kW = Math.round(leftW * 0.58);
    rooms.push({ x: x0, y: y0 + livH, w: kW, h: ih - livH, label: "Kitchen", fill: LIGHTK });
    const esW = leftW - kW, esH = Math.round((ih - livH) / 2);
    rooms.push({ x: x0 + kW, y: y0 + livH, w: esW, h: esH, label: "Entry", fill: HALL, small: true });
    rooms.push({ x: x0 + kW, y: y0 + livH + esH, w: esW, h: ih - livH - esH, label: "Stair", fill: HALL, small: true, stair: true });
    const rcx = x0 + leftW, rcw = rx1 - rcx;
    if (hasGuest) {
      const gH = Math.round(ih * 0.52);
      const bw = Math.round(rcw * 0.34);
      rooms.push({ x: rcx, y: y0, w: rcw - bw, h: gH, label: "Guest Bedroom", fill: LIGHT });
      rooms.push({ x: rcx + (rcw - bw), y: y0, w: bw, h: gH, label: "Bath", fill: LIGHTB, small: true });
      rooms.push({ x: rcx, y: y0 + gH, w: rcw, h: ih - gH, label: "Powder / Study", fill: HALL, small: true });
    } else {
      const pH = Math.round(ih * 0.30);
      rooms.push({ x: rcx, y: y0, w: rcw, h: ih - pH, label: "Lounge", fill: LIGHT });
      rooms.push({ x: rcx, y: y0 + ih - pH, w: rcw, h: pH, label: "Powder", fill: LIGHTB, small: true });
    }
  } else {
    // UPPER — sleeping level
    const upperBeds = Math.max(1, bed >= 4 ? bed - 1 : bed);
    const upperBaths = Math.max(1, bath - 1);
    const leftW = Math.round(iw * 0.30);
    const stairH = Math.round(ih * 0.34);
    rooms.push({ x: x0, y: y0, w: leftW, h: stairH, label: "Stair", fill: HALL, small: true, stair: true });
    rooms.push({ x: x0, y: y0 + stairH, w: leftW, h: ih - stairH, label: "Family", fill: LIGHT, small: true });
    const rcx = x0 + leftW, rcw = rx1 - rcx;
    const bedH = Math.floor(ih / upperBeds);
    for (let i = 0; i < upperBeds; i++) {
      const by = y0 + i * bedH;
      const h = (i === upperBeds - 1) ? (y1 - by) : bedH;
      const label = i === 0 ? "Master Bedroom" : ("Bedroom " + (i + 1));
      if (i < upperBaths) {
        const bw = Math.round(rcw * 0.32);
        rooms.push({ x: rcx, y: by, w: rcw - bw, h, label, fill: LIGHT });
        rooms.push({ x: rcx + (rcw - bw), y: by, w: bw, h, label: i === 0 ? "Ensuite" : "Bath", fill: LIGHTB, small: true });
      } else {
        rooms.push({ x: rcx, y: by, w: rcw, h, label, fill: LIGHT });
      }
    }
  }
  return { W, H, x0, y0, x1, y1, rooms, entry: !isUpper };
}

function StairGlyph({ r }) {
  const n = 5;
  const horiz = r.w >= r.h;
  const lines = [];
  for (let i = 1; i < n; i++) {
    if (horiz) {
      const x = r.x + (r.w * i) / n;
      lines.push(<line key={i} x1={x} y1={r.y + 4} x2={x} y2={r.y + r.h - 4} stroke={INK} strokeWidth="1" strokeOpacity="0.45" />);
    } else {
      const y = r.y + (r.h * i) / n;
      lines.push(<line key={i} x1={r.x + 4} y1={y} x2={r.x + r.w - 4} y2={y} stroke={INK} strokeWidth="1" strokeOpacity="0.45" />);
    }
  }
  return <g>{lines}</g>;
}

function FloorPlan({ type, palette, view, level }) {
  const bed = Math.max(1, (type && type.bedrooms) || 1);
  const bath = Math.max(1, (type && type.baths) || 1);
  const accent = (palette && palette[1]) || "#C9B89A";
  const levels = unitLevels(type);
  const lvl = level || 0;
  const { W, H, x0, y0, x1, y1, rooms, entry } = levels > 1 ? buildLevel(bed, bath, accent, lvl) : buildFlat(bed, bath, accent);

  return (
    <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", aspectRatio: W + " / " + H, fontFamily: "'JetBrains Mono', monospace" }} role="img" aria-label="Unit floor plan">
      <rect x="0" y="0" width={W} height={H} fill="#FCFBF8" />
      {rooms.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} stroke={INK} strokeWidth={WALL} strokeOpacity={r.balcony ? 0.35 : 1} fillOpacity={r.balcony ? 0.5 : 1} />
          {r.stair ? <StairGlyph r={r} /> : null}
          {r.balcony ? (
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill={INK} fontSize="9.5" textAnchor="middle" transform={"rotate(90 " + (r.x + r.w / 2) + " " + (r.y + r.h / 2) + ")"} letterSpacing="0.12em" opacity="0.85">{arLabel(r.label).toUpperCase()}</text>
          ) : (
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill={INK} textAnchor="middle" dominantBaseline="middle" fontSize={r.small ? 8.5 : (r.big ? 11 : 10)} letterSpacing="0.04em">
              {arLabel(r.label).split(" / ").map((line, li, arr) => (
                <tspan key={li} x={r.x + r.w / 2} dy={li === 0 ? (arr.length > 1 ? "-0.5em" : "0") : "1.15em"}>{line}</tspan>
              ))}
            </text>
          )}
        </g>
      ))}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" stroke={INK} strokeWidth={WALL + 2} />
      {entry ? <path d={"M " + (x0 + 4) + " " + (y1 - 4) + " a 26 26 0 0 1 26 -26"} fill="none" stroke={INK} strokeWidth="1.2" strokeOpacity="0.5" /> : null}
      <g transform={"translate(" + (W - 30) + "," + 30 + ")"}>
        <path d="M 0 -12 L 5 6 L 0 1 L -5 6 Z" fill={INK} />
        <text x="0" y="18" fill={INK} fontSize="8" textAnchor="middle" letterSpacing="0.1em">N</text>
      </g>
      <g transform={"translate(" + x0 + "," + (H - 8) + ")"}>
        <line x1="0" y1="0" x2="60" y2="0" stroke={INK} strokeWidth="1.4" />
        <line x1="0" y1="-3" x2="0" y2="3" stroke={INK} strokeWidth="1.4" />
        <line x1="60" y1="-3" x2="60" y2="3" stroke={INK} strokeWidth="1.4" />
        <text x="66" y="3" fill={INK} fontSize="8" letterSpacing="0.06em">5 m</text>
      </g>
    </svg>
  );
}

window.FloorPlan = FloorPlan;
window.unitLevels = unitLevels;
window.unitLevelName = unitLevelName;

export { FloorPlan, unitLevels, unitLevelName };
