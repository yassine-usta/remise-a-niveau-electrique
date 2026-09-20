/* ==========================================================================
   icones.js
   Jeu d'icônes unique du site. Tous les tracés sont dessinés sur une grille
   de 24 par 24, avec une graisse de trait constante de 1.6 et des extrémités
   arrondies. Les icônes pleines sont signalées par la propriété remplie.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";

export const ICONES = {
  /* Interface */
  menu: { traces: ["M3.75 7.25h16.5", "M3.75 12h16.5", "M3.75 16.75h10.5"] },
  fermer: { traces: ["M6.4 6.4 17.6 17.6", "M17.6 6.4 6.4 17.6"] },
  recherche: { cercles: [[11, 11, 6.35]], traces: ["m15.65 15.65 4.35 4.35"] },
  soleil: {
    cercles: [[12, 12, 3.9]],
    traces: [
      "M12 3.1v2.1", "M12 18.8v2.1", "M3.1 12h2.1", "M18.8 12h2.1",
      "m5.8 5.8 1.5 1.5", "m16.7 16.7 1.5 1.5", "m18.2 5.8-1.5 1.5", "m7.3 16.7-1.5 1.5",
    ],
  },
  lune: { traces: ["M20.4 14.1A8.55 8.55 0 0 1 9.9 3.6 8.55 8.55 0 1 0 20.4 14.1Z"] },
  contraste: { cercles: [[12, 12, 8.4]], remplis: ["M12 3.6a8.4 8.4 0 0 1 0 16.8Z"] },
  fleche: { traces: ["M4.6 12h13.8", "m12.9 6.5 5.5 5.5-5.5 5.5"] },
  fleche_gauche: { traces: ["M19.4 12H5.6", "m11.1 6.5-5.5 5.5 5.5 5.5"] },
  fleche_haut: { traces: ["M12 19.4V5.6", "m6.5 11.1 5.5-5.5 5.5 5.5"] },
  chevron: { traces: ["m9.6 5.6 6.4 6.4-6.4 6.4"] },
  coche: { traces: ["m5.2 12.6 4.6 4.6L18.8 7.6"] },
  coche_cercle: { cercles: [[12, 12, 8.4]], traces: ["m8.2 12.2 2.7 2.7 5.1-5.6"] },
  croix_cercle: { cercles: [[12, 12, 8.4]], traces: ["m9.2 9.2 5.6 5.6", "m14.8 9.2-5.6 5.6"] },
  oeil: { traces: ["M2.8 12S6.4 5.9 12 5.9 21.2 12 21.2 12 17.6 18.1 12 18.1 2.8 12 2.8 12Z"], cercles: [[12, 12, 2.7]] },
  recommencer: { traces: ["M19.4 12a7.4 7.4 0 1 1-2.6-5.65", "M19.8 4.2v4.4h-4.4"] },
  melanger: { traces: ["M3.6 7.2h3.3l9.5 9.6h3.6", "M16.4 7.2h3.6", "M3.6 16.8h3.3", "m17.6 4.4 2.8 2.8-2.8 2.8", "m17.6 14 2.8 2.8-2.8 2.8"] },
  horloge: { cercles: [[12, 12, 8.4]], traces: ["M12 7.3V12l3.1 1.9"] },
  reglages: {
    traces: ["M3.6 8.4h7.2", "M15.6 8.4h4.8", "M3.6 15.6h3.6", "M12 15.6h8.4"],
    cercles: [[13.2, 8.4, 2.4], [9.6, 15.6, 2.4]],
  },
  calendrier: {
    traces: ["M4.4 8.4h15.2", "M8.2 3.8v3", "M15.8 3.8v3", "M6.4 5.6h11.2a2 2 0 0 1 2 2v10.6a2 2 0 0 1-2 2H6.4a2 2 0 0 1-2-2V7.6a2 2 0 0 1 2-2Z"],
  },
  livre: { traces: ["M4.6 5.4a2 2 0 0 1 2-2H19.4v14.2H6.6a2 2 0 0 0-2 2V5.4Z", "M4.6 19.6a2 2 0 0 1 2-2H19.4v3H6.6a2 2 0 0 1-2-1Z"] },
  cible: { cercles: [[12, 12, 8.4], [12, 12, 4.2]], remplis: ["M12 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z"] },
  grille: {
    traces: ["M4.4 4.4h6v6h-6zM13.6 4.4h6v6h-6zM4.4 13.6h6v6h-6zM13.6 13.6h6v6h-6z"],
  },

  /* Électrotechnique */
  eclair: { remplis: ["M13.9 2.6 5.4 13.9a.6.6 0 0 0 .48.96h4.28l-1.06 6.54a.6.6 0 0 0 1.07.46l8.5-11.3a.6.6 0 0 0-.48-.96h-4.28l1.06-6.54a.6.6 0 0 0-1.07-.46Z"] },
  onde: { traces: ["M2.8 12h2.9c.9 0 1.2-6.2 2.6-6.2s1.8 12.4 3.2 12.4S13.3 12 14.4 12h6.8"] },
  circuit: { traces: ["M3.4 12h3.2", "M17.4 12h3.2", "M9.8 8.8h4.4v6.4H9.8z"], cercles: [[7.4, 12, 1.1], [16.6, 12, 1.1]] },
  condensateur: { traces: ["M3.4 12h6.4", "M14.2 12h6.4", "M9.8 6.8v10.4", "M14.2 6.8v10.4"] },
  moteur: { cercles: [[12, 12, 7.6]], traces: ["M8.9 14.8V9.2l3.1 4 3.1-4v5.6"] },

  /* Retours */
  info: { cercles: [[12, 12, 8.4]], traces: ["M12 11.2v5", "M12 8.1v.1"] },
  alerte: { traces: ["M12 4.2 3.2 19.4h17.6L12 4.2Z", "M12 10v4.1", "M12 16.7v.1"] },
  etincelle: { traces: ["M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6-5.6-1.7L10.3 9 12 3.4Z", "M18.6 16.4l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"] },
};

/**
 * Construit un élément SVG à partir du registre.
 * options : { taille, classe, titre }
 */
export function icone(nom, options = {}) {
  const definition = ICONES[nom] || ICONES.info;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(options.taille || 20));
  svg.setAttribute("height", String(options.taille || 20));
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "icone" + (options.classe ? " " + options.classe : ""));
  if (options.titre) {
    svg.setAttribute("role", "img");
    const titre = document.createElementNS(NS, "title");
    titre.textContent = options.titre;
    svg.appendChild(titre);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  for (const trace of definition.traces || []) {
    const element = document.createElementNS(NS, "path");
    element.setAttribute("d", trace);
    svg.appendChild(element);
  }
  for (const [cx, cy, r] of definition.cercles || []) {
    const element = document.createElementNS(NS, "circle");
    element.setAttribute("cx", String(cx));
    element.setAttribute("cy", String(cy));
    element.setAttribute("r", String(r));
    svg.appendChild(element);
  }
  for (const trace of definition.remplis || []) {
    const element = document.createElementNS(NS, "path");
    element.setAttribute("d", trace);
    element.setAttribute("class", "icone-plein");
    svg.appendChild(element);
  }
  return svg;
}

/** Version chaîne, pour les gabarits HTML construits par innerHTML. */
export function iconeHtml(nom, options = {}) {
  const provisoire = document.createElement("div");
  provisoire.appendChild(icone(nom, options));
  return provisoire.innerHTML;
}

export default icone;
