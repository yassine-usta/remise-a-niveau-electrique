/* ==========================================================================
   illustrations.js
   Une illustration plate par module, dans le style des aplats du site :
   une forme pleine, des découpes dans la couleur de la carte, et quelques
   traits pour les liaisons qui sortent de la forme.

   Convention : grille de 200 par 200.
     illus-forme      aplat sombre, la masse principale
     illus-creux      découpe pleine, reprend la couleur de la carte
     illus-trait-fin  trait en creux, à l'intérieur de la forme
     illus-trait-large trait en creux, épais
     illus-objet      trait sombre, à l'extérieur de la forme
     illus-detail     trait sombre, posé sur une découpe
     illus-onde       trait sombre épais, pour les signaux
   Aucune illustration ne dépasse de sa boîte.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";

export const ILLUSTRATIONS = {
  /* 1. Pile : corps, borne et niveau de charge */
  "fondements-circuits-continus":
    '<path class="illus-forme" d="M86 22h28a6 6 0 0 1 6 6v14h20a14 14 0 0 1 14 14v106a14 14 0 0 1-14 14H60a14 14 0 0 1-14-14V56a14 14 0 0 1 14-14h20V28a6 6 0 0 1 6-6Z"/>' +
    '<g class="illus-creux">' +
    '<rect x="66" y="62" width="68" height="16" rx="5"/>' +
    '<rect x="66" y="88" width="68" height="16" rx="5"/>' +
    '<rect x="66" y="114" width="68" height="16" rx="5"/>' +
    "</g>" +
    '<g class="illus-trait-fin"><path d="M70 150h16"/><path d="M78 142v16"/><path d="M114 150h16"/></g>',

  /* 2. Condensateur : deux armatures et le champ entre elles */
  "stockage-energie-transitoires":
    '<g class="illus-forme">' +
    '<rect x="34" y="46" width="132" height="22" rx="8"/>' +
    '<rect x="34" y="132" width="132" height="22" rx="8"/>' +
    "</g>" +
    '<g class="illus-objet"><path d="M100 46V16"/><path d="M100 154v30"/>' +
    '<path d="M74 84v32"/><path d="M100 84v32"/><path d="M126 84v32"/></g>',

  /* 3. Source alternative : disque et sinusoïde en creux */
  "regime-sinusoidal-monophase":
    '<circle class="illus-forme" cx="100" cy="100" r="64"/>' +
    '<path class="illus-trait-large" d="M58 100c7-26 14-26 21 0s14 26 21 0 14-26 21 0 14 26 21 0"/>',

  /* 4. Trois phases : trois ondes décalées d'un tiers de période */
  "triphase-qualite-energie":
    '<g class="illus-onde">' +
    '<path d="M22 54c9-15 18-15 27 0s18 15 27 0 18-15 27 0 18 15 27 0 18-15 26 0"/>' +
    '<path d="M22 100c9 15 18 15 27 0s18-15 27 0 18 15 27 0 18-15 27 0 18 15 26 0"/>' +
    '<path d="M22 146c9-15 18-15 27 0s18 15 27 0 18-15 27 0 18 15 27 0 18-15 26 0"/>' +
    "</g>",

  /* 5. Aimant en U, pôles marqués */
  "magnetisme-transformateurs":
    '<path class="illus-forme" d="M100 34c34 0 62 28 62 62v60h-42V96a20 20 0 0 0-40 0v60H38V96c0-34 28-62 62-62Z"/>' +
    '<g class="illus-creux"><rect x="38" y="132" width="42" height="14"/><rect x="120" y="132" width="42" height="14"/></g>' +
    '<g class="illus-objet"><path d="M20 66c12-14 28-24 46-28"/><path d="M180 66c-12-14-28-24-46-28"/></g>',

  /* 6. Machine tournante : stator encoché et arbre */
  "machines-electriques":
    '<path class="illus-forme" d="M100 28a72 72 0 1 1 0 144 72 72 0 0 1 0-144Zm0 40a32 32 0 1 0 0 64 32 32 0 0 0 0-64Z"/>' +
    '<g class="illus-creux">' +
    '<rect x="94" y="30" width="12" height="16" rx="3"/><rect x="94" y="154" width="12" height="16" rx="3"/>' +
    '<rect x="30" y="94" width="16" height="12" rx="3"/><rect x="154" y="94" width="16" height="12" rx="3"/>' +
    '<rect x="47" y="47" width="12" height="16" rx="3" transform="rotate(-45 53 55)"/>' +
    '<rect x="141" y="47" width="12" height="16" rx="3" transform="rotate(45 147 55)"/>' +
    '<rect x="47" y="137" width="12" height="16" rx="3" transform="rotate(45 53 145)"/>' +
    '<rect x="141" y="137" width="12" height="16" rx="3" transform="rotate(-45 147 145)"/>' +
    "</g>" +
    '<circle class="illus-forme" cx="100" cy="100" r="16"/>' +
    '<g class="illus-objet"><path d="M116 100h62"/></g>',

  /* 7. Diode : triangle, barre et sens passant */
  "semiconducteurs-conversion":
    '<path class="illus-forme" d="M58 46a7 7 0 0 1 10.6-6l78 54a7 7 0 0 1 0 12l-78 54A7 7 0 0 1 58 154Z"/>' +
    '<rect class="illus-forme" x="150" y="44" width="16" height="112" rx="5"/>' +
    '<path class="illus-trait-fin" d="M80 100h34"/>' +
    '<g class="illus-objet"><path d="M58 100H18"/><path d="M166 100h16"/></g>',

  /* 8. Convertisseur : symbole normalisé, alternatif vers continu */
  "onduleurs-variateurs-integration":
    '<rect class="illus-forme" x="28" y="28" width="144" height="144" rx="26"/>' +
    '<g class="illus-trait-large"><path d="M40 160 160 40"/></g>' +
    '<g class="illus-trait-fin">' +
    '<path d="M52 74c5-14 10-14 15 0s10 14 15 0"/>' +
    '<path d="M118 118h34"/><path d="M118 134h34"/>' +
    "</g>",

  /* 9. Boucle de régulation : anneau, flèche et consigne */
  "automatique-regulation":
    '<path class="illus-forme" d="M100 26a74 74 0 1 1-74 74h34a40 40 0 1 0 40-40Z"/>' +
    '<rect class="illus-forme" x="78" y="78" width="44" height="44" rx="12"/>' +
    '<path class="illus-trait-fin" d="M88 100h24"/>' +
    '<g class="illus-objet"><path d="M100 12v30"/><path d="M86 26 100 12l14 14"/></g>',

  /* 10. Appareil de mesure : cadran gradué et aiguille */
  "mesure-instrumentation":
    '<path class="illus-forme" d="M100 34a74 74 0 0 1 74 74v18a12 12 0 0 1-12 12H38a12 12 0 0 1-12-12v-18a74 74 0 0 1 74-74Z"/>' +
    '<g class="illus-trait-fin">' +
    '<path d="M46 118a54 54 0 0 1 108 0"/>' +
    '<path d="M100 126 132 82"/>' +
    "</g>" +
    '<circle class="illus-creux" cx="100" cy="126" r="7"/>' +
    '<g class="illus-objet"><path d="M46 156h108"/><path d="M62 156v14"/><path d="M138 156v14"/></g>',

  /* 11. Tableau basse tension : rangée de disjoncteurs */
  "installations-basse-tension":
    '<rect class="illus-forme" x="30" y="30" width="140" height="140" rx="20"/>' +
    '<g class="illus-creux">' +
    '<rect x="50" y="56" width="28" height="52" rx="6"/>' +
    '<rect x="86" y="56" width="28" height="52" rx="6"/>' +
    '<rect x="122" y="56" width="28" height="52" rx="6"/>' +
    '<rect x="50" y="126" width="100" height="14" rx="6"/>' +
    "</g>" +
    '<g class="illus-detail"><path d="M64 68v12"/><path d="M100 68v12"/><path d="M136 84v12"/></g>',

  /* 12. Pylône et lignes */
  "reseaux-electriques":
    '<path class="illus-forme" d="M90 26h20l26 150h-26l-10-38h-2l-10 38H62Z"/>' +
    '<g class="illus-creux"><path d="M96 66h8l3 18h-14ZM92 100h16l3 20h-22Z"/></g>' +
    '<g class="illus-objet">' +
    '<path d="M56 58h88"/><path d="M48 92h104"/>' +
    '<path d="M22 66c12 10 24 12 34 0"/><path d="M178 66c-12 10-24 12-34 0"/>' +
    '<path d="M16 100c12 10 22 12 32 0"/><path d="M184 100c-12 10-22 12-32 0"/>' +
    "</g>",

  /* 13. Supervision : écran et enchaînement d'étapes */
  "automatismes-supervision":
    '<rect class="illus-forme" x="24" y="34" width="152" height="108" rx="18"/>' +
    '<g class="illus-creux">' +
    '<rect x="58" y="52" width="34" height="26" rx="6"/>' +
    '<rect x="58" y="98" width="34" height="26" rx="6"/>' +
    '<rect x="112" y="52" width="34" height="26" rx="6"/>' +
    '<rect x="112" y="98" width="34" height="26" rx="6"/>' +
    "</g>" +
    '<g class="illus-trait-fin"><path d="M75 78v20"/><path d="M129 78v20"/><path d="M68 88h14"/><path d="M122 88h14"/></g>' +
    '<g class="illus-objet"><path d="M100 142v20"/><path d="M68 170h64"/></g>',

  /* 14. Soleil et capteur photovoltaïque */
  "renouvelables-synthese":
    '<circle class="illus-forme" cx="100" cy="72" r="40"/>' +
    '<g class="illus-objet">' +
    '<path d="M100 14v-6"/><path d="M100 136v6"/><path d="M158 72h6"/><path d="M36 72h-6"/>' +
    '<path d="m141 31 4-4"/><path d="m55 117-4 4"/><path d="m141 113 4 4"/><path d="m55 27-4-4"/>' +
    "</g>" +
    '<path class="illus-forme" d="M46 146h108l10 32H36Z"/>' +
    '<g class="illus-creux"><path d="M82 146h6l-4 32h-8ZM112 146h6l6 32h-8Z"/><path d="M52 160h96l2 6H50Z"/></g>',
};

/** Forme neutre, si un module n'a pas encore son illustration. */
const PAR_DEFAUT =
  '<circle class="illus-forme" cx="100" cy="100" r="62"/>' +
  '<g class="illus-creux"><circle cx="100" cy="100" r="26"/></g>';

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
