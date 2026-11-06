/* ==========================================================================
   cours/mosfet-et-igbt/cours.js
   MOSFET et IGBT : formation du canal, caractéristiques à l'état passant,
   chronogrammes de commutation avec pertes, pertes d'un onduleur en fonction
   de la fréquence, exercices, quiz, cartes, révision et auto-évaluation.
   N'utilise que l'objet api et le DOM de la racine du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/* Trois composants représentatifs. Valeurs supposées, ordres de grandeur. */
const COMPOSANTS = [
  {
    court: "MOSFET Si",
    nom: "MOSFET Si 100 V, 8 mΩ",
    V: 40, I: 8, RG: 5, f: 100, Vmax: 100,
    Ciss: 3e-9, Vth: 3, k: 8 / 2.25, QGDref: 10e-9, Vref: 40, Vp: 12, Vn: 0,
    triMin: 0, tfiMin: 0, queue: 0, tauQueue: 0, Qrr50: 0, Cer: 460e-12,
  },
  {
    court: "MOSFET SiC",
    nom: "MOSFET SiC 1200 V, 20 mΩ",
    V: 540, I: 50, RG: 4, f: 16, Vmax: 1200,
    Ciss: 3e-9, Vth: 3, k: 2, QGDref: 60e-9, Vref: 800, Vp: 18, Vn: -4,
    triMin: 10e-9, tfiMin: 10e-9, queue: 0, tauQueue: 0, Qrr50: 0.2e-6, Cer: 343e-12,
  },
  {
    court: "IGBT",
    nom: "IGBT 1200 V, 100 A",
    V: 540, I: 50, RG: 4, f: 4, Vmax: 1200,
    Ciss: 6e-9, Vth: 6, k: 100 / 12.25, QGDref: 0.35e-6, Vref: 600, Vp: 15, Vn: -8,
    triMin: 40e-9, tfiMin: 60e-9, queue: 0.2, tauQueue: 200e-9, Qrr50: 1.2e-6, Cer: 0,
  },
];

/**
 * Commutation dure sur charge inductive, modèle linéaire par morceaux.
 * Mise en conduction : retard, montée du courant, recharge de la diode,
 * chute de la tension sur le plateau Miller. Blocage : retard, montée de la
 * tension sur le plateau, chute du courant avec surtension, queue éventuelle.
 */
function commutation(p, V, I, RG, Ls) {
  const tau = RG * p.Ciss;
  const Vpl = p.Vth + Math.sqrt(I / p.k);
  const QGD = (p.QGDref * V) / p.Vref;
  const tdon = tau * Math.log((p.Vp - p.Vn) / (p.Vp - p.Vth));
  const tri = Math.max(p.triMin, tau * Math.log((p.Vp - p.Vth) / Math.max(1e-6, p.Vp - Vpl)));
  const didt = I / tri;
  const Qrr = (p.Qrr50 * I) / 50;
  const ta = Qrr > 0 ? Math.sqrt(Qrr / didt) : 0;
  const Irr = didt * ta;
  const IGon = (p.Vp - Vpl) / RG;
  const tfv = QGD / IGon;
  const Eoss = 0.5 * p.Cer * V * V;
  const chute = Math.min(V, Ls * didt);
  const tdoff = tau * Math.log((p.Vp - p.Vn) / (Vpl - p.Vn));
  const IGoff = (Vpl - p.Vn) / RG;
  const trv = QGD / IGoff;
  const tfi = Math.max(p.tfiMin, tau * Math.log((Vpl - p.Vn) / (p.Vth - p.Vn)));
  const Ic = (1 - p.queue) * I;
  const surtension = (Ls * Ic) / tfi;
  const t1 = tdon;
  const t2 = t1 + tri;
  const t3 = t2 + ta;
  const t4 = t3 + tfv;
  const u1 = tdoff;
  const u2 = u1 + trv;
  const u3 = u2 + tfi;
  const fenOn = Math.max(t4 * 1.3, t4 + 3 * tau);
  const fenOff = p.queue > 0 ? u3 + 5 * p.tauQueue : Math.max(u3 * 1.3, u3 + 3 * tau);

  function on(t) {
    if (t < t1) return { vgs: p.Vp - (p.Vp - p.Vn) * Math.exp(-t / tau), v: V, i: 0, phase: "retard à la mise en conduction" };
    if (t < t2) return { vgs: p.Vth + ((Vpl - p.Vth) * (t - t1)) / tri, v: V - chute, i: (I * (t - t1)) / tri, phase: "montée du courant sous pleine tension" };
    if (t < t3) return { vgs: Vpl, v: V - chute, i: I + didt * (t - t2), phase: "recharge inverse de la diode" };
    if (t < t4) {
      const x = (t - t3) / tfv;
      const ir = ta > 0 && t - t3 < ta ? Irr * (1 - (t - t3) / ta) : 0;
      return { vgs: Vpl, v: V * (1 - x), i: I + ir, poss: Eoss / tfv, phase: "plateau Miller : chute de la tension" };
    }
    return { vgs: p.Vp - (p.Vp - Vpl) * Math.exp(-(t - t4) / tau), v: 0, i: I, phase: "conduction" };
  }

  function off(t) {
    if (t < u1) return { vgs: p.Vn + (p.Vp - p.Vn) * Math.exp(-t / tau), v: 0, i: I, phase: "retard au blocage" };
    if (t < u2) return { vgs: Vpl, v: (V * (t - u1)) / trv, i: I, phase: "plateau Miller : montée de la tension" };
    if (t < u3) return { vgs: Vpl + ((p.Vth - Vpl) * (t - u2)) / tfi, v: V + surtension, i: I - (Ic * (t - u2)) / tfi, phase: "chute du courant, surtension" };
    const iq = p.queue > 0 ? p.queue * I * Math.exp(-(t - u3) / p.tauQueue) : 0;
    return {
      vgs: p.Vn + (p.Vth - p.Vn) * Math.exp(-(t - u3) / tau),
      v: V,
      i: iq,
      phase: p.queue > 0 && iq > 0.01 * I ? "courant de queue" : "bloqué",
    };
  }

  function energie(fn, T, jusque) {
    const N = 2400;
    const fin = jusque == null ? T : Math.min(T, jusque);
    let E = 0;
    for (let n = 0; n < N; n += 1) {
      const t = ((n + 0.5) * fin) / N;
      const e = fn(t);
      E += ((e.v * e.i + (e.poss || 0)) * fin) / N;
    }
    return E;
  }

  return {
    tau, Vpl, QGD, tdon, tri, ta, Irr, tfv, tdoff, trv, tfi, surtension, chute, Eoss, fenOn, fenOff, on, off,
    Eon: energie(on, fenOn),
    Eoff: energie(off, fenOff),
    energieOn: (t) => energie(on, fenOn, t),
    energieOff: (t) => energie(off, fenOff, t),
    dvdtOn: V / tfv,
    dvdtOff: V / trv,
    didtOff: Ic / tfi,
    Ic,
  };
}

/* Pertes d'un onduleur triphasé en modulation sinusoïdale (section I). */
const ONDULEUR = {
  igbt: { V0: 0.85, r: 0.011, Ets: 15.5e-3, VF0: 0.9, rF: 0.008, Erec: 4.0e-3 },
  sic: { R: 0.02, Ets: 2.1e-3, Erec: 0.3e-3 },
  Vref: 600,
  Iref: 100,
};

function pertesOnduleur(I, cphi, m, Vdc, fHz) {
  const Ic = Math.SQRT2 * I;
  const g = ONDULEUR.igbt;
  const Pc = g.V0 * Ic * (1 / (2 * Math.PI) + (m * cphi) / 8) + g.r * Ic * Ic * (1 / 8 + (m * cphi) / (3 * Math.PI));
  const Pd = Math.max(0, g.VF0 * Ic * (1 / (2 * Math.PI) - (m * cphi) / 8) + g.rF * Ic * Ic * (1 / 8 - (m * cphi) / (3 * Math.PI)));
  const k = (Vdc / ONDULEUR.Vref) * (Ic / Math.PI) / ONDULEUR.Iref;
  const Ps = fHz * g.Ets * k;
  const Pr = fHz * g.Erec * k;
  const s = ONDULEUR.sic;
  const Psc = (s.R * I * I) / 2;
  const Pss = fHz * (s.Ets + s.Erec) * k;
  return {
    Pc, Pd, Ps, Pr, k,
    igbt: 6 * (Pc + Pd + Ps + Pr),
    igbtCond: 6 * (Pc + Pd),
    sic: 6 * (Psc + Pss),
    sicSwitch: Psc + Pss,
    TjIgbt: 80 + 0.3 * (Pc + Ps),
    TjDiode: 80 + 0.5 * (Pd + Pr),
    TjSic: 80 + 0.35 * (Psc + Pss),
    fEgal: (Pc + Pd) / (k * (g.Ets + g.Erec)),
  };
}

