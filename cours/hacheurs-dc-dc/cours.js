/* ==========================================================================
   cours/hacheurs-dc-dc/cours.js
   Hacheurs abaisseur, élévateur et inverseur : cellule de commutation,
   équilibre des volts-secondes, conduction continue et discontinue,
   dimensionnement, démarrage. N'utilise que l'objet api et le DOM du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const NOMS_TOPO = ["abaisseur", "élévateur", "inverseur"];

/* --------------------------------------------------------------------------
   Modèle commun : régime établi exact d'un hacheur idéal, conduction
   continue ou discontinue. topo : 1 abaisseur, 2 élévateur, 3 inverseur.
   -------------------------------------------------------------------------- */

function regime(topo, Ve, D, L, f, R, C) {
  const Td = 1 / f;
  const K = (2 * L * f) / R;
  let Kc;
  let M;
  let continu;
  if (topo === 1) {
    Kc = 1 - D;
    continu = K >= Kc;
    M = continu ? D : 2 / (1 + Math.sqrt(1 + (4 * K) / (D * D)));
  } else if (topo === 2) {
    Kc = D * (1 - D) * (1 - D);
    continu = K >= Kc;
    M = continu ? 1 / (1 - D) : (1 + Math.sqrt(1 + (4 * D * D) / K)) / 2;
  } else {
    Kc = (1 - D) * (1 - D);
    continu = K >= Kc;
    M = continu ? D / (1 - D) : D / Math.sqrt(K);
  }
  const Vs = M * Ve;
  const Is = Vs / R;
  const von = topo === 1 ? Ve - Vs : Ve;
  const voff = topo === 2 ? Ve - Vs : -Vs;
  const a = von / L;
  const b = voff / L;
  let Imin;
  let Imax;
  let D2;
  let IL;
  if (continu) {
    const delta = a * D * Td;
    IL = topo === 1 ? Is : Is / (1 - D);
    Imin = IL - delta / 2;
    Imax = IL + delta / 2;
    D2 = 1 - D;
  } else {
    Imin = 0;
    Imax = a * D * Td;
    D2 = Math.min(1 - D, Imax / -b / Td);
    IL = (Imax * (D + D2)) / 2;
  }
  const iL = (u) => {
    const x = ((u % 1) + 1) % 1;
    if (x < D) return Imin + a * x * Td;
    if (x < D + D2) return Math.max(0, Imax + b * (x - D) * Td);
    return 0;
  };
  const vL = (u) => {
    const x = ((u % 1) + 1) % 1;
    if (x < D) return von;
    if (x < D + D2) return voff;
    return 0;
  };
  const iT = (u) => ((((u % 1) + 1) % 1) < D ? iL(u) : 0);
  const iD = (u) => {
    const x = ((u % 1) + 1) % 1;
    return x >= D && x < D + D2 ? iL(u) : 0;
  };
  const alimSortie = (u) => (topo === 1 ? iL(u) : iD(u));
  /* Ondulation de sortie : intégration numérique du courant du condensateur. */
  let q = 0;
  let qMin = 0;
  let qMax = 0;
  const N = 2000;
  let somme2 = 0;
  for (let n = 0; n < N; n += 1) {
    const ic = alimSortie((n + 0.5) / N) - Is;
    somme2 += ic * ic;
    q += (ic * Td) / N;
    if (q < qMin) qMin = q;
    if (q > qMax) qMax = q;
  }
  const dVs = C ? (qMax - qMin) / C : NaN;
  const vBloque = topo === 1 ? Ve : topo === 2 ? Vs : Ve + Vs;
  return {
    topo, Ve, D, L, f, R, Td, K, Kc, M, Vs, Is, continu, von, voff, Imin, Imax, D2, IL,
    delta: Imax - Imin, iL, vL, iT, iD, alimSortie, dVs, ICeff: Math.sqrt(somme2 / N), vBloque,
    Islim: (Ve * D * (1 - D)) / (2 * L * f),
  };
}

/* --------------------------------------------------------------------------
   Outils
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nb(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function ligneH(c, repere, couleurs, y, libelle) {
  const py = repere.versY(y);
  c.save();
  c.setLineDash([7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([2, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function point(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.accent;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = px > repere.boite.x + repere.boite.l * 0.6 ? "right" : "left";
    c.fillText(libelle, px + (c.textAlign === "right" ? -8 : 8), py - 8);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 400, ...options });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteurApi, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  figure.className = "visuel-correction";
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteurApi.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
  return figure;
}

/** Lignes de calcul révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 600) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 600) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

function brancherVisuelsQuiz(racine, api, selecteur, visuels) {
  const bloc = racine.querySelector(selecteur);
  if (!bloc || typeof MutationObserver !== "function") return;
  const observateur = new MutationObserver(() => {
    const verdict = bloc.querySelector(".m-verdict");
    if (!verdict || verdict.dataset.visuel === "1") return;
    if (verdict.getAttribute("data-etat") === "partiel") return;
    const marque = bloc.querySelector("[data-q]");
    if (!marque) return;
    const visuel = visuels[Number(marque.getAttribute("data-q"))];
    if (!visuel) return;
    verdict.dataset.visuel = "1";
    const conteneur = document.createElement("div");
    conteneur.className = "m-visuel";
    verdict.after(conteneur);
    const v = typeof visuel === "function" ? visuel() : visuel;
    schemaCorrection(api, conteneur, v.viewBox, v.dessin, v.legende);
  });
  observateur.observe(bloc, { childList: true, subtree: true });
  nettoyeurs.push(() => observateur.disconnect());
}

/** Synchronise une poignée, des curseurs et un lecteur sur une même grandeur. */
function synchroniseur(dessiner) {
  const etat = { poignee: null, lecteur: null, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(valeur);
    etat.verrou = false;
  };
  etat.redessiner = () => {
    if (etat.valeur != null) dessiner(etat.valeur);
  };
  return etat;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireCellule(racine, api);
  construireVoltSeconde(racine, api);
  construireFormes(racine, api);
  construireFrontiere(racine, api);
  construireGainReel(racine, api);
  construireDemarrage(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 });
}

export function detruire() {
  for (const nettoyeur of nettoyeurs) {
    try {
      nettoyeur();
    } catch (erreur) {
      /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
    }
  }
  nettoyeurs = [];
  for (const ressource of ressources) {
    if (ressource && typeof ressource.detruire === "function") {
      try {
        ressource.detruire();
      } catch (erreur) {
        /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
      }
    }
  }
  ressources = [];
}

/* --------------------------------------------------------------------------
   Renvois et tracés statiques
   -------------------------------------------------------------------------- */

