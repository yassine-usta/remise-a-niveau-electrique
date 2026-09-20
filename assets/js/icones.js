/* ==========================================================================
   icones.js
   Registre d'icônes du site.

   Les icônes d'interface proviennent de Lucide, intégrées ici plutôt que
   chargées depuis un réseau de diffusion, afin d'éviter une requête et un
   poids inutiles. Licence ISC :
     Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
     as part of Feather (MIT). All other copyright (c) for Lucide are held
     by Lucide Contributors 2022.
     https://lucide.dev

   Les symboles d'électrotechnique ne figurent dans aucune bibliothèque
   généraliste : ils sont dessinés ici sur la même grille de 24 par 24 et
   avec la même graisse de trait, pour rester homogènes avec les précédents.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";

export const ICONES = {
  alerte: "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/> <path d=\"M12 9v4\"/> <path d=\"M12 17h.01\"/>",
  ampoule: "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/> <path d=\"M9 18h6\"/> <path d=\"M10 22h4\"/>",
  calendrier: "<path d=\"M8 2v4\"/> <path d=\"M16 2v4\"/> <rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/> <path d=\"M3 10h18\"/> <path d=\"M8 14h.01\"/> <path d=\"M12 14h.01\"/> <path d=\"M16 14h.01\"/> <path d=\"M8 18h.01\"/> <path d=\"M12 18h.01\"/> <path d=\"M16 18h.01\"/>",
  chevron: "<path d=\"m9 18 6-6-6-6\"/>",
  cible: "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <circle cx=\"12\" cy=\"12\" r=\"6\"/> <circle cx=\"12\" cy=\"12\" r=\"2\"/>",
  coche: "<path d=\"M20 6 9 17l-5-5\"/>",
  coche_cercle: "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"m9 12 2 2 4-4\"/>",
  croix_cercle: "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"m15 9-6 6\"/> <path d=\"m9 9 6 6\"/>",
  diplome: "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"/> <path d=\"M22 10v6\"/> <path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/>",
  eclair: "<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"/>",
  etincelle: "<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\"/> <path d=\"M20 3v4\"/> <path d=\"M22 5h-4\"/> <path d=\"M4 17v2\"/> <path d=\"M5 18H3\"/>",
  fermer: "<path d=\"M18 6 6 18\"/> <path d=\"m6 6 12 12\"/>",
  fleche: "<path d=\"M5 12h14\"/> <path d=\"m12 5 7 7-7 7\"/>",
  fleche_gauche: "<path d=\"m12 19-7-7 7-7\"/> <path d=\"M19 12H5\"/>",
  fleche_haut: "<path d=\"m5 12 7-7 7 7\"/> <path d=\"M12 19V5\"/>",
  grille: "<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/> <rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/> <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/> <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>",
  horloge: "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <polyline points=\"12 6 12 12 16 14\"/>",
  info: "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M12 16v-4\"/> <path d=\"M12 8h.01\"/>",
  lien_externe: "<path d=\"M15 3h6v6\"/> <path d=\"M10 14 21 3\"/> <path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>",
  liste: "<path d=\"m3 17 2 2 4-4\"/> <path d=\"m3 7 2 2 4-4\"/> <path d=\"M13 6h8\"/> <path d=\"M13 12h8\"/> <path d=\"M13 18h8\"/>",
  livre: "<path d=\"M12 7v14\"/> <path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\"/>",
  lune: "<path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\"/>",
  melanger: "<path d=\"M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22\"/> <path d=\"m18 2 4 4-4 4\"/> <path d=\"M2 6h1.9c1.5 0 2.9.9 3.6 2.2\"/> <path d=\"M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8\"/> <path d=\"m18 14 4 4-4 4\"/>",
  menu: "<line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\"/> <line x1=\"4\" x2=\"20\" y1=\"6\" y2=\"6\"/> <line x1=\"4\" x2=\"20\" y1=\"18\" y2=\"18\"/>",
  oeil: "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/> <circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  onde: "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>",
  recherche: "<circle cx=\"11\" cy=\"11\" r=\"8\"/> <path d=\"m21 21-4.3-4.3\"/>",
  recommencer: "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/> <path d=\"M3 3v5h5\"/>",
  reglages: "<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\"/> <line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\"/> <line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\"/> <line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\"/> <line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\"/> <line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\"/> <line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\"/> <line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\"/> <line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\"/>",
  soleil: "<circle cx=\"12\" cy=\"12\" r=\"4\"/> <path d=\"M12 2v2\"/> <path d=\"M12 20v2\"/> <path d=\"m4.93 4.93 1.41 1.41\"/> <path d=\"m17.66 17.66 1.41 1.41\"/> <path d=\"M2 12h2\"/> <path d=\"M20 12h2\"/> <path d=\"m6.34 17.66-1.41 1.41\"/> <path d=\"m19.07 4.93-1.41 1.41\"/>",
  theme_auto: "<path d=\"M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4\"/> <path d=\"M12 2v2\"/> <path d=\"M12 20v2\"/> <path d=\"m4.9 4.9 1.4 1.4\"/> <path d=\"m17.7 17.7 1.4 1.4\"/> <path d=\"M2 12h2\"/> <path d=\"M20 12h2\"/> <path d=\"m6.3 17.7-1.4 1.4\"/> <path d=\"m19.1 4.9-1.4 1.4\"/>",
  automate: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 4v16\"/><path d=\"M10.5 9h7\"/><path d=\"M10.5 13h7\"/><path d=\"M10.5 17h4\"/>",
  batterie: "<rect x=\"2\" y=\"7\" width=\"17\" height=\"10\" rx=\"2\"/><path d=\"M22 10.5v3\"/><path d=\"M6.5 12h5\"/><path d=\"M9 9.5v5\"/>",
  bobine: "<path d=\"M2 15h2.5\"/><path d=\"M19.5 15H22\"/><path d=\"M4.5 15a2.6 2.6 0 0 1 5.2 0 2.6 2.6 0 0 1 5.2 0 2.6 2.6 0 0 1 4.6 0\"/>",
  condensateur: "<path d=\"M2 12h7\"/><path d=\"M15 12h7\"/><path d=\"M9 6v12\"/><path d=\"M15 6v12\"/>",
  convertisseur: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 20 21 4\"/><path d=\"M6 9.5c.9-2 1.8-2 2.7 0s1.8 2 2.7 0\"/><path d=\"M13 15h5\"/><path d=\"M13 18h5\"/>",
  disjoncteur: "<circle cx=\"5\" cy=\"17\" r=\"1.6\"/><circle cx=\"19\" cy=\"7\" r=\"1.6\"/><path d=\"M6.4 15.9 17 8.3\"/><path d=\"M14 4.5 19.5 6l-1.5 5.5\"/>",
  machine: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8.5 15.5v-7l3.5 4.5 3.5-4.5v7\"/>",
  panneau_solaire: "<rect x=\"2.5\" y=\"5\" width=\"19\" height=\"11\" rx=\"1.5\"/><path d=\"M2.5 9.7h19\"/><path d=\"M8.8 5v11\"/><path d=\"M15.2 5v11\"/><path d=\"M12 19v2.5\"/><path d=\"M8 21.5h8\"/>",
  phaseur: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 12 18 7.5\"/><path d=\"M15.4 7.3 18 7.5l-.2 2.6\"/><path d=\"M12 12H3\"/>",
  resistance: "<path d=\"M2 12h3.5\"/><path d=\"M18.5 12h3.5\"/><rect x=\"5.5\" y=\"8\" width=\"13\" height=\"8\" rx=\"1\"/>",
  source_alternative: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M7 12c1.7-4 3.3-4 5 0s3.3 4 5 0\"/>",
  transformateur: "<circle cx=\"9\" cy=\"12\" r=\"6\"/><circle cx=\"15\" cy=\"12\" r=\"6\"/>",
};

/**
 * Construit un élément SVG à partir du registre.
 * options : { taille, classe, titre, trait }
 */
