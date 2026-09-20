/* ==========================================================================
   illustrations.js
   Une illustration plate par module : une forme pleine qui porte un visage,
   accompagnée d'un objet technique tracé au trait.

   Convention : grille de 200 par 200, la forme prend la couleur courante
   (définie par la carte), les traits et le visage prennent --illus-trait.
   Aucune illustration ne dépasse de sa boîte.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";

/** Deux yeux rieurs et une bouche, posés au même endroit dans chaque dessin. */
function visage(cx, cy, echelle = 1) {
  const e = echelle;
  const ecart = 13 * e;
  const oeil = 5.2 * e;
  const bouche = 9 * e;
  return (
    '<g class="illus-visage">' +
    '<path d="M' + (cx - ecart - oeil) + " " + cy + "a" + oeil + " " + oeil + " 0 0 1 " + oeil * 2 + ' 0"/>' +
    '<path d="M' + (cx + ecart - oeil) + " " + cy + "a" + oeil + " " + oeil + " 0 0 1 " + oeil * 2 + ' 0"/>' +
    '<path d="M' + (cx - bouche) + " " + (cy + 13 * e) + "a" + bouche + " " + bouche * 0.78 + " 0 0 0 " + bouche * 2 + ' 0"/>' +
    "</g>"
  );
}