function brancherRenvois(racine, api) {
  const liens = Array.from(racine.querySelectorAll("a[data-renvoi]"));
  if (!liens.length) return;
  function surClic(evenement) {
    const cible = racine.querySelector("#" + evenement.currentTarget.dataset.renvoi);
    if (!cible) return;
    evenement.preventDefault();
    const haut = Math.max(0, cible.getBoundingClientRect().top + window.scrollY - 90);
    if (api.lenis && typeof api.lenis.scrollTo === "function") api.lenis.scrollTo(haut);
    else window.scrollTo({ top: haut, behavior: api.mouvementReduit ? "auto" : "smooth" });
    cible.setAttribute("tabindex", "-1");
    cible.focus({ preventScroll: true });
  }
  for (const lien of liens) lien.addEventListener("click", surClic);
  nettoyeurs.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#e-buck-figure svg", 1.6],
    ["#e-boost-figure svg", 1.6],
    ["#e-bb-figure svg", 1.6],
    ["#f-schema-principal svg", 1.6],
    ["#f-gains-figure svg", 1.4],
    ["#h-figure svg", 1.4],
    ["#h-boost-figure svg", 1.4],
    ["#i-figure svg", 1.4],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  if (!racine.querySelector("#c-minitest")) return;

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-rampe",
      titre: "Rampe de courant dans une inductance",
      niveau: "fondamental",
      enonce: "<p>Une tension constante de $20\\ \\mathrm{V}$ est appliquée pendant $5\\ \\mathrm{\\mu s}$ aux bornes d'une inductance de $50\\ \\mathrm{\\mu H}$. De combien d'ampères son courant varie-t-il ?</p>",
      valeur: (20 * 5e-6) / 50e-6,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Variation $\\Delta i$",
      etapes: [
        { texte: "Relation de définition : $v_L = L\\,\\mathrm{d}i/\\mathrm{d}t$ ; à tension constante, la pente est constante : $\\mathrm{d}i/\\mathrm{d}t = 20/(50 \\times 10^{-6}) = 4 \\times 10^5\\ \\mathrm{A/s}$." },
        { texte: "$\\Delta i = v_L\\,\\Delta t/L = 20 \\times 5 \\times 10^{-6}/(50 \\times 10^{-6}) = 2\\ \\mathrm{A}$.", note: "C'est exactement le calcul de l'ondulation d'un hacheur : une tension constante par phase, une rampe linéaire par phase." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant sous tension constante",
          xTitre: "temps", xUnite: "µs", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 8, yMin: 0, yMax: 3,
          series: [{ id: "i", nom: "i(t), rampe puis palier", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (t < 1 ? 0 : t < 6 ? (t - 1) * 0.4 : 2) }],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 6, 2, "2 A après 5 µs");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-moyenne",
      titre: "Valeur moyenne d'un créneau",
      niveau: "fondamental",
      enonce: "<p>Une tension vaut $40\\ \\mathrm{V}$ pendant $67{,}5\\ \\%$ de chaque période et $0\\ \\mathrm{V}$ le reste du temps. Quelle est sa valeur moyenne, en volts ?</p>",
      valeur: 27,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "Définition : $\\langle v \\rangle = \\dfrac{1}{T}\\int_0^T v\\,\\mathrm{d}t = \\dfrac{40 \\times 0{,}675\\,T}{T}$." },
        { texte: "$\\langle v \\rangle = 0{,}675 \\times 40 = 27\\ \\mathrm{V}$.", note: "C'est la tension au nœud de commutation du chargeur ; le filtre LC n'en garde que la valeur moyenne." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Créneau et valeur moyenne",
          xTitre: "temps rapporté à la période", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 2, yMin: 0, yMax: 45,
          series: [{ id: "v", nom: "v(t), créneau", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => (x % 1 < 0.675 ? 40 : 0) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 27, "moyenne 27 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-charge",
      titre: "Variation de tension d'un condensateur",
      niveau: "fondamental",
      enonce: "<p>Un condensateur de $47\\ \\mathrm{\\mu F}$ reçoit un courant constant de $1\\ \\mathrm{A}$ pendant $10\\ \\mathrm{\\mu s}$. De combien de millivolts sa tension augmente-t-elle ?</p>",
      valeur: ((1 * 10e-6) / 47e-6) * 1000,
      unite: "mV",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Variation $\\Delta v$",
      etapes: [
        { texte: "Charge apportée : $\\Delta Q = I\\,\\Delta t = 1 \\times 10 \\times 10^{-6} = 10\\ \\mathrm{\\mu C}$." },
        { texte: "$\\Delta v = \\Delta Q/C = 10 \\times 10^{-6}/(47 \\times 10^{-6}) = 0{,}213\\ \\mathrm{V} = 213\\ \\mathrm{mV}$.", note: "L'ondulation de sortie d'un hacheur se calcule de la même façon : charge apportée pendant la phase où le courant du condensateur est positif, divisée par $C$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, etapes(["ΔQ = I Δt = 1 A × 10 µs = 10 µC", "Δv = ΔQ / C = 10 µC / 47 µF", "Δv = 0,213 V = 213 mV"], "").viewBox,
          etapes(["ΔQ = I Δt = 1 A × 10 µs = 10 µC", "Δv = ΔQ / C = 10 µC / 47 µF", "Δv = 0,213 V = 213 mV"], "").dessin, "Charge apportée divisée par la capacité.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   Dessin de composants pour les schémas construits en JavaScript
   -------------------------------------------------------------------------- */

const C_ = {
  fil: (pts) => '<polyline points="' + chaine(pts) + '"/>',
  indH(x1, x2, y) {
    const xs = (x1 + x2) / 2 - 30;
    return '<path d="M' + x1 + " " + y + "H" + xs + "a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0H" + x2 + '"/>';
  },
  indV(x, y1, y2) {
    const ys = (y1 + y2) / 2 - 30;
    return '<path d="M' + x + " " + y1 + "V" + ys + "a7.5 7.5 0 0 1 0 15a7.5 7.5 0 0 1 0 15a7.5 7.5 0 0 1 0 15a7.5 7.5 0 0 1 0 15V" + y2 + '"/>';
  },
  capV(x, y1, y2) {
    const ym = (y1 + y2) / 2;
    return '<path d="M' + x + " " + y1 + "V" + (ym - 5) + "M" + x + " " + (ym + 5) + "V" + y2 + '"/><path d="M' + (x - 18) + " " + (ym - 5) + "h36M" + (x - 18) + " " + (ym + 5) + 'h36" stroke-width="3"/>';
  },
  resV(x, y1, y2) {
    const ym = (y1 + y2) / 2;
    return '<path d="M' + x + " " + y1 + "V" + (ym - 24) + "M" + x + " " + (ym + 24) + "V" + y2 + '"/><rect x="' + (x - 9) + '" y="' + (ym - 24) + '" width="18" height="48" rx="3"/>';
  },
  diodeH(x1, x2, y, sens) {
    const xm = (x1 + x2) / 2;
    const s = sens > 0 ? 1 : -1;
    return (
      '<path d="M' + x1 + " " + y + "H" + (xm - 9) + "M" + (xm + 9) + " " + y + "H" + x2 + '"/>' +
      '<path d="M' + (xm - 9 * s) + " " + (y - 10) + "L" + (xm + 9 * s) + " " + y + "L" + (xm - 9 * s) + " " + (y + 10) + 'Z"/>' +
      '<path d="M' + (xm + 9 * s) + " " + (y - 10) + 'v20" stroke-width="2.6"/>'
    );
  },
  diodeVHaut(x, y1, y2) {
    const ym = (y1 + y2) / 2;
    return (
      '<path d="M' + x + " " + y1 + "V" + (ym - 9) + "M" + x + " " + (ym + 9) + "V" + y2 + '"/>' +
      '<path d="M' + (x - 10) + " " + (ym + 9) + "L" + x + " " + (ym - 9) + "L" + (x + 10) + " " + (ym + 9) + 'Z"/>' +
      '<path d="M' + (x - 10) + " " + (ym - 9) + 'h20" stroke-width="2.6"/>'
    );
  },
  interH(x1, x2, y, ferme) {
    const xa = x1 + 8;
    const xb = x2 - 8;
    const levier = ferme ? "M" + xa + " " + y + "L" + xb + " " + y : "M" + xa + " " + y + "L" + (xb - 4) + " " + (y - 18);
    return '<path d="M' + x1 + " " + y + "H" + xa + "M" + xb + " " + y + "H" + x2 + '"/><path d="' + levier + '" stroke-width="2.6"/>' +
      '<circle cx="' + xa + '" cy="' + y + '" r="3"/><circle cx="' + xb + '" cy="' + y + '" r="3"/>';
  },
  interV(x, y1, y2, ferme) {
    const ya = y1 + 8;
    const yb = y2 - 8;
    const levier = ferme ? "M" + x + " " + yb + "L" + x + " " + ya : "M" + x + " " + yb + "L" + (x - 18) + " " + (ya + 4);
    return '<path d="M' + x + " " + y1 + "V" + ya + "M" + x + " " + yb + "V" + y2 + '"/><path d="' + levier + '" stroke-width="2.6"/>' +
      '<circle cx="' + x + '" cy="' + ya + '" r="3"/><circle cx="' + x + '" cy="' + yb + '" r="3"/>';
  },
  source(x, y1, y2) {
    const ym = (y1 + y2) / 2;
    return '<path d="M' + x + " " + y1 + "V" + (ym - 20) + "M" + x + " " + (ym + 20) + "V" + y2 + '"/><circle cx="' + x + '" cy="' + ym + '" r="20"/>';
  },
};

/* Mailles parcourues par i_L : phase de conduction de T, puis de D ;
   maille du condensateur qui alimente seul la charge pendant la conduction de T. */
const MAILLES = {
  1: {
    on: [[70, 250], [70, 70], [215, 70], [310, 70], [370, 70], [370, 250], [70, 250]],
    off: [[215, 250], [215, 70], [370, 70], [370, 250], [215, 250]],
    cOn: null,
  },
  2: {
    on: [[70, 250], [70, 70], [215, 70], [215, 250], [70, 250]],
    off: [[70, 250], [70, 70], [215, 70], [310, 70], [370, 70], [370, 250], [70, 250]],
    cOn: [[310, 70], [370, 70], [370, 250], [310, 250], [310, 70]],
  },
  3: {
    on: [[70, 250], [70, 70], [215, 70], [215, 250], [70, 250]],
    off: [[215, 70], [215, 250], [370, 250], [370, 70], [310, 70], [215, 70]],
    cOn: [[310, 250], [370, 250], [370, 70], [310, 70], [310, 250]],
  },
};

function longueurPolyligne(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i += 1) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

function pointSurPolyligne(pts, s) {
  let reste = s;
  for (let i = 1; i < pts.length; i += 1) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (reste <= l) {
      const t = l ? reste / l : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    reste -= l;
  }
  return pts[pts.length - 1];
}

function schemaTopo(topo, ferme, idM) {
  let s = TRAITS + ' stroke-width="2">' + C_.source(70, 70, 250) + C_.fil([[70, 250], [370, 250]]);
  let t = ECRITS + texte(65, 152, "+") + texte(66, 180, "-");
  if (topo === 1) {
    s += C_.fil([[70, 70], [100, 70]]) + C_.interH(100, 170, 70, ferme) + C_.fil([[170, 70], [215, 70]]);
    s += C_.diodeVHaut(215, 70, 250) + C_.indH(215, 310, 70);
    t += texte(124, 100, "T") + texte(188, 166, "D") + texte(256, 98, "L");
  } else if (topo === 2) {
    s += C_.indH(70, 215, 70) + C_.fil([[215, 70], [215, 130]]) + C_.interV(215, 130, 190, ferme) + C_.fil([[215, 190], [215, 250]]);
    s += C_.diodeH(215, 310, 70, 1);
    t += texte(140, 98, "L") + texte(176, 150, "T") + texte(258, 98, "D");
  } else {
    s += C_.fil([[70, 70], [100, 70]]) + C_.interH(100, 170, 70, ferme) + C_.fil([[170, 70], [215, 70]]);
    s += C_.indV(215, 70, 250) + C_.diodeH(215, 310, 70, -1);
    t += texte(124, 100, "T") + texte(240, 166, "L") + texte(258, 98, "D");
  }
  s += C_.fil([[310, 70], [370, 70]]) + C_.capV(310, 70, 250) + C_.resV(370, 70, 250) + "</g>";
  t += texte(272, 166, "C") + texte(384, 166, "R") + texte(222, 62, "A", ' font-size="11"') + texte(232, 272, "0 V", ' font-size="11"');
  t += texte(10, 112, "V_e");
  if (topo === 3) t += texte(380, 92, "-") + texte(380, 240, "+") + texte(396, 228, "|V_s|");
  else t += texte(380, 92, "+") + texte(380, 240, "-") + texte(398, 108, "V_s");
  t += "</g>";
  let f = TRAITS + ' stroke-width="1.5">';
  f += '<path d="M36 200L36 120" marker-end="url(#' + idM + ')"/>';
  f += topo === 3 ? '<path d="M412 120L412 205" marker-end="url(#' + idM + ')"/>' : '<path d="M412 205L412 120" marker-end="url(#' + idM + ')"/>';
  f += "</g>";
  return s + f + t + '<g fill="currentColor"><circle cx="215" cy="70" r="3.6"/><circle cx="310" cy="70" r="3.6"/><circle cx="310" cy="250" r="3.6"/></g>';
}

/* --------------------------------------------------------------------------
   D. Cellule de commutation animée
   -------------------------------------------------------------------------- */

function construireCellule(racine, api) {
  const conteneur = racine.querySelector("#d-cellule");
  if (!conteneur) return;
  const idM = "fl-d-cel";
  const PAR = { Ve: 24, L: 56e-6, f: 1e5, R: 10, C: 47e-6 };
  const CH = { x0: 470, l: 270, haut: 120, bas: 250, piste: 300 };
  const reglages = { topo: 1, D: 0.5 };
  let modele = null;
  let charge = [];

  const svg = svgEl("svg", {
    viewBox: "0 0 760 330",
    role: "img",
    "aria-label": "Cellule de commutation animée : schéma avec la maille parcourue par le courant et chronogramme du courant de l'inductance",
  });
  const fond = svgEl("g");
  const mailles = svgEl("g");
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const chrono = svgEl("g");
  const curseur = svgEl("g");
  svg.append(fond, mailles, chrono, curseur, points);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-cellule-valeurs", [
    { id: "phase", libelle: "Phase", format: (x) => x },
    { id: "conduit", libelle: "Élément qui porte i_L", format: (x) => x },
    { id: "vl", libelle: "v_L", unite: "V", decimales: 2 },
    { id: "il", libelle: "i_L", unite: "A", decimales: 3 },
    { id: "w", libelle: "Énergie ½ L i_L²", unite: "mJ", decimales: 4 },
    { id: "vs", libelle: "|V_s| en régime établi", unite: "V", decimales: 2 },
    { id: "mode", libelle: "Conduction", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function recalculer() {
    modele = regime(reglages.topo, PAR.Ve, reglages.D, PAR.L, PAR.f, PAR.R, PAR.C);
    charge = [0];
    const N = 400;
    for (let n = 1; n <= N; n += 1) {
      const u = (2 * n) / N;
      charge.push(charge[n - 1] + modele.iL(u - 1 / N) * (2 / N));
    }
    const echI = Math.max(modele.Imax * 1.15, 0.1);
    const yI = (i) => CH.bas - ((CH.bas - CH.haut) * i) / echI;
    const xU = (u) => CH.x0 + (CH.l * u) / 2;
    modele.yI = yI;
    modele.xU = xU;
    let s = TRAITS + ' stroke-width="1.3">';
    s += '<path d="M' + CH.x0 + " " + CH.bas + "H" + (CH.x0 + CH.l + 8) + "M" + CH.x0 + " " + CH.bas + "V" + (CH.haut - 20) + '"/>';
    s += '<path d="M' + CH.x0 + " 80H" + (CH.x0 + CH.l) + '" opacity="0.5"/>';
    for (const u of [reglages.D, 1, 1 + reglages.D, 2]) s += '<path d="M' + xU(u).toFixed(1) + " 50V" + CH.bas + '" stroke-dasharray="2 4" opacity="0.55"/>';
    s += '<path d="M' + CH.x0 + " " + CH.piste + "H" + (CH.x0 + CH.l) + '" stroke-width="1.8"/>';
    s += "</g>";
    /* commande q */
    let q = "M" + CH.x0 + " 80";
    for (let k = 0; k < 2; k += 1) q += "V58H" + xU(k + reglages.D).toFixed(1) + "V80H" + xU(k + 1).toFixed(1);
    s += TRAITS + ' stroke-width="2"><path d="' + q + '"/></g>';
    const pts = [];
    for (let n = 0; n <= 400; n += 1) {
      const u = (2 * n) / 400;
      pts.push([xU(u), yI(modele.iL(Math.min(u, 1.99999)))]);
    }
    s += TRAITS + ' stroke-width="2.6"><polyline points="' + chaine(pts) + '"/></g>';
    s += TRAITS + ' stroke-width="1.3" stroke-dasharray="6 5"><path d="M' + CH.x0 + " " + yI(modele.IL).toFixed(1) + "H" + (CH.x0 + CH.l) + '"/></g>';
    s += ECRITS + texte(CH.x0 - 30, 74, "q") + texte(CH.x0 - 34, CH.haut - 4, "i_L") + texte(CH.x0 + CH.l + 4, yI(modele.IL) + 4, "I_L", ' font-size="11"');
    s += texte(xU(reglages.D) - 10, 46, "DT", ' font-size="11"') + texte(xU(1) - 4, 46, "T", ' font-size="11"') + texte(xU(2) - 8, 46, "2T", ' font-size="11"');
    s += texte(CH.x0, CH.piste + 22, "instant observé : faire glisser la poignée", ' font-size="11"') + "</g>";
    chrono.innerHTML = s;
  }

  function placer(u) {
    if (!modele) return;
    const m = modele;
    const uu = Math.min(Math.max(u, 0), 1.99999);
    const x = uu % 1;
    const enT = x < m.D;
    const enD = !enT && x < m.D + m.D2;
    fond.innerHTML = "<defs>" + marqueur(idM) + "</defs>" + schemaTopo(reglages.topo, enT, idM);
    const maille = enT ? MAILLES[reglages.topo].on : enD ? MAILLES[reglages.topo].off : null;
    let s = "";
    if (maille) s += '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="7" opacity="0.55" style="stroke: var(--serie-2)"><polyline points="' + chaine(maille) + '"/></g>';
    const mc = enT ? MAILLES[reglages.topo].cOn : null;
    if (mc) s += '<g fill="none" stroke-linecap="round" stroke-width="5" stroke-dasharray="6 7" opacity="0.6" style="stroke: var(--serie-2)"><polyline points="' + chaine(mc.map((p) => [p[0] + (p[0] > 340 ? -7 : 7), p[1] + (p[1] > 160 ? -7 : 7)])) + '"/></g>';
    mailles.innerHTML = s;
    let p = "";
    if (maille) {
      const lg = longueurPolyligne(maille);
      const n = Math.round(uu * 200);
      const avance = (charge[Math.min(400, n)] / Math.max(m.IL, 1e-6)) * 90;
      const pas = 46;
      for (let d = avance % pas; d < lg; d += pas) {
        const pt = pointSurPolyligne(maille, d);
        p += '<circle cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="3.4"/>';
      }
    }
    points.innerHTML = p;
    const il = m.iL(uu);
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + m.xU(uu).toFixed(1) + " 50V" + CH.piste + '"/></g>' +
      '<circle cx="' + m.xU(uu).toFixed(1) + '" cy="' + m.yI(il).toFixed(1) + '" r="4.5" fill="currentColor"/>';
    if (valeurs) {
      valeurs.maj({
        phase: enT ? "T fermé, durée D T" : enD ? "T ouvert, roue libre" : "palier nul, T et D bloqués",
        conduit: enT ? "interrupteur T" : enD ? "diode D" : "aucun",
        vl: m.vL(uu),
        il,
        w: 0.5 * PAR.L * il * il * 1e3,
        vs: m.Vs,
        mode: m.continu ? "continue" : "discontinue",
      });
    }
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: CH.x0, y: CH.piste },
    a: { x: CH.x0 + CH.l, y: CH.piste },
    min: 0,
    max: 2,
    pas: 0.01,
    valeur: 0.25,
    libelle: "Instant observé sur deux périodes",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const curseurs = api.sim.curseurs(
    "#d-cellule-curseurs",
    [
      { id: "topo", libelle: "Topologie : 1 abaisseur, 2 élévateur, 3 inverseur", min: 1, max: 3, pas: 1, valeur: 1, format: (x) => NOMS_TOPO[Math.round(x) - 1] },
      { id: "D", libelle: "Rapport cyclique D", min: 0.2, max: 0.8, pas: 0.01, valeur: 0.5, format: (x) => nb(api, x, 2) },
    ],
    (lues) => {
      reglages.topo = Math.round(lues.topo);
      reglages.D = lues.D;
      recalculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.lecteur = api.sim.lecteur("#d-cellule-lecteur", {
    de: 0,
    a: 2,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Parcours de deux périodes",
    rappel: (u) => synchro.appliquer(u, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  if (!modele) recalculer();
  synchro.appliquer(0.25, null);
  ressources.push(api.dessiner(chrono, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Équilibre des volts-secondes sur une batterie
   -------------------------------------------------------------------------- */

function construireVoltSeconde(racine, api) {
  if (!racine.querySelector("#e-vs-il")) return;
  const Ve = 40;
  const L = 56e-6;
  const f = 1e5;
  const Td = 1 / f;
  const HORIZON = 3e-3;
  const PAS = 100;
  const reglages = { D: 0.675, Vb: 26.2, r: 0.1 };
  let simu = null;
  let tCourant = 0;

  function simuler() {
    const dt = Td / PAS;
    const n = Math.round(HORIZON / dt);
    const ech = [];
    const periodes = [];
    let i = 0;
    let ap = 0;
    let am = 0;
    let somme = 0;
    let vlPeriode = [];
    for (let k = 0; k <= n; k += 1) {
      const t = k * dt;
      const phase = (k % PAS) / PAS;
      /* fraction de conduction exacte dans le pas, sans arrondi du rapport cyclique */
      const frac = Math.min(1, Math.max(0, (reglages.D - phase) * PAS));
      const von = Ve - reglages.Vb - reglages.r * i;
      let voff = -reglages.Vb - reglages.r * i;
      if (i <= 0 && voff < 0) voff = 0;
      const vl = frac * von + (1 - frac) * voff;
      if (k % 5 === 0) ech.push([t * 1e3, i]);
      vlPeriode.push([phase * Td * 1e6, frac >= 0.5 ? von : voff]);
      for (const part of [frac * von, (1 - frac) * voff]) {
        if (part > 0) ap += part * dt;
        else am -= part * dt;
      }
      somme += i * dt;
      i += (vl / L) * dt;
      if (i < 0) i = 0;
      if ((k + 1) % PAS === 0) {
        periodes.push({ ap, am, imoy: somme / Td, vl: vlPeriode });
        ap = 0;
        am = 0;
        somme = 0;
        vlPeriode = [];
      }
    }
    simu = { ech, periodes, ifin: Math.max(0, (reglages.D * Ve - reglages.Vb) / reglages.r) };
  }

  const traceVl = api.sim.traceur("#e-vs-vl", {
    titre: "Tension de l'inductance pendant la période observée",
    genre: "Simulation",
    xTitre: "temps dans la période", xUnite: "µs", yTitre: "v_L", yUnite: "V",
    xMin: 0, xMax: 10, yMin: -30, yMax: 16,
    ratio: 0.32,
    series: [{ id: "vl", nom: "v_L(t)", couleur: "serie-1", epaisseur: 2.4, points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      if (!simu) return;
      const per = simu.periodes[Math.min(simu.periodes.length - 1, Math.floor(tCourant / (Td * 1e3)))];
      if (!per) return;
      c.save();
      c.globalAlpha = 0.18;
      c.fillStyle = couleurs.texte;
      c.beginPath();
      c.moveTo(r.versX(0), r.versY(0));
      for (const p of per.vl) c.lineTo(r.versX(p[0]), r.versY(p[1]));
      c.lineTo(r.versX(10), r.versY(0));
      c.closePath();
      c.fill();
      c.restore();
      ligneH(c, r, couleurs, 0, "");
    },
  });
  if (traceVl) ressources.push(traceVl);

  const traceIl = api.sim.traceur("#e-vs-il", {
    titre: "Courant de l'inductance depuis la mise en marche",
    genre: "Simulation",
    xTitre: "temps", xUnite: "ms", yTitre: "i_L", yUnite: "A",
    xMin: 0, xMax: 3, yMin: 0, yMax: 20,
    ratio: 0.4,
    series: [{ id: "il", nom: "i_L(t)", couleur: "serie-1", epaisseur: 1.6, points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      if (!simu) return;
      if (simu.ifin <= 40) ligneH(c, r, couleurs, Math.min(simu.ifin, 40), "valeur finale " + nb(api, simu.ifin, 2) + " A");
    },
  });
  if (traceIl) ressources.push(traceIl);

  const valeurs = api.sim.valeurs("#e-vs-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 3 },
    { id: "k", libelle: "Période observée", decimales: 0 },
    { id: "ap", libelle: "A+", unite: "V·µs", decimales: 2 },
    { id: "am", libelle: "A-", unite: "V·µs", decimales: 2 },
    { id: "di", libelle: "Variation de i_L sur la période", unite: "mA", decimales: 1 },
    { id: "imoy", libelle: "Courant moyen sur la période", unite: "A", decimales: 3 },
    { id: "dve", libelle: "D V_e - V_bat", unite: "V", decimales: 3 },
    { id: "ifin", libelle: "Valeur finale (D V_e - V_bat) / r", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(tms) {
    tCourant = Math.max(0, Math.min(tms, HORIZON * 1e3));
    if (!simu) return;
    const k = Math.min(simu.periodes.length - 1, Math.floor(tCourant / (Td * 1e3)));
    const per = simu.periodes[k];
    const visibles = simu.ech.filter((p) => p[0] <= tCourant);
    const ymax = Math.max(20, Math.min(60, simu.ifin * 1.3));
    if (traceIl) {
      traceIl.definirPlage({ yMax: ymax });
      traceIl.definirDonnees("il", visibles.length > 1 ? visibles : [[0, 0], [0.0001, 0]]);
    }
    if (traceVl) traceVl.definirDonnees("vl", per.vl.concat([[10, per.vl[per.vl.length - 1][1]]]));
    if (valeurs) {
      valeurs.maj({
        t: tCourant,
        k: k + 1,
        ap: per.ap * 1e6,
        am: per.am * 1e6,
        di: ((per.ap - per.am) / L) * 1e3,
        imoy: per.imoy,
        dve: reglages.D * Ve - reglages.Vb,
        ifin: simu.ifin,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-vs-curseurs",
    [
      { id: "D", libelle: "Rapport cyclique D", min: 0.6, max: 0.75, pas: 0.001, valeur: 0.675, format: (x) => nb(api, x, 3) },
      { id: "Vb", libelle: "Tension de la batterie V_bat", min: 24, max: 28.5, pas: 0.05, valeur: 26.2, unite: "V" },
      { id: "r", libelle: "Résistance de la batterie et des connexions r", min: 0.05, max: 0.5, pas: 0.01, valeur: 0.1, unite: "Ω" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      simuler();
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-vs-lecteur", {
    de: 0,
    a: 3,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Écoulement du temps depuis la mise en marche",
    rappel: (t) => afficher(t),
  });
  if (lecteur) ressources.push(lecteur);
  if (!simu) simuler();
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Formes d'onde des trois topologies
   -------------------------------------------------------------------------- */

function construireFormes(racine, api) {
  if (!racine.querySelector("#e-formes-il")) return;
  const traceI = api.sim.traceur("#e-formes-il", {
    titre: "Courants sur deux périodes",
    genre: "Simulation",
    xTitre: "temps", xUnite: "µs", yTitre: "courant", yUnite: "A",
    xMin: 0, xMax: 20, yMin: 0, yMax: 10,
    ratio: 0.42,
    series: [
      { id: "il", nom: "i_L, courant de l'inductance", couleur: "serie-1", epaisseur: 2.6 },
      { id: "is", nom: "courant reçu par la sortie", couleur: "serie-5", epaisseur: 1.6 },
    ],
  });
  if (traceI) ressources.push(traceI);
  const traceV = api.sim.traceur("#e-formes-vl", {
    titre: "Tension de l'inductance",
    genre: "Simulation",
    xTitre: "temps", xUnite: "µs", yTitre: "v_L", yUnite: "V",
    xMin: 0, xMax: 20, yMin: -30, yMax: 30,
    ratio: 0.32,
    series: [{ id: "vl", nom: "v_L", couleur: "serie-3", epaisseur: 2.2 }],
  });
  if (traceV) ressources.push(traceV);
  const valeurs = api.sim.valeurs("#e-formes-valeurs", [
    { id: "mode", libelle: "Conduction", format: (x) => x },
    { id: "M", libelle: "M = |V_s| / V_e", decimales: 3 },
    { id: "vs", libelle: "|V_s|", unite: "V", decimales: 2 },
    { id: "is", libelle: "I_s", unite: "A", decimales: 3 },
    { id: "il", libelle: "I_L moyen", unite: "A", decimales: 3 },
    { id: "di", libelle: "Δi_L", unite: "A", decimales: 3 },
    { id: "ipk", libelle: "Courant crête", unite: "A", decimales: 3 },
    { id: "lim", libelle: "I_s limite de conduction continue", unite: "A", decimales: 3 },
    { id: "dv", libelle: "ΔV_s, condensateur idéal", unite: "mV", decimales: 1 },
    { id: "ic", libelle: "Courant efficace du condensateur", unite: "A", decimales: 3 },
    { id: "vb", libelle: "Tension bloquée par T et D", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#e-formes-curseurs",
    [
      { id: "topo", libelle: "Topologie : 1 abaisseur, 2 élévateur, 3 inverseur", min: 1, max: 3, pas: 1, valeur: 1, format: (x) => NOMS_TOPO[Math.round(x) - 1] },
      { id: "Ve", libelle: "Tension d'entrée V_e", min: 5, max: 60, pas: 0.5, valeur: 40, unite: "V" },
      { id: "D", libelle: "Rapport cyclique D", min: 0.05, max: 0.9, pas: 0.005, valeur: 0.675, format: (x) => nb(api, x, 3) },
      { id: "L", libelle: "Inductance L", min: 5, max: 200, pas: 1, valeur: 56, unite: "µH" },
      { id: "f", libelle: "Fréquence de découpage f", min: 20, max: 500, pas: 5, valeur: 100, unite: "kHz" },
      { id: "R", libelle: "Résistance de charge R", min: 1, max: 200, pas: 0.1, valeur: 3.4, unite: "Ω" },
      { id: "C", libelle: "Capacité de sortie C", min: 10, max: 470, pas: 1, valeur: 47, unite: "µF" },
    ],
    (v) => {
      const topo = Math.round(v.topo);
      const m = regime(topo, v.Ve, v.D, v.L * 1e-6, v.f * 1e3, v.R, v.C * 1e-6);
      const tus = 2e6 / (v.f * 1e3);
      const conv = (fn) => (t) => fn(Math.min(t / (tus / 2), 1.99999));
      if (traceI) {
        traceI.definirPlage({ xMin: 0, xMax: tus, yMin: 0, yMax: Math.max(0.2, m.Imax * 1.15) });
        traceI.definirFonction("il", conv(m.iL));
        traceI.definirFonction("is", conv(m.alimSortie));
      }
      if (traceV) {
        const vmax = Math.max(Math.abs(m.von), Math.abs(m.voff), 1) * 1.15;
        traceV.definirPlage({ xMin: 0, xMax: tus, yMin: -vmax, yMax: vmax });
        traceV.definirFonction("vl", conv(m.vL));
      }
      if (valeurs) {
        valeurs.maj({
          mode: m.continu ? "continue" : "discontinue",
          M: m.M,
          vs: m.Vs,
          is: m.Is,
          il: m.IL,
          di: m.delta,
          ipk: m.Imax,
          lim: m.Islim,
          dv: m.dVs * 1e3,
          ic: m.ICeff,
          vb: m.vBloque,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   E. Caractéristiques de sortie et frontière de conduction discontinue
   -------------------------------------------------------------------------- */

function vsDeIs(topo, Ve, D, L, f, Is) {
  const lim = (Ve * D * (1 - D)) / (2 * L * f);
  const k = 2 * L * f * Is;
  if (topo === 1) return Is >= lim ? D * Ve : Ve / (1 + k / (D * D * Ve));
  if (topo === 2) return Is >= lim ? Ve / (1 - D) : Ve * (1 + (Ve * D * D) / k);
  return Is >= lim ? (Ve * D) / (1 - D) : (Ve * Ve * D * D) / k;
}

function construireFrontiere(racine, api) {
  const conteneur = racine.querySelector("#e-frontiere");
  if (!conteneur) return;
  const Ve = 40;
  const L = 56e-6;
  const f = 1e5;
  const B = { x: 80, y: 30, l: 520, h: 270 };
  const IMAX = 2;
  const YMAX = { 1: 45, 2: 250, 3: 200 };
  const reglages = { topo: 1, D: 0.675, Is: 0.5 };
  const svg = svgEl("svg", {
    viewBox: "0 0 640 370",
    role: "img",
    "aria-label": "Caractéristiques de sortie tension en fonction du courant pour quatre rapports cycliques, avec la frontière de conduction discontinue",
  });
  const courbes = svgEl("g");
  const marque = svgEl("g");
  svg.append(courbes, marque);
  conteneur.appendChild(svg);
  const X = (i) => B.x + (B.l * i) / IMAX;
  const Y = (v) => B.y + B.h - (B.h * Math.min(v, YMAX[reglages.topo] * 1.05)) / YMAX[reglages.topo];

  const valeurs = api.sim.valeurs("#e-frontiere-valeurs", [
    { id: "is", libelle: "Courant de sortie I_s", unite: "A", decimales: 3 },
    { id: "vs", libelle: "|V_s|", unite: "V", decimales: 2 },
    { id: "mode", libelle: "Conduction", format: (x) => x },
    { id: "lim", libelle: "I_s limite", unite: "A", decimales: 3 },
    { id: "vccm", libelle: "|V_s| en conduction continue", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function polyligne(fn) {
    const pts = [];
    for (let n = 1; n <= 200; n += 1) {
      const i = (IMAX * n) / 200;
      const v = fn(i);
      if (v <= YMAX[reglages.topo] * 1.05) pts.push([X(i), Y(v)]);
    }
    return pts;
  }

  function dessinerCourbes() {
    const t = reglages.topo;
    const ym = YMAX[t];
    let s = TRAITS + ' stroke-width="1.3"><path d="M' + B.x + " " + (B.y + B.h) + "H" + (B.x + B.l + 8) + "M" + B.x + " " + (B.y + B.h) + "V" + (B.y - 8) + '"/>';
    let e = ECRITS;
    for (let k = 0; k <= 4; k += 1) {
      const i = (IMAX * k) / 4;
      s += '<path d="M' + X(i) + " " + (B.y + B.h) + 'v6"/>';
      e += texte(X(i) - 10, B.y + B.h + 22, nb(api, i, 1), ' font-size="11"');
    }
    const pasY = t === 1 ? 10 : 50;
    for (let v = 0; v <= ym; v += pasY) {
      s += '<path d="M' + B.x + " " + Y(v) + 'h-6"/>';
      e += texte(B.x - 40, Y(v) + 4, String(v), ' font-size="11"');
    }
    s += "</g>";
    e += texte(B.x + B.l - 70, B.y + B.h + 44, "I_s en A") + texte(B.x - 70, B.y - 14, "|V_s| en V");
    for (const D of [0.2, 0.4, 0.6, 0.8]) {
      const pts = polyligne((i) => vsDeIs(t, Ve, D, L, f, i));
      s += TRAITS + ' stroke-width="1.3" opacity="0.7"><polyline points="' + chaine(pts) + '"/></g>';
      const fin = pts[pts.length - 1];
      if (fin) e += texte(fin[0] - 50, fin[1] - 6, "D = " + nb(api, D, 1), ' font-size="10"');
    }
    const ptsD = polyligne((i) => vsDeIs(t, Ve, reglages.D, L, f, i));
    s += TRAITS + ' stroke-width="3"><polyline points="' + chaine(ptsD) + '"/></g>';
    const front = [];
    for (let n = 1; n < 100; n += 1) {
      const D = n / 100;
      const i = (Ve * D * (1 - D)) / (2 * L * f);
      const v = t === 1 ? D * Ve : t === 2 ? Ve / (1 - D) : (Ve * D) / (1 - D);
      if (v <= ym && i <= IMAX) front.push([X(i), Y(v)]);
    }
    s += TRAITS + ' stroke-width="1.8" stroke-dasharray="7 5"><polyline points="' + chaine(front) + '"/></g>';
    e += texte(B.x + 8, B.y + 12, "à gauche des tirets : conduction discontinue", ' font-size="11"') + "</g>";
    courbes.innerHTML = s + e;
  }

  function placer(Is) {
    reglages.Is = Is;
    const t = reglages.topo;
    const v = vsDeIs(t, Ve, reglages.D, L, f, Is);
    const lim = (Ve * reglages.D * (1 - reglages.D)) / (2 * L * f);
    const vccm = t === 1 ? reglages.D * Ve : t === 2 ? Ve / (1 - reglages.D) : (Ve * reglages.D) / (1 - reglages.D);
    const yv = Y(v);
    marque.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + X(Is).toFixed(1) + " " + (B.y + B.h) + "V" + yv.toFixed(1) + '"/></g>' +
      '<circle cx="' + X(Is).toFixed(1) + '" cy="' + yv.toFixed(1) + '" r="5" fill="currentColor"/>';
    if (valeurs) valeurs.maj({ is: Is, vs: v, mode: Is >= lim ? "continue" : "discontinue", lim, vccm });
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X(0.02), y: B.y + B.h },
    a: { x: X(IMAX), y: B.y + B.h },
    min: 0.02,
    max: IMAX,
    pas: 0.01,
    valeur: 0.5,
    unite: "A",
    libelle: "Courant de sortie sur l'axe horizontal",
    diffuserAuDepart: false,
    rappel: (mesure) => placer(mesure.valeur),
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-frontiere-curseurs",
    [
      { id: "topo", libelle: "Topologie : 1 abaisseur, 2 élévateur, 3 inverseur", min: 1, max: 3, pas: 1, valeur: 1, format: (x) => NOMS_TOPO[Math.round(x) - 1] },
      { id: "D", libelle: "Rapport cyclique de la courbe épaisse", min: 0.1, max: 0.9, pas: 0.005, valeur: 0.675, format: (x) => nb(api, x, 3) },
    ],
    (lues) => {
      reglages.topo = Math.round(lues.topo);
      reglages.D = lues.D;
      dessinerCourbes();
      placer(reglages.Is);
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessinerCourbes();
  placer(0.5);
  ressources.push(api.dessiner(courbes, { declencheur: conteneur, duree: 1.3 }));
}

/* --------------------------------------------------------------------------
   E. Gain réel de l'élévateur
   -------------------------------------------------------------------------- */

function construireGainReel(racine, api) {
  if (!racine.querySelector("#e-reel-trace")) return;
  const reglages = { a: 0.01, D: 0.6 };
  const reel = (D) => 1 / (1 - D) / (1 + reglages.a / ((1 - D) * (1 - D)));
  const trace = api.sim.traceur("#e-reel-trace", {
    titre: "Gain de l'élévateur en fonction du rapport cyclique",
    genre: "Simulation",
    xTitre: "rapport cyclique D", yTitre: "M = V_s / V_e",
    xMin: 0, xMax: 0.99, yMin: 0, yMax: 12,
    ratio: 0.45,
    series: [
      { id: "ideal", nom: "idéal, 1 / (1 - D)", couleur: "serie-6", epaisseur: 1.6, fonction: (D) => Math.min(13, 1 / (1 - D)) },
      { id: "reel", nom: "réel, avec r_L / R", couleur: "serie-1", epaisseur: 2.8, fonction: reel },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const Dopt = 1 - Math.sqrt(reglages.a);
      ligneV(c, r, couleurs, Dopt, "gain maximal");
      point(c, r, couleurs, reglages.D, reel(reglages.D), "D = " + nb(api, reglages.D, 2));
    },
  });
  if (trace) ressources.push(trace);
  const valeurs = api.sim.valeurs("#e-reel-valeurs", [
    { id: "mreel", libelle: "Gain réel au D choisi", decimales: 3 },
    { id: "mideal", libelle: "Gain idéal au D choisi", decimales: 3 },
    { id: "eta", libelle: "Rendement au D choisi", unite: "%", decimales: 1 },
    { id: "mmax", libelle: "Gain maximal", decimales: 2 },
    { id: "dopt", libelle: "D du gain maximal", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);
  const curseurs = api.sim.curseurs(
    "#e-reel-curseurs",
    [
      { id: "a", libelle: "Rapport r_L / R", min: 0.1, max: 5, pas: 0.1, valeur: 1, unite: "%" },
      { id: "D", libelle: "Rapport cyclique D", min: 0, max: 0.97, pas: 0.005, valeur: 0.6, format: (x) => nb(api, x, 3) },
    ],
    (lues) => {
      reglages.a = lues.a / 100;
      reglages.D = lues.D;
      if (trace) trace.definirFonction("reel", reel);
      const x = 1 - reglages.D;
      if (valeurs) {
        valeurs.maj({
          mreel: reel(reglages.D),
          mideal: 1 / x,
          eta: (100 / (1 + reglages.a / (x * x))),
          mmax: 0.5 / Math.sqrt(reglages.a),
          dopt: 1 - Math.sqrt(reglages.a),
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   H. Démarrage du hacheur abaisseur
   -------------------------------------------------------------------------- */

function simulerDemarrage(rampeMs, Is) {
  const Ve = 40;
  const Dfin = 0.675;
  const L = 56e-6;
  const C = 47e-6;
  const R = 27 / Is;
  const Td = 1e-5;
  const PAS = 100;
  const dt = Td / PAS;
  const horizon = 5e-3;
  const n = Math.round(horizon / dt);
  const rampe = rampeMs * 1e-3;
  let i = 0;
  let v = 0;
  let imax = 0;
  let vmax = 0;
  const vs = [];
  const il = [];
  for (let k = 0; k <= n; k += 1) {
    const t = k * dt;
    const D = rampe > 0 ? Dfin * Math.min(1, t / rampe) : Dfin;
    const frac = Math.min(1, Math.max(0, (D - (k % PAS) / PAS) * PAS));
    let voff = -v;
    if (i <= 0 && voff < 0) voff = 0;
    const vl = frac * (Ve - v) + (1 - frac) * voff;
    i += (vl / L) * dt;
    if (i < 0) i = 0;
    v += ((i - v / R) / C) * dt;
    if (i > imax) imax = i;
    if (v > vmax) vmax = v;
    if (k % 20 === 0) {
      vs.push([t * 1e3, v]);
      il.push([t * 1e3, i]);
    }
  }
  return { vs, il, imax, vmax };
}

function construireDemarrage(racine, api) {
  if (!racine.querySelector("#h-demarrage-trace")) return;
  const reglages = { rampe: 0, Is: 8 };
  let simu = simulerDemarrage(0, 8);
  let tCourant = 5;
  const trace = api.sim.traceur("#h-demarrage-trace", {
    titre: "Mise en marche, batterie déconnectée",
    genre: "Simulation",
    xTitre: "temps", xUnite: "ms", yTitre: "valeur", yUnite: "V ou A",
    xMin: 0, xMax: 5, yMin: 0, yMax: 50,
    ratio: 0.45,
    series: [
      { id: "vs", nom: "v_s, tension de sortie en V", couleur: "serie-1", epaisseur: 2.4, points: [] },
      { id: "il", nom: "i_L, courant de l'inductance en A", couleur: "serie-5", epaisseur: 1.2, points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 11.5, "saturation supposée 11,5 A");
    },
  });
  if (trace) ressources.push(trace);
  const valeurs = api.sim.valeurs("#h-demarrage-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "v", libelle: "v_s", unite: "V", decimales: 2 },
    { id: "i", libelle: "i_L", unite: "A", decimales: 2 },
    { id: "vmax", libelle: "Tension crête sur 5 ms", unite: "V", decimales: 1 },
    { id: "imax", libelle: "Courant crête sur 5 ms", unite: "A", decimales: 1 },
    { id: "dep", libelle: "Dépassement de 27 V", unite: "%", decimales: 0 },
    { id: "sat", libelle: "Saturation franchie", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(tms) {
    tCourant = Math.max(0, Math.min(5, tms));
    const filtre = (serie) => {
      const pts = serie.filter((p) => p[0] <= tCourant);
      return pts.length > 1 ? pts : [[0, 0], [0.001, 0]];
    };
    const vsv = filtre(simu.vs);
    const ilv = filtre(simu.il);
    if (trace) {
      trace.definirDonnees("vs", vsv);
      trace.definirDonnees("il", ilv);
    }
    if (valeurs) {
      valeurs.maj({
        t: tCourant,
        v: vsv[vsv.length - 1][1],
        i: ilv[ilv.length - 1][1],
        vmax: simu.vmax,
        imax: simu.imax,
        dep: Math.max(0, (simu.vmax / 27 - 1) * 100),
        sat: simu.imax > 11.5 ? "oui" : "non",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-demarrage-curseurs",
    [
      { id: "rampe", libelle: "Durée de la rampe de démarrage progressif", min: 0, max: 3, pas: 0.1, valeur: 0, unite: "ms" },
      { id: "Is", libelle: "Courant de charge en régime établi", min: 1, max: 8, pas: 0.5, valeur: 8, unite: "A" },
    ],
    (lues) => {
      reglages.rampe = lues.rampe;
      reglages.Is = lues.Is;
      simu = simulerDemarrage(reglages.rampe, reglages.Is);
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);
  const lecteur = api.sim.lecteur("#h-demarrage-lecteur", {
    de: 0,
    a: 5,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Écoulement du temps depuis la mise en marche",
    rappel: (t) => afficher(t),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(5);
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

const DESSIN_SATURATION =
  TRAITS + ' stroke-width="1.4"><path d="M50 200H560M50 200V20"/></g>' +
  TRAITS + ' stroke-width="1.6" stroke-dasharray="6 5"><path d="M50 150L170 60L300 150L420 60L550 150"/></g>' +
  TRAITS + ' stroke-width="3"><path d="M50 150L130 100C150 90 160 70 170 40L300 150L380 100C400 90 410 70 420 40L550 150"/></g>' +
  TRAITS + ' stroke-width="1.2" stroke-dasharray="2 4"><path d="M50 100H560"/></g>' +
  ECRITS + texte(56, 16, "i_L : rampe normale (tirets), rampe saturée (trait épais)") + texte(440, 96, "I_sat") + texte(530, 218, "t") + "</g>";

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  const dI1 = (12 * 0.75) / (22e-6 * 2e5);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-ondulation-buck",
      titre: "Ondulation de courant d'un abaisseur",
      niveau: "fondamental",
      enonce: "<p>Un hacheur abaisseur en conduction continue convertit $48\\ \\mathrm{V}$ en $12\\ \\mathrm{V}$, avec $L = 22\\ \\mathrm{\\mu H}$ et $f = 200\\ \\mathrm{kHz}$. Quelle est l'ondulation crête à crête du courant de l'inductance, en ampères ?</p>",
      valeur: dI1,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Ondulation $\\Delta i_L$",
      etapes: [
        { texte: "Rapport cyclique : $D = V_s/V_e = 12/48 = 0{,}25$." },
        { texte: "Pendant la phase 2, $v_L = -V_s$ pendant $(1 - D)/f$ : $\\Delta i_L = \\dfrac{V_s(1 - D)}{Lf}$." },
        { texte: "$\\Delta i_L = \\dfrac{12 \\times 0{,}75}{22 \\times 10^{-6} \\times 2 \\times 10^5} = \\dfrac{9}{4{,}4} = 2{,}05\\ \\mathrm{A}$.", note: "Contrôle par la phase 1 : $(48 - 12) \\times 0{,}25/(4{,}4) = 2{,}05\\ \\mathrm{A}$, identique : c'est l'équilibre des volts-secondes." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const m = regime(1, 48, 0.25, 22e-6, 2e5, 1.2, 100e-6);
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant de l'inductance, I_s = 10 A supposés",
          xTitre: "temps", xUnite: "µs", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 10, yMin: 8, yMax: 12,
          series: [{ id: "i", nom: "i_L(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => m.iL(t / 5) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, m.Imax, "crête");
            ligneH(c, r, couleurs, m.Imin, "creux : Δi_L = 2,05 A");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-courant-boost",
      titre: "Courant d'entrée d'un élévateur",
      niveau: "fondamental",
      enonce: "<p>Un hacheur élévateur idéal en conduction continue produit $60\\ \\mathrm{V}$ et $3\\ \\mathrm{A}$ à partir de $24\\ \\mathrm{V}$. Quel est le courant moyen de son inductance, en ampères ?</p>",
      valeur: 7.5,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant moyen $I_L$",
      etapes: [
        { texte: "Rapport cyclique : $V_s = V_e/(1 - D)$, donc $1 - D = 24/60 = 0{,}4$ et $D = 0{,}6$." },
        { texte: "Bilan de puissance : $V_eI_L = V_sI_s$, soit $I_L = 60 \\times 3/24 = 7{,}5\\ \\mathrm{A}$, ou $I_s/(1 - D) = 3/0{,}4$." },
        { texte: "La diode ne transmet ce courant que pendant $(1 - D) = 40\\ \\%$ du temps : $7{,}5 \\times 0{,}4 = 3\\ \\mathrm{A}$ moyens en sortie.", note: "Erreur classique : dimensionner l'inductance et l'interrupteur pour $3\\ \\mathrm{A}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["1 - D = V_e / V_s = 24 / 60 = 0,4", "I_L = I_s / (1 - D) = 3 / 0,4 = 7,5 A", "contrôle : 24 V × 7,5 A = 180 W = 60 V × 3 A"], "Bilan de puissance de l'élévateur.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  const lim3 = (24 * (5 / 24) * (1 - 5 / 24)) / (2 * 10e-6 * 5e5);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-frontiere",
      titre: "Frontière de conduction discontinue",
      niveau: "intermédiaire",
      enonce: "<p>Un abaisseur convertit $24\\ \\mathrm{V}$ en $5\\ \\mathrm{V}$ avec $L = 10\\ \\mathrm{\\mu H}$ et $f = 500\\ \\mathrm{kHz}$. Au-dessous de quel courant de sortie, en ampères, passe-t-il en conduction discontinue ? Choisissez la bonne relation avant de calculer.</p>",
      valeur: lim3,
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Courant limite $I_{s,lim}$",
      etapes: [
        { texte: "Méthode : la frontière est atteinte quand le creux du triangle touche zéro, $I_L - \\Delta i_L/2 = 0$ ; pour l'abaisseur $I_L = I_s$, donc $I_{s,lim} = \\Delta i_L/2$." },
        { texte: "$D = 5/24 = 0{,}2083$ ; $\\Delta i_L = V_s(1 - D)/(Lf) = 5 \\times 0{,}7917/(10^{-5} \\times 5 \\times 10^5) = 3{,}958/5 = 0{,}792\\ \\mathrm{A}$." },
        { texte: "$I_{s,lim} = 0{,}396\\ \\mathrm{A}$.", note: "Même résultat par $V_eD(1 - D)/(2Lf) = 24 \\times 0{,}2083 \\times 0{,}7917/10 = 0{,}396\\ \\mathrm{A}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const m = regime(1, 24, 5 / 24, 10e-6, 5e5, 5 / lim3, 100e-6);
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant de l'inductance à la frontière",
          xTitre: "temps", xUnite: "µs", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 4, yMin: 0, yMax: 1,
          series: [{ id: "i", nom: "i_L(t), creux à zéro", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => m.iL(t / 2) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, lim3, "moyenne = Δi_L / 2 = 0,396 A");
          },
        });
      },
    })
  );

  const C4 = (dI1 / (8 * 2e5 * 0.02)) * 1e6;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-condensateur",
      titre: "Condensateur de sortie d'un abaisseur",
      niveau: "intermédiaire",
      enonce: "<p>Pour l'abaisseur du premier exercice, $48$ vers $12\\ \\mathrm{V}$ à $200\\ \\mathrm{kHz}$ avec $\\Delta i_L = 2{,}05\\ \\mathrm{A}$, l'ondulation de sortie ne doit pas dépasser $20\\ \\mathrm{mV}$ crête à crête. Quelle capacité minimale, en microfarads, faut-il avec un condensateur idéal ? Quelle résistance série admettriez-vous ensuite ?</p>",
      valeur: C4,
      unite: "µF",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "Capacité minimale $C$",
      etapes: [
        { texte: "Le condensateur absorbe $i_C = i_L - I_s$, triangle d'amplitude $\\Delta i_L$ ; charge de la demi-période positive : $\\Delta Q = \\Delta i_L/(8f)$." },
        { texte: "$C \\geq \\dfrac{\\Delta i_L}{8f\\,\\Delta V_s} = \\dfrac{2{,}045}{8 \\times 2 \\times 10^5 \\times 0{,}02} = 63{,}9\\ \\mathrm{\\mu F}$." },
        { texte: "Résistance série : seule, elle donnerait $R_{ESR}\\Delta i_L$ ; pour tenir $20\\ \\mathrm{mV}$, $R_{ESR} \\leq 0{,}02/2{,}045 = 9{,}8\\ \\mathrm{m\\Omega}$. Avec les deux termes, il faut partager le budget : par exemple $100\\ \\mathrm{\\mu F}$ céramique effectifs, qui laissent $7{,}2\\ \\mathrm{mV}$ pour la résistance série, soit $3{,}5\\ \\mathrm{m\\Omega}$.", note: "Un céramique de $100\\ \\mathrm{\\mu F}$ nominal peut n'en offrir que la moitié sous $12\\ \\mathrm{V}$ : vérifier la courbe du constructeur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant du condensateur et charge apportée",
          xTitre: "temps", xUnite: "µs", yTitre: "i_C", yUnite: "A",
          xMin: 0, xMax: 10, yMin: -1.5, yMax: 1.5,
          series: [{ id: "ic", nom: "i_C = i_L - I_s", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => { const m = regime(1, 48, 0.25, 22e-6, 2e5, 1.2, 1e-4); return m.iL(t / 5) - m.IL; } }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0, "aire positive : ΔQ = Δi_L / (8 f)");
          },
        });
      },
    })
  );

  const Ve5 = 40;
  const K5 = (2 * 56e-6 * 1e5) / 135;
  const M5 = 2 / (1 + Math.sqrt(1 + (4 * K5) / (0.675 * 0.675)));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-discontinu",
      titre: "Chargeur à faible charge, rapport cyclique figé",
      niveau: "avancé",
      enonce: "<p>Le chargeur du projet fil rouge, $V_e = 40\\ \\mathrm{V}$, $L = 56\\ \\mathrm{\\mu H}$, $f = 100\\ \\mathrm{kHz}$, ne débite plus que $0{,}2\\ \\mathrm{A}$ sous environ $27\\ \\mathrm{V}$, soit une charge équivalente de $135\\ \\Omega$. Si la régulation restait figée à $D = 0{,}675$, quelle tension de sortie, en volts, s'établirait ? Quel rapport cyclique la régulation doit-elle imposer pour revenir à $27\\ \\mathrm{V}$ ?</p>",
      valeur: M5 * Ve5,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Tension de sortie $V_s$",
      etapes: [
        { texte: "Mode : $I_{s,lim} = 0{,}78\\ \\mathrm{A}$ à $40\\ \\mathrm{V}$, donc $0{,}2\\ \\mathrm{A}$ est en conduction discontinue ; $V_s = DV_e$ ne vaut plus." },
        { texte: "$K = 2Lf/R = 2 \\times 56 \\times 10^{-6} \\times 10^5/135 = 0{,}0830$." },
        { texte: "$M = \\dfrac{2}{1 + \\sqrt{1 + 4K/D^2}} = \\dfrac{2}{1 + \\sqrt{1 + 0{,}332/0{,}4556}} = \\dfrac{2}{1 + 1{,}315} = 0{,}864$, soit $V_s = 34{,}6\\ \\mathrm{V}$." },
        { texte: "Pour $M = 0{,}675$ : $1 + 4K/D^2 = (2/M - 1)^2 = 3{,}853$, donc $D^2 = 4K/2{,}853 = 0{,}1163$ et $D = 0{,}341$.", note: "La régulation doit diviser le rapport cyclique par deux : la plage de commande d'un hacheur qui travaille à faible charge est beaucoup plus large que ne le laisse croire $D = V_s/V_e$. La valeur exacte dépend un peu de $R$, qui change avec $V_s$ ; ici, on a gardé $135\\ \\Omega$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Caractéristique de sortie à D = 0,675 et à D = 0,341",
          xTitre: "courant de sortie", xUnite: "A", yTitre: "V_s", yUnite: "V",
          xMin: 0.05, xMax: 1.5, yMin: 0, yMax: 42,
          series: [
            { id: "a", nom: "D = 0,675", couleur: "serie-1", epaisseur: 2.6, fonction: (i) => vsDeIs(1, 40, 0.675, 56e-6, 1e5, i) },
            { id: "b", nom: "D = 0,341", couleur: "serie-5", epaisseur: 1.8, fonction: (i) => vsDeIs(1, 40, 0.341, 56e-6, 1e5, i) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 34.56 / 135, 34.56, "34,6 V");
            ligneH(c, r, couleurs, 27, "27 V visés");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Diagnostic : une inductance qui chauffe",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un chargeur abaisseur, la tension de sortie reste correcte, mais l'inductance chauffe nettement plus que prévu et le transistor déclenche parfois sa protection de courant à pleine charge, surtout quand l'armoire est chaude. À l'oscilloscope, avec une sonde de courant, la rampe montante de $i_L$ reste droite au début de la conduction puis s'incurve vers le haut juste avant l'ouverture. Quelle est la cause la plus probable ?</p>",
      options: [
        { texte: "La saturation du noyau de l'inductance : au-delà du courant de saturation, l'inductance chute et la pente $V/L$ augmente", juste: true },
        { texte: "Le passage en conduction discontinue" },
        { texte: "Une résistance série trop forte du condensateur de sortie" },
        { texte: "Une fréquence de découpage trop élevée" },
      ],
      etapes: [
        { texte: "Une rampe qui s'incurve vers le haut signifie que $\\mathrm{d}i/\\mathrm{d}t = v_L/L$ augmente alors que $v_L$ est constante : c'est $L$ qui diminue." },
        { texte: "La diminution de $L$ avec le courant est la signature de la saturation ; le courant de saturation baisse quand le noyau chauffe, d'où la sensibilité à la température de l'armoire." },
        { texte: "La conduction discontinue se verrait par un palier nul, un condensateur vieilli par une ondulation de tension accrue, une fréquence trop haute par des pertes de commutation, sans déformer la rampe.", note: "Remède : inductance de courant de saturation plus élevé, au moins $1{,}25$ fois le seuil de la limitation de courant, ou ventilation ; vérifier aussi que la limitation agit cycle par cycle." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 600 230", DESSIN_SATURATION, "Une rampe qui s'incurve au-delà du courant de saturation trahit l'effondrement de l'inductance.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Protection en court-circuit",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul : pourquoi un hacheur abaisseur peut-il interrompre un court-circuit de sa sortie en ouvrant son interrupteur, alors qu'un hacheur élévateur ne le peut pas ?</p>",
      motsCles: [["diode"], ["direct", "permanence", "toujours", "chemin", "relie"], ["entree", "source"], ["serie", "interrupteur", "couper", "ouvrir"]],
      minimum: 3,
      exemple: "Suivez le chemin du courant de la source vers la sortie quand l'interrupteur est ouvert.",
      etapes: [
        { texte: "Abaisseur : l'interrupteur est en série entre la source et le reste du montage ; ouvert, il isole la sortie de la source." },
        { texte: "Élévateur : l'interrupteur est en parallèle, vers la masse ; le chemin source, inductance, diode, sortie existe en permanence et ne contient aucun élément commandé." },
        { texte: "En court-circuit, ce chemin débite un courant limité seulement par la source et les résistances ; ouvrir l'interrupteur n'y change rien.", note: "Il faut donc un fusible, un interrupteur en série, ou une topologie à quatre interrupteurs. La même liaison directe explique l'appel de courant à la mise sous tension." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const DESSIN_BOOST_QUIZ = `<defs><marker id="fl-q" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M70 70V140M70 180V250"/><circle cx="70" cy="160" r="20"/><path d="M70 250H370"/><path d="M70 70H112.5a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0a7.5 7.5 0 0 1 15 0H215"/><path d="M215 70V130"/><path d="M215 130V138M215 182V190"/><path d="M215 182L197 142" stroke-width="2.4"/><circle cx="215" cy="138" r="3"/><circle cx="215" cy="182" r="3"/><path d="M215 190V250"/><path d="M215 70H253.5M271.5 70H310"/><path d="M253.5 60L271.5 70L253.5 80Z"/><path d="M271.5 60v20" stroke-width="2.6"/><path d="M310 70H370"/><path d="M310 70V155M310 165V250"/><path d="M292 155h36M292 165h36" stroke-width="3"/><path d="M370 70V136M370 184V250"/><rect x="361" y="136" width="18" height="48" rx="3"/><path d="M215 250v10M201 260h28M206 265h18M211 270h8"/></g><circle cx="215" cy="70" r="3.6" fill="currentColor" stroke="none"/><circle cx="310" cy="70" r="3.6" fill="currentColor" stroke="none"/><circle cx="310" cy="250" r="3.6" fill="currentColor" stroke="none"/><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M36 200L36 120" marker-end="url(#fl-q)"/><path d="M170 38L120 38" marker-end="url(#fl-q)"/><path d="M100 84L124 84" marker-end="url(#fl-q)"/><path d="M232 140L232 168" marker-end="url(#fl-q)"/><path d="M250 52L280 52" marker-end="url(#fl-q)"/><path d="M410 205L410 120" marker-end="url(#fl-q)"/><path d="M352 112L352 136" marker-end="url(#fl-q)"/></g><g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13"><text x="65" y="150">+</text><text x="66" y="178">-</text><text x="10" y="112">V_e</text><text x="152" y="106">L</text><text x="176" y="150">T</text><text x="258" y="98">D</text><text x="120" y="214" font-size="11">q(t)</text><text x="134" y="30">v_L</text><text x="92" y="102">i_L</text><text x="238" y="160">i_T</text><text x="252" y="44">i_D</text><text x="272" y="166">C</text><text x="384" y="166">R</text><text x="400" y="112">V_s</text><text x="380" y="92">+</text><text x="380" y="240">-</text><text x="330" y="108">I_s</text><text x="232" y="270" font-size="11">0 V</text><text x="222" y="62" font-size="11">A</text></g>`;

const VISUELS_QUIZ = [
  etapes(["T fermé : l'inductance se charge sous V_e", "T ouvert : elle tire son courant de la sortie", "la borne de sortie devient négative"], "Le montage inverseur."),
  etapes(["conduction continue : V_s = D V_e", "R n'intervient pas", "tant que I_s > I_s,lim"], "Sortie indépendante de la charge."),
  etapes(["V_s = V_e / (1 - D)", "= 12 / 0,6", "= 20 V"], "Élévateur."),
  etapes(["régime périodique : i_L(T) = i_L(0)", "Δi_L = (1 / L) ∫ v_L dt = 0", "donc valeur moyenne de v_L nulle"], "Équilibre des volts-secondes."),
  etapes(["|V_s| = D V_e / (1 - D)", "= 0,6 × 24 / 0,4", "= 36 V"], "Inverseur."),
  etapes(["Δi_L = V_e D (1 - D) / (L f)", "L ou f plus petit : Δi_L plus grand", "D(1 - D) baisse de 0,25 à 0,09 entre 0,5 et 0,9"], "Ce qui fixe l'ondulation."),
  () => ({ viewBox: "0 0 430 300", dessin: DESSIN_BOOST_QUIZ + TRAITS + ' stroke-width="1.6" stroke-dasharray="4 4"><rect x="242" y="46" width="48" height="48" rx="6"/></g>', legende: "La diode conduit le courant de l'inductance pendant que T est ouvert." }),
  etapes(["conduction discontinue : M = 2 / (1 + √(1 + 4K / D²))", "M > D, et M tend vers 1 à vide", "V_s = D V_e n'est plus vraie"], "Conduction discontinue."),
  etapes(["ΔV_s = I_s D / (C f)", "= 2 × 0,5 / (100 µF × 100 kHz)", "= 0,1 V = 100 mV"], "Ondulation de sortie de l'élévateur."),
  etapes(["T ouvert : v_A = -|V_s| côté diode", "T voit V_e - (-|V_s|)", "= V_e + |V_s|"], "Tension bloquée dans l'inverseur."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle topologie produit une tension de sortie de signe opposé à celui de l'entrée ?</p>",
        options: ["L'abaisseur", "L'élévateur", "L'abaisseur-élévateur inverseur", "Aucune des trois"],
        bonnes: [2],
        explication: "Dans l'inverseur, l'inductance se charge sous $V_e$, puis maintient son courant vers la masse en le tirant de la sortie à travers la diode : la borne de sortie devient négative.",
        resume: "Topologie inverseuse",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>En conduction continue, la tension de sortie d'un abaisseur idéal ne dépend pas de la résistance de charge.</p>",
        reponse: true,
        explication: "$V_s = DV_e$ ne contient pas $R$ : seule la valeur moyenne du courant suit la charge, tant que $I_s$ reste supérieur à $I_{s,lim}$.",
        resume: "Indépendance vis-à-vis de la charge",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un élévateur idéal en conduction continue est alimenté sous $12\\ \\mathrm{V}$ avec $D = 0{,}4$. Tension de sortie, en volts ?</p>",
        valeur: 20,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_s = 12/(1 - 0{,}4) = 20\\ \\mathrm{V}$.",
        resume: "Rapport de l'élévateur",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi la valeur moyenne de la tension aux bornes de l'inductance est-elle nulle en régime établi ?</p>",
        motsCles: [["periodique", "etabli", "meme valeur", "revient", "retrouve"], ["courant"], ["integrale", "aire", "moyenne", "volt"]],
        minimum: 2,
        explication: "En régime périodique, $i_L$ revient à la même valeur à chaque période ; or sa variation vaut $\\frac{1}{L}\\int v_L\\,\\mathrm{d}t$ : l'aire, donc la moyenne, de $v_L$ est nulle.",
        resume: "Équilibre des volts-secondes",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un inverseur idéal en conduction continue est alimenté sous $24\\ \\mathrm{V}$ avec $D = 0{,}6$. Valeur absolue de la tension de sortie, en volts ?</p>",
        valeur: 36,
        unite: "V",
        tolerance: 0.01,
        explication: "$|V_s| = 0{,}6 \\times 24/0{,}4 = 36\\ \\mathrm{V}$ : au-delà de $D = 0{,}5$, l'inverseur élève.",
        resume: "Rapport de l'inverseur",
      },
      {
        type: "qcm",
        enonce: repere(5) + "<p>Pour un abaisseur à tension d'entrée fixée, quelles actions augmentent l'ondulation $\\Delta i_L$ ?</p>",
        options: [
          { texte: "Diminuer l'inductance", juste: true },
          { texte: "Diminuer la fréquence de découpage", juste: true },
          { texte: "Augmenter le courant de charge" },
          { texte: "Passer le rapport cyclique de 0,5 à 0,9" },
        ],
        multiple: true,
        explication: "$\\Delta i_L = V_eD(1 - D)/(Lf)$ : elle croît si $L$ ou $f$ diminue, ne dépend pas de la charge, et $D(1 - D)$ passe de $0{,}25$ à $0{,}09$ entre $0{,}5$ et $0{,}9$.",
        resume: "Facteurs de l'ondulation",
      },
      {
        type: "schema",
        enonce: repere(6) + "<p>Sur ce hacheur élévateur, quel composant conduit le courant de l'inductance pendant que l'interrupteur est ouvert ?</p>",
        consigne: "Cliquez sur le composant.",
        viewBox: "0 0 430 300",
        dessin: DESSIN_BOOST_QUIZ,
        zones: [
          { x: 100, y: 48, largeur: 90, hauteur: 44, etiquette: "inductance" },
          { x: 168, y: 120, largeur: 70, hauteur: 80, etiquette: "interrupteur" },
          { x: 242, y: 46, largeur: 48, hauteur: 48, etiquette: "diode", juste: true },
          { x: 288, y: 138, largeur: 46, hauteur: 54, etiquette: "condensateur" },
        ],
        explication: "Quand $T$ s'ouvre, le courant de l'inductance ne peut pas s'interrompre : la tension du nœud $A$ monte jusqu'à mettre la diode en conduction, et ce courant alimente la sortie.",
        resume: "Rôle de la diode",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>En conduction discontinue, la relation $V_s = DV_e$ reste vraie pour un abaisseur.</p>",
        reponse: false,
        explication: "En conduction discontinue, $M = 2/(1 + \\sqrt{1 + 4K/D^2})$, supérieur à $D$ et tendant vers $1$ à vide.",
        resume: "Rapport en conduction discontinue",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un élévateur délivre $2\\ \\mathrm{A}$ avec $D = 0{,}5$, $C = 100\\ \\mathrm{\\mu F}$ idéal et $f = 100\\ \\mathrm{kHz}$. Ondulation de sortie crête à crête, en millivolts ?</p>",
        valeur: 100,
        unite: "mV",
        tolerance: 0.02,
        explication: "$\\Delta V_s = I_sD/(Cf) = 2 \\times 0{,}5/(10^{-4} \\times 10^5) = 0{,}1\\ \\mathrm{V}$.",
        resume: "Ondulation de l'élévateur",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelle tension l'interrupteur d'un hacheur inverseur doit-il bloquer ?</p>",
        options: ["$V_e$", "$|V_s|$", "$V_e + |V_s|$", "$V_e - |V_s|$"],
        bonnes: [2],
        explication: "Interrupteur ouvert, la diode conduit et le nœud $A$ est à $-|V_s|$ : l'interrupteur voit $V_e - (-|V_s|) = V_e + |V_s|$.",
        resume: "Contrainte en tension de l'inverseur",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  if (!racine.querySelector("#m-cartes")) return;
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Physique", question: "Pourquoi un hacheur a-t-il besoin d'une inductance ?", reponse: "Pour accepter des sauts de tension sans saut de courant : elle stocke l'énergie pendant une phase et la restitue pendant l'autre, l'interrupteur ne dissipant presque rien." },
      { categorie: "Physique", question: "Qui met la diode de roue libre en conduction ?", reponse: "L'inductance : à l'ouverture de $T$, son courant ne peut pas s'interrompre et la tension du nœud de commutation bascule jusqu'à rendre la diode passante." },
      { categorie: "Loi", question: "Qu'est-ce que l'équilibre des volts-secondes ?", reponse: "En régime périodique, $\\int v_L\\,\\mathrm{d}t = 0$ sur une période : l'aire positive de $v_L$ compense l'aire négative." },
      { categorie: "Formule", question: "Rapports de conversion en conduction continue ?", reponse: "Abaisseur $D$, élévateur $1/(1 - D)$, inverseur $D/(1 - D)$ avec sortie inversée." },
      { categorie: "Formule", question: "Ondulation de courant de l'abaisseur, et où la calculer ?", reponse: "$\\Delta i_L = V_s(1 - D)/(Lf)$, maximale à $V_e$ maximale." },
      { categorie: "Formule", question: "Ondulation de sortie de l'abaisseur et de l'élévateur ?", reponse: "Abaisseur : $\\Delta i_L/(8Cf)$. Élévateur : $I_sD/(Cf)$, car le condensateur porte seul la charge pendant $DT_d$." },
      { categorie: "Frontière", question: "Quand la conduction devient-elle discontinue ?", reponse: "Quand $I_s < V_eD(1 - D)/(2Lf)$ : le courant moyen descend sous la demi-ondulation et $i_L$ s'annule avant la fin de la période." },
      { categorie: "Défaut", question: "Que fait un élévateur à vide en boucle ouverte ?", reponse: "Sa tension monte sans limite : chaque période transfère $\\frac{1}{2}L\\hat{I}_L^2$ que personne ne consomme. Régulation et protection de surtension obligatoires." },
      { categorie: "Dimensionnement", question: "Quel courant le condensateur de sortie d'un élévateur porte-t-il ?", reponse: "Environ $I_s\\sqrt{D/(1 - D)}$ efficaces, du même ordre que $I_s$, contre $\\Delta i_L/\\sqrt{12}$ pour un abaisseur." },
      { categorie: "Commande", question: "Pourquoi un démarrage progressif ?", reponse: "Le filtre LC peu amorti dépasse de $60\\ \\%$ sur un échelon : $43\\ \\mathrm{V}$ et $27\\ \\mathrm{A}$ pour le chargeur sans rampe, contre $28\\ \\mathrm{V}$ et $10\\ \\mathrm{A}$ avec $1\\ \\mathrm{ms}$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["D = V_s / V_e", "= 27 / 36", "= 0,75"], "Rapport cyclique de l'abaisseur."),
  etapes(["abaisseur : C reçoit i_L - I_s, triangle faible", "élévateur : C reçoit i_D - I_s, pulsé", "I_C,eff ≈ I_s √(D / (1 - D))"], "Le condensateur de l'élévateur est le plus sollicité."),
  etapes(["Δi_L ne dépend pas de la charge", "I_L = I_s diminue", "I_L < Δi_L / 2 : i_L s'annule"], "Origine de la conduction discontinue."),
  etapes(["I_eff² = D I² = 0,5 × 64 = 32 A²", "P = R_DS(on) I_eff²", "= 0,010 × 32 = 0,32 W"], "Pertes de conduction d'un MOSFET."),
  etapes(["40 V : tenue 100 V suffisante", "100 kHz : composant unipolaire rapide", "MOSFET Si, quelques mΩ"], "Choix de l'interrupteur du chargeur."),
  etapes(["n = 60 f / p", "p = 60 f / n = 60 × 100 / 1500", "p = 4 paires de pôles"], "Vitesse de synchronisme."),
  etapes(["P = V I λ", "I = 216 / (230 × 0,67)", "= 1,40 A"], "Courant et facteur de puissance."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Rapport cyclique d'un abaisseur idéal en conduction continue qui produit $27\\ \\mathrm{V}$ à partir de $36\\ \\mathrm{V}$ ?</p>",
        valeur: 0.75,
        unite: "",
        tolerance: 0.01,
        explication: "$D = V_s/V_e = 27/36 = 0{,}75$.",
        resume: "Rapport cyclique",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. À puissance égale, le condensateur de sortie d'un élévateur porte moins de courant efficace que celui d'un abaisseur.</p>",
        reponse: false,
        explication: "C'est l'inverse : l'élévateur alimente sa sortie par un courant pulsé, et son condensateur porte environ $I_s\\sqrt{D/(1 - D)}$ efficaces.",
        resume: "Contrainte du condensateur",
      },
      {
        type: "courte",
        enonce: repere(2) + "<p>Cette séance. Pourquoi la conduction discontinue apparaît-elle à faible charge ?</p>",
        motsCles: [["ondulation", "delta", "triangle"], ["moyen", "moyenne", "charge"], ["annule", "zero", "nul"], ["diode", "bloque"]],
        minimum: 2,
        explication: "L'ondulation $\\Delta i_L$ ne dépend pas de la charge ; quand le courant moyen descend sous $\\Delta i_L/2$, le courant s'annule avant la fin de la période et la diode se bloque.",
        resume: "Conduction discontinue",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours MOSFET et IGBT. Un MOSFET de $10\\ \\mathrm{m\\Omega}$ à chaud conduit $8\\ \\mathrm{A}$ lissés pendant la moitié de chaque période. Pertes de conduction, en watts ?</p>",
        valeur: 0.32,
        unite: "W",
        tolerance: 0.02,
        explication: "$I_{eff}^2 = DI^2 = 32\\ \\mathrm{A^2}$, $P = 0{,}010 \\times 32 = 0{,}32\\ \\mathrm{W}$.",
        resume: "Pertes de conduction",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours MOSFET et IGBT. Pourquoi le hacheur du chargeur, $40\\ \\mathrm{V}$ à $100\\ \\mathrm{kHz}$, utilise-t-il un MOSFET au silicium plutôt qu'un IGBT ?</p>",
        options: [
          "Parce qu'un IGBT ne peut pas bloquer 40 V",
          "Parce qu'en basse tension le MOSFET Si a quelques milliohms et commute en quelques nanosecondes, alors que l'IGBT ajoute un seuil et un courant de queue",
          "Parce que le MOSFET n'a besoin d'aucune énergie de commande",
          "Parce qu'un IGBT ne supporte pas une charge inductive",
        ],
        bonnes: [1],
        explication: "À $100\\ \\mathrm{V}$ de tenue, le MOSFET Si conduit comme une petite résistance et commute très vite ; l'IGBT y dissiperait environ huit fois plus.",
        resume: "Choix technologique",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Machine synchrone. Une excitatrice à aimants tourne à $1500\\ \\mathrm{tr/min}$ et délivre $100\\ \\mathrm{Hz}$. Combien de paires de pôles possède-t-elle ?</p>",
        valeur: 4,
        unite: "",
        tolerance: 0.001,
        explication: "$n = 60f/p$, donc $p = 60 \\times 100/1500 = 4$.",
        resume: "Paires de pôles",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Puissances en courant alternatif. Un appareil absorbe $216\\ \\mathrm{W}$ sous $230\\ \\mathrm{V}$ avec un facteur de puissance de $0{,}67$. Courant efficace absorbé, en ampères ?</p>",
        valeur: 216 / (230 * 0.67),
        unite: "A",
        tolerance: 0.02,
        explication: "$I = P/(V\\lambda) = 216/(230 \\times 0{,}67) = 1{,}40\\ \\mathrm{A}$ ; avec un facteur de puissance unitaire, il suffirait de $0{,}94\\ \\mathrm{A}$.",
        resume: "Facteur de puissance",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#n-revision-bloc", VISUELS_REVISION);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  if (!racine.querySelector("#p-autoevaluation-grille")) return;
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les hacheurs ?",
  });
  if (auto) ressources.push(auto);
}
