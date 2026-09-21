/* ===================================================================
   My Daily Garden — Vector artwork
   Flat, hand-drawn SVG sprites for garden cosmetics, rewards and UI
   icons. Replaces emoji everywhere. Critters are drawn on a 40x40 grid
   with the ground at y=36 so they all sit on the same baseline; UI icons
   use a 24x24 grid.
   =================================================================== */

(function () {
  "use strict";

  const C = {
    cream:   "#F3E6D2", creamDk: "#DDC9AC", white: "#FFFFFF",
    fox:     "#E8862B", foxDk:   "#C96B1C",
    navy:    "#4A5570", navyDk:  "#2E3350",
    tan:     "#C69A6D", tanDk:   "#A3764B",
    bark:    "#8A5A2B", barkDk:  "#6B4423",
    green:   "#3E8E5A", greenDk: "#276B41",
    teal:    "#2E8B8B", tealDk:  "#1F6B6B",
    blue:    "#6FA8DC", blueDk:  "#4A7FB5",
    stone:   "#BCC3CE", stoneDk: "#9AA3B0",
    gold:    "#FFB443", goldDk:  "#E0912A",
    red:     "#D2493C",
    pink:    "#F0A6B4",
    violet:  "#B48CD6",
    shade:   "rgba(38,42,69,0.13)",
  };

  const GROUND = `<ellipse cx="20" cy="37" rx="10.5" ry="2" fill="${C.shade}"/>`;

  // Small helper: a flower head of 5 petals around (x,y)
  function bloom(x, y, r, petal, centre) {
    let out = "";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      out += `<circle cx="${(x + Math.cos(a) * r).toFixed(2)}" cy="${(y + Math.sin(a) * r).toFixed(2)}" r="${(r * 0.86).toFixed(2)}" fill="${petal}"/>`;
    }
    return out + `<circle cx="${x}" cy="${y}" r="${(r * 0.72).toFixed(2)}" fill="${centre}"/>`;
  }

  // ── Critters / cosmetics (40 x 40) ──
  const CRITTER = {
    // Animals are drawn front-facing with big heads — at 30-40px a side
    // profile collapses into an unreadable blob, a face does not.
    bunny: `
      <ellipse cx="15.4" cy="10.6" rx="2.7" ry="7.2" transform="rotate(-8 15.4 10.6)" fill="${C.cream}"/>
      <ellipse cx="15.4" cy="11.2" rx="1.2" ry="4.6" transform="rotate(-8 15.4 11.2)" fill="${C.pink}"/>
      <ellipse cx="24.6" cy="10.6" rx="2.7" ry="7.2" transform="rotate(8 24.6 10.6)" fill="${C.cream}"/>
      <ellipse cx="24.6" cy="11.2" rx="1.2" ry="4.6" transform="rotate(8 24.6 11.2)" fill="${C.pink}"/>
      <ellipse cx="20" cy="30.2" rx="8.2" ry="5.9" fill="${C.cream}"/>
      <ellipse cx="13.2" cy="34.4" rx="3.1" ry="1.8" fill="${C.white}"/>
      <ellipse cx="26.8" cy="34.4" rx="3.1" ry="1.8" fill="${C.white}"/>
      <circle cx="20" cy="21.6" r="7.7" fill="${C.cream}"/>
      <circle cx="16.9" cy="21" r="1.35" fill="${C.navyDk}"/>
      <circle cx="23.1" cy="21" r="1.35" fill="${C.navyDk}"/>
      <circle cx="14.2" cy="24.4" r="1.5" fill="${C.pink}" opacity=".55"/>
      <circle cx="25.8" cy="24.4" r="1.5" fill="${C.pink}" opacity=".55"/>
      <path d="M18.6 24.4 h2.8 l-1.4 1.7 z" fill="${C.pink}"/>`,

    fox: `
      <path d="M11.4 17.2 l1.4 -7.6 l6.2 4.6 z" fill="${C.fox}"/>
      <path d="M28.6 17.2 l-1.4 -7.6 l-6.2 4.6 z" fill="${C.fox}"/>
      <path d="M13.2 15.4 l0.8 -4.2 l3.4 2.6 z" fill="${C.navyDk}" opacity=".55"/>
      <path d="M26.8 15.4 l-0.8 -4.2 l-3.4 2.6 z" fill="${C.navyDk}" opacity=".55"/>
      <ellipse cx="20" cy="30.4" rx="7.9" ry="5.7" fill="${C.fox}"/>
      <ellipse cx="20" cy="32.2" rx="4.1" ry="3.6" fill="${C.cream}"/>
      <ellipse cx="30.8" cy="29.2" rx="3.3" ry="5.6" transform="rotate(32 30.8 29.2)" fill="${C.foxDk}"/>
      <circle cx="33.4" cy="25.2" r="2.4" fill="${C.cream}"/>
      <path d="M20 28.8 q-7.7 -1.8 -7.7 -8.2 q0 -6.4 7.7 -6.4 q7.7 0 7.7 6.4 q0 6.4 -7.7 8.2 z" fill="${C.fox}"/>
      <path d="M20 28.6 q-4.4 -1.4 -4.8 -4.6 q4.8 -1.5 9.6 0 q-0.4 3.2 -4.8 4.6 z" fill="${C.cream}"/>
      <circle cx="16.6" cy="20.2" r="1.35" fill="${C.navyDk}"/>
      <circle cx="23.4" cy="20.2" r="1.35" fill="${C.navyDk}"/>
      <path d="M18.7 23.4 h2.6 l-1.3 1.7 z" fill="${C.navyDk}"/>`,

    hedgehog: `
      <path d="M6.6 33.4 q0 -13.6 13.4 -13.6 q13.4 0 13.4 13.6 z" fill="${C.barkDk}"/>
      <path d="M8.8 25 l1.4 -4.4 l3 3 z" fill="${C.bark}"/>
      <path d="M14.2 21.4 l1.6 -4.6 l3 3.4 z" fill="${C.bark}"/>
      <path d="M20 20 l2 -4.4 l2.4 4.2 z" fill="${C.bark}"/>
      <path d="M25.8 21.6 l2.8 -3.8 l1.8 4.4 z" fill="${C.bark}"/>
      <path d="M30.4 25.4 l3.4 -3 l0.8 4.6 z" fill="${C.bark}"/>
      <ellipse cx="20" cy="29.8" rx="6.9" ry="5.7" fill="${C.tan}"/>
      <circle cx="17.2" cy="28.4" r="1.25" fill="${C.navyDk}"/>
      <circle cx="22.8" cy="28.4" r="1.25" fill="${C.navyDk}"/>
      <ellipse cx="20" cy="32.4" rx="1.6" ry="1.3" fill="${C.navyDk}"/>`,

    owl: `
      <path d="M12.4 16.2 l0.6 -5 l4.4 3.4 z" fill="${C.navy}"/>
      <path d="M27.6 16.2 l-0.6 -5 l-4.4 3.4 z" fill="${C.navy}"/>
      <path d="M20 35 q-9 0 -9 -9.8 q0 -11.6 9 -11.6 q9 0 9 11.6 q0 9.8 -9 9.8 z" fill="${C.navy}"/>
      <ellipse cx="20" cy="28.4" rx="5.6" ry="6.2" fill="${C.cream}"/>
      <circle cx="15.9" cy="20.6" r="3.9" fill="${C.white}"/>
      <circle cx="24.1" cy="20.6" r="3.9" fill="${C.white}"/>
      <circle cx="16.4" cy="20.8" r="1.9" fill="${C.navyDk}"/>
      <circle cx="23.6" cy="20.8" r="1.9" fill="${C.navyDk}"/>
      <path d="M20 22.2 l2.2 3.2 l-4.4 0 z" fill="${C.gold}"/>
      <path d="M16.6 34.8 v1.7 M18.8 34.8 v1.7 M21.2 34.8 v1.7 M23.4 34.8 v1.7" stroke="${C.gold}" stroke-width="1.3" stroke-linecap="round"/>`,

    deer: `
      <path d="M15.6 12.4 q-1.4 -4 -4 -5.4 M14.8 9 q-2.6 -0.6 -3.6 -2.4 M24.4 12.4 q1.4 -4 4 -5.4 M25.2 9 q2.6 -0.6 3.6 -2.4" stroke="${C.bark}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="11.8" cy="19.4" rx="3.6" ry="2.3" transform="rotate(-26 11.8 19.4)" fill="${C.tanDk}"/>
      <ellipse cx="28.2" cy="19.4" rx="3.6" ry="2.3" transform="rotate(26 28.2 19.4)" fill="${C.tanDk}"/>
      <ellipse cx="20" cy="31" rx="6.8" ry="5" fill="${C.tan}"/>
      <ellipse cx="20" cy="21.4" rx="6.4" ry="7.1" fill="${C.tan}"/>
      <ellipse cx="20" cy="25.4" rx="3.7" ry="2.9" fill="${C.cream}"/>
      <circle cx="16.8" cy="20.2" r="1.3" fill="${C.navyDk}"/>
      <circle cx="23.2" cy="20.2" r="1.3" fill="${C.navyDk}"/>
      <ellipse cx="20" cy="24.4" rx="1.5" ry="1.1" fill="${C.navyDk}"/>
      <circle cx="16.4" cy="31" r="0.9" fill="${C.cream}" opacity=".8"/>
      <circle cx="23.4" cy="32" r="0.8" fill="${C.cream}" opacity=".8"/>`,

    peacock: `
      <g fill="${C.teal}">
        <ellipse cx="20" cy="13.6" rx="2.8" ry="7.8" transform="rotate(-40 20 28)"/>
        <ellipse cx="20" cy="12.6" rx="2.8" ry="8.2" transform="rotate(-20 20 28)"/>
        <ellipse cx="20" cy="12.2" rx="2.8" ry="8.4" transform="rotate(0 20 28)"/>
        <ellipse cx="20" cy="12.6" rx="2.8" ry="8.2" transform="rotate(20 20 28)"/>
        <ellipse cx="20" cy="13.6" rx="2.8" ry="7.8" transform="rotate(40 20 28)"/>
      </g>
      <g fill="${C.gold}">
        <circle cx="20" cy="9.2" r="1.5" transform="rotate(-40 20 28)"/>
        <circle cx="20" cy="7.8" r="1.5" transform="rotate(-20 20 28)"/>
        <circle cx="20" cy="7.2" r="1.5" transform="rotate(0 20 28)"/>
        <circle cx="20" cy="7.8" r="1.5" transform="rotate(20 20 28)"/>
        <circle cx="20" cy="9.2" r="1.5" transform="rotate(40 20 28)"/>
      </g>
      <ellipse cx="20" cy="30" rx="5.4" ry="6" fill="${C.tealDk}"/>
      <rect x="18.3" y="21.4" width="3.4" height="5.4" rx="1.7" fill="${C.teal}"/>
      <circle cx="20" cy="19.8" r="3.3" fill="${C.teal}"/>
      <circle cx="18.6" cy="19.4" r="1.15" fill="${C.white}"/>
      <circle cx="21.4" cy="19.4" r="1.15" fill="${C.white}"/>
      <circle cx="18.8" cy="19.5" r="0.6" fill="${C.navyDk}"/>
      <circle cx="21.2" cy="19.5" r="0.6" fill="${C.navyDk}"/>
      <path d="M18.8 21.6 h2.4 l-1.2 1.8 z" fill="${C.gold}"/>
      <path d="M17.6 17 l-0.8 -2.4 M20 16.5 v-2.6 M22.4 17 l0.8 -2.4" stroke="${C.tealDk}" stroke-width="0.8" stroke-linecap="round"/>
      <circle cx="16.7" cy="14" r="0.85" fill="${C.teal}"/>
      <circle cx="20" cy="13.5" r="0.85" fill="${C.teal}"/>
      <circle cx="23.3" cy="14" r="0.85" fill="${C.teal}"/>`,

    gnome_house: `
      <path d="M12 34.6 v-8.6 a8 8 0 0 1 16 0 v8.6 z" fill="${C.cream}"/>
      <path d="M5.6 27 q14.4 -19.2 28.8 0 z" fill="${C.red}"/>
      <circle cx="13.4" cy="23.6" r="1.5" fill="${C.white}" opacity=".85"/>
      <circle cx="20" cy="19.4" r="1.8" fill="${C.white}" opacity=".85"/>
      <circle cx="26.4" cy="23.4" r="1.4" fill="${C.white}" opacity=".85"/>
      <path d="M17 34.6 v-5.4 a3 3 0 0 1 6 0 v5.4 z" fill="${C.bark}"/>
      <circle cx="21.8" cy="31.8" r="0.6" fill="${C.gold}"/>`,

    bird_bath: `
      <ellipse cx="20" cy="34.2" rx="8.2" ry="2.5" fill="${C.stoneDk}"/>
      <path d="M16.6 33.6 q1.4 -5.2 0 -9.4 h6.8 q-1.4 4.2 0 9.4 z" fill="${C.stone}"/>
      <path d="M10.2 23 q9.8 7.4 19.6 0 z" fill="${C.stoneDk}"/>
      <ellipse cx="20" cy="22.4" rx="10.2" ry="3" fill="${C.stone}"/>
      <ellipse cx="20" cy="22.2" rx="7.6" ry="1.9" fill="${C.blue}"/>
      <circle cx="27.4" cy="18.2" r="2.5" fill="${C.navy}"/>
      <circle cx="29.2" cy="16.2" r="1.6" fill="${C.navy}"/>
      <path d="M30.5 15.9 l2 0.6 l-2 0.7 z" fill="${C.gold}"/>
      <circle cx="29.5" cy="15.9" r="0.42" fill="${C.white}"/>`,

    tiny_fence: `
      <path d="M8 34.4 v-8.8 l2.4 -2.4 l2.4 2.4 v8.8 z" fill="${C.bark}"/>
      <path d="M17.6 34.4 v-8.8 l2.4 -2.4 l2.4 2.4 v8.8 z" fill="${C.bark}"/>
      <path d="M27.2 34.4 v-8.8 l2.4 -2.4 l2.4 2.4 v8.8 z" fill="${C.bark}"/>
      <rect x="6.4" y="26.6" width="27.2" height="2.1" rx="1" fill="${C.barkDk}"/>
      <rect x="6.4" y="31" width="27.2" height="2.1" rx="1" fill="${C.barkDk}"/>`,

    stone_well: `
      <path d="M11.8 34.4 v-8.2 h16.4 v8.2 z" fill="${C.stone}"/>
      <path d="M11.8 29.4 h16.4 M17 26.2 v3.2 M23 29.4 v5" stroke="${C.stoneDk}" stroke-width="0.9"/>
      <ellipse cx="20" cy="26.2" rx="8.2" ry="2.5" fill="${C.navyDk}" opacity=".5"/>
      <path d="M13.8 26 v-7.6 M26.2 26 v-7.6" stroke="${C.bark}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M9.6 19 l10.4 -7 l10.4 7 z" fill="${C.red}"/>
      <rect x="18.2" y="20.6" width="3.6" height="3.2" rx="0.7" fill="${C.barkDk}"/>`,

    fairy_lantern: `
      <circle cx="20" cy="24" r="9.4" fill="${C.gold}" opacity=".2"/>
      <path d="M20 13.6 v2.4" stroke="${C.navyDk}" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="16.8" y="15.4" width="6.4" height="2.4" rx="1" fill="${C.navyDk}"/>
      <path d="M15.8 30.4 v-8.2 q0 -4.4 4.2 -4.4 q4.2 0 4.2 4.4 v8.2 z" fill="${C.gold}"/>
      <path d="M20 18 v12.4" stroke="${C.goldDk}" stroke-width="0.8" opacity=".7"/>
      <circle cx="20" cy="24.6" r="2.2" fill="${C.white}" opacity=".9"/>
      <rect x="15" y="30.2" width="10" height="2.6" rx="1" fill="${C.navyDk}"/>`,

    golden_gate: `
      <rect x="7.6" y="13.6" width="3.2" height="21" rx="1.5" fill="${C.gold}"/>
      <rect x="29.2" y="13.6" width="3.2" height="21" rx="1.5" fill="${C.gold}"/>
      <path d="M9.2 14.6 q10.8 -9.4 21.6 0" stroke="${C.gold}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M14.4 34.4 v-13.6 M20 34.4 v-16 M25.6 34.4 v-13.6" stroke="${C.goldDk}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M11.4 21.8 h17.2" stroke="${C.goldDk}" stroke-width="1.4"/>
      <path d="M20 6.6 l0.9 2.3 l2.3 0.9 l-2.3 0.9 l-0.9 2.3 l-0.9 -2.3 l-2.3 -0.9 l2.3 -0.9 z" fill="${C.white}" opacity=".9"/>`,

    wildflowers: `
      <path d="M12.6 34.4 q0.6 -7 2.4 -9.6 M20.2 34.4 q-1 -8.2 0.4 -11.6 M27.4 34.4 q-0.4 -6.2 -2 -8.6" stroke="${C.greenDk}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <ellipse cx="17" cy="30" rx="2.4" ry="1.2" transform="rotate(-24 17 30)" fill="${C.green}"/>
      <ellipse cx="23.4" cy="31" rx="2.4" ry="1.2" transform="rotate(20 23.4 31)" fill="${C.green}"/>
      ${bloom(15.2, 24, 2.1, C.pink, C.gold)}
      ${bloom(20.8, 21.8, 2.3, C.white, C.gold)}
      ${bloom(25.6, 25.4, 2, C.violet, C.gold)}`,

    mushroom_ring: `
      <path d="M12.2 34.2 v-5.4 q0 -1.5 1.7 -1.5 q1.7 0 1.7 1.5 v5.4 z" fill="${C.cream}"/>
      <path d="M8 29 q1.5 -7 5.9 -7 q4.4 0 5.9 7 z" fill="${C.red}"/>
      <circle cx="11.4" cy="26.4" r="1.1" fill="${C.white}"/>
      <circle cx="15.4" cy="25.4" r="0.9" fill="${C.white}"/>
      <path d="M24.4 34.2 v-4 q0 -1.2 1.4 -1.2 q1.4 0 1.4 1.2 v4 z" fill="${C.cream}"/>
      <path d="M21 30.4 q1.2 -5.4 4.8 -5.4 q3.6 0 4.8 5.4 z" fill="${C.red}"/>
      <circle cx="24" cy="28.4" r="0.9" fill="${C.white}"/>
      <circle cx="27.6" cy="27.8" r="0.75" fill="${C.white}"/>`,

    lily_pond: `
      <ellipse cx="20" cy="29.6" rx="14" ry="6.2" fill="${C.blue}" opacity=".8"/>
      <ellipse cx="20" cy="29.6" rx="14" ry="6.2" fill="none" stroke="${C.blueDk}" stroke-width="0.9" opacity=".7"/>
      <path d="M11.4 26.4 a4.4 4.4 0 1 0 4.4 4.4 l-4.4 -4.4 z" fill="${C.green}"/>
      <path d="M26.6 29.6 a3.6 3.6 0 1 0 3.6 3.6 l-3.6 -3.6 z" fill="${C.greenDk}"/>
      ${bloom(22.6, 27, 2.1, C.pink, C.gold)}
      <path d="M14.6 33 q2 -1 4 0" stroke="${C.white}" stroke-width="0.8" fill="none" opacity=".6" stroke-linecap="round"/>`,

    rainbow_arch: `
      <path d="M5 33.4 a15 15 0 0 1 30 0" stroke="${C.red}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M7.7 33.4 a12.3 12.3 0 0 1 24.6 0" stroke="${C.gold}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M10.4 33.4 a9.6 9.6 0 0 1 19.2 0" stroke="${C.green}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M13.1 33.4 a6.9 6.9 0 0 1 13.8 0" stroke="${C.blue}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M15.8 33.4 a4.2 4.2 0 0 1 8.4 0" stroke="${C.violet}" stroke-width="2.7" fill="none" stroke-linecap="round"/>`,

    // ── Reward drops ──
    butterfly: `
      <path d="M19.4 18 q-7.4 -7.6 -11.4 -2.6 q-3.4 4.4 3 7.6 q4.2 2.1 8.4 1.4 z" fill="${C.violet}"/>
      <path d="M20.6 18 q7.4 -7.6 11.4 -2.6 q3.4 4.4 -3 7.6 q-4.2 2.1 -8.4 1.4 z" fill="${C.violet}"/>
      <path d="M19.4 24.6 q-5.4 -1 -8 2.8 q-2 3.4 2.4 4.6 q4 1 5.6 -3 z" fill="${C.pink}"/>
      <path d="M20.6 24.6 q5.4 -1 8 2.8 q2 3.4 -2.4 4.6 q-4 1 -5.6 -3 z" fill="${C.pink}"/>
      <ellipse cx="20" cy="24" rx="1.5" ry="7.4" fill="${C.navyDk}"/>
      <path d="M19.2 16.6 q-1.8 -3 -4 -3.8 M20.8 16.6 q1.8 -3 4 -3.8" stroke="${C.navyDk}" stroke-width="1" fill="none" stroke-linecap="round"/>
      <circle cx="13.6" cy="20" r="1.3" fill="${C.gold}"/>
      <circle cx="26.4" cy="20" r="1.3" fill="${C.gold}"/>`,

    bird: `
      <path d="M20.6 32.6 q-8.6 0 -9.4 -7.6 q-0.8 -8 7.6 -9 q7.6 -0.9 9.8 5.6 q1.6 4.8 -1.4 8.2 z" fill="${C.blue}"/>
      <path d="M17.6 22.6 q5.6 -1.6 8.8 2.4 q-2.4 4.2 -7.4 3.4 q-3 -0.5 -1.4 -5.8 z" fill="${C.blueDk}"/>
      <path d="M28.4 20.6 q4.4 -0.6 6.6 2.4 q-3.2 2 -6.8 0.8 z" fill="${C.blueDk}"/>
      <circle cx="14.4" cy="19.8" r="1.2" fill="${C.navyDk}"/>
      <path d="M11 21.4 l-3.6 1.4 l3.6 1.4 z" fill="${C.gold}"/>
      <path d="M17.4 32.4 v2.6 M22 32.4 v2.6" stroke="${C.gold}" stroke-width="1.3" stroke-linecap="round"/>`,

    rare_seed: `
      <ellipse cx="20" cy="27.4" rx="6.2" ry="8" transform="rotate(8 20 27.4)" fill="${C.bark}"/>
      <ellipse cx="18.4" cy="26" rx="2.4" ry="4" transform="rotate(8 18.4 26)" fill="${C.tan}" opacity=".8"/>
      <path d="M20 19.6 q0.4 -5 4.6 -6.6 q0.6 5 -4.6 6.6 z" fill="${C.green}"/>
      <path d="M19.4 20 q-2.6 -3.4 -6.2 -3.4 q1.4 4 6.2 3.4 z" fill="${C.greenDk}"/>
      <circle cx="27.6" cy="17.6" r="1.4" fill="${C.gold}"/>
      <circle cx="12.4" cy="24" r="1" fill="${C.gold}"/>`,

    golden_can: `
      <path d="M12 32.6 v-9.4 h13.4 v9.4 q0 1.6 -1.6 1.6 h-10.2 q-1.6 0 -1.6 -1.6 z" fill="${C.gold}"/>
      <rect x="10.8" y="21" width="15.8" height="2.6" rx="1.2" fill="${C.goldDk}"/>
      <path d="M25.4 25.6 l7 -4.4 l1.4 2 l-6.6 5.2 z" fill="${C.goldDk}"/>
      <path d="M31 19.6 l4 -2.4 l1 1.8 l-3.6 2.6 z" fill="${C.gold}"/>
      <path d="M15.4 21 q0.6 -4.4 5 -4.4 q4.4 0 5 4.4" stroke="${C.goldDk}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M8.6 12.6 l0.8 2 l2 0.8 l-2 0.8 l-0.8 2 l-0.8 -2 l-2 -0.8 l2 -0.8 z" fill="${C.white}" opacity=".9"/>`,

    rainbow: `
      <path d="M5 32 a15 15 0 0 1 30 0" stroke="${C.red}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M7.7 32 a12.3 12.3 0 0 1 24.6 0" stroke="${C.gold}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M10.4 32 a9.6 9.6 0 0 1 19.2 0" stroke="${C.green}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M13.1 32 a6.9 6.9 0 0 1 13.8 0" stroke="${C.blue}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <path d="M15.8 32 a4.2 4.2 0 0 1 8.4 0" stroke="${C.violet}" stroke-width="2.7" fill="none" stroke-linecap="round"/>
      <ellipse cx="6" cy="33.6" rx="4.4" ry="2.4" fill="${C.white}"/>
      <ellipse cx="34" cy="33.6" rx="4.4" ry="2.4" fill="${C.white}"/>`,

    legendary: `
      <path d="M8 30.4 l-2.4 -14 l7.4 5.4 l7 -8.6 l7 8.6 l7.4 -5.4 l-2.4 14 z" fill="${C.gold}"/>
      <path d="M8 30.4 h24 v3 h-24 z" fill="${C.goldDk}"/>
      <circle cx="20" cy="12.6" r="2" fill="${C.red}"/>
      <circle cx="12" cy="21" r="1.5" fill="${C.teal}"/>
      <circle cx="28" cy="21" r="1.5" fill="${C.teal}"/>
      <circle cx="20" cy="24.6" r="1.7" fill="${C.violet}"/>`,
  };

  // ── UI icons (24 x 24) ──
  const ICON = {
    flame: `
      <path d="M12 2.4 c2.6 3.6 5.8 5.8 5.8 10 a5.8 5.8 0 0 1 -11.6 0 c0 -2.4 1.3 -4.1 2.8 -5.6 c0.3 1.5 1 2.4 2 2.7 c-0.5 -2.7 0.2 -5.2 1 -7.1 z" fill="${C.gold}"/>
      <path d="M12 11.4 c1.4 1.8 2.8 3 2.8 5 a2.8 2.8 0 0 1 -5.6 0 c0 -2 1.4 -3.2 2.8 -5 z" fill="${C.red}"/>`,
    star: `
      <path d="M12 2.6 l2.9 6.1 6.7 0.9 -4.9 4.7 1.2 6.7 -5.9 -3.2 -5.9 3.2 1.2 -6.7 -4.9 -4.7 6.7 -0.9 z" fill="${C.gold}"/>
      <path d="M12 5.6 l1.9 4 4.4 0.6 -3.2 3.1 0.8 4.4 -3.9 -2.1 z" fill="${C.goldDk}" opacity=".35"/>`,
    tree: `
      <path d="M11 21.4 v-5.4 h2 v5.4 z" fill="${C.barkDk}"/>
      <circle cx="12" cy="8.6" r="5" fill="${C.green}"/>
      <circle cx="8.2" cy="12.2" r="3.9" fill="${C.greenDk}"/>
      <circle cx="15.8" cy="12.2" r="3.9" fill="${C.green}"/>
      <circle cx="12" cy="12.6" r="4.2" fill="${C.greenDk}"/>`,
    mail: `
      <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="2.4" fill="${C.blue}"/>
      <path d="M3.6 7.4 l8.4 6 l8.4 -6" stroke="${C.white}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    link: `
      <path d="M9.6 14.4 l4.8 -4.8" stroke="${C.navy}" stroke-width="2" stroke-linecap="round"/>
      <path d="M13.4 6.6 l1.6 -1.6 a3.6 3.6 0 0 1 5.1 5.1 l-2.6 2.6" stroke="${C.blueDk}" stroke-width="2.1" fill="none" stroke-linecap="round"/>
      <path d="M10.6 17.4 l-1.6 1.6 a3.6 3.6 0 0 1 -5.1 -5.1 l2.6 -2.6" stroke="${C.blueDk}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`,
    trophy: `
      <path d="M7.4 3.6 h9.2 v6 a4.6 4.6 0 0 1 -9.2 0 z" fill="${C.gold}"/>
      <path d="M7.4 5 h-2.8 a3 3 0 0 0 3 3.6 M16.6 5 h2.8 a3 3 0 0 1 -3 3.6" stroke="${C.goldDk}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M11 14 h2 v3.6 h-2 z" fill="${C.goldDk}"/>
      <rect x="7.6" y="17.4" width="8.8" height="2.8" rx="1.2" fill="${C.goldDk}"/>`,
    bag: `
      <path d="M4.6 8.4 h14.8 l-1.2 11 a2 2 0 0 1 -2 1.8 h-8.4 a2 2 0 0 1 -2 -1.8 z" fill="${C.gold}"/>
      <path d="M8.8 9.6 v-2.4 a3.2 3.2 0 0 1 6.4 0 v2.4" stroke="${C.goldDk}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    gift: `
      <rect x="3.4" y="10" width="17.2" height="10.6" rx="1.8" fill="${C.red}"/>
      <rect x="2.6" y="6.6" width="18.8" height="4" rx="1.4" fill="${C.gold}"/>
      <path d="M10.6 6.6 v14 h2.8 v-14 z" fill="${C.goldDk}"/>
      <path d="M12 6.4 q-3.6 -4.4 -5.2 -1.6 q-1 2 5.2 1.6 z" fill="${C.gold}"/>
      <path d="M12 6.4 q3.6 -4.4 5.2 -1.6 q1 2 -5.2 1.6 z" fill="${C.gold}"/>`,
    sprout: `
      <path d="M12 20.6 v-7.4" stroke="${C.greenDk}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M12 13.6 q0.4 -5.4 5.4 -6.6 q0.6 5.6 -5.4 6.6 z" fill="${C.green}"/>
      <path d="M11.6 15 q-3 -3.8 -7 -3.8 q1.6 4.6 7 3.8 z" fill="${C.greenDk}"/>
      <ellipse cx="12" cy="20.8" rx="6.4" ry="1.8" fill="${C.bark}"/>`,
    harvest: `
      <path d="M6 20.4 q-1.6 -8 3.4 -12.4 q2.6 6.6 -0.4 12.4 z" fill="${C.gold}"/>
      <path d="M12 20.4 q-2 -9 2.2 -14 q3.4 7.4 0.6 14 z" fill="${C.goldDk}"/>
      <path d="M18 20.4 q-1.2 -7.4 3.4 -11 q1.8 6.4 -1 11 z" fill="${C.gold}"/>
      <rect x="3.4" y="19.8" width="17.2" height="2.4" rx="1.2" fill="${C.barkDk}"/>`,
  };

  function wrap(box, body, size, extraClass) {
    return `<svg class="art-svg ${extraClass || ""}" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  window.Art = {
    critter(type, size) {
      const body = CRITTER[type];
      if (!body) return "";
      return wrap(40, GROUND + body, size || 36, "art-critter");
    },
    // Same sprites but without the ground shadow — for inline/list contexts
    badge(type, size) {
      const body = CRITTER[type];
      if (!body) return "";
      return wrap(40, body, size || 32, "art-badge");
    },
    icon(name, size) {
      const body = ICON[name];
      if (!body) return "";
      return wrap(24, body, size || 22, "art-icon");
    },
    hasCritter: (t) => !!CRITTER[t],
  };
})();