/* Chaque entrée est indexée par l'identifiant du module. */
export const ILLUSTRATIONS = {
  /* 1. Pile */
  "fondements-circuits-continus":
    '<path class="illus-forme" d="M86 26h28a7 7 0 0 1 7 7v9h9a12 12 0 0 1 12 12v106a12 12 0 0 1-12 12H70a12 12 0 0 1-12-12V54a12 12 0 0 1 12-12h9v-9a7 7 0 0 1 7-7Z"/>' +
    visage(100, 96) +
    '<g class="illus-trait-fin"><path d="M74 140h18"/><path d="M83 131v18"/><path d="M108 140h18"/></g>',

  /* 2. Condensateur et sa charge */
  "stockage-energie-transitoires":
    '<path class="illus-forme" d="M58 40h84a12 12 0 0 1 12 12v74a12 12 0 0 1-12 12H58a12 12 0 0 1-12-12V52a12 12 0 0 1 12-12Z"/>' +
    visage(100, 84) +
    '<g class="illus-trait-fin"><path d="M62 110h24"/></g>' +
    '<g class="illus-objet"><path d="M78 138v26"/><path d="M122 138v26"/><path d="M62 164h32"/><path d="M106 164h32"/></g>',

  /* 3. Sinusoïde */
  "regime-sinusoidal-monophase":
    '<circle class="illus-forme" cx="66" cy="78" r="42"/>' +
    visage(66, 74, 0.95) +
    '<g class="illus-objet"><path d="M16 150c14 0 14-30 28-30s14 30 28 30 14-30 28-30 14 30 28 30 14-30 28-30 14 30 28 30"/></g>',

  /* 4. Trois phases */
  "triphase-qualite-energie":
    '<circle class="illus-forme" cx="46" cy="116" r="28"/>' +
    '<circle class="illus-forme" cx="154" cy="116" r="28"/>' +
    '<circle class="illus-forme" cx="100" cy="82" r="40"/>' +
    visage(100, 78) +
    '<g class="illus-objet"><path d="M46 152v20"/><path d="M100 128v44"/><path d="M154 152v20"/><path d="M28 172h144"/></g>',

  /* 5. Aimant et lignes de champ */
  "magnetisme-transformateurs":
    '<path class="illus-forme" d="M100 32c34 0 62 28 62 62v58h-40V94a22 22 0 0 0-44 0v58H38V94c0-34 28-62 62-62Z"/>' +
    visage(100, 62, 0.88) +
    '<g class="illus-objet"><path d="M38 164h40"/><path d="M122 164h40"/></g>' +
    '<g class="illus-trait-fin"><path d="M52 132h12"/><path d="M136 132h12"/></g>',

  /* 6. Rotor de machine */
  "machines-electriques":
    '<path class="illus-forme" d="M100 26a74 74 0 1 1 0 148 74 74 0 0 1 0-148Zm0 44a30 30 0 1 0 0 60 30 30 0 0 0 0-60Z"/>' +
    '<circle class="illus-forme" cx="100" cy="100" r="22"/>' +
    visage(100, 96, 0.72) +
    '<g class="illus-objet"><path d="M100 26V8"/><path d="M100 192v-18"/><path d="M174 100h18"/><path d="M26 100H8"/></g>',

  /* 7. Diode */
  "semiconducteurs-conversion":
    '<path class="illus-forme" d="M62 40a8 8 0 0 1 12-7l74 58a8 8 0 0 1 0 12l-74 58a8 8 0 0 1-12-7Z"/>' +
    visage(94, 92, 0.9) +
    '<g class="illus-objet"><path d="M156 52v96"/><path d="M156 100h30"/><path d="M62 100H14"/></g>',

  /* 8. Onduleur et modulation */
  "onduleurs-variateurs-integration":
    '<rect class="illus-forme" x="30" y="30" width="140" height="140" rx="24"/>' +
    visage(76, 74, 0.86) +
    '<g class="illus-objet illus-clair"><path d="M38 162 162 38"/>' +
    '<path d="M108 140h8v-22h8v22h8v-22h8v22h8"/></g>',

  /* 9. Boucle de régulation */
  "automatique-regulation":
    '<path class="illus-forme" d="M100 26a74 74 0 1 1-74 74h34a40 40 0 1 0 40-40Z"/>' +
    '<circle class="illus-forme" cx="100" cy="100" r="30"/>' +
    visage(100, 96, 0.85) +
    '<g class="illus-objet"><path d="M100 10v32"/><path d="M84 26 100 10l16 16"/></g>',

  /* 10. Cadran de mesure */
  "mesure-instrumentation":
    '<path class="illus-forme" d="M100 34a76 76 0 0 1 76 76v20a14 14 0 0 1-14 14H38a14 14 0 0 1-14-14v-20a76 76 0 0 1 76-76Z"/>' +
    visage(100, 96) +
    '<g class="illus-objet"><path d="M100 144V96"/><path d="M100 96l34-30"/>' +
    '<path d="M46 170h108"/></g>',

  /* 11. Tableau basse tension */
  "installations-basse-tension":
    '<rect class="illus-forme" x="36" y="26" width="128" height="148" rx="18"/>' +
    visage(100, 76, 0.95) +
    '<g class="illus-objet illus-clair"><path d="M58 118h26v34H58z"/><path d="M87 118h26v34H87z"/><path d="M116 118h26v34h-26z"/>' +
    '<path d="M71 126v8"/><path d="M100 126v8"/><path d="M129 126v8"/></g>',

  /* 12. Pylône et lignes */
  "reseaux-electriques":
    '<path class="illus-forme" d="M92 30h16l30 148h-28l-4-26H84l-4 26H52Z"/>' +
    visage(100, 74, 0.72) +
    '<g class="illus-objet"><path d="M60 62h80"/><path d="M52 92h96"/>' +
    '<path d="M18 62c14 8 22 14 42 0"/><path d="M182 62c-14 8-22 14-42 0"/></g>',

  /* 13. Supervision */
  "automatismes-supervision":
    '<rect class="illus-forme" x="24" y="38" width="152" height="104" rx="18"/>' +
    visage(100, 84, 1) +
    '<g class="illus-objet"><path d="M100 142v20"/><path d="M68 170h64"/></g>' +
    '<g class="illus-objet illus-clair"><path d="M48 118h24"/><path d="M84 118h24"/><path d="M120 118h32"/></g>',

  /* 14. Soleil et panneau */
  "renouvelables-synthese":
    '<circle class="illus-forme" cx="100" cy="88" r="46"/>' +
    visage(100, 84, 0.95) +
    '<g class="illus-objet"><path d="M100 24V8"/><path d="M100 168v-16"/><path d="M164 88h16"/><path d="M20 88h16"/>' +
    '<path d="m145 43 11-11"/><path d="m44 144 11-11"/><path d="m145 133 11 11"/><path d="m44 32 11 11"/></g>' +
    '<g class="illus-objet"><path d="M40 176h120"/></g>',
};

/** Illustration par défaut, si un module n'a pas encore la sienne. */
const PAR_DEFAUT =
  '<circle class="illus-forme" cx="100" cy="100" r="62"/>' + visage(100, 96);

export function illustration(id, options = {}) {
  const corps = ILLUSTRATIONS[id] || PAR_DEFAUT;
  const source = '<svg xmlns="' + NS + '" viewBox="0 0 200 200">' + corps + "</svg>";
  let svg = null;
  try {
    const rendu = new DOMParser().parseFromString(source, "image/svg+xml");
    const racine = rendu.documentElement;
    if (racine && racine.nodeName.toLowerCase() === "svg") svg = document.importNode(racine, true);
  } catch (erreur) {
    svg = null;
  }
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
  }
  svg.setAttribute("class", "illus" + (options.classe ? " " + options.classe : ""));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return svg;
}

export default illustration;