export function icone(nom, options = {}) {
  const corps = ICONES[nom] || ICONES.info;
  const taille = options.taille || 20;
  const source =
    '<svg xmlns="' + NS + '" viewBox="0 0 24 24" width="' + taille + '" height="' + taille +
    '" fill="none" stroke="currentColor" stroke-width="' + (options.trait || 2) +
    '" stroke-linecap="round" stroke-linejoin="round">' + corps + "</svg>";

  let svg = null;
  try {
    const document2 = new DOMParser().parseFromString(source, "image/svg+xml");
    const racine = document2.documentElement;
    if (racine && racine.nodeName.toLowerCase() === "svg") svg = document.importNode(racine, true);
  } catch (erreur) {
    svg = null;
  }
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
  }

  svg.setAttribute("class", "icone" + (options.classe ? " " + options.classe : ""));
  svg.setAttribute("focusable", "false");
  if (options.titre) {
    svg.setAttribute("role", "img");
    const titre = document.createElementNS(NS, "title");
    titre.textContent = options.titre;
    svg.insertBefore(titre, svg.firstChild);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  return svg;
}

/** Balisage d'une icône, pour les gabarits construits en chaîne de caractères. */
export function iconeHtml(nom, options = {}) {
  const corps = ICONES[nom] || ICONES.info;
  const taille = options.taille || 20;
  return (
    '<svg class="icone' + (options.classe ? " " + options.classe : "") +
    '" viewBox="0 0 24 24" width="' + taille + '" height="' + taille +
    '" fill="none" stroke="currentColor" stroke-width="' + (options.trait || 2) +
    '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    corps + "</svg>"
  );
}

export default icone;