/* Caractéristiques à l'état passant, classe 1200 V (section E). */
function chuteIgbt(I, T) {
  const V0 = 0.95 - 0.001 * (T - 25);
  const r = 0.008 + 0.00003 * (T - 25);
  return { v: V0 + r * I, V0, r };
}
function resistanceSic(T) {
  return 0.014 * (1 + 0.00429 * (T - 25));
}
function resistanceSi1200(T) {
  return 0.25 * (1 + 0.0067 * (T - 25));
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function seg(a, b, attributs = "") {
  return '<path d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"' + attributs + "/>";
}

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function energieTexte(api, joules) {
  if (!Number.isFinite(joules)) return "indéfini";
  if (Math.abs(joules) >= 1e-3) return nombre(api, joules * 1e3, 3) + " mJ";
  return nombre(api, joules * 1e6, 2) + " µJ";
}

function puissanceTexte(api, watts) {
  if (!Number.isFinite(watts)) return "indéfini";
  if (Math.abs(watts) >= 1000) return nombre(api, watts / 1000, 2) + " kW";
  return nombre(api, watts, 1) + " W";
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

function point(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.accent;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
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
function synchroniseur(dessiner, options = {}) {
  const etat = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "curseur" && etat.curseurs && etat.idCurseur) etat.curseurs.definir(etat.idCurseur, valeur);
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
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireCanal(racine, api);
  construireCaracteristiques(racine, api);
  construireChronogrammes(racine, api);
  construirePertesOnduleur(racine, api);
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
   Renvois vers les schémas placés au fil du texte, tracés statiques
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
    ["#d-structures-figure svg", 1.7],
    ["#d-cellule-figure svg", 1.5],
    ["#e-grille-figure svg", 1.5],
    ["#e-qg-figure svg", 1.4],
    ["#f-schema-principal svg", 2.0],
    ["#f-domaines-figure svg", 1.4],
    ["#h-figure svg", 1.6],
    ["#i-figure svg", 1.8],
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
  const tau = 10 * 5e-9;
  const t4 = tau * Math.log(15 / 11);

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-rc-grille",
      titre: "Charge d'une grille à travers sa résistance",
      niveau: "fondamental",
      enonce:
        "<p>Une capacité de $5\\ \\mathrm{nF}$, initialement déchargée, est chargée par une source de $15\\ \\mathrm{V}$ à travers $10\\ \\Omega$. " +
        "Au bout de combien de nanosecondes sa tension atteint-elle $4\\ \\mathrm{V}$ ?</p>",
      valeur: t4 * 1e9,
      unite: "ns",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Durée $t$",
      etapes: [
        { texte: "Constante de temps : $\\tau = RC = 10 \\times 5 \\times 10^{-9} = 50\\ \\mathrm{ns}$." },
        { texte: "Charge : $v(t) = 15\\left(1 - e^{-t/\\tau}\\right)$, donc $t = \\tau\\ln\\dfrac{15}{15 - 4}$." },
        { texte: "$t = 50 \\times \\ln(1{,}364) = 50 \\times 0{,}310 = 15{,}5\\ \\mathrm{ns}$.", note: "C'est exactement le calcul du retard à la mise en conduction d'un transistor : $4\\ \\mathrm{V}$ jouant le rôle du seuil." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Charge de la capacité de grille",
          xTitre: "temps", xUnite: "ns", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 200, yMin: 0, yMax: 16,
          series: [{ id: "v", nom: "v(t), trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 15 * (1 - Math.exp(-t / 50)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 4, "seuil 4 V");
            point(c, r, couleurs, t4 * 1e9, 4, "15,5 ns");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-creneau",
      titre: "Valeur efficace d'un créneau",
      niveau: "fondamental",
      enonce: "<p>Un interrupteur conduit $8\\ \\mathrm{A}$ pendant $75\\ \\%$ de chaque période et rien le reste du temps. Quelle est la valeur efficace de son courant, en ampères ?</p>",
      valeur: 8 * Math.sqrt(0.75),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur efficace $I_{eff}$",
      etapes: [
        { texte: "Définition : $I_{eff}^2 = \\dfrac{1}{T}\\int_0^T i^2\\,\\mathrm{d}t = D\\,I^2 = 0{,}75 \\times 64 = 48\\ \\mathrm{A^2}$." },
        { texte: "$I_{eff} = \\sqrt{48} = 6{,}93\\ \\mathrm{A}$.", note: "La valeur moyenne vaut $DI = 6\\ \\mathrm{A}$ : moyenne et efficace diffèrent dès que le courant est haché." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Créneau de rapport cyclique 0,75",
          xTitre: "temps rapporté à la période", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 2, yMin: 0, yMax: 10,
          series: [{ id: "i", nom: "i(t), trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => (x % 1 < 0.75 ? 8 : 0) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 8 * Math.sqrt(0.75), "I_eff = 6,93 A");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-ldidt",
      titre: "Tension induite dans un câblage",
      niveau: "fondamental",
      enonce: "<p>Un courant de $100\\ \\mathrm{A}$ s'annule linéairement en $50\\ \\mathrm{ns}$ dans une connexion de $50\\ \\mathrm{nH}$. Quelle tension apparaît à ses bornes, en volts ?</p>",
      valeur: 100,
      unite: "V",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Tension $|v|$",
      etapes: [
        { texte: "Pente : $\\mathrm{d}i/\\mathrm{d}t = 100 / (50 \\times 10^{-9}) = 2 \\times 10^9\\ \\mathrm{A/s}$, soit $2\\ \\mathrm{A/ns}$." },
        { texte: "$v = L\\,\\mathrm{d}i/\\mathrm{d}t = 50 \\times 10^{-9} \\times 2 \\times 10^9 = 100\\ \\mathrm{V}$.", note: "Cette tension s'ajoute à celle du bus aux bornes de l'interrupteur qui s'ouvre : c'est la surtension au blocage." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant et tension induite",
          xTitre: "temps", xUnite: "ns", yTitre: "valeur", yUnite: "A ou V",
          xMin: 0, xMax: 100, yMin: 0, yMax: 120,
          series: [
            { id: "i", nom: "courant en A, trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (t < 20 ? 100 : t < 70 ? 100 - ((t - 20) * 100) / 50 : 0) },
            { id: "v", nom: "tension induite en V, trait fin", couleur: "serie-3", epaisseur: 1.4, fonction: (t) => (t >= 20 && t < 70 ? 100 : 0) },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Formation du canal : coupe manipulable
   -------------------------------------------------------------------------- */

function construireCanal(racine, api) {
  const conteneur = racine.querySelector("#d-canal");
  if (!conteneur) return;
  const MOS = COMPOSANTS[0];
  const VE = 40;
  const RL = 5;
  const GX = 60;
  const GY0 = 340;
  const GY1 = 100;
  const versYG = (v) => GY0 - ((GY0 - GY1) * v) / 12;
  const idM = nouveauMarqueur("fl-d-ca");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Coupe d'un MOSFET à canal N : formation de la zone désertée puis du canal quand la tension de grille augmente",
  });
  let fond = "<defs>" + marqueur(idM) + "</defs>";
  fond += TRAITS + ' stroke-width="1.6">';
  fond += seg([GX, GY0 + 6], [GX, GY1 - 10]);
  for (let v = 0; v <= 12; v += 1) fond += seg([GX - (v % 3 === 0 ? 8 : 4), versYG(v)], [GX, versYG(v)]);
  fond += '<rect x="150" y="122" width="550" height="220" rx="4"/>';
  fond += '<rect x="190" y="122" width="140" height="50" rx="8"/><rect x="520" y="122" width="140" height="50" rx="8"/>';
  fond += '<rect x="320" y="110" width="210" height="12" stroke-width="1"/>';
  fond += '<rect x="330" y="88" width="190" height="22" stroke-width="3"/>';
  fond += '<rect x="220" y="104" width="80" height="18"/><rect x="550" y="104" width="80" height="18"/>';
  fond += '<path d="M425 88V56H470"/><path d="M260 104V60H210V72"/><path d="M590 104V56H640"/>';
  fond += '<path d="M196 72H224M201 78H219M206 84H214"/>';
  fond += '<rect x="640" y="48" width="44" height="16" rx="2"/><path d="M684 56H710V40"/>';
  fond += "</g>";
  fond += TRAITS + ' stroke-width="1" stroke-dasharray="2 4" opacity="0.7">' + seg([GX, versYG(3)], [GX + 40, versYG(3)]) + seg([GX, versYG(4.5)], [GX + 40, versYG(4.5)]) + "</g>";
  fond += TRAITS + ' stroke-width="1.5">' + seg([612, 62], [612, 98], ' marker-end="url(#' + idM + ')"') + seg([268, 26], [584, 26], ' marker-end="url(#' + idM + ')"') + "</g>";
  let ecr = texte(30, 84, "v_GS") + texte(14, GY0 + 4, "0 V") + texte(8, versYG(12) + 4, "12 V") + texte(GX + 44, versYG(3) + 4, "V_th = 3 V") + texte(GX + 44, versYG(4.5) - 2, "4,5 V");
  ecr += texte(476, 60, "G") + texte(266, 52, "S, référence") + texte(620, 84, "i_D") + texte(400, 20, "v_DS");
  ecr += texte(646, 80, "5 Ω") + texte(700, 34, "+40 V");
  ecr += texte(222, 152, "n+ source") + texte(556, 152, "n+ drain") + texte(390, 320, "caisson p") + texte(560, 104, "D", ' font-size="11"');
  ecr += texte(394, 104, "grille", ' font-size="11"');
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const zone = svgEl("rect", { x: 330, y: 122, width: 190, height: 0, fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "6 4", opacity: "0.8" });
  const canal = svgEl("rect", { x: 330, y: 122, width: 190, height: 0, fill: "currentColor", "fill-opacity": "0.45", stroke: "none" });
  const electrons = svgEl("g", { fill: "currentColor", stroke: "none" });
  const etiquette = svgEl("g");
  svg.append(groupeFond, zone, canal, electrons, etiquette);
  conteneur.appendChild(svg);

  const NB = 28;
  const points = [];
  for (let n = 0; n < NB; n += 1) {
    const c = svgEl("circle", { r: 2.6, cx: 330, cy: 126, opacity: 0 });
    electrons.appendChild(c);
    points.push({ el: c, x: 330 + (190 * n) / NB, y: Math.random() });
  }

  const valeurs = api.sim.valeurs("#d-canal-valeurs", [
    { id: "vgs", libelle: "v_GS", unite: "V", decimales: 2 },
    { id: "zone", libelle: "État", format: (x) => x },
    { id: "i", libelle: "i_D", unite: "A", decimales: 2 },
    { id: "vds", libelle: "v_DS", unite: "V", decimales: 2 },
    { id: "p", libelle: "Puissance dissipée v_DS i_D", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const etat = { vgs: 0, i: 0, epaisseur: 0, nombre: 0 };

  function regime(vgs) {
    if (vgs <= MOS.Vth) return { i: 0, nom: "bloqué : caisson déserté, pas de canal" };
    const Rch = (0.008 * (12 - MOS.Vth)) / (vgs - MOS.Vth);
    const iSat = MOS.k * (vgs - MOS.Vth) * (vgs - MOS.Vth);
    const iOhm = VE / (RL + Rch);
    if (iSat < iOhm) return { i: iSat, nom: "zone active : le canal limite le courant" };
    return { i: iOhm, nom: "zone ohmique : résistance R_DS(on)" };
  }

  function placer(vgs) {
    etat.vgs = vgs;
    const r = regime(vgs);
    etat.i = r.i;
    const profondeur = vgs <= MOS.Vth ? 40 * Math.sqrt(Math.max(0, vgs) / MOS.Vth) : 40;
    zone.setAttribute("height", profondeur.toFixed(1));
    const ep = vgs <= MOS.Vth ? 0 : 3 + 11 * Math.min(1, (vgs - MOS.Vth) / 6);
    etat.epaisseur = ep;
    canal.setAttribute("height", ep.toFixed(1));
    etat.nombre = vgs <= MOS.Vth ? 0 : Math.round(NB * Math.min(1, (vgs - MOS.Vth) / 5));
    points.forEach((p, n) => {
      p.el.setAttribute("opacity", n < etat.nombre ? "1" : "0");
      p.el.setAttribute("cy", (124 + p.y * Math.max(1, ep - 3)).toFixed(1));
      p.el.setAttribute("cx", p.x.toFixed(1));
    });
    const vds = VE - RL * r.i;
    etiquette.innerHTML = ECRITS + texte(150, 368, "état : " + r.nom) + "</g>";
    if (valeurs) valeurs.maj({ vgs, zone: r.nom, i: r.i, vds, p: vds * r.i });
  }

  /* Boucle des électrons : ne tourne que si le mouvement n'est pas réduit. */
  let image = 0;
  let dernier = 0;
  let visible = true;
  function boucle(instant) {
    image = requestAnimationFrame(boucle);
    if (!visible) {
      dernier = instant;
      return;
    }
    const dt = dernier ? Math.min(0.05, (instant - dernier) / 1000) : 0;
    dernier = instant;
    if (etat.nombre === 0 || etat.i <= 0) return;
    const vitesse = 12 + 14 * etat.i;
    points.forEach((p, n) => {
      if (n >= etat.nombre) return;
      p.x += vitesse * dt;
      if (p.x > 520) {
        p.x -= 190;
        p.y = Math.random();
        p.el.setAttribute("cy", (124 + p.y * Math.max(1, etat.epaisseur - 3)).toFixed(1));
      }
      p.el.setAttribute("cx", p.x.toFixed(1));
    });
  }
  if (!api.mouvementReduit && typeof requestAnimationFrame === "function") {
    image = requestAnimationFrame(boucle);
    let observateur = null;
    if (typeof IntersectionObserver === "function") {
      observateur = new IntersectionObserver((entrees) => {
        for (const entree of entrees) visible = entree.isIntersecting;
      });
      observateur.observe(svg);
    }
    nettoyeurs.push(() => {
      if (image) cancelAnimationFrame(image);
      image = 0;
      if (observateur) observateur.disconnect();
    });
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.5 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(placer, { idCurseur: "vgs" });
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: GX, y: GY0 },
    a: { x: GX, y: GY1 },
    min: 0,
    max: 12,
    pas: 0.1,
    valeur: 2,
    unite: "V",
    libelle: "Tension grille-source",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.curseurs = api.sim.curseurs(
    "#d-canal-curseurs",
    [{ id: "vgs", libelle: "Tension de grille v_GS", min: 0, max: 12, pas: 0.05, valeur: 2, unite: "V" }],
    (lues) => synchro.appliquer(lues.vgs, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.lecteur = api.sim.lecteur("#d-canal-lecteur", {
    de: 0,
    a: 12,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Montée de v_GS de 0 à 12 V",
    rappel: (v) => synchro.appliquer(v, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(2, null);
}

/* --------------------------------------------------------------------------
   E. Caractéristiques à l'état passant, classe 1200 V
   -------------------------------------------------------------------------- */

function construireCaracteristiques(racine, api) {
  const conteneur = racine.querySelector("#e-carac");
  if (!conteneur) return;
  const X0 = 80;
  const X1 = 700;
  const Y0 = 340;
  const Y1 = 40;
  const IMAX = 120;
  const VMAX = 4;
  const vx = (I) => X0 + ((X1 - X0) * I) / IMAX;
  const vy = (v) => Y0 - ((Y0 - Y1) * Math.min(v, VMAX * 1.02)) / VMAX;
  const reglages = { T: 125, D: 0.5 };
  const idM = nouveauMarqueur("fl-e-ca");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Chute de tension à l'état passant en fonction du courant pour un IGBT, un MOSFET SiC et un MOSFET Si de 1200 V",
  });
  let fond = "<defs>" + marqueur(idM) + "</defs>";
  fond += TRAITS + ' stroke-width="1" stroke-dasharray="2 4" opacity="0.45">';
  for (let I = 20; I <= IMAX; I += 20) fond += seg([vx(I), Y0], [vx(I), Y1]);
  for (let v = 0.5; v <= VMAX; v += 0.5) fond += seg([X0, vy(v)], [X1, vy(v)]);
  fond += "</g>";
  fond += TRAITS + ' stroke-width="1.4">' + seg([X0, Y0], [X1 + 16, Y0], ' marker-end="url(#' + idM + ')"') + seg([X0, Y0], [X0, Y1 - 16], ' marker-end="url(#' + idM + ')"') + "</g>";
  let ecr = "";
  for (let I = 0; I <= IMAX; I += 20) ecr += texte(vx(I) - 8, Y0 + 18, String(I));
  for (let v = 0; v <= VMAX; v += 1) ecr += texte(X0 - 26, vy(v) + 4, String(v));
  ecr += texte(X1 - 30, Y0 + 36, "courant (A)") + texte(X0 - 60, Y1 - 22, "chute de tension (V)");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const courbes = svgEl("g");
  const curseur = svgEl("g");
  svg.append(groupeFond, courbes, curseur);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-carac-valeurs", [
    { id: "I", libelle: "Courant I", unite: "A", decimales: 1 },
    { id: "vI", libelle: "Chute de l'IGBT", unite: "V", decimales: 3 },
    { id: "vS", libelle: "Chute du MOSFET SiC", unite: "V", decimales: 3 },
    { id: "vM", libelle: "Chute du MOSFET Si 1200 V", unite: "V", decimales: 2 },
    { id: "pI", libelle: "Pertes IGBT, D (V_CE0 I + r_CE I²)", unite: "W", decimales: 1 },
    { id: "pS", libelle: "Pertes MOSFET SiC, D R I²", unite: "W", decimales: 1 },
    { id: "pM", libelle: "Pertes MOSFET Si 1200 V", unite: "W", decimales: 1 },
    { id: "Ix", libelle: "Croisement IGBT et SiC", unite: "A", decimales: 1 },
    { id: "R", libelle: "R_DS(on) du SiC à cette température", unite: "mΩ", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessinerCourbes() {
    const T = reglages.T;
    const pI = [];
    const pS = [];
    const pM = [];
    const Rs = resistanceSic(T);
    const Rm = resistanceSi1200(T);
    for (let I = 0; I <= IMAX; I += 1) {
      pI.push([vx(I), vy(chuteIgbt(I, T).v)]);
      pS.push([vx(I), vy(Rs * I)]);
      const v = Rm * I;
      if (v <= VMAX * 1.02) pM.push([vx(I), vy(v)]);
    }
    const iFin = Math.min(IMAX, (VMAX * 1.02) / Rm);
    pM.push([vx(iFin), vy(Rm * iFin)]);
    let s = TRAITS + ' stroke-width="3"><polyline points="' + chaine(pI) + '"/></g>';
    s += TRAITS + ' stroke-width="2.2" stroke-dasharray="8 6"><polyline points="' + chaine(pS) + '"/></g>';
    s += TRAITS + ' stroke-width="2" stroke-dasharray="2 5"><polyline points="' + chaine(pM) + '"/></g>';
    const ig = chuteIgbt(0, T);
    const Ix = Rs > ig.r ? ig.V0 / (Rs - ig.r) : Infinity;
    if (Ix <= IMAX) {
      const x = vx(Ix);
      const y = vy(Rs * Ix);
      s += '<path d="M' + x.toFixed(1) + " " + (y - 7).toFixed(1) + "l7 7-7 7-7-7Z" + '" fill="currentColor"/>';
      s += ECRITS + texte(x + 10, y + 24, "croisement") + "</g>";
    }
    s += ECRITS + texte(vx(IMAX) - 40, vy(chuteIgbt(IMAX, T).v) + 18, "IGBT");
    s += texte(vx(70) - 30, vy(Rs * 70) + 20, "MOSFET SiC");
    s += texte(vx(iFin) + 8, vy(VMAX) + 14, "MOSFET Si 1200 V") + "</g>";
    s += ECRITS + texte(X1 - 120, Y1 + 4, "T_j = " + T + " °C") + "</g>";
    courbes.innerHTML = s;
    return Ix;
  }

  let Ix = Infinity;
  function placer(I) {
    const T = reglages.T;
    const ig = chuteIgbt(I, T);
    const Rs = resistanceSic(T);
    const Rm = resistanceSi1200(T);
    const x = vx(I);
    let s = TRAITS + ' stroke-width="1" stroke-dasharray="3 4">' + seg([x, Y0], [x, Y1]) + "</g>";
    s += '<g fill="currentColor" stroke="none">';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + vy(ig.v).toFixed(1) + '" r="4"/>';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + vy(Rs * I).toFixed(1) + '" r="4"/>';
    if (Rm * I <= VMAX) s += '<circle cx="' + x.toFixed(1) + '" cy="' + vy(Rm * I).toFixed(1) + '" r="4"/>';
    s += "</g>";
    curseur.innerHTML = s;
    const D = reglages.D;
    if (valeurs) {
      valeurs.maj({
        I,
        vI: ig.v,
        vS: Rs * I,
        vM: Rm * I,
        pI: D * (ig.V0 * I + ig.r * I * I),
        pS: D * Rs * I * I,
        pM: D * Rm * I * I,
        Ix: Number.isFinite(Ix) ? Ix : NaN,
        R: Rs * 1000,
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.3 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: Y0 },
    a: { x: X1, y: Y0 },
    min: 0,
    max: IMAX,
    pas: 0.5,
    valeur: 50,
    unite: "A",
    libelle: "Courant à l'état passant",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  const curseurs = api.sim.curseurs(
    "#e-carac-curseurs",
    [
      { id: "T", libelle: "Température de jonction T_j", min: 25, max: 150, pas: 5, valeur: 125, unite: "°C" },
      { id: "D", libelle: "Rapport cyclique D", min: 0.1, max: 1, pas: 0.05, valeur: 0.5 },
    ],
    (lues) => {
      reglages.T = lues.T;
      reglages.D = lues.D;
      Ix = dessinerCourbes();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  Ix = dessinerCourbes();
  synchro.appliquer(50, null);
}

/* --------------------------------------------------------------------------
   E. Chronogrammes de commutation avec pertes
   -------------------------------------------------------------------------- */

function construireChronogrammes(racine, api) {
  const conteneur = racine.querySelector("#e-chrono");
  if (!conteneur) return;
  const PX = [70, 430];
  const LARG = 300;
  const RG = { haut: 40, bas: 120 };
  const RV = { haut: 150, bas: 320 };
  const RP = { haut: 350, bas: 450 };
  const PISTE = 506;
  const reglages = { comp: 3, V: 540, I: 50, RG: 4, Ls: 0, f: 4 };
  let modele = null;
  let echelles = null;
  let chargement = false;
  const idM = nouveauMarqueur("fl-e-ch");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 540",
    role: "img",
    "aria-label": "Chronogrammes de mise en conduction et de blocage : tension de grille, tension, courant et puissance dissipée",
  });
  const cadre = svgEl("g");
  const traces = svgEl("g");
  const curseur = svgEl("g");
  svg.append(traces, cadre, curseur);
  conteneur.appendChild(svg);

  let fixe = "<defs>" + marqueur(idM) + "</defs>";
  fixe += TRAITS + ' stroke-width="1.2">';
  for (const x0 of PX) {
    fixe += seg([x0, RG.bas], [x0 + LARG, RG.bas]) + seg([x0, RV.bas], [x0 + LARG, RV.bas]) + seg([x0, RP.bas], [x0 + LARG, RP.bas]);
    fixe += seg([x0, RG.haut - 6], [x0, RG.bas]) + seg([x0, RV.haut - 6], [x0, RV.bas]) + seg([x0, RP.haut - 6], [x0, RP.bas]);
  }
  fixe += seg([PX[0], PISTE], [PX[1] + LARG, PISTE], ' stroke-width="1.6"');
  fixe += "</g>";
  fixe += ECRITS + texte(PX[0], 24, "mise en conduction") + texte(PX[1], 24, "blocage");
  fixe += texte(8, RG.haut + 8, "v_GS") + texte(8, RV.haut + 30, "v, i") + texte(8, RP.haut + 30, "p") + "</g>";
  cadre.innerHTML = fixe;

  const valeurs = api.sim.valeurs("#e-chrono-valeurs", [
    { id: "phase", libelle: "Phase", format: (x) => x },
    { id: "t", libelle: "Instant dans la fenêtre", unite: "ns", decimales: 1 },
    { id: "vgs", libelle: "v_GS", unite: "V", decimales: 2 },
    { id: "v", libelle: "v_DS", unite: "V", decimales: 1 },
    { id: "i", libelle: "i_D", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance instantanée", format: (x) => puissanceTexte(api, x) },
    { id: "e", libelle: "Énergie cumulée", format: (x) => energieTexte(api, x) },
    { id: "eon", libelle: "E_on", format: (x) => energieTexte(api, x) },
    { id: "eoff", libelle: "E_off", format: (x) => energieTexte(api, x) },
    { id: "pcom", libelle: "P_com = f (E_on + E_off)", unite: "W", decimales: 3 },
    { id: "dvdt", libelle: "dv/dt au blocage", unite: "kV/µs", decimales: 2 },
    { id: "didt", libelle: "di/dt au blocage", unite: "A/ns", decimales: 2 },
    { id: "surt", libelle: "Surtension L_σ di/dt", unite: "V", decimales: 1 },
    { id: "crete", libelle: "Tension crête sur tenue", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function versXY(panneau, t, fen) {
    return PX[panneau] + (LARG * t) / fen;
  }

  function recalculer() {
    const p = COMPOSANTS[reglages.comp - 1];
    modele = commutation(p, reglages.V, reglages.I, reglages.RG, reglages.Ls * 1e-9);
    const m = modele;
    const N = 500;
    const echV = Math.max(1 + m.surtension / reglages.V, 1 + m.Irr / reglages.I, 1) * 1.1;
    let pmax = 1e-9;
    const donnees = [[], []];
    const fen = [m.fenOn, m.fenOff];
    const fns = [m.on, m.off];
    for (let k = 0; k < 2; k += 1) {
      for (let n = 0; n <= N; n += 1) {
        const t = (fen[k] * n) / N;
        const e = fns[k](t);
        const pw = e.v * e.i + (e.poss || 0);
        if (pw > pmax) pmax = pw;
        donnees[k].push({ t, e, pw });
      }
    }
    pmax *= 1.1;
    echelles = { echV, pmax, fen };
    const yG = (v) => RG.bas - ((RG.bas - RG.haut) * (v - p.Vn)) / (p.Vp - p.Vn);
    const yV = (x) => RV.bas - ((RV.bas - RV.haut) * x) / echV;
    const yP = (w) => RP.bas - ((RP.bas - RP.haut) * w) / pmax;
    echelles.yG = yG;
    echelles.yV = yV;
    echelles.yP = yP;
    let s = "";
    for (let k = 0; k < 2; k += 1) {
      const x0 = PX[k];
      const g = [];
      const v = [];
      const i = [];
      const pw = [];
      for (const d of donnees[k]) {
        const x = versXY(k, d.t, fen[k]);
        g.push([x, yG(d.e.vgs)]);
        v.push([x, yV(d.e.v / reglages.V)]);
        i.push([x, yV(d.e.i / reglages.I)]);
        pw.push([x, yP(d.pw)]);
      }
      const aire = [[x0, RP.bas]].concat(pw, [[x0 + LARG, RP.bas]]);
      s += '<polygon points="' + chaine(aire) + '" fill="currentColor" fill-opacity="0.16" stroke="none"/>';
      s += TRAITS + ' stroke-width="1" stroke-dasharray="2 4" opacity="0.6">' + seg([x0, yV(1)], [x0 + LARG, yV(1)]) + seg([x0, yG(m.Vpl)], [x0 + LARG, yG(m.Vpl)]) + "</g>";
      s += TRAITS + ' stroke-width="2"><polyline points="' + chaine(g) + '"/></g>';
      s += TRAITS + ' stroke-width="3"><polyline points="' + chaine(v) + '"/></g>';
      s += TRAITS + ' stroke-width="2.2" stroke-dasharray="7 5"><polyline points="' + chaine(i) + '"/></g>';
      s += TRAITS + ' stroke-width="1.8"><polyline points="' + chaine(pw) + '"/></g>';
      const dureeNs = fen[k] * 1e9;
      s += ECRITS + texte(x0 - 4, RP.bas + 18, "0") + texte(x0 + LARG - 60, RP.bas + 18, nombre(api, dureeNs, dureeNs < 100 ? 1 : 0) + " ns") + "</g>";
    }
    s += ECRITS;
    s += texte(PX[0] + LARG - 70, yG(p.Vp) - 4, "V_GG+ = " + p.Vp + " V", ' font-size="10"');
    s += texte(PX[1] + LARG - 70, yG(p.Vn) - 4, "V_GG- = " + p.Vn + " V", ' font-size="10"');
    s += texte(PX[1] + LARG - 90, yG(m.Vpl) - 4, "V_pl = " + nombre(api, m.Vpl, 2) + " V", ' font-size="10"');
    s += texte(PX[0] + 4, yV(1) - 5, "V_DC et I_L", ' font-size="10"');
    s += texte(PX[1] + 4, RP.haut + 12, "crête " + puissanceTexte(api, pmax / 1.1), ' font-size="10"');
    s += texte(PX[0] + 4, RP.haut + 12, "E_on = " + energieTexte(api, m.Eon), ' font-size="10"');
    s += texte(PX[1] + 150, RP.haut + 12, "E_off = " + energieTexte(api, m.Eoff), ' font-size="10"');
    s += texte(PX[0], PISTE + 26, p.nom + " : " + reglages.V + " V, " + reglages.I + " A, R_G = " + nombre(api, reglages.RG, 1) + " Ω, L_σ = " + reglages.Ls + " nH", ' font-size="11"');
    s += "</g>";
    traces.innerHTML = s;
  }

  function lire(u) {
    const xs = PX[0] + 660 * u;
    if (xs <= PX[0] + LARG) return { k: 0, t: ((xs - PX[0]) / LARG) * echelles.fen[0], x: xs };
    if (xs < PX[1]) return { k: 0, t: echelles.fen[0], x: PX[0] + LARG };
    return { k: 1, t: ((xs - PX[1]) / LARG) * echelles.fen[1], x: xs };
  }

  function placer(u) {
    if (!modele) return;
    const m = modele;
    const l = lire(u);
    const e = l.k === 0 ? m.on(l.t) : m.off(l.t);
    const pw = e.v * e.i + (e.poss || 0);
    let s = TRAITS + ' stroke-width="1" stroke-dasharray="3 4">' + seg([l.x, RG.haut - 6], [l.x, RP.bas]) + "</g>";
    s += '<g fill="currentColor" stroke="none">';
    s += '<circle cx="' + l.x.toFixed(1) + '" cy="' + echelles.yG(e.vgs).toFixed(1) + '" r="3.5"/>';
    s += '<circle cx="' + l.x.toFixed(1) + '" cy="' + echelles.yV(e.v / reglages.V).toFixed(1) + '" r="4"/>';
    s += '<circle cx="' + l.x.toFixed(1) + '" cy="' + echelles.yV(e.i / reglages.I).toFixed(1) + '" r="3.5"/>';
    s += '<circle cx="' + l.x.toFixed(1) + '" cy="' + echelles.yP(pw).toFixed(1) + '" r="3.5"/>';
    s += "</g>";
    curseur.innerHTML = s;
    const p = COMPOSANTS[reglages.comp - 1];
    const crete = reglages.V + m.surtension;
    if (valeurs) {
      valeurs.maj({
        phase: (l.k === 0 ? "mise en conduction, " : "blocage, ") + e.phase,
        t: l.t * 1e9,
        vgs: e.vgs,
        v: e.v,
        i: e.i,
        p: pw,
        e: l.k === 0 ? m.energieOn(l.t) : m.energieOff(l.t),
        eon: m.Eon,
        eoff: m.Eoff,
        pcom: reglages.f * 1e3 * (m.Eon + m.Eoff),
        dvdt: m.dvdtOff / 1e9,
        didt: m.didtOff / 1e9,
        surt: m.surtension,
        crete: nombre(api, crete, 0) + " V sur " + p.Vmax + " V" + (crete > 0.8 * p.Vmax ? " : marge insuffisante" : ""),
      });
    }
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: PX[0], y: PISTE },
    a: { x: PX[1] + LARG, y: PISTE },
    min: 0,
    max: 1,
    pas: 0.002,
    valeur: 0.3,
    libelle: "Instant observé, mise en conduction puis blocage",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  let curseurs = null;
  curseurs = api.sim.curseurs(
    "#e-chrono-curseurs",
    [
      { id: "comp", libelle: "Composant : 1 MOSFET Si, 2 MOSFET SiC, 3 IGBT", min: 1, max: 3, pas: 1, valeur: 3, format: (x) => COMPOSANTS[Math.round(x) - 1].court },
      { id: "V", libelle: "Tension commutée V_DC", min: 10, max: 900, pas: 1, valeur: 540, unite: "V" },
      { id: "I", libelle: "Courant commuté I_L", min: 1, max: 100, pas: 1, valeur: 50, unite: "A" },
      { id: "RG", libelle: "Résistance de grille R_G", min: 1, max: 30, pas: 0.5, valeur: 4, unite: "Ω" },
      { id: "Ls", libelle: "Inductance parasite L_σ", min: 0, max: 100, pas: 1, valeur: 0, unite: "nH" },
      { id: "f", libelle: "Fréquence de découpage f", min: 1, max: 200, pas: 1, valeur: 4, unite: "kHz" },
    ],
    (lues, controle) => {
      if (chargement) return;
      const comp = Math.round(lues.comp);
      if (comp !== reglages.comp && controle) {
        const p = COMPOSANTS[comp - 1];
        reglages.comp = comp;
        chargement = true;
        controle.definir("V", p.V);
        controle.definir("I", p.I);
        controle.definir("RG", p.RG);
        controle.definir("f", p.f);
        chargement = false;
        Object.assign(reglages, { V: p.V, I: p.I, RG: p.RG, f: p.f, Ls: lues.Ls });
      } else {
        Object.assign(reglages, { comp, V: lues.V, I: lues.I, RG: lues.RG, Ls: lues.Ls, f: lues.f });
      }
      recalculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.lecteur = api.sim.lecteur("#e-chrono-lecteur", {
    de: 0,
    a: 1,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Parcours des deux commutations",
    rappel: (u) => synchro.appliquer(u, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  if (!modele) recalculer();
  synchro.appliquer(0.3, null);
}

/* --------------------------------------------------------------------------
   I. Pertes de l'onduleur en fonction de la fréquence
   -------------------------------------------------------------------------- */

function construirePertesOnduleur(racine, api) {
  if (!racine.querySelector("#i-pertes-trace")) return;
  const reglages = { I: 52.6, c: 0.86, m: 1, V: 540, f: 4 };
  const traceur = api.sim.traceur("#i-pertes-trace", {
    titre: "Pertes de l'onduleur de la pompe",
    xTitre: "fréquence de découpage",
    xUnite: "kHz",
    yTitre: "pertes",
    yUnite: "W",
    xMin: 1,
    xMax: 40,
    yMin: 0,
    yMax: 1300,
    ratio: 0.5,
    series: [
      { id: "igbt", nom: "IGBT et diodes, trait épais", couleur: "serie-1", epaisseur: 3, fonction: (f) => pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, f * 1e3).igbt },
      { id: "sic", nom: "MOSFET SiC, trait moyen", couleur: "serie-3", epaisseur: 2, fonction: (f) => pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, f * 1e3).sic },
      { id: "cond", nom: "conduction seule de la solution IGBT, trait fin", couleur: "serie-6", epaisseur: 1.2, fonction: (f) => pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, f * 1e3).igbtCond },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, reglages.f, "f = " + nombre(api, reglages.f, 1) + " kHz");
      const b = pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, reglages.f * 1e3);
      point(c, r, couleurs, reglages.f, b.igbt, null);
      point(c, r, couleurs, reglages.f, b.sic, null);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#i-pertes-valeurs", [
    { id: "pi", libelle: "Onduleur à IGBT", unite: "W", decimales: 1 },
    { id: "ps", libelle: "Onduleur SiC", unite: "W", decimales: 1 },
    { id: "rap", libelle: "Rapport IGBT sur SiC", decimales: 2 },
    { id: "tji", libelle: "T_j IGBT, dissipateur à 80 °C", unite: "°C", decimales: 1 },
    { id: "tjd", libelle: "T_j diode", unite: "°C", decimales: 1 },
    { id: "tjs", libelle: "T_j MOSFET SiC", unite: "°C", decimales: 1 },
    { id: "feg", libelle: "f où commutation = conduction, IGBT", unite: "kHz", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const b = pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, reglages.f * 1e3);
    const fin = pertesOnduleur(reglages.I, reglages.c, reglages.m, reglages.V, 40e3);
    if (traceur) {
      traceur.definirPlage({ yMin: 0, yMax: Math.max(100, Math.ceil((fin.igbt * 1.08) / 50) * 50) });
      traceur.rafraichir();
    }
    if (valeurs) {
      valeurs.maj({
        pi: b.igbt,
        ps: b.sic,
        rap: b.igbt / b.sic,
        tji: b.TjIgbt,
        tjd: b.TjDiode,
        tjs: b.TjSic,
        feg: b.fEgal / 1000,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-pertes-curseurs",
    [
      { id: "I", libelle: "Courant de phase efficace I", min: 5, max: 70, pas: 0.1, valeur: 52.6, unite: "A" },
      { id: "c", libelle: "Facteur de puissance cos φ", min: 0.3, max: 1, pas: 0.01, valeur: 0.86 },
      { id: "m", libelle: "Indice de modulation m", min: 0.1, max: 1, pas: 0.05, valeur: 1 },
      { id: "V", libelle: "Tension du bus V_DC", min: 450, max: 650, pas: 1, valeur: 540, unite: "V" },
      { id: "f", libelle: "Fréquence repérée f", min: 1, max: 40, pas: 0.5, valeur: 4, unite: "kHz" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinBrasMiller(idM) {
  let s = "<defs>" + marqueur(idM) + "</defs>";
  s += TRAITS + ' stroke-width="1.6">';
  s += '<path d="M120 30V70M120 130V170M120 230V270"/>';
  s += '<rect x="100" y="70" width="40" height="60" rx="4"/><rect x="100" y="170" width="40" height="60" rx="4"/>';
  s += '<path d="M120 150H220"/><path d="M100 200H60"/>';
  s += '<path d="M70 150V176M62 176H78M62 184H78M70 184V200" stroke-dasharray="4 3"/>';
  s += '<rect x="20" y="194" width="30" height="12" rx="2"/><path d="M20 200H8V250H120"/>';
  s += "</g>";
  s += TRAITS + ' stroke-width="1.5">' + seg([90, 160], [90, 192], ' marker-end="url(#' + idM + ')"') + seg([240, 230], [240, 160], ' marker-end="url(#' + idM + ')"') + "</g>";
  s += ECRITS + texte(150, 104, "T_haut se ferme") + texte(150, 204, "T_bas bloqué à 0 V") + texte(38, 168, "C_GD", ' font-size="11"');
  s += texte(4, 190, "R_G,off", ' font-size="11"') + texte(250, 200, "dv/dt") + texte(96, 186, "i", ' font-size="11"');
  s += texte(300, 60, "i = C_GD dv/dt") + texte(300, 82, "v_GE = R_G,off C_GD dv/dt") + texte(300, 104, "si v_GE > V_th : court-circuit") + texte(300, 126, "du bras par T_haut et T_bas") + "</g>";
  return s;
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";
  if (!racine.querySelector(cible)) return;

  /* 1. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-conduction-mos",
      titre: "Pertes de conduction d'un MOSFET à chaud",
      niveau: "fondamental",
      enonce:
        "<p>Un MOSFET de $R_{DS(on)} = 15\\ \\mathrm{m\\Omega}$ à $25\\ ^\\circ\\mathrm{C}$, dont la résistance est multipliée par $1{,}6$ à sa température de fonctionnement de " +
        "$110\\ ^\\circ\\mathrm{C}$, conduit un créneau de $20\\ \\mathrm{A}$ avec un rapport cyclique de $0{,}4$. Quelles sont ses pertes de conduction, en watts ?</p>",
      valeur: 0.015 * 1.6 * 400 * 0.4,
      unite: "W",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Pertes de conduction $P_{cond}$",
      etapes: [
        { texte: "Résistance à chaud : $R_{DS(on)} = 1{,}6 \\times 15 = 24\\ \\mathrm{m\\Omega}$." },
        { texte: "Courant efficace au carré : $I_{eff}^2 = DI^2 = 0{,}4 \\times 400 = 160\\ \\mathrm{A^2}$." },
        { texte: "$P_{cond} = R_{DS(on)}I_{eff}^2 = 0{,}024 \\times 160 = 3{,}84\\ \\mathrm{W}$.", note: "Avec la valeur à $25\\ ^\\circ\\mathrm{C}$, on aurait trouvé $2{,}40\\ \\mathrm{W}$, soit $37{,}5\\ \\%$ de moins." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant et puissance sur deux périodes",
          xTitre: "temps rapporté à la période", yTitre: "valeur", yUnite: "A ou W",
          xMin: 0, xMax: 2, yMin: 0, yMax: 24,
          series: [
            { id: "i", nom: "courant en A, trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => (x % 1 < 0.4 ? 20 : 0) },
            { id: "p", nom: "puissance en W, trait fin", couleur: "serie-5", epaisseur: 1.6, fonction: (x) => (x % 1 < 0.4 ? 9.6 : 0) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 3.84, "moyenne 3,84 W");
          },
        });
      },
    })
  );

  /* 2. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-commutation",
      titre: "Pertes de commutation par le modèle linéaire",
      niveau: "fondamental",
      enonce:
        "<p>Un interrupteur commute $20\\ \\mathrm{A}$ sous $400\\ \\mathrm{V}$ sur charge inductive. La mise en conduction dure $t_{ri} + t_{fv} = 50\\ \\mathrm{ns}$ et le " +
        "blocage $t_{rv} + t_{fi} = 80\\ \\mathrm{ns}$. Quelles sont ses pertes de commutation à $20\\ \\mathrm{kHz}$, en watts ?</p>",
      valeur: 0.5 * 400 * 20 * 130e-9 * 20e3,
      unite: "W",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Pertes de commutation $P_{com}$",
      etapes: [
        { texte: "Commutation dure : chaque intervalle coûte $\\frac{1}{2}V_{DC}I_L$ fois sa durée." },
        { texte: "$E_{on} = \\frac{1}{2} \\times 400 \\times 20 \\times 50 \\times 10^{-9} = 0{,}20\\ \\mathrm{mJ}$ ; $E_{off} = \\frac{1}{2} \\times 400 \\times 20 \\times 80 \\times 10^{-9} = 0{,}32\\ \\mathrm{mJ}$." },
        { texte: "$P_{com} = f(E_{on} + E_{off}) = 20\\,000 \\times 0{,}52 \\times 10^{-3} = 10{,}4\\ \\mathrm{W}$.", note: "Sur une charge résistive, tension et courant varieraient ensemble et l'énergie serait trois fois plus faible." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Puissance instantanée pendant les deux commutations",
          xTitre: "temps", xUnite: "ns", yTitre: "puissance", yUnite: "kW",
          xMin: 0, xMax: 260, yMin: 0, yMax: 9,
          series: [{
            id: "p", nom: "p(t), trait épais", couleur: "serie-1", epaisseur: 2.6,
            fonction: (t) => {
              if (t < 20) return 0;
              if (t < 45) return (8 * (t - 20)) / 25;
              if (t < 70) return 8 * (1 - (t - 45) / 25);
              if (t < 140) return 0;
              if (t < 180) return (8 * (t - 140)) / 40;
              if (t < 220) return 8 * (1 - (t - 180) / 40);
              return 0;
            },
          }],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 45, 8, "E_on = 0,20 mJ");
            point(c, r, couleurs, 180, 8, "E_off = 0,32 mJ");
          },
        });
      },
    })
  );

  /* 3. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-miller",
      titre: "Durée du plateau Miller et pente de tension",
      niveau: "intermédiaire",
      enonce:
        "<p>Un MOSFET est commandé par un pilote de $15\\ \\mathrm{V}$ à travers $R_G = 10\\ \\Omega$. Son plateau Miller est à $5\\ \\mathrm{V}$ et sa charge $Q_{GD}$ vaut " +
        "$25\\ \\mathrm{nC}$ sous $400\\ \\mathrm{V}$. Quelle est la pente moyenne de la tension drain-source à la mise en conduction, en $\\mathrm{kV/\\mu s}$ ?</p>",
      valeur: 16,
      unite: "kV/µs",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Pente $\\mathrm{d}v/\\mathrm{d}t$",
      etapes: [
        { texte: "Méthode : sur le plateau, $v_{GS}$ est constante, donc le courant de grille l'est aussi et décharge $C_{GD}$." },
        { texte: "$I_G = (V_{GG+} - V_{pl})/R_G = (15 - 5)/10 = 1\\ \\mathrm{A}$." },
        { texte: "$t_{fv} = Q_{GD}/I_G = 25\\ \\mathrm{ns}$." },
        { texte: "$\\mathrm{d}v/\\mathrm{d}t = 400/25 \\times 10^{-9} = 1{,}6 \\times 10^{10}\\ \\mathrm{V/s} = 16\\ \\mathrm{kV/\\mu s}$.", note: "Doubler $R_G$ diviserait la pente par deux et doublerait la part de $E_{on}$ due au plateau." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Chute de la tension sur le plateau",
          xTitre: "temps", xUnite: "ns", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 60, yMin: 0, yMax: 440,
          series: [
            { id: "v", nom: "v_DS, trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (t < 15 ? 400 : t < 40 ? 400 * (1 - (t - 15) / 25) : 0) },
            { id: "g", nom: "v_GS multipliée par 20, trait fin", couleur: "serie-3", epaisseur: 1.4, fonction: (t) => 20 * (t < 15 ? 5 * (t / 15) : t < 40 ? 5 : 5 + 10 * (1 - Math.exp(-(t - 40) / 8))) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 27.5, 200, "pente 16 kV/µs");
          },
        });
      },
    })
  );

  /* 4. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-croisement",
      titre: "Courant de croisement entre un MOSFET et un IGBT",
      niveau: "intermédiaire",
      enonce:
        "<p>Pour une même application, on hésite entre un MOSFET de $60\\ \\mathrm{m\\Omega}$ à chaud et un IGBT de $V_{CE0} = 1{,}0\\ \\mathrm{V}$, $r_{CE} = 15\\ \\mathrm{m\\Omega}$. " +
        "Au-delà de quel courant l'IGBT a-t-il la plus faible chute de tension, en ampères ?</p>",
      valeur: 1.0 / (0.06 - 0.015),
      unite: "A",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Courant de croisement $I_x$",
      etapes: [
        { texte: "Méthode : comparer les chutes de tension, pas les pertes moyennes, qui dépendent de la forme d'onde." },
        { texte: "Égalité : $R_{DS(on)}I_x = V_{CE0} + r_{CE}I_x$, soit $I_x = V_{CE0}/(R_{DS(on)} - r_{CE})$." },
        { texte: "$I_x = 1{,}0/(0{,}060 - 0{,}015) = 22{,}2\\ \\mathrm{A}$.", note: "À $10\\ \\mathrm{A}$, le MOSFET chute de $0{,}60\\ \\mathrm{V}$ contre $1{,}15\\ \\mathrm{V}$ pour l'IGBT : il est préférable." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Chutes de tension comparées",
          xTitre: "courant", xUnite: "A", yTitre: "chute", yUnite: "V",
          xMin: 0, xMax: 40, yMin: 0, yMax: 2.6,
          series: [
            { id: "m", nom: "MOSFET, trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (I) => 0.06 * I },
            { id: "g", nom: "IGBT, trait fin", couleur: "serie-5", epaisseur: 1.6, fonction: (I) => 1 + 0.015 * I },
          ],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 22.22, 1.333, "I_x = 22,2 A");
          },
        });
      },
    })
  );

  /* 5. Avancé */
  const kA = (540 / 600) * (Math.SQRT2 * 52.6 / Math.PI) / 100;
  const Emoy = 15.5e-3 * kA;
  const fmax = (90 - 30.02) / Emoy;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-fmax",
      titre: "Fréquence de découpage maximale d'un onduleur à IGBT",
      niveau: "avancé",
      enonce:
        "<p>Un onduleur alimente un moteur de $52{,}6\\ \\mathrm{A}$ efficaces sous un bus de $540\\ \\mathrm{V}$. Chaque IGBT a des pertes de conduction de $30{,}0\\ \\mathrm{W}$ " +
        "et des énergies $E_{on} + E_{off} = 15{,}5\\ \\mathrm{mJ}$ mesurées sous $600\\ \\mathrm{V}$ et $100\\ \\mathrm{A}$. Le dissipateur est à $80\\ ^\\circ\\mathrm{C}$, la résistance " +
        "thermique jonction-dissipateur vaut $0{,}50\\ \\mathrm{K/W}$ et la température de jonction de conception est de $125\\ ^\\circ\\mathrm{C}$. Quelle fréquence de découpage " +
        "maximale peut-on retenir, en kilohertz ?</p>",
      valeur: fmax / 1000,
      unite: "kHz",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Fréquence maximale $f_{max}$",
      etapes: [
        { texte: "Budget thermique : $P_{max} = (125 - 80)/0{,}50 = 90\\ \\mathrm{W}$ par IGBT ; il reste $90 - 30{,}0 = 60{,}0\\ \\mathrm{W}$ pour la commutation." },
        { texte: "Courant commuté moyen sur la période du fondamental : $\\hat I/\\pi = 74{,}4/\\pi = 23{,}7\\ \\mathrm{A}$." },
        { texte: "Énergie moyenne par période de découpage : $15{,}5 \\times \\frac{540}{600} \\times \\frac{23{,}7}{100} = 3{,}30\\ \\mathrm{mJ}$." },
        { texte: "$f_{max} = 60{,}0/3{,}30 \\times 10^{-3} = 18{,}2\\ \\mathrm{kHz}$.", note: "Avec la résistance thermique de $0{,}30\\ \\mathrm{K/W}$ de la section I, le budget serait de $150\\ \\mathrm{W}$ et la fréquence de $36\\ \\mathrm{kHz}$ ; la diode, sur sa propre résistance thermique, est à vérifier à part." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Pertes d'un IGBT en fonction de la fréquence",
          xTitre: "fréquence", xUnite: "kHz", yTitre: "pertes", yUnite: "W",
          xMin: 0, xMax: 30, yMin: 0, yMax: 140,
          series: [{ id: "p", nom: "conduction et commutation, trait épais", couleur: "serie-1", epaisseur: 2.6, fonction: (f) => 30.02 + Emoy * f * 1e3 }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 90, "budget 90 W");
            point(c, r, couleurs, fmax / 1000, 90, "18,2 kHz");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Déclenchements en court-circuit d'un variateur",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement d'une carte de commande, un variateur à IGBT déclenche sur défaut de court-circuit, surtout à chaud, à l'instant précis où l'IGBT du haut " +
        "d'un bras se ferme. La nouvelle carte bloque les IGBT à $0\\ \\mathrm{V}$ au lieu de $-8\\ \\mathrm{V}$, avec des fils de grille plus longs. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Le $\\mathrm{d}v/\\mathrm{d}t$ imposé à l'IGBT du bas injecte $C_{GD}\\,\\mathrm{d}v/\\mathrm{d}t$ dans sa grille et peut le rendre passant.", juste: true },
        { texte: "Rétablir une tension de blocage négative ou ajouter une pince de Miller supprime la cause.", juste: true },
        { texte: "Augmenter la résistance de mise en conduction de l'IGBT du haut réduit le risque, au prix de pertes plus fortes.", juste: true },
        { texte: "Allonger le temps mort suffit à supprimer le défaut." },
        { texte: "Le défaut prouve que la diode antiparallèle de l'IGBT du haut est coupée." },
      ],
      etapes: [
        { texte: "Le défaut coïncide avec la fermeture du complémentaire : c'est la signature d'une conduction parasite, pas d'un défaut de charge." },
        { texte: "Sans tension négative, la marge vaut $V_{th}$ entier ; des fils longs ajoutent de l'inductance et retardent l'action du pilote ; à chaud, $V_{th}$ baisse." },
        { texte: "Remèdes : $V_{GG-}$ négative, pince de Miller, câblage court et torsadé, ou pente réduite par $R_{G,on}$ du haut." },
        { texte: "Le temps mort sépare les ordres de commande ; il ne protège pas d'un amorçage provoqué par la pente de tension. La diode n'est pas en cause.", note: "Mesure de confirmation : $v_{GE}$ de l'IGBT du bas à la sonde différentielle pendant la fermeture de celui du haut." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 560 280", dessinBrasMiller(nouveauMarqueur("fl-k-mi")), "Chemin du courant de Miller dans la grille de l'IGBT bloqué.");
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi l'IGBT conduit mieux mais commute plus lentement",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un IGBT de $1200\\ \\mathrm{V}$ a une chute de tension à l'état passant bien plus faible qu'un MOSFET au silicium de même " +
        "tenue et de même surface, et pourquoi il commute pourtant plus lentement.</p>",
      motsCles: [["trou", "injection", "injecte", "bipolaire", "minoritaire"], ["modulation", "conductivite", "conducteur"], ["queue", "trainee", "stock", "recombin", "evacu"], ["lent", "vitesse", "frequence", "temps"]],
      minimum: 3,
      exemple: "Trois phrases : ce que fait la couche P+, ce que cela change à la zone de tenue, ce que cela coûte au blocage.",
      etapes: [
        { texte: "Dans un MOSFET, seule la zone N− épaisse et peu dopée porte le courant, par des électrons : sa résistance croît comme $V_{BR}^2$ à $V_{BR}^{2{,}5}$." },
        { texte: "Dans un IGBT, la couche P+ injecte des trous dans cette zone : électrons et trous en grand nombre la rendent très conductrice, c'est la modulation de conductivité." },
        { texte: "Au blocage, ces charges stockées doivent disparaître par recombinaison : le courant traîne en queue pendant que la tension est déjà à $V_{DC}$, d'où une énergie et une durée de blocage plus grandes.", note: "Le MOSFET SiC contourne le dilemme : son champ critique permet une zone de tenue mince et dopée sans injection." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QG_QUIZ =
  TRAITS + ' stroke-width="1.4"><path d="M50 190H500M50 190V20"/></g>' +
  TRAITS + ' stroke-width="3"><path d="M50 190L130 140L170 120H330L480 40"/></g>' +
  TRAITS + ' stroke-width="2" stroke-dasharray="7 5"><path d="M50 60H170L330 190H480"/></g>' +
  ECRITS + '<text x="56" y="18">v_GS (trait plein), v_DS (tirets)</text><text x="440" y="210">Q_G</text></g>';

const VISUELS_QUIZ = [
  etapes(["courant statique de grille nul", "mais charge Q_G à fournir à chaque période", "P_G = Q_G ΔV f"], "Commande en tension, pas sans énergie."),
  etapes(["IGBT : pas de chemin inverse utilisable", "diode antiparallèle dans le même boîtier", "MOSFET : canal ou diode interne"], "Conduction inverse."),
  etapes(["P = V_CE0 I_moy + r_CE I_eff²", "= 0,9 × 10 + 0,012 × 196", "= 9 + 2,35 = 11,35 W"], "Pertes de conduction d'un IGBT."),
  etapes(["v_GS constante = V_pl", "i_G décharge C_GD", "v_DS varie pendant ce temps"], "Le plateau Miller."),
  etapes(["P_G = Q_G (V_GG+ - V_GG-) f", "= 100 nC × 20 V × 20 kHz", "= 40 mW"], "Puissance de commande."),
  etapes(["R_G plus grande : rampes plus longues", "f plus grande : plus de commutations", "Q_rr : pic de courant sous pleine tension"], "Ce qui augmente les pertes de commutation."),
  () => ({ viewBox: "0 0 520 230", dessin: DESSIN_QG_QUIZ + TRAITS + ' stroke-width="1.4" stroke-dasharray="3 3"><rect x="170" y="100" width="160" height="96" rx="6"/></g>', legende: "Le plateau : v_GS constante pendant que v_DS chute." }),
  etapes(["mobilité des électrons en baisse à chaud", "R_DS(on) × 1,5 à 1,8 à 125 °C", "partage naturel du courant en parallèle"], "Coefficient positif."),
  etapes(["ΔV = L di/dt", "= 40 nH × 100 A / 50 ns", "= 80 V"], "Surtension au blocage."),
  etapes(["réseau 400 V : bus de 540 à 700 V", "tenue 1200 V, fréquence 4 à 8 kHz", "IGBT et diode antiparallèle"], "Choix pour un variateur industriel."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pourquoi dit-on qu'un MOSFET est commandé en tension ?</p>",
        options: [
          "Parce qu'il ne consomme aucune énergie de commande, même en commutation",
          "Parce que sa grille isolée n'absorbe aucun courant statique : il suffit de maintenir une tension, après avoir apporté la charge Q_G",
          "Parce que sa tension drain-source est imposée par la grille",
          "Parce qu'il se bloque dès que la tension de grille passe sous la tension de plateau",
        ],
        bonnes: [1],
        explication: "La grille est un condensateur : en régime établi, aucun courant ; à chaque commutation, il faut apporter puis retirer $Q_G$, d'où $P_G = Q_G\\Delta V_Gf$.",
        resume: "Commande en tension",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un IGBT seul peut conduire un courant inverse, de l'émetteur vers le collecteur, comme un MOSFET par sa diode interne.</p>",
        reponse: false,
        explication: "Sa couche P+ de collecteur forme avec la zone N− une jonction qui bloque en inverse : il faut une diode antiparallèle, logée dans le même boîtier.",
        resume: "Conduction inverse de l'IGBT",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un IGBT ($V_{CE0} = 0{,}9\\ \\mathrm{V}$, $r_{CE} = 12\\ \\mathrm{m\\Omega}$) porte un courant de valeur moyenne $10\\ \\mathrm{A}$ et de valeur efficace $14\\ \\mathrm{A}$. Pertes de conduction, en watts ?</p>",
        valeur: 0.9 * 10 + 0.012 * 196,
        unite: "W",
        tolerance: 0.01,
        explication: "$P = 0{,}9 \\times 10 + 0{,}012 \\times 14^2 = 9{,}00 + 2{,}35 = 11{,}35\\ \\mathrm{W}$.",
        resume: "Conduction d'un IGBT",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Que se passe-t-il pendant le plateau Miller de la courbe de charge de grille ?</p>",
        motsCles: [["constant", "plateau", "palier", "fixe"], ["c_gd", "cgd", "miller", "grille-drain", "grille drain"], ["v_ds", "vds", "tension drain", "tension"]],
        minimum: 2,
        explication: "La tension de grille reste constante à $V_{pl}$ : tout le courant de grille sert à charger ou décharger $C_{GD}$, pendant que $v_{DS}$ varie. Sa durée vaut $Q_{GD}/I_G$.",
        resume: "Plateau Miller",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un module demande $Q_G = 100\\ \\mathrm{nC}$ pour une excursion de $-5$ à $+15\\ \\mathrm{V}$ et commute à $20\\ \\mathrm{kHz}$. Puissance de commande, en milliwatts ?</p>",
        valeur: 40,
        unite: "mW",
        tolerance: 0.01,
        explication: "$P_G = 100 \\times 10^{-9} \\times 20 \\times 20 \\times 10^3 = 0{,}040\\ \\mathrm{W} = 40\\ \\mathrm{mW}$.",
        resume: "Puissance de commande",
      },
      {
        type: "qcm",
        enonce: repere(5) + "<p>Quels changements augmentent les pertes de commutation d'un interrupteur, toutes choses égales par ailleurs ?</p>",
        options: [
          { texte: "Augmenter la résistance de grille", juste: true },
          { texte: "Augmenter la fréquence de découpage", juste: true },
          { texte: "Associer une diode de roue libre à forte charge de recouvrement", juste: true },
          { texte: "Abaisser la tension du bus continu" },
        ],
        multiple: true,
        explication: "$R_G$ allonge les rampes, $f$ multiplie les commutations, $Q_{rr}$ ajoute un pic de courant sous pleine tension. Une tension plus basse réduit au contraire $\\frac{1}{2}VIt$.",
        resume: "Facteurs des pertes de commutation",
      },
      {
        type: "schema",
        enonce: repere(6) + "<p>Sur cette courbe de charge de grille, où la tension drain-source chute-t-elle ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 520 220",
        dessin: DESSIN_QG_QUIZ,
        zones: [
          { x: 50, y: 110, largeur: 110, hauteur: 80, etiquette: "montée jusqu'au seuil et au plateau" },
          { x: 172, y: 96, largeur: 156, hauteur: 94, etiquette: "plateau", juste: true },
          { x: 334, y: 30, largeur: 150, hauteur: 110, etiquette: "fin de charge" },
        ],
        explication: "Sur le plateau, $v_{GS}$ est constante et toute la charge apportée sert à $C_{GD}$ : c'est là que $v_{DS}$ chute de $V_{DC}$ à presque zéro.",
        resume: "Lecture de la courbe de charge",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>La résistance à l'état passant d'un MOSFET au silicium augmente avec la température, ce qui facilite la mise en parallèle.</p>",
        reponse: true,
        explication: "La mobilité diminue à chaud : $R_{DS(on)}$ augmente de $50$ à $80\\ \\%$ à $125\\ ^\\circ\\mathrm{C}$. La puce la plus chaude se décharge sur ses voisines.",
        resume: "Coefficient de température",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Au blocage, $100\\ \\mathrm{A}$ s'annulent en $50\\ \\mathrm{ns}$ dans une maille de $40\\ \\mathrm{nH}$. Surtension, en volts ?</p>",
        valeur: 80,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta V = L_\\sigma\\,\\mathrm{d}i/\\mathrm{d}t = 40 \\times 10^{-9} \\times 100/(50 \\times 10^{-9}) = 80\\ \\mathrm{V}$.",
        resume: "Surtension au blocage",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Pour l'onduleur d'un variateur de $50\\ \\mathrm{kW}$ raccordé au réseau $400\\ \\mathrm{V}$ et découpant à $4\\ \\mathrm{kHz}$, quel interrupteur est le choix standard ?</p>",
        options: ["Un MOSFET Si de 100 V", "Un IGBT de 1200 V avec diode antiparallèle", "Un MOSFET Si de 1200 V", "Un thyristor commuté par le réseau"],
        bonnes: [1],
        explication: "Bus de $540$ à $700\\ \\mathrm{V}$ : tenue de $1200\\ \\mathrm{V}$ ; à fréquence modérée, l'IGBT offre la meilleure chute pour ce coût. Un MOSFET Si de $1200\\ \\mathrm{V}$ serait trop résistif, un thyristor ne se bloque pas.",
        resume: "Choix pour un variateur",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  if (!racine.querySelector("#m-cartes")) return;
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Physique", question: "Comment un MOSFET à canal N devient-il passant ?", reponse: "Au-delà de $V_{th}$, le champ de grille attire assez d'électrons sous l'oxyde pour inverser la surface du caisson P : un canal N relie source et drain." },
      { categorie: "Physique", question: "Qu'apporte la couche P+ d'un IGBT, et que coûte-t-elle ?", reponse: "Elle injecte des trous dans la zone de tenue : modulation de conductivité, chute faible à haute tension. En échange : un seuil et un courant de queue au blocage." },
      { categorie: "Formule", question: "Pertes de conduction d'un MOSFET et d'un IGBT ?", reponse: "MOSFET : $R_{DS(on)}(T_j)\\,I_{eff}^2$. IGBT : $V_{CE0}I_{moy} + r_{CE}I_{eff}^2$." },
      { categorie: "Formule", question: "Courant de croisement entre un MOSFET et un IGBT ?", reponse: "$I_x = V_{CE0}/(R_{DS(on)} - r_{CE})$ : au-dessous, le MOSFET chute moins ; au-dessus, l'IGBT." },
      { categorie: "Commande", question: "Que se passe-t-il sur le plateau Miller ?", reponse: "$v_{GS}$ reste à $V_{pl}$ ; le courant de grille $I_G$ charge ou décharge $C_{GD}$ pendant que $v_{DS}$ varie, en $t = Q_{GD}/I_G$, avec $\\mathrm{d}v/\\mathrm{d}t = I_G/C_{GD}$." },
      { categorie: "Commande", question: "Puissance de commande d'un interrupteur à grille isolée ?", reponse: "$P_G = Q_G\\,(V_{GG+} - V_{GG-})\\,f$, indépendante de $R_G$, dissipée dans le pilote et les résistances de grille." },
      { categorie: "Commutation", question: "Pourquoi une commutation sur charge inductive est-elle dure ?", reponse: "Les lois de Kirchhoff imposent que le courant change sous pleine tension et que la tension change à plein courant : chaque intervalle coûte $\\frac{1}{2}V_{DC}I_L\\,t$." },
      { categorie: "Commande", question: "Pourquoi bloquer un IGBT ou un SiC sous tension négative ?", reponse: "Pour accélérer le blocage et surtout empêcher qu'un $\\mathrm{d}v/\\mathrm{d}t$ ne soulève la grille par $C_{GD}$ au-dessus de $V_{th}$, ce qui court-circuiterait le bras.", rappel: "Alternative : pince de Miller." },
      { categorie: "Câblage", question: "D'où vient la surtension au blocage ?", reponse: "De l'inductance parasite de la maille : $\\Delta V = L_\\sigma\\,\\mathrm{d}i/\\mathrm{d}t$. $50\\ \\mathrm{nH}$ et $5\\ \\mathrm{A/ns}$ font $250\\ \\mathrm{V}$." },
      { categorie: "Choix", question: "Quelle technologie pour quel domaine ?", reponse: "MOSFET Si jusqu'à $200\\ \\mathrm{V}$ environ et haute fréquence ; IGBT de $600$ à $6500\\ \\mathrm{V}$ à fréquence modérée ; MOSFET SiC de $650$ à $3300\\ \\mathrm{V}$ quand la fréquence ou le rendement priment." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["E = ½ V I (t_on + t_off)", "= 0,5 × 600 × 30 × 150 ns", "= 1,35 mJ"], "Énergie de commutation."),
  etapes(["courant statique nul", "mais Q_G apporté et retiré à chaque période", "P_G = Q_G ΔV f > 0"], "La commande consomme."),
  etapes(["48 V : tenue 100 V", "200 kHz : composant unipolaire rapide", "MOSFET Si"], "Choix pour un hacheur basse tension."),
  etapes(["V_d = 1,35 U cos α", "= 540,19 × cos 60°", "= 270,1 V"], "Pont triphasé commandé."),
  etapes(["la gâchette n'éteint pas un thyristor", "en continu, le courant ne s'annule jamais", "extinction forcée lourde, t_q trop long"], "Thyristor et découpage."),
  etapes(["U = U0 + (Un - U0) f / fn", "= 8 + 392 × 42,25 / 50", "= 339,2 V"], "Loi U/f compensée."),
  etapes(["X = 2π f L", "= 2π × 10 MHz × 50 nH", "= 3,14 Ω"], "Réactance d'un câblage."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un interrupteur commute $30\\ \\mathrm{A}$ sous $600\\ \\mathrm{V}$ ; les durées de transition cumulées de la mise en conduction et du blocage valent $150\\ \\mathrm{ns}$. Énergie totale par période, en millijoules, par le modèle linéaire ?</p>",
        valeur: 0.5 * 600 * 30 * 150e-9 * 1e3,
        unite: "mJ",
        tolerance: 0.01,
        explication: "$E = \\frac{1}{2} \\times 600 \\times 30 \\times 150 \\times 10^{-9} = 1{,}35\\ \\mathrm{mJ}$.",
        resume: "Énergie de commutation",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. La puissance de commande d'un MOSFET est nulle, puisque le courant de grille est nul en régime établi.</p>",
        reponse: false,
        explication: "À chaque période, la charge $Q_G$ est apportée puis retirée : $P_G = Q_G\\Delta V_Gf$, quelques dizaines de milliwatts à quelques watts.",
        resume: "Puissance de commande",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Quel interrupteur choisir pour un hacheur $48\\ \\mathrm{V}$, $20\\ \\mathrm{A}$, découpant à $200\\ \\mathrm{kHz}$ ?</p>",
        options: ["Un IGBT de 600 V", "Un MOSFET Si de 100 V", "Un MOSFET SiC de 1200 V", "Un thyristor rapide"],
        bonnes: [1],
        explication: "Tenue d'environ le double de $48\\ \\mathrm{V}$ ; à $200\\ \\mathrm{kHz}$, seul un composant unipolaire rapide convient, et le MOSFET Si de $100\\ \\mathrm{V}$ a quelques milliohms.",
        resume: "Choix basse tension",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Thyristors et redresseurs commandés. Pont triphasé tout thyristors idéal sur $400\\ \\mathrm{V}$, courant lissé, $\\alpha = 60^\\circ$. Tension moyenne, en volts ?</p>",
        valeur: (3 * Math.SQRT2 * 400 / Math.PI) * 0.5,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_d = 540{,}19\\cos 60^\\circ = 270{,}1\\ \\mathrm{V}$.",
        resume: "Pont triphasé commandé",
      },
      {
        type: "courte",
        enonce: repere(4) + "<p>Cours Thyristors et redresseurs commandés. Pourquoi un thyristor ne convient-il pas pour découper une tension continue à $10\\ \\mathrm{kHz}$ ?</p>",
        motsCles: [["bloqu", "eteind", "ouvr", "extinction"], ["courant", "annul", "zero"], ["gachette", "commande"], ["t_q", "tq", "desamorcage", "temps"]],
        minimum: 2,
        explication: "La gâchette ne sait qu'amorcer ; le thyristor ne se bloque que si son courant s'annule puis qu'une tension inverse dure $t_q$. En continu, rien n'annule le courant : il faudrait une extinction forcée à chaque période.",
        resume: "Thyristor et découpage",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Variation de vitesse des moteurs asynchrones. Loi $U/f$ linéaire compensée, $400\\ \\mathrm{V}$ à $50\\ \\mathrm{Hz}$ et $U_0 = 8\\ \\mathrm{V}$ à fréquence nulle. Tension à $42{,}25\\ \\mathrm{Hz}$, en volts ?</p>",
        valeur: 8 + (392 * 42.25) / 50,
        unite: "V",
        tolerance: 0.01,
        explication: "$U = 8 + (400 - 8) \\times 42{,}25/50 = 339{,}2\\ \\mathrm{V}$ : c'est la tension que l'onduleur de la pompe doit synthétiser au point de service.",
        resume: "Loi U/f",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Impédances en régime sinusoïdal. Réactance d'une connexion de $50\\ \\mathrm{nH}$ à $10\\ \\mathrm{MHz}$, ordre de grandeur des fronts de commutation d'un MOSFET, en ohms ?</p>",
        valeur: 2 * Math.PI * 10e6 * 50e-9,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$X = L\\omega = 2\\pi \\times 10^7 \\times 50 \\times 10^{-9} = 3{,}14\\ \\Omega$ : négligeable à $50\\ \\mathrm{Hz}$, elle ne l'est plus du tout pendant une commutation.",
        resume: "Réactance d'un câblage",
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
    titre: "Où en suis-je sur les MOSFET et les IGBT ?",
  });
  if (auto) ressources.push(auto);
}
