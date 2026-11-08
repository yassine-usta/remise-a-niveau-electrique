/* ==========================================================================
   cours/revision-7-et-mini-projet-alimentation/cours.js
   Révision du module des semi-conducteurs et mini-projet : alimentation
   24 V, 5 A à partir du réseau 230 V (transformateur, pont de Graetz,
   condensateur de bus, hacheur abaisseur).
   Le module n'utilise que l'objet api et le DOM de la racine du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

/* --------------------------------------------------------------------------
   Données du mini-projet (hypothèses de la section H)
   -------------------------------------------------------------------------- */

const PROJET = {
  E0: 32, // tension efficace du secondaire à vide, réseau nominal (V)
  Rs: 0.25, // résistance ramenée au secondaire (ohm)
  VF0: 0.8, // seuil d'une diode du pont (V)
  rF: 0.02, // résistance d'une diode du pont (ohm)
  Cb: 4.4e-3, // condensateur de bus (F)
  Pfer: 4, // pertes fer du transformateur (W)
  fr: 50, // fréquence du réseau (Hz)
  Vs: 24, // tension de sortie (V)
  Is: 5, // courant de sortie (A)
  fd: 100e3, // fréquence de découpage (Hz)
  L: 82e-6, // inductance du hacheur (H)
  Vmin: 28, // borne basse du bus (V)
};

/* Hacheur : composants de la classe 100 V et de la classe 150 V. */
const CLASSES = [
  { tenue: 100, Rds: 0.018, VF: 0.6, limite: 62.5 },
  { tenue: 150, Rds: 0.035, VF: 0.7, limite: 1e9 },
];
const HACHEUR = { tr: 40e-9, Qg: 30e-9, Vg: 10, Coss: 500e-12, RL: 0.03, Pnoyau: 0.3, Pcommande: 0.5 };

/**
 * Bus redressé alimentant une charge à puissance constante.
 * Intégration explicite de C dv/dt = i2 - P/v, pont idéalisé par V_F0 et r_F.
 * Renvoie la dernière période enregistrée (ou les deux dernières) et les grandeurs.
 */
function simulerBus(o = {}) {
  const E0 = o.E0 != null ? o.E0 : PROJET.E0;
  const k = o.k != null ? o.k : 1;
  const C = o.C != null ? o.C : PROJET.Cb;
  const P = o.P != null ? o.P : 123.4;
  const Rs = o.Rs != null ? o.Rs : PROJET.Rs;
  const dt = o.dt || 5e-6;
  const periodes = o.periodes || 20;
  const garder = o.garder || 1;
  const w = 2 * Math.PI * PROJET.fr;
  const T = 1 / PROJET.fr;
  const Em = E0 * k * Math.SQRT2;
  const R = Rs + 2 * PROJET.rF;
  const seuil = 2 * PROJET.VF0;
  let v = Math.max(1, Em - seuil);
  const n = Math.round((periodes * T) / dt);
  const debut = n - Math.round((garder * T) / dt);
  const t = [];
  const vb = [];
  const i2 = [];
  const ic = [];
  const er = [];
  let somme = { v: 0, i: 0, i2: 0, ic2: 0, pd: 0, cond: 0, nb: 0 };
  let vmax = -Infinity;
  let vmin = Infinity;
  let ipk = 0;
  for (let j = 0; j < n; j += 1) {
    const tj = j * dt;
    const s = Math.sin(w * tj);
    const e = Math.abs(Em * s);
    const i = Math.max(0, (e - seuil - v) / R);
    const ich = P / Math.max(v, 1);
    if (j >= debut) {
      t.push((j - debut) * dt);
      vb.push(v);
      i2.push(s >= 0 ? i : -i);
      ic.push(i - ich);
      er.push(e - seuil);
      somme.v += v;
      somme.i += i;
      somme.i2 += i * i;
      somme.ic2 += (i - ich) * (i - ich);
      somme.pd += 2 * (PROJET.VF0 * i + PROJET.rF * i * i);
      if (i > 0) somme.cond += 1;
      somme.nb += 1;
      if (v > vmax) vmax = v;
      if (v < vmin) vmin = v;
      if (i > ipk) ipk = i;
    }
    v += ((i - ich) / C) * dt;
    if (!Number.isFinite(v) || v < 0.5) v = 0.5;
  }
  const nb = Math.max(1, somme.nb);
  const i2eff = Math.sqrt(somme.i2 / nb);
  return {
    t,
    vb,
    i2,
    ic,
    er,
    vmax,
    vmin,
    vmoy: somme.v / nb,
    imoy: somme.i / nb,
    i2eff,
    iceff: Math.sqrt(somme.ic2 / nb),
    ipk,
    angle: (somme.cond / nb) * 180,
    pd: somme.pd / nb,
    pcu: Rs * i2eff * i2eff,
    S: E0 * k * i2eff,
  };
}

/** Pertes du hacheur abaisseur en conduction continue (formules de la section H). */
function pertesHacheur(Ve, Is, o = {}) {
  const classe = o.classe || CLASSES[0];
  const L = o.L || PROJET.L;
  const Vs = PROJET.Vs;
  const D = Math.min(0.95, Vs / Ve);
  const di = (Vs * (1 - D)) / (L * PROJET.fd);
  const i2 = Is * Is + (di * di) / 12;
  const pT = classe.Rds * D * i2;
  const pCom = 0.5 * Ve * Is * HACHEUR.tr * PROJET.fd;
  const pCoss = 0.5 * HACHEUR.Coss * Ve * Ve * PROJET.fd;
  const pG = HACHEUR.Qg * HACHEUR.Vg * PROJET.fd;
  const pD = classe.VF * Is * (1 - D);
  const pL = HACHEUR.RL * i2 + HACHEUR.Pnoyau;
  const total = pT + pCom + pCoss + pG + pD + pL + HACHEUR.Pcommande;
  return { D, di, pT, pCom, pCoss, pG, pD, pL, total };
}

/** Point de fonctionnement complet : boucle sur la puissance absorbée au bus. */
function regime(o = {}) {
  const Is = o.Is != null ? o.Is : PROJET.Is;
  const Ps = PROJET.Vs * Is;
  let P = Ps + 3.4;
  let bus = null;
  let hacheur = null;
  for (let boucle = 0; boucle < 3; boucle += 1) {
    bus = simulerBus({ ...o, P, dt: o.dt || 5e-6, periodes: o.periodes || 20 });
    hacheur = pertesHacheur(bus.vmoy, Is, o);
    P = Ps + hacheur.total;
  }
  const E0 = o.E0 != null ? o.E0 : PROJET.E0;
  const k = o.k != null ? o.k : 1;
  const Pac = P + bus.pd + bus.pcu + PROJET.Pfer;
  return {
    Ps,
    Pb: P,
    bus,
    hacheur,
    Pac,
    eta: Ps / Pac,
    lambda: Pac / (E0 * k * bus.i2eff),
    I1: (bus.i2eff * E0) / 230,
  };
}

/** Plus petite capacité nominale qui tient le creux au réseau bas avec -20 % de tolérance. */
function capaciteRequise(E0, P, Rs) {
  const essai = (C) =>
    simulerBus({ E0, k: 0.9, C: C * 0.8, P, Rs, dt: 1e-5, periodes: 10 }).vmin >= PROJET.Vmin;
  let bas = 2e-4;
  let haut = 0.1;
  if (!essai(haut)) return null;
  for (let j = 0; j < 17; j += 1) {
    const milieu = Math.sqrt(bas * haut);
    if (essai(milieu)) haut = milieu;
    else bas = milieu;
  }
  return haut;
}

/** Mise sous tension : précharge, contact à 80 ms, hacheur à 100 ms avec rampe de 10 ms. */
function simulerDemarrage(Rp, k, phiDeg, C = PROJET.Cb) {
  const w = 2 * Math.PI * PROJET.fr;
  const Em = PROJET.E0 * k * Math.SQRT2;
  const seuil = 2 * PROJET.VF0;
  const R0 = PROJET.Rs + 2 * PROJET.rF;
  const phi = (phiDeg * Math.PI) / 180;
  const dt = 5e-6;
  const fin = 0.15;
  const tK = 0.08;
  const tH = 0.1;
  const P = 123.4;
  let v = 0;
  let energie = 0;
  const t = [];
  const vb = [];
  const ir = [];
  const er = [];
  let picAvant = 0;
  let picApres = 0;
  const pas = 6;
  let j = 0;
  for (let tj = 0; tj < fin; tj += dt, j += 1) {
    const e = Math.abs(Em * Math.sin(w * tj + phi));
    const R = R0 + (tj < tK ? Rp : 0);
    const i = Math.max(0, (e - seuil - v) / R);
    const Pl = tj < tH ? 0 : P * Math.min(1, (tj - tH) / 0.01);
    const il = Pl > 0 ? Pl / Math.max(v, 20) : 0;
    if (tj < tK) {
      energie += Rp * i * i * dt;
      if (i > picAvant) picAvant = i;
    } else if (i > picApres) picApres = i;
    if (j % pas === 0) {
      t.push(tj * 1000);
      vb.push(v);
      ir.push(i);
      er.push(energie);
    }
    v += ((i - il) / C) * dt;
  }
  return { t, vb, ir, er, picAvant, picApres, energie };
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

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
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

function ligneV(c, repere, couleurs, x, libelle, motif, cote) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash(motif || [2, 4]);
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
    const aGauche = cote ? cote === "gauche" : px > repere.boite.x + repere.boite.l * 0.62;
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

/** Courbe en tirets tracée à la main, la série du traceur restant en trait plein. */
function courbeTirets(c, repere, couleur, xs, ys) {
  c.save();
  c.beginPath();
  c.rect(repere.boite.x, repere.boite.y, repere.boite.l, repere.boite.h);
  c.clip();
  c.setLineDash([6, 4]);
  c.strokeStyle = couleur;
  c.lineWidth = 1.6;
  c.beginPath();
  for (let j = 0; j < xs.length; j += 1) {
    const px = repere.versX(xs[j]);
    const py = repere.versY(ys[j]);
    if (j === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
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

function schemaEtapes(moteurApi, conteneur, lignes, legende) {
  const e = etapes(lignes, legende);
  schemaCorrection(moteurApi, conteneur, e.viewBox, e.dessin, legende);
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

/** Interpolation linéaire dans un tableau régulier. */
function interpoler(xs, ys, x) {
  if (!xs.length) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const pas = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  const j = Math.min(xs.length - 2, Math.floor((x - xs[0]) / pas));
  const f = (x - xs[j]) / (xs[j + 1] - xs[j] || 1);
  return ys[j] + f * (ys[j + 1] - ys[j]);
}

/** Paires [x, y] décimées pour le traceur. */
function paires(xs, ys, maximum = 900, echelle = 1) {
  const pas = Math.max(1, Math.floor(xs.length / maximum));
  const sortie = [];
  for (let j = 0; j < xs.length; j += pas) sortie.push([xs[j] * echelle, ys[j]]);
  return sortie;
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
  construirePeriode(racine, api);
  construireBus(racine, api);
  construireChoix(racine, api);
  construireDemarrage(racine, api);
  construireBilan(racine, api);
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
    ["#e-hyperbole-figure svg", 1.4],
    ["#e-fenetre-figure svg", 1.4],
    ["#e-precharge-schema svg", 1.4],
    ["#f-schema-principal svg", 1.8],
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
      id: "c-crete",
      titre: "Crête d'une tension sinusoïdale",
      niveau: "fondamental",
      enonce: "<p>Le secondaire d'un transformateur délivre $32\\ \\mathrm{V}$ efficaces à vide. Quelle est la valeur crête de cette tension, en volts ?</p>",
      valeur: 32 * Math.SQRT2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Tension crête",
      etapes: [
        { texte: "Pour une sinusoïde, $\\hat{E} = E_{eff}\\sqrt{2}$." },
        { texte: "$\\hat{E} = 32 \\times 1{,}4142 = 45{,}25\\ \\mathrm{V}$.", note: "Derrière le pont, deux seuils de diode en moins : environ $43{,}6\\ \\mathrm{V}$ à vide, c'est le plafond du bus au réseau nominal." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension du secondaire et tension redressée",
          xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 20, yMin: -50, yMax: 50,
          series: [
            { id: "e", nom: "e(t), sinusoïde de 32 V efficaces", couleur: "serie-1", epaisseur: 2, fonction: (t) => 45.25 * Math.sin((2 * Math.PI * t) / 20) },
            { id: "r", nom: "|e(t)|, après redressement idéal", couleur: "serie-3", epaisseur: 2.4, fonction: (t) => Math.abs(45.25 * Math.sin((2 * Math.PI * t) / 20)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 5, 45.25, "45,25 V crête");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-rapport",
      titre: "Rapport cyclique d'un hacheur abaisseur",
      niveau: "fondamental",
      enonce: "<p>Un hacheur abaisseur idéal en conduction continue produit $24\\ \\mathrm{V}$ à partir d'un bus de $40\\ \\mathrm{V}$. Quel est son rapport cyclique ?</p>",
      valeur: 0.6,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Rapport cyclique $D$",
      etapes: [
        { texte: "Conduction continue : $V_s = DV_e$, donc $D = V_s/V_e$." },
        { texte: "$D = 24/40 = 0{,}6$.", note: "Si le bus descend à $26{,}7\\ \\mathrm{V}$, $D$ atteint $0{,}9$ : c'est l'origine de la borne basse du bus." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Rapport cyclique en fonction de la tension du bus",
          xTitre: "tension du bus", xUnite: "V", yTitre: "rapport cyclique",
          xMin: 24, xMax: 50, yMin: 0.4, yMax: 1.02,
          series: [{ id: "d", nom: "D = 24 / V_e", couleur: "serie-1", epaisseur: 2.6, fonction: (v) => 24 / v }],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 40, 0.6, "40 V : D = 0,6");
            ligneH(c, r, couleurs, 0.9, "D max = 0,9");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-energie",
      titre: "Énergie stockée dans un condensateur",
      niveau: "fondamental",
      enonce: "<p>Quelle énergie un condensateur de $4{,}4\\ \\mathrm{mF}$ stocke-t-il sous $40\\ \\mathrm{V}$, en joules ?</p>",
      valeur: 0.5 * 4.4e-3 * 1600,
      unite: "J",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Énergie $W$",
      etapes: [
        { texte: "$W = \\frac{1}{2}CV^2$." },
        { texte: "$W = 0{,}5 \\times 4{,}4 \\times 10^{-3} \\times 40^2 = 3{,}52\\ \\mathrm{J}$.", note: "Seule la part au-dessus de la borne basse est utilisable : à $28\\ \\mathrm{V}$, il reste $1{,}72\\ \\mathrm{J}$, donc $1{,}80\\ \\mathrm{J}$ seulement sont disponibles." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaEtapes(moteurApi, conteneur, ["W = ½ C V²", "= 0,5 × 4,4 mF × (40 V)²", "= 3,52 J", "utilisable jusqu'à 28 V : 3,52 - 1,72 = 1,80 J"], "Énergie stockée et énergie utilisable.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Une période réseau animée
   -------------------------------------------------------------------------- */

function diodeHaut(x, yc) {
  return (
    '<path d="M' + (x - 10) + " " + (yc + 9) + "H" + (x + 10) + "L" + x + " " + (yc - 9) + 'Z"/>' +
    '<path d="M' + (x - 10) + " " + (yc - 9) + "H" + (x + 10) + '" stroke-width="2.6"/>'
  );
}

function construirePeriode(racine, api) {
  const conteneur = racine.querySelector("#d-periode");
  if (!conteneur) return;

  const donnees = simulerBus({ k: 1, C: PROJET.Cb, P: 123.4, dt: 1e-5, periodes: 20 });
  const tms = donnees.t.map((t) => t * 1000);

  const X0 = 80;
  const X1 = 720;
  const xT = (t) => X0 + ((X1 - X0) * t) / 20;
  const yV = (v) => 335 - ((v - 24) / (46 - 24)) * 80;
  const yI = (i) => 382 - (i / 20) * 34;

  const svg = svgEl("svg", { viewBox: "0 0 760 440", role: "img", "aria-label": "Une période réseau : diodes en conduction, courant du condensateur et chronogrammes" });

  const fixe =
    '<defs><marker id="fl-per" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs>' +
    TRAITS + ' stroke-width="2">' +
    '<circle cx="90" cy="140" r="24"/><path d="M78 140c4-9 8-9 12 0s8 9 12 0" stroke-width="1.6"/>' +
    '<path d="M90 116V90H160V140H220"/>' +
    '<path d="M90 164V190H214a6 6 0 0 1 12 0H260V140H300"/>' +
    '<path d="M220 50V86M220 104V161M220 179V230"/>' +
    '<path d="M300 50V86M300 104V176M300 194V230"/>' +
    '<path d="M220 50H520V90M220 230H520V190"/>' +
    '<path d="M400 50V135M400 145V230"/><path d="M380 135H420M380 145H420" stroke-width="3"/>' +
    '<rect x="470" y="90" width="100" height="100" rx="8"/>' +
    '<path d="M570 110H665V118M570 170H665V162"/><rect x="655" y="118" width="20" height="44" rx="3"/>' +
    "</g>" +
    '<g fill="currentColor" stroke="none"><circle cx="220" cy="140" r="3.4"/><circle cx="300" cy="140" r="3.4"/><circle cx="300" cy="50" r="3.4"/><circle cx="300" cy="230" r="3.4"/><circle cx="400" cy="50" r="3.4"/><circle cx="400" cy="230" r="3.4"/><circle cx="100" cy="106" r="2.6"/></g>' +
    ECRITS +
    '<text x="34" y="146">e(t)</text><text x="106" y="112" font-size="11">+</text>' +
    '<text x="200" y="154" font-size="11">A</text><text x="308" y="154" font-size="11">B</text>' +
    '<text x="232" y="100">D1</text><text x="232" y="175">D2</text><text x="312" y="100">D3</text><text x="312" y="190">D4</text>' +
    '<text x="376" y="122" font-size="11">+</text><text x="350" y="176">C_b</text>' +
    '<text x="484" y="134">hacheur</text><text x="484" y="152">abaisseur</text>' +
    '<text x="684" y="136" font-size="11">charge</text><text x="684" y="150" font-size="11">24 V</text>' +
    '<text x="236" y="248" font-size="11">0 V du bus, référence</text><text x="236" y="40" font-size="11">+ bus</text>' +
    "</g>" +
    TRAITS + ' stroke-width="1.2" opacity="0.7">' +
    '<path d="M' + X0 + " 255V415M" + X0 + " 382H" + X1 + '"/>' +
    '<path d="M' + X0 + " " + yV(28) + "H" + X1 + '" stroke-dasharray="3 5"/>' +
    "</g>" +
    ECRITS.replace('font-size="12"', 'font-size="11"') +
    '<text x="8" y="' + (yV(40) + 4) + '">40 V</text><text x="8" y="' + (yV(28) + 4) + '">28 V</text>' +
    '<text x="8" y="' + (yI(16) + 4) + '">+16 A</text><text x="8" y="' + (yI(-16) + 4) + '">-16 A</text>' +
    '<text x="' + (X1 - 30) + '" y="400">20 ms</text><text x="' + (X0 + 4) + '" y="400">0</text>' +
    "</g>";

  const groupeFixe = svgEl("g");
  groupeFixe.innerHTML = fixe;
  svg.appendChild(groupeFixe);

  /* Chronogrammes fixes. */
  const chemin = (xs, ys, fx, fy) => xs.map((x, j) => (j ? "L" : "M") + fx(x).toFixed(1) + " " + fy(ys[j]).toFixed(1)).join("");
  const pas = 4;
  const ts = tms.filter((_, j) => j % pas === 0);
  const pris = (tab) => tab.filter((_, j) => j % pas === 0);
  const chrono = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  chrono.appendChild(svgEl("path", { d: chemin(ts, pris(donnees.er).map((v) => Math.max(24, v)), xT, yV), "stroke-width": "1.4", "stroke-dasharray": "6 4" }));
  chrono.appendChild(svgEl("path", { d: chemin(ts, pris(donnees.vb), xT, yV), "stroke-width": "2.8" }));
  chrono.appendChild(svgEl("path", { d: chemin(ts, pris(donnees.i2), xT, yI), "stroke-width": "1.4" }));
  svg.appendChild(chrono);

  /* Éléments animés. */
  const maillePos =
    "M90 116V90H160V140H220V50H400M400 230H300V140H260V190H226a6 6 0 0 0 -12 0H90V164";
  const mailleNeg =
    "M90 164V190H214a6 6 0 0 1 12 0H260V140H300V50H400M400 230H220V140H160V90H90V116";
  const mailleHacheur = "M400 50H520V90M520 190V230H400M400 50V135M400 145V230";
  const traitPos = svgEl("path", { d: maillePos, fill: "none", "stroke-width": "5", "stroke-linecap": "round", "stroke-linejoin": "round", style: "stroke: var(--serie-2)", opacity: "0" });
  const traitNeg = svgEl("path", { d: mailleNeg, fill: "none", "stroke-width": "5", "stroke-linecap": "round", "stroke-linejoin": "round", style: "stroke: var(--serie-2)", opacity: "0" });
  const traitHacheur = svgEl("path", { d: mailleHacheur, fill: "none", "stroke-width": "4", "stroke-linecap": "round", "stroke-linejoin": "round", style: "stroke: var(--serie-1)", opacity: "0.8" });
  svg.insertBefore(traitHacheur, groupeFixe);
  svg.insertBefore(traitPos, groupeFixe);
  svg.insertBefore(traitNeg, groupeFixe);

  const diodes = {};
  const positions = { D1: [220, 95], D2: [220, 170], D3: [300, 95], D4: [300, 185] };
  for (const [nom, [x, y]] of Object.entries(positions)) {
    const g = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" });
    g.innerHTML = diodeHaut(x, y);
    svg.appendChild(g);
    diodes[nom] = g;
  }

  const flecheC = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "marker-end": "url(#fl-per)", d: "M436 110V160" });
  const texteC = svgEl("text", { x: "404", y: "212", fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "2 3", d: "" });
  const pointV = svgEl("circle", { r: "5", fill: "currentColor" });
  const pointI = svgEl("circle", { r: "4", fill: "currentColor" });
  const etat = svgEl("text", { x: "560", y: "212", fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(flecheC, texteC, curseurT, pointV, pointI, etat);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-periode-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "e", libelle: "|e| - 2 V_F0", unite: "V", decimales: 1 },
    { id: "vb", libelle: "Bus v_b", unite: "V", decimales: 2 },
    { id: "i2", libelle: "Secondaire i_2", unite: "A", decimales: 2 },
    { id: "ic", libelle: "Condensateur i_C", unite: "A", decimales: 2 },
    { id: "diodes", libelle: "Diodes passantes", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const synchro = { verrou: false, poignee: null, lecteur: null };

  function dessiner(t) {
    const vb = interpoler(tms, donnees.vb, t);
    const i2 = interpoler(tms, donnees.i2, t);
    const ic = interpoler(tms, donnees.ic, t);
    const er = interpoler(tms, donnees.er, t);
    const conduit = Math.abs(i2) > 0.05;
    const positif = i2 > 0;
    traitPos.setAttribute("opacity", conduit && positif ? "1" : "0");
    traitNeg.setAttribute("opacity", conduit && !positif ? "1" : "0");
    const passantes = conduit ? (positif ? ["D1", "D4"] : ["D3", "D2"]) : [];
    for (const [nom, g] of Object.entries(diodes)) {
      const actif = passantes.includes(nom);
      g.setAttribute("fill", actif ? "currentColor" : "none");
      g.setAttribute("stroke-width", actif ? "3" : "2");
    }
    const enCharge = ic > 0;
    flecheC.setAttribute("d", enCharge ? "M436 100V160" : "M436 160V100");
    texteC.textContent = enCharge ? "i_C : charge" : "i_C : décharge";
    const x = xT(t);
    curseurT.setAttribute("d", "M" + x.toFixed(1) + " 255V415");
    pointV.setAttribute("cx", x.toFixed(1));
    pointV.setAttribute("cy", yV(vb).toFixed(1));
    pointI.setAttribute("cx", x.toFixed(1));
    pointI.setAttribute("cy", yI(i2).toFixed(1));
    etat.textContent = conduit ? "pont passant : " + passantes.join(" et ") : "pont bloqué";
    if (valeurs) {
      valeurs.maj({ t, e: Math.max(0, er), vb, i2, ic, diodes: passantes.length ? passantes.join(", ") : "aucune" });
    }
  }

  function appliquer(t, source) {
    if (synchro.verrou) return;
    synchro.verrou = true;
    dessiner(t);
    if (source !== "poignee" && synchro.poignee) synchro.poignee.set(t, false);
    if (source !== "lecteur" && synchro.lecteur) synchro.lecteur.suivre(t);
    synchro.verrou = false;
  }

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: 430 },
    a: { x: X1, y: 430 },
    min: 0,
    max: 20,
    pas: 0.1,
    valeur: 4,
    unite: "ms",
    libelle: "Instant dans la période réseau",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#d-periode-lecteur", {
    de: 0,
    a: 20,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période réseau",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  appliquer(4, null);
  ressources.push(api.dessiner([groupeFixe, chrono], { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Simulation du bus sur deux périodes
   -------------------------------------------------------------------------- */

function construireBus(racine, api) {
  if (!racine.querySelector("#e-bus-tension")) return;
  let dernier = null;

  const traceV = api.sim.traceur("#e-bus-tension", {
    titre: "Tension du bus",
    xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
    xMin: 0, xMax: 40, yMin: 20, yMax: 52,
    ratio: 0.4,
    series: [{ id: "vb", nom: "v_b(t), tension du bus", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere: r, couleurs }) {
      if (!dernier) return;
      courbeTirets(c, r, couleurs.texte, dernier.tms, dernier.er);
      ligneH(c, r, couleurs, PROJET.Vmin, "borne basse 28 V");
    },
    note: "En tirets fins : tension redressée moins deux seuils de diode. Les diodes conduisent quand elle dépasse la tension du bus.",
  });
  if (traceV) ressources.push(traceV);

  const traceI = api.sim.traceur("#e-bus-courant", {
    titre: "Courant du secondaire et courant du condensateur",
    xTitre: "temps", xUnite: "ms", yTitre: "courant", yUnite: "A",
    xMin: 0, xMax: 40, yMin: -25, yMax: 25,
    ratio: 0.4,
    series: [
      { id: "i2", nom: "i_2(t), courant du secondaire", couleur: "serie-2", epaisseur: 2.2 },
      { id: "ic", nom: "i_C(t), courant du condensateur", couleur: "serie-3", epaisseur: 1.6 },
    ],
  });
  if (traceI) ressources.push(traceI);

  const valeurs = api.sim.valeurs("#e-bus-valeurs", [
    { id: "vmax", libelle: "Crête du bus", unite: "V", decimales: 2 },
    { id: "vmin", libelle: "Creux du bus", unite: "V", decimales: 2 },
    { id: "dv", libelle: "Ondulation", unite: "V", decimales: 2 },
    { id: "angle", libelle: "Conduction par alternance", unite: "°", decimales: 1 },
    { id: "ipk", libelle: "Pointe de courant", unite: "A", decimales: 1 },
    { id: "i2eff", libelle: "I_2 efficace", unite: "A", decimales: 2 },
    { id: "iceff", libelle: "I_C efficace", unite: "A", decimales: 2 },
    { id: "lambda", libelle: "Facteur de puissance", decimales: 3 },
    { id: "dmax", libelle: "D au creux", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#e-bus-curseurs",
    [
      { id: "k", libelle: "Tension du réseau", min: 90, max: 110, pas: 1, valeur: 100, unite: "%" },
      { id: "c", libelle: "Capacité du bus C_b", min: 1, max: 10, pas: 0.1, valeur: 4.4, unite: "mF" },
      { id: "p", libelle: "Puissance absorbée P_b", min: 20, max: 160, pas: 1, valeur: 123, unite: "W" },
      { id: "rs", libelle: "Résistance de source R_s", min: 0.05, max: 0.5, pas: 0.01, valeur: 0.25, unite: "Ω" },
    ],
    (v) => {
      const s = simulerBus({ k: v.k / 100, C: v.c * 1e-3, P: v.p, Rs: v.rs, dt: 4e-6, periodes: 24, garder: 2 });
      const tms = s.t.map((t) => t * 1000);
      dernier = { tms: tms.filter((_, j) => j % 8 === 0), er: s.er.filter((_, j) => j % 8 === 0) };
      if (traceV) {
        traceV.definirPlage({ yMin: 20, yMax: Math.max(52, s.vmax + 4) });
        traceV.definirDonnees("vb", paires(tms, s.vb));
      }
      if (traceI) {
        const borne = Math.max(10, Math.ceil(s.ipk / 5) * 5 + 5);
        traceI.definirPlage({ yMin: -borne, yMax: borne });
        traceI.definirDonnees("i2", paires(tms, s.i2));
        traceI.definirDonnees("ic", paires(tms, s.ic));
      }
      const Pac = v.p + s.pd + s.pcu + PROJET.Pfer;
      if (valeurs) {
        valeurs.maj({
          vmax: s.vmax,
          vmin: s.vmin,
          dv: s.vmax - s.vmin,
          angle: s.angle,
          ipk: s.ipk,
          i2eff: s.i2eff,
          iceff: s.iceff,
          lambda: Pac / (PROJET.E0 * (v.k / 100) * s.i2eff),
          dmax: PROJET.Vs / s.vmin,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   E. Choix de la tension du bus
   -------------------------------------------------------------------------- */

function evaluerSecondaire(E0, Ps) {
  const Rs = PROJET.Rs * Math.pow(E0 / PROJET.E0, 2);
  const VeMax = E0 * 1.1 * Math.SQRT2 - 2 * PROJET.VF0;
  const classe = VeMax <= CLASSES[0].limite ? CLASSES[0] : CLASSES[1];
  const Dmin = PROJET.Vs / VeMax;
  const L = (PROJET.Vs * (1 - Dmin)) / (1.5 * PROJET.fd);
  const Is = Ps / PROJET.Vs;
  const C = capaciteRequise(E0, Ps + 3.5, Rs);
  if (!C) return { E0, possible: false, VeMax, classe, L };
  let P = Ps + 3.5;
  let bus = null;
  let hach = null;
  for (let j = 0; j < 3; j += 1) {
    bus = simulerBus({ E0, k: 1, C, P, Rs, dt: 1e-5, periodes: 10 });
    hach = pertesHacheur(bus.vmoy, Is, { classe, L });
    P = Ps + hach.total;
  }
  const Pac = P + bus.pd + bus.pcu + PROJET.Pfer;
  let C20 = (2 * P * 0.02) / Math.max(1, bus.vmin * bus.vmin - PROJET.Vmin * PROJET.Vmin);
  for (let j = 0; j < 2; j += 1) {
    const b = simulerBus({ E0, k: 1, C: C20, P, Rs, dt: 1e-5, periodes: 10 });
    C20 = (2 * P * 0.02) / Math.max(1, b.vmin * b.vmin - PROJET.Vmin * PROJET.Vmin);
  }
  const busBas = simulerBus({ E0, k: 0.9, C: C * 0.8, P, Rs, dt: 1e-5, periodes: 10 });
  return {
    E0,
    possible: true,
    C,
    C20,
    L,
    classe,
    VeMax,
    Dmin,
    Dmax: PROJET.Vs / busBas.vmin,
    pont: bus.pd,
    cuivre: bus.pcu,
    hacheur: hach.total,
    total: Pac - Ps,
    eta: Ps / Pac,
  };
}

function construireChoix(racine, api) {
  if (!racine.querySelector("#e-choix-trace")) return;
  let balayage = [];
  let choisi = null;
  let minuterie = 0;

  const trace = api.sim.traceur("#e-choix-trace", {
    titre: "Pertes de la chaîne selon la tension du secondaire",
    xTitre: "tension efficace du secondaire à vide", xUnite: "V", yTitre: "pertes", yUnite: "W",
    xMin: 27, xMax: 60, yMin: 0, yMax: 30,
    ratio: 0.46,
    series: [
      { id: "pont", nom: "pont de diodes", couleur: "serie-2", epaisseur: 2 },
      { id: "cuivre", nom: "cuivre du transformateur", couleur: "serie-3", epaisseur: 2 },
      { id: "hacheur", nom: "hacheur", couleur: "serie-4", epaisseur: 2 },
      { id: "total", nom: "total, pertes fer comprises", couleur: "serie-1", epaisseur: 3 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      if (!choisi) return;
      ligneV(c, r, couleurs, choisi.E0, choisi.possible ? "E_0 = " + nb(api, choisi.E0, 1) + " V" : "irréalisable", [6, 4]);
      if (choisi.possible) point(c, r, couleurs, choisi.E0, choisi.total, null);
    },
    note: "À gauche de la première valeur tracée, aucune capacité raisonnable ne maintient le creux au-dessus de 28 V au réseau bas.",
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-choix-valeurs", [
    { id: "C", libelle: "C_b requise", unite: "mF", decimales: 2 },
    { id: "C20", libelle: "C_b pour 20 ms", unite: "mF", decimales: 2 },
    { id: "L", libelle: "L requise", unite: "µH", decimales: 0 },
    { id: "VeMax", libelle: "Bus à vide, réseau haut", unite: "V", decimales: 1 },
    { id: "classe", libelle: "Tenue des semi-conducteurs", unite: "V", decimales: 0 },
    { id: "D", libelle: "Plage de D", format: (v) => v },
    { id: "eta", libelle: "Rendement global", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficherPoint(E0, Ps) {
    choisi = evaluerSecondaire(E0, Ps);
    if (valeurs) {
      if (choisi.possible) {
        valeurs.maj({
          C: choisi.C * 1000,
          C20: choisi.C20 * 1000,
          L: choisi.L * 1e6,
          VeMax: choisi.VeMax,
          classe: choisi.classe.tenue,
          D: nb(api, choisi.Dmin, 2) + " à " + nb(api, choisi.Dmax, 2),
          eta: choisi.eta * 100,
        });
      } else {
        valeurs.maj({ C: NaN, C20: NaN, L: choisi.L * 1e6, VeMax: choisi.VeMax, classe: choisi.classe.tenue, D: "irréalisable", eta: NaN });
      }
    }
    if (trace) trace.demanderRendu();
  }

  function balayer(Ps) {
    balayage = [];
    for (let E0 = 27; E0 <= 60.01; E0 += 1.5) balayage.push(evaluerSecondaire(E0, Ps));
    if (!trace) return;
    for (const id of ["pont", "cuivre", "hacheur", "total"]) {
      trace.definirDonnees(id, balayage.filter((p) => p.possible).map((p) => [p.E0, p[id]]));
    }
    const maxi = Math.max(10, ...balayage.filter((p) => p.possible).map((p) => p.total));
    trace.definirPlage({ yMin: 0, yMax: Math.ceil((maxi * 1.15) / 5) * 5 });
  }

  let puissance = null;
  const curseurs = api.sim.curseurs(
    "#e-choix-curseurs",
    [
      { id: "e0", libelle: "Secondaire à vide E_0", min: 27, max: 60, pas: 0.5, valeur: 32, unite: "V" },
      { id: "ps", libelle: "Puissance de sortie P_s", min: 60, max: 150, pas: 5, valeur: 120, unite: "W" },
    ],
    (v) => {
      if (v.ps !== puissance) {
        puissance = v.ps;
        clearTimeout(minuterie);
        const ps = v.ps;
        const e0 = v.e0;
        minuterie = setTimeout(() => {
          balayer(ps);
          afficherPoint(e0, ps);
        }, balayage.length ? 160 : 0);
        if (!balayage.length) return;
      }
      afficherPoint(v.e0, v.ps);
    }
  );
  if (curseurs) ressources.push(curseurs);
  nettoyeurs.push(() => clearTimeout(minuterie));
}

/* --------------------------------------------------------------------------
   E. Mise sous tension : précharge et démarrage
   -------------------------------------------------------------------------- */

function construireDemarrage(racine, api) {
  if (!racine.querySelector("#e-demarrage-tension")) return;
  let resultat = null;
  let instant = 40;

  const decor = (unite) => ({ c, repere: r, couleurs }) => {
    ligneV(c, r, couleurs, 80, "K fermé", [1, 3], "gauche");
    ligneV(c, r, couleurs, 100, "hacheur", [1, 3], "droite");
    if (!resultat) return;
    const y = interpoler(resultat.t, unite === "V" ? resultat.vb : resultat.ir, instant);
    ligneV(c, r, couleurs, instant, null, [2, 4]);
    point(c, r, couleurs, instant, y, nb(api, y, 1) + " " + unite);
  };

  const traceV = api.sim.traceur("#e-demarrage-tension", {
    titre: "Tension du bus à la mise sous tension",
    xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
    xMin: 0, xMax: 150, yMin: 0, yMax: 52,
    ratio: 0.38,
    series: [{ id: "vb", nom: "v_b(t)", couleur: "serie-1", epaisseur: 2.4 }],
    surDessin: decor("V"),
  });
  if (traceV) ressources.push(traceV);

  const traceI = api.sim.traceur("#e-demarrage-courant", {
    titre: "Courant fourni par le pont",
    xTitre: "temps", xUnite: "ms", yTitre: "courant", yUnite: "A",
    xMin: 0, xMax: 150, yMin: 0, yMax: 40,
    ratio: 0.38,
    series: [{ id: "ir", nom: "i_r(t), courant redressé", couleur: "serie-2", epaisseur: 1.8 }],
    surDessin: decor("A"),
  });
  if (traceI) ressources.push(traceI);

  const valeurs = api.sim.valeurs("#e-demarrage-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 1 },
    { id: "vb", libelle: "Bus v_b", unite: "V", decimales: 1 },
    { id: "ir", libelle: "Courant i_r", unite: "A", decimales: 1 },
    { id: "avant", libelle: "Pointe avant K", unite: "A", decimales: 1 },
    { id: "apres", libelle: "Pointe après K", unite: "A", decimales: 1 },
    { id: "energie", libelle: "Énergie dans R_pré", unite: "J", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majInstant() {
    if (!resultat) return;
    if (valeurs) {
      valeurs.maj({
        t: instant,
        vb: interpoler(resultat.t, resultat.vb, instant),
        ir: interpoler(resultat.t, resultat.ir, instant),
        avant: resultat.picAvant,
        apres: resultat.picApres,
        energie: interpoler(resultat.t, resultat.er, instant),
      });
    }
    if (traceV) traceV.demanderRendu();
    if (traceI) traceI.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#e-demarrage-curseurs",
    [
      { id: "r", libelle: "Résistance de précharge R_pré", min: 0, max: 6.8, pas: 0.1, valeur: 2.2, unite: "Ω" },
      { id: "k", libelle: "Tension du réseau", min: 90, max: 110, pas: 1, valeur: 100, unite: "%" },
      { id: "phi", libelle: "Phase à l'enclenchement", min: 0, max: 90, pas: 5, valeur: 90, unite: "°" },
    ],
    (v) => {
      resultat = simulerDemarrage(v.r, v.k / 100, v.phi);
      const imax = Math.max(resultat.picAvant, resultat.picApres);
      if (traceI) {
        traceI.definirPlage({ yMin: 0, yMax: Math.max(20, Math.ceil((imax * 1.12) / 10) * 10) });
        traceI.definirDonnees("ir", resultat.t.map((t, j) => [t, resultat.ir[j]]));
      }
      if (traceV) traceV.definirDonnees("vb", resultat.t.map((t, j) => [t, resultat.vb[j]]));
      majInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const synchro = { verrou: false, curseur: null, lecteur: null };
  function appliquer(t, source) {
    if (synchro.verrou) return;
    synchro.verrou = true;
    instant = t;
    majInstant();
    if (source !== "curseur" && synchro.curseur) synchro.curseur.definir("t", Math.round(t));
    if (source !== "lecteur" && synchro.lecteur) synchro.lecteur.suivre(t);
    synchro.verrou = false;
  }

  synchro.curseur = api.sim.curseurs(
    "#e-demarrage-lecteur",
    [{ id: "t", libelle: "Instant observé", min: 0, max: 150, pas: 1, valeur: 40, unite: "ms" }],
    (v) => appliquer(v.t, "curseur")
  );
  if (synchro.curseur) ressources.push(synchro.curseur);

  synchro.lecteur = api.sim.lecteur("#e-demarrage-lecteur", {
    de: 0,
    a: 150,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Lecture de la mise sous tension",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
}

/* --------------------------------------------------------------------------
   H. Bilan de puissance animé
   -------------------------------------------------------------------------- */

function construireBilan(racine, api) {
  const conteneur = racine.querySelector("#h-bilan");
  if (!conteneur) return;

  const svg = svgEl("svg", { viewBox: "0 0 760 320", role: "img", "aria-label": "Flux de puissance de l'alimentation, du réseau à la sortie, avec les pertes de chaque étage" });
  const Y0 = 50;
  const ECH = 0.72; // pixels par watt
  const X = { debut: 30, fer: 130, cuivre: 225, pont: 345, hacheur: 495, fin: 650 };

  const bande = svgEl("path", { style: "fill: var(--serie-1)", opacity: "0.38", stroke: "none" });
  const contour = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4" });
  const languettes = ["fer", "cuivre", "pont", "hacheur"].map(() =>
    svgEl("path", { fill: "none", "stroke-linecap": "butt", style: "stroke: var(--serie-5)", opacity: "0.6" })
  );
  const etiquettesPertes = languettes.map(() => svgEl("text", { fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11", "text-anchor": "middle" }));
  const etiquettesFlux = [0, 1, 2, 3].map(() => svgEl("text", { fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12", "text-anchor": "middle" }));
  const fixe = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  fixe.innerHTML =
    texte(X.debut, 26, "réseau") +
    texte(X.fer - 10, 26, "transformateur") +
    texte(X.pont - 20, 26, "pont") +
    texte(X.hacheur - 30, 26, "hacheur") +
    texte(X.fin, 26, "sortie 24 V") +
    texte(30, 314, "largeur de bande proportionnelle à la puissance ; pertes vers le bas", ' font-size="11"');
  const reperes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4", opacity: "0.6" });
  reperes.innerHTML = [X.fer, X.cuivre, X.pont, X.hacheur].map((x) => '<path d="M' + x + ' 36V' + (Y0 - 4) + '"/>').join("");
  svg.append(bande, ...languettes, contour, reperes, fixe, ...etiquettesFlux, ...etiquettesPertes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#h-bilan-valeurs", [
    { id: "pac", libelle: "Puissance au réseau", unite: "W", decimales: 1 },
    { id: "eta", libelle: "Rendement global", unite: "%", decimales: 1 },
    { id: "lambda", libelle: "Facteur de puissance", decimales: 3 },
    { id: "i1", libelle: "Courant primaire", unite: "A", decimales: 3 },
    { id: "chaleur", libelle: "Chaleur dégagée", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let affiche = null;
  let image = 0;

  function dessiner(e) {
    const P0 = e.Pac;
    const P1 = P0 - e.fer;
    const P2 = P1 - e.cuivre;
    const P3 = P2 - e.pont;
    const P4 = P3 - e.hacheur;
    const y = (P) => Y0 + P * ECH;
    const d =
      "M" + X.debut + " " + Y0 + "H" + X.fin + "V" + y(P4).toFixed(1) +
      "H" + X.hacheur + "V" + y(P3).toFixed(1) +
      "H" + X.pont + "V" + y(P2).toFixed(1) +
      "H" + X.cuivre + "V" + y(P1).toFixed(1) +
      "H" + X.fer + "V" + y(P0).toFixed(1) +
      "H" + X.debut + "Z";
    bande.setAttribute("d", d);
    contour.setAttribute("d", d);
    const tranches = [
      [X.fer, P1, e.fer, "fer"],
      [X.cuivre, P2, e.cuivre, "cuivre"],
      [X.pont, P3, e.pont, "pont"],
      [X.hacheur, P4, e.hacheur, "hacheur"],
    ];
    tranches.forEach(([x, bas, perte, nom], j) => {
      const largeur = Math.max(2, perte * ECH);
      const ym = y(bas) + (perte * ECH) / 2;
      const xs = x - largeur / 2 - 1;
      languettes[j].setAttribute("stroke-width", largeur.toFixed(1));
      languettes[j].setAttribute("d", "M" + xs.toFixed(1) + " " + ym.toFixed(1) + "C" + (xs + 26).toFixed(1) + " " + ym.toFixed(1) + " " + (xs + 34).toFixed(1) + " " + (ym + 20).toFixed(1) + " " + (xs + 34).toFixed(1) + " 268");
      etiquettesPertes[j].setAttribute("x", (xs + 34).toFixed(1));
      etiquettesPertes[j].setAttribute("y", "290");
      etiquettesPertes[j].textContent = nom + " " + nb(api, perte, 1) + " W";
    });
    const flux = [
      [(X.debut + X.fer) / 2, P0],
      [(X.cuivre + X.pont) / 2, P2],
      [(X.pont + X.hacheur) / 2, P3],
      [(X.hacheur + X.fin) / 2 + 20, P4],
    ];
    flux.forEach(([x, P], j) => {
      etiquettesFlux[j].setAttribute("x", x.toFixed(1));
      etiquettesFlux[j].setAttribute("y", (Y0 + (P * ECH) / 2 + 4).toFixed(1));
      etiquettesFlux[j].textContent = nb(api, P, 1) + " W";
    });
  }

  function animerVers(cible) {
    cancelAnimationFrame(image);
    image = 0;
    if (!affiche || api.mouvementReduit) {
      affiche = { ...cible };
      dessiner(affiche);
      return;
    }
    const depart = { ...affiche };
    const debut = performance.now();
    const duree = 450;
    const pas = (maintenant) => {
      const f = Math.min(1, (maintenant - debut) / duree);
      const g = 1 - Math.pow(1 - f, 3);
      affiche = {};
      for (const cle of Object.keys(cible)) affiche[cle] = depart[cle] + (cible[cle] - depart[cle]) * g;
      dessiner(affiche);
      image = f < 1 ? requestAnimationFrame(pas) : 0;
    };
    image = requestAnimationFrame(pas);
  }
  nettoyeurs.push(() => cancelAnimationFrame(image));

  const curseurs = api.sim.curseurs(
    "#h-bilan-curseurs",
    [
      { id: "is", libelle: "Courant de sortie I_s", min: 1, max: 5, pas: 0.1, valeur: 5, unite: "A" },
      { id: "k", libelle: "Tension du réseau", min: 90, max: 110, pas: 1, valeur: 100, unite: "%" },
    ],
    (v) => {
      const r = regime({ k: v.k / 100, Is: v.is, C: PROJET.Cb });
      animerVers({ Pac: r.Pac, fer: PROJET.Pfer, cuivre: r.bus.pcu, pont: r.bus.pd, hacheur: r.hacheur.total });
      if (valeurs) {
        valeurs.maj({ pac: r.Pac, eta: r.eta * 100, lambda: r.lambda, i1: (r.bus.i2eff * PROJET.E0) / 230, chaleur: r.Pac - r.Ps });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
  ressources.push(api.dessiner(fixe, { declencheur: conteneur, duree: 1 }));
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

/** Décharge à puissance constante : v(t) = sqrt(V1² - 2 P t / C). */
function decharge(V1, P, C) {
  return (tms) => {
    const v2 = V1 * V1 - (2 * P * tms * 1e-3) / C;
    return v2 > 0 ? Math.sqrt(v2) : NaN;
  };
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";
  if (!racine.querySelector(cible)) return;

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-diode",
      titre: "Pertes d'une diode du pont",
      niveau: "fondamental",
      enonce:
        "<p>Une diode du pont, modélisée par $V_{F0} = 0{,}8\\ \\mathrm{V}$ et $r_F = 20\\ \\mathrm{m\\Omega}$, porte un courant moyen de " +
        "$1{,}61\\ \\mathrm{A}$ et un courant efficace de $4{,}55\\ \\mathrm{A}$. Quelles sont ses pertes de conduction, en watts ?</p>",
      valeur: 0.8 * 1.61 + 0.02 * 4.55 * 4.55,
      unite: "W",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Pertes $P_D$",
      etapes: [
        { texte: "Puissance instantanée : $p = v_Fi_F = V_{F0}i_F + r_Fi_F^2$. Sa moyenne fait apparaître la valeur moyenne du courant pour le seuil et le carré de la valeur efficace pour la résistance." },
        { texte: "$P_D = V_{F0}I_{moy} + r_FI_{eff}^2 = 0{,}8 \\times 1{,}61 + 0{,}02 \\times 4{,}55^2$." },
        { texte: "$P_D = 1{,}288 + 0{,}414 = 1{,}70\\ \\mathrm{W}$.", note: "Quatre diodes : $6{,}8\\ \\mathrm{W}$. La part résistive pèse un quart du total parce que le courant en pointes a un facteur de forme voisin de $2{,}8$ par diode." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaEtapes(moteurApi, conteneur, ["p = V_F0 i + r_F i²", "P = V_F0 I_moy + r_F I_eff²", "= 0,8 × 1,61 + 0,02 × 4,55²", "= 1,288 + 0,414 = 1,70 W par diode", "pont : 4 × 1,70 = 6,8 W"], "Moyenne de la puissance instantanée d'une diode linéarisée.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-ondulation",
      titre: "Ondulation de courant du hacheur",
      niveau: "fondamental",
      enonce:
        "<p>Le hacheur abaisseur de la séance, $L = 82\\ \\mathrm{\\mu H}$, $f_d = 100\\ \\mathrm{kHz}$, produit $24\\ \\mathrm{V}$ à partir d'un bus " +
        "de $40\\ \\mathrm{V}$, en conduction continue. Quelle est l'ondulation crête à crête du courant de l'inductance, en ampères ?</p>",
      valeur: (24 * (1 - 0.6)) / (82e-6 * 1e5),
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Ondulation $\\Delta i_L$",
      etapes: [
        { texte: "Rapport cyclique : $D = 24/40 = 0{,}6$." },
        { texte: "Pendant le blocage, l'inductance supporte $-V_s$ pendant $(1 - D)/f_d$ : $\\Delta i_L = V_s(1 - D)/(Lf_d)$." },
        { texte: "$\\Delta i_L = 24 \\times 0{,}4/(82 \\times 10^{-6} \\times 10^5) = 9{,}6/8{,}2 = 1{,}17\\ \\mathrm{A}$.", note: "Au réseau haut, bus à $48{,}2\\ \\mathrm{V}$, l'ondulation monte à $1{,}47\\ \\mathrm{A}$ : c'est le cas qui a fixé $L$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const di = (24 * 0.4) / 8.2;
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant de l'inductance sur deux périodes",
          xTitre: "temps", xUnite: "µs", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 20, yMin: 3.5, yMax: 6.5,
          series: [{ id: "i", nom: "i_L(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => { const u = (t % 10) / 10; return u < 0.6 ? 5 - di / 2 + (di * u) / 0.6 : 5 + di / 2 - (di * (u - 0.6)) / 0.4; } }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 5, "I_L = 5 A");
            point(c, r, couleurs, 6, 5 + di / 2, "crête 5,59 A");
            point(c, r, couleurs, 10, 5 - di / 2, "creux 4,41 A");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-energie",
      titre: "Capacité de bus par la méthode énergétique",
      niveau: "intermédiaire",
      enonce:
        "<p>Un hacheur absorbe $60\\ \\mathrm{W}$ sur un bus redressé à $50\\ \\mathrm{Hz}$. On veut que le bus, qui monte à $30\\ \\mathrm{V}$ " +
        "en crête, ne descende pas sous $20\\ \\mathrm{V}$. En prenant prudemment une décharge sur toute la demi-période, quelle capacité faut-il, " +
        "en millifarads ?</p>",
      valeur: 2.4,
      unite: "mF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Capacité $C_b$",
      etapes: [
        { texte: "Choix de la méthode : la charge est à puissance constante et l'ondulation est grande, la forme énergétique s'impose." },
        { texte: "$\\frac{1}{2}C_b(V_{max}^2 - V_{min}^2) = P_bt_d$ avec $t_d = 10\\ \\mathrm{ms}$." },
        { texte: "$C_b = 2 \\times 60 \\times 0{,}01/(30^2 - 20^2) = 1{,}2/500 = 2{,}4 \\times 10^{-3}\\ \\mathrm{F}$." },
        { texte: "Résultat : $2{,}4\\ \\mathrm{mF}$, soit $3\\ \\mathrm{mF}$ avec la tolérance de $-20\\ \\%$.", note: "La formule en courant, $\\Delta V = I/(2fC)$ avec $I = 60/25 = 2{,}4\\ \\mathrm{A}$, donne la même valeur : $2{,}4/(100 \\times 10) = 2{,}4\\ \\mathrm{mF}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Décharge du bus à puissance constante",
          xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 12, yMin: 15, yMax: 32,
          series: [{ id: "v", nom: "v_b(t) = √(30² - 2 P t / C)", couleur: "serie-1", epaisseur: 2.6, fonction: decharge(30, 60, 2.4e-3) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 20, "borne basse 20 V");
            point(c, r, couleurs, 10, 20, "20 V à 10 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thyristor",
      titre: "Réguler par un pont à thyristors",
      niveau: "intermédiaire",
      enonce:
        "<p>On remplace le pont de diodes par un pont monophasé tout thyristors, sur le même secondaire de $32\\ \\mathrm{V}$, et l'on supprime le " +
        "hacheur. En conduction continue, chutes négligées, quel angle de retard $\\alpha$ donne une tension moyenne de $24\\ \\mathrm{V}$, en degrés ?</p>",
      valeur: (Math.acos(24 / ((2 * Math.SQRT2 * 32) / Math.PI)) * 180) / Math.PI,
      unite: "°",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Angle $\\alpha$",
      etapes: [
        { texte: "Pont tout thyristors en conduction continue : $V_{moy} = V_{d0}\\cos\\alpha$ avec $V_{d0} = 2\\sqrt{2}\\,E/\\pi$." },
        { texte: "$V_{d0} = 2 \\times 1{,}4142 \\times 32/3{,}1416 = 28{,}81\\ \\mathrm{V}$." },
        { texte: "$\\cos\\alpha = 24/28{,}81 = 0{,}833$, donc $\\alpha = 33{,}6$ degrés." },
        { texte: "Le prix : une ondulation à $100\\ \\mathrm{Hz}$ qu'il faut lisser par une grosse inductance, et un facteur de déplacement voisin de $\\cos\\alpha = 0{,}83$ qui s'ajoute à la déformation.", note: "D'où le choix du hacheur pour une sortie précise de $120\\ \\mathrm{W}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const vd0 = (2 * Math.SQRT2 * 32) / Math.PI;
        const a = (Math.acos(24 / vd0) * 180) / Math.PI;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension moyenne en fonction de l'angle de retard",
          xTitre: "angle de retard", xUnite: "°", yTitre: "tension moyenne", yUnite: "V",
          xMin: 0, xMax: 180, yMin: -32, yMax: 32,
          series: [{ id: "v", nom: "V_d0 cos α", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => vd0 * Math.cos((x * Math.PI) / 180) }],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, a, 24, "α = 33,6° : 24 V");
            ligneV(c, r, couleurs, 90, "onduleur au-delà");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-maintien",
      titre: "Tenir une microcoupure de 20 ms",
      niveau: "avancé",
      enonce:
        "<p>L'alimentation de la séance absorbe $P_b = 123{,}4\\ \\mathrm{W}$ au bus. Une coupure du réseau survient au creux, à " +
        "$35{,}7\\ \\mathrm{V}$ ; le hacheur décroche sous $28\\ \\mathrm{V}$. Quelle capacité de bus faut-il pour tenir $20\\ \\mathrm{ms}$, en " +
        "millifarads, en gardant ce creux de $35{,}7\\ \\mathrm{V}$ ?</p>",
      valeur: ((2 * 123.4 * 0.02) / (35.7 * 35.7 - 28 * 28)) * 1000,
      unite: "mF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Capacité $C_b$",
      etapes: [
        { texte: "Stratégie : bilan d'énergie sur la coupure, à puissance constante : $\\frac{1}{2}C_b(V_1^2 - V_{b,min}^2) = P_bt_m$." },
        { texte: "$C_b = 2P_bt_m/(V_1^2 - V_{b,min}^2) = 2 \\times 123{,}4 \\times 0{,}02/(35{,}7^2 - 28^2)$." },
        { texte: "$V_1^2 - V_{b,min}^2 = 1274{,}5 - 784 = 490{,}5\\ \\mathrm{V^2}$ ; $C_b = 4{,}936/490{,}5 = 10{,}06\\ \\mathrm{mF}$." },
        { texte: "Contrôle : avec les $4{,}4\\ \\mathrm{mF}$ installés, $t_m = 8{,}7\\ \\mathrm{ms}$ seulement. Il faut donc plus du double.", note: "Raffinement : une capacité plus grande relève elle-même le creux, à $37{,}3\\ \\mathrm{V}$ ; en itérant, la simulation donne environ $8{,}1\\ \\mathrm{mF}$. Autre voie : relever la tension du bus, l'énergie utilisable croissant comme $V_1^2 - V_{b,min}^2$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Décharge du bus après une coupure au creux",
          xTitre: "temps après la coupure", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 25, yMin: 20, yMax: 38,
          series: [
            { id: "a", nom: "C_b = 4,4 mF", couleur: "serie-2", epaisseur: 2.2, fonction: decharge(35.7, 123.4, 4.4e-3) },
            { id: "b", nom: "C_b = 10,06 mF", couleur: "serie-1", epaisseur: 2.6, fonction: decharge(35.7, 123.4, 10.06e-3) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 28, "décrochage 28 V");
            point(c, r, couleurs, 8.74, 28, "8,7 ms");
            point(c, r, couleurs, 20, 28, "20 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Ondulation apparue sur la sortie 24 V",
      niveau: "diagnostic",
      enonce:
        "<p>Quatre ans après sa mise en service, l'alimentation de l'armoire déportée présente une ondulation de quelques centaines de millivolts à " +
        "$100\\ \\mathrm{Hz}$ sur sa sortie, uniquement à pleine charge et par réseau bas. À l'oscilloscope, le bus oscille entre $25{,}6$ et " +
        "$37{,}4\\ \\mathrm{V}$ au lieu de $29{,}5$ et $36{,}7\\ \\mathrm{V}$ à la réception. Le boîtier est chaud. Quelle est la cause la plus probable ?</p>",
      options: [
        { texte: "Les condensateurs de bus ont perdu une grande partie de leur capacité.", juste: true },
        { texte: "Une diode du pont est coupée." },
        { texte: "L'inductance du hacheur sature." },
        { texte: "La consigne de tension de la régulation a dérivé." },
      ],
      etapes: [
        { texte: "L'ondulation est à $100\\ \\mathrm{Hz}$, deux fois la fréquence du réseau : le pont redresse bien les deux alternances. Une diode coupée donnerait une ondulation à $50\\ \\mathrm{Hz}$, beaucoup plus profonde." },
        { texte: "Le creux du bus est passé sous la borne basse de $28\\ \\mathrm{V}$ : à cet instant, le hacheur atteint $D_{max}$ et ne régule plus, la sortie suit le bus. Le symptôme n'apparaît qu'au cas le plus défavorable, réseau bas et pleine charge." },
        { texte: "L'ondulation du bus est passée d'environ $7{,}2$ à $11{,}8\\ \\mathrm{V}$ : à puissance égale, cela signale une capacité réduite, typique du vieillissement d'électrolytiques chauds, dont la résistance série augmente aussi." },
        { texte: "Une saturation de l'inductance produirait des pointes de courant à $100\\ \\mathrm{kHz}$ et des déclenchements de la limitation ; une dérive de consigne décalerait la sortie en permanence, sans ondulation.", note: "Action : remplacer les condensateurs et revoir leur température de service ; ajouter la surveillance de l'ondulation du bus." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const neuf = simulerBus({ k: 0.9, C: 3.52e-3, P: 123.1, dt: 1e-5, periodes: 14, garder: 2 });
        const vieux = simulerBus({ k: 0.9, C: 2.2e-3, P: 123.1, dt: 1e-5, periodes: 14, garder: 2 });
        traceCorrection(moteurApi, conteneur, {
          titre: "Bus au réseau bas : condensateurs neufs et vieillis",
          xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 40, yMin: 22, yMax: 40,
          series: [
            { id: "n", nom: "3,52 mF, réception", couleur: "serie-1", epaisseur: 2.4, points: paires(neuf.t, neuf.vb, 600, 1000) },
            { id: "v", nom: "2,2 mF, après vieillissement", couleur: "serie-5", epaisseur: 2.4, points: paires(vieux.t, vieux.vb, 600, 1000) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 28, "borne basse 28 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi quelques volts de bus valent beaucoup de microfarads",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi relever la tension du bus de quelques volts allonge le maintien sur microcoupure bien plus que " +
        "proportionnellement, à capacité égale.</p>",
      motsCles: [["energie"], ["carre", "v2", "v²", "quadrat"], ["borne", "minimum", "minimale", "fixe", "28"], ["utilisable", "difference", "ecart", "disponible"]],
      minimum: 3,
      exemple: "Deux ou trois phrases : reliez l'énergie stockée, son expression et la borne basse imposée par le hacheur.",
      etapes: [
        { texte: "L'énergie stockée vaut $\\frac{1}{2}CV^2$ : elle croît comme le carré de la tension." },
        { texte: "Seule l'énergie comprise entre la tension de départ et la borne basse, fixée par le hacheur, est utilisable : $\\frac{1}{2}C(V_1^2 - V_{b,min}^2)$." },
        { texte: "La borne basse ne bouge pas quand on relève le bus : l'écart des carrés grandit très vite. De $35{,}7$ à $57{,}8\\ \\mathrm{V}$ de creux, l'énergie utilisable passe de $1{,}1$ à $5{,}6\\ \\mathrm{J}$ avec $4{,}4\\ \\mathrm{mF}$, et le maintien de $8{,}8$ à $45\\ \\mathrm{ms}$.", note: "Le compromis : condensateurs et semi-conducteurs plus tenus en tension, pertes de commutation plus élevées." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Énergie utilisable au-dessus de 28 V, pour 4,4 mF",
          xTitre: "tension de départ", xUnite: "V", yTitre: "énergie", yUnite: "J",
          xMin: 28, xMax: 60, yMin: 0, yMax: 6.5,
          series: [{ id: "w", nom: "½ C (V² - 28²)", couleur: "serie-1", epaisseur: 2.6, fonction: (v) => 0.5 * 4.4e-3 * (v * v - 784) }],
          surDessin({ c, repere: r, couleurs }) {
            point(c, r, couleurs, 35.7, 0.5 * 4.4e-3 * (35.7 * 35.7 - 784), "35,7 V : 1,1 J");
            point(c, r, couleurs, 57.8, 0.5 * 4.4e-3 * (57.8 * 57.8 - 784), "57,8 V : 5,6 J");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const DESSIN_PRECHARGE =
  '<defs><marker id="fl-qp" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker></defs>' +
  TRAITS + ' stroke-width="2.2"><rect x="40" y="70" width="110" height="130" rx="10"/><path d="M150 90H230"/><rect x="230" y="80" width="60" height="20" rx="3"/><path d="M290 90H380"/>' +
  '<path d="M210 90V40H238M282 40H310V90"/><path d="M238 40L276 26" stroke-width="2.4"/><circle cx="238" cy="40" r="3"/><circle cx="282" cy="40" r="3"/>' +
  '<path d="M380 90V135M380 145V200"/><path d="M360 135h40M360 145h40" stroke-width="3"/><path d="M380 90H500"/><path d="M150 200H500"/><rect x="500" y="70" width="140" height="150" rx="10"/></g>' +
  ECRITS + '<text x="56" y="128">pont de</text><text x="56" y="146">Graetz</text><text x="236" y="122">R_pré</text><text x="244" y="20">K</text>' +
  '<text x="350" y="122">+</text><text x="330" y="232">C_b</text><text x="514" y="128">hacheur</text><text x="514" y="146">abaisseur</text><text x="160" y="220" font-size="11">0 V du bus</text></g>';

const VISUELS_QUIZ = [
  etapes(["P_b t_d = ½ C (V_max² - V_min²)", "à P_b fixée : C plus grand, écart plus faible", "f_d et L n'agissent qu'à 100 kHz"], "La capacité fixe l'ondulation à 100 Hz."),
  etapes(["v_b i_b = P_b constant", "dv_b / di_b = - v_b² / P_b < 0", "38,4 V et 123,4 W : r_inc = -12,0 Ω"], "Résistance incrémentale négative."),
  etapes(["V_moy = 3 √2 U / π", "= 1,3505 × 400", "= 540,2 V"], "Pont à six impulsions."),
  etapes(["C_b déchargé : court-circuit vu du pont", "R_pré limite la pointe d'enclenchement", "K la court-circuite : aucune perte en service"], "Rôle de la précharge."),
  etapes(["η = η_transfo × η_pont × η_hacheur", "= 0,90 × 0,95 × 0,97", "= 0,829, soit 82,9 %"], "Les rendements se multiplient."),
  () => ({ viewBox: "0 0 720 250", dessin: DESSIN_PRECHARGE + TRAITS + ' stroke-width="1.6" stroke-dasharray="4 4"><rect x="222" y="72" width="76" height="36" rx="6"/></g>', legende: "La résistance de précharge, en série sur le rail positif, limite le courant d'appel." }),
  etapes(["V_moy = V_d0 cos α", "α > 90° : V_moy < 0, courant inchangé", "puissance renvoyée au réseau ; α borné vers 150°"], "Fonctionnement en onduleur assisté."),
  etapes(["48 V : tenue 100 V suffit", "100 kHz : pertes de commutation dominantes", "MOSFET unipolaire, sans traînée de courant"], "Choix de l'interrupteur à basse tension et haute fréquence."),
  etapes(["t_m = C_b (V_1² - V_min²) / (2 P_b)", "= 4,4 mF × (1600 - 784) / 246,8", "= 14,5 ms"], "Durée de maintien."),
  etapes(["bus plus haut : tenue des composants plus élevée", "Δi_L = V_s (1 - D) / (L f) : L plus grande", "pertes de commutation ∝ V_e ; C_b diminue"], "Ce que déplace la tension du bus."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pour une puissance absorbée donnée, quel composant fixe l'ondulation à $100\\ \\mathrm{Hz}$ du bus ?</p>",
        options: ["L'inductance du hacheur", "La capacité du bus", "La fréquence de découpage", "Le condensateur de sortie"],
        bonnes: [1],
        explication: "La loi $\\frac{1}{2}C_b(V_{max}^2 - V_{min}^2) = P_bt_d$ relie directement la capacité du bus à l'écart entre crête et creux ; les éléments du hacheur n'agissent qu'à la fréquence de découpage.",
        resume: "Ondulation du bus",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Vu du bus, un hacheur régulé se comporte comme une résistance positive : son courant baisse quand la tension du bus baisse.</p>",
        reponse: false,
        explication: "À puissance constante, $i_b = P_b/v_b$ augmente quand $v_b$ baisse : la résistance incrémentale vaut $-v_b^2/P_b$, négative.",
        resume: "Charge à puissance constante",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Tension moyenne d'un pont de diodes à six impulsions alimenté par un réseau de $400\\ \\mathrm{V}$ entre phases, en modèle à courant lissé sans chute, en volts ?</p>",
        valeur: (3 * Math.SQRT2 * 400) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{moy} = 3\\sqrt{2}\\,U/\\pi = 1{,}3505 \\times 400 = 540{,}2\\ \\mathrm{V}$, la tension du bus du variateur de la pompe.",
        resume: "Pont triphasé",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi place-t-on une résistance en série avec le condensateur de bus à la mise sous tension, puis la court-circuite-t-on par un contact ?</p>",
        motsCles: [["appel", "pointe", "enclenchement", "demarrage", "mise sous tension"], ["condensateur", "bus", "decharge", "court-circuit"], ["contact", "court-circuite", "pertes", "dissip", "service"]],
        minimum: 2,
        explication: "Le condensateur déchargé est un court-circuit vu du pont : la résistance limite la pointe d'enclenchement ; une fois le bus chargé, le contact la court-circuite pour qu'elle ne dissipe rien en service.",
        resume: "Précharge",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une alimentation enchaîne un transformateur à $90\\ \\%$, un pont à $95\\ \\%$ et un hacheur à $97\\ \\%$. Rendement global, en pourcentage ?</p>",
        valeur: 90 * 0.95 * 0.97,
        unite: "%",
        tolerance: 0.01,
        explication: "$\\eta = 0{,}90 \\times 0{,}95 \\times 0{,}97 = 0{,}829$, soit $82{,}9\\ \\%$ : le maillon faible est le transformateur à $50\\ \\mathrm{Hz}$.",
        resume: "Rendement d'une cascade",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce circuit de mise sous tension, quel élément limite le courant d'appel ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 720 250",
        dessin: DESSIN_PRECHARGE,
        zones: [
          { x: 40, y: 70, largeur: 110, hauteur: 130, etiquette: "pont" },
          { x: 222, y: 72, largeur: 76, hauteur: 36, etiquette: "R_pré", juste: true },
          { x: 345, y: 118, largeur: 70, hauteur: 46, etiquette: "C_b" },
          { x: 500, y: 70, largeur: 140, hauteur: 150, etiquette: "hacheur" },
        ],
        explication: "La résistance de précharge, en série sur le rail positif tant que $K$ est ouvert, limite la pointe à $(E_0\\sqrt{2} - 2V_{F0})/(R_{\\text{pré}} + R_s + 2r_F)$.",
        resume: "Lecture du circuit de précharge",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Dans quelle plage d'angle de retard un pont tout thyristors fonctionne-t-il en onduleur assisté par le réseau ?</p>",
        options: ["Entre $0$ et $30$ degrés", "Autour de $60$ degrés", "Au-delà de $90$ degrés, borné en pratique vers $150$ degrés", "Uniquement à $\\alpha = 0$"],
        bonnes: [2],
        explication: "$V_{moy} = V_{d0}\\cos\\alpha$ devient négative au-delà de $90$ degrés, alors que le courant garde son sens : la puissance s'inverse ; la marge de commutation borne l'angle vers $150$ degrés.",
        resume: "Thyristors en onduleur",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Pour un hacheur sous $48\\ \\mathrm{V}$ découpant à $100\\ \\mathrm{kHz}$, un IGBT est préférable à un MOSFET.</p>",
        reponse: false,
        explication: "À basse tension et haute fréquence, le MOSFET l'emporte : faible résistance à l'état passant et commutations rapides sans traînée de courant. L'IGBT se justifie au-delà de quelques centaines de volts et à fréquence modérée.",
        resume: "MOSFET ou IGBT",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un bus de $4{,}4\\ \\mathrm{mF}$ alimente $123{,}4\\ \\mathrm{W}$. Le réseau disparaît quand le bus est à $40\\ \\mathrm{V}$ ; le hacheur décroche à $28\\ \\mathrm{V}$. Durée de maintien, en millisecondes ?</p>",
        valeur: ((4.4e-3 * (40 * 40 - 28 * 28)) / (2 * 123.4)) * 1000,
        unite: "ms",
        tolerance: 0.02,
        explication: "$t_m = C_b(V_1^2 - V_{b,min}^2)/(2P_b) = 4{,}4 \\times 10^{-3} \\times 816/246{,}8 = 14{,}5\\ \\mathrm{ms}$.",
        resume: "Maintien sur microcoupure",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>On relève la tension du bus, à sortie inchangée. Quelles grandeurs augmentent ?</p>",
        options: [
          { texte: "La tenue en tension exigée des semi-conducteurs et des condensateurs", juste: true },
          { texte: "L'inductance nécessaire pour la même ondulation de courant", juste: true },
          { texte: "Les pertes de commutation du hacheur", juste: true },
          { texte: "La capacité de bus nécessaire" },
        ],
        multiple: true,
        explication: "Un bus plus haut exige des composants plus tenus, une inductance plus grande car $D$ diminue et $\\Delta i_L = V_s(1 - D)/(Lf_d)$ augmente, et des pertes de commutation proportionnelles à la tension commutée ; la capacité nécessaire, elle, diminue fortement.",
        resume: "Effets de la tension du bus",
      },
    ],
    { titre: "Dix questions sur le module" }
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
      { categorie: "Architecture", question: "Quelles sont les cinq fonctions d'une alimentation régulée à partir du réseau ?", reponse: "Adapter et isoler (transformateur), redresser (pont), stocker et filtrer (condensateur de bus), convertir et réguler (hacheur), protéger (fusible, varistance, précharge, limitation)." },
      { categorie: "Physique", question: "Pourquoi le pont ne conduit-il que pendant une courte fenêtre ?", reponse: "Les diodes ne conduisent que si la tension redressée dépasse celle du condensateur, c'est-à-dire autour de chaque crête : environ $55$ degrés par alternance dans l'exemple." },
      { categorie: "Physique", question: "Comment un hacheur régulé se comporte-t-il vu du bus ?", reponse: "Comme une charge à puissance constante : $i_b = P_b/v_b$, résistance incrémentale $-v_b^2/P_b$, négative." },
      { categorie: "Formule", question: "Comment dimensionner le condensateur de bus ?", reponse: "$\\frac{1}{2}C_b(V_{max}^2 - V_{min}^2) = P_bt_d$, avec $t_d \\le 1/(2f_r)$, puis tolérance et vérification par simulation." },
      { categorie: "Conception", question: "D'où vient la borne basse du bus ?", reponse: "Du rapport cyclique maximal du hacheur : $V_{b,min} \\ge (V_s + \\text{chutes})/D_{max}$, plus une marge ; $28\\ \\mathrm{V}$ pour $24\\ \\mathrm{V}$ en sortie." },
      { categorie: "Conception", question: "Où vérifier le creux, et où vérifier la tenue en tension ?", reponse: "Le creux au réseau bas, à pleine charge, capacité en bas de tolérance ; la tenue à vide, au réseau haut, où le bus atteint la crête moins deux seuils." },
      { categorie: "Transformateur", question: "Pourquoi un transformateur de $250\\ \\mathrm{VA}$ pour $145\\ \\mathrm{W}$ ?", reponse: "Le courant en pointes a une valeur efficace double de sa valeur moyenne : $206\\ \\mathrm{VA}$ et un facteur de puissance de $0{,}70$." },
      { categorie: "Démarrage", question: "Que fait une précharge mal réglée ?", reponse: "Trop faible, elle laisse passer une forte pointe d'enclenchement ; trop forte ou trop brève, elle reporte une seconde pointe à la fermeture du contact." },
      { categorie: "Maintien", question: "Comment calculer le maintien sur microcoupure ?", reponse: "$t_m = C_b(V_1^2 - V_{b,min}^2)/(2P_b)$, au pire depuis le creux : $8{,}8\\ \\mathrm{ms}$ pour $4{,}4\\ \\mathrm{mF}$ à $123{,}4\\ \\mathrm{W}$." },
      { categorie: "Compromis", question: "Que gagne-t-on et que perd-on à relever la tension du bus ?", reponse: "On gagne beaucoup sur la capacité et le maintien, l'énergie utilisable croissant comme $V^2$ ; on perd en tenue des composants, en inductance et en pertes de commutation ; le rendement change à peine." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["i_b = P_b / v_b", "= 123,4 / 38,4", "= 3,21 A, et non 5 A"], "Courant moyen d'entrée du hacheur."),
  etapes(["W utilisable = ½ C (V_1² - V_min²)", "dépend du carré de la tension", "doubler V_1 fait bien plus que doubler W"], "Énergie utilisable du bus."),
  etapes(["creux : réseau bas, pleine charge, C_b - 20 %", "tenue : à vide, réseau haut", "deux cas défavorables distincts"], "Cas le plus défavorable."),
  etapes(["Δi_L = 24 × (1 - 0,498) / (82 µH × 100 kHz)", "= 1,47 A", "I_s,lim = Δi_L / 2 = 0,73 A"], "Frontière de conduction discontinue."),
  etapes(["échelon de consigne : filtre LC peu amorti", "dépassement de tension et de courant", "rampe de consigne : démarrage progressif"], "Démarrage progressif."),
  etapes(["freinage : énergie cinétique renvoyée au bus", "pont de diodes non réversible : le bus monte", "hacheur de freinage et résistance, ou défaut de surtension"], "Où va l'énergie de freinage."),
  etapes(["λ = (I_1 / I) cos φ_1", "ici cos φ_1 ≈ 1 : la perte vient de la déformation", "remède : inductance de lissage ou correcteur actif"], "Facteur de puissance d'un courant déformé."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Le hacheur absorbe $123{,}4\\ \\mathrm{W}$ sur un bus de $38{,}4\\ \\mathrm{V}$ en moyenne. Courant moyen d'entrée, en ampères ?</p>",
        valeur: 123.4 / 38.4,
        unite: "A",
        tolerance: 0.02,
        explication: "$i_b = P_b/v_b = 123{,}4/38{,}4 = 3{,}21\\ \\mathrm{A}$ : c'est ce courant, pas les $5\\ \\mathrm{A}$ de sortie, que le bus fournit.",
        resume: "Courant du bus",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. L'énergie qu'un bus peut fournir pendant une microcoupure est proportionnelle à sa tension.</p>",
        reponse: false,
        explication: "Elle vaut $\\frac{1}{2}C_b(V_1^2 - V_{b,min}^2)$ : elle dépend des carrés, et la borne basse fixe en retranche une part constante.",
        resume: "Énergie utilisable",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Dans quel cas vérifie-t-on que le creux du bus reste au-dessus de la borne basse ?</p>",
        options: ["Réseau haut, à vide", "Réseau bas, pleine charge, capacité en bas de tolérance", "Réseau nominal, demi-charge", "Réseau haut, pleine charge"],
        bonnes: [1],
        explication: "Le creux est le plus profond quand la crête est la plus basse, la puissance la plus forte et la capacité la plus faible.",
        resume: "Cas défavorable du creux",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Hacheurs DC-DC. Le hacheur de la séance, $L = 82\\ \\mathrm{\\mu H}$, $f_d = 100\\ \\mathrm{kHz}$, produit $24\\ \\mathrm{V}$ à partir de $48{,}2\\ \\mathrm{V}$. Sous quel courant de sortie la conduction devient-elle discontinue, en ampères ?</p>",
        valeur: (24 * (1 - 24 / 48.2)) / (82e-6 * 1e5) / 2,
        unite: "A",
        tolerance: 0.03,
        explication: "$I_{s,lim} = \\Delta i_L/2 = 24 \\times (1 - 0{,}498)/(2 \\times 82 \\times 10^{-6} \\times 10^5) = 0{,}73\\ \\mathrm{A}$.",
        resume: "Frontière de conduction",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours Hacheurs DC-DC. Pourquoi un hacheur abaisseur démarre-t-il avec une rampe de consigne ?</p>",
        options: [
          "Pour éviter le dépassement de tension et de courant du filtre LC peu amorti",
          "Pour réduire les pertes de conduction en régime établi",
          "Pour éviter la conduction discontinue à pleine charge",
          "Pour augmenter la fréquence de découpage",
        ],
        bonnes: [0],
        explication: "Sur un échelon de rapport cyclique, le filtre LC de sortie, peu amorti, dépasse fortement sa valeur finale ; la rampe garde la tension et le courant sous contrôle.",
        resume: "Démarrage progressif",
      },
      {
        type: "qcm",
        enonce: repere(5) + "<p>Cours Révision 6 et sélection d'un entraînement. La centrifugeuse, sur variateur à pont de diodes, est freinée rapidement. Où va son énergie cinétique ?</p>",
        options: [
          "Elle est renvoyée au réseau par le pont de diodes",
          "Elle charge le bus continu, qui monte ; un hacheur de freinage la dissipe dans une résistance, faute de quoi le variateur se met en défaut de surtension",
          "Elle est entièrement dissipée dans le rotor du moteur",
          "Elle est stockée dans l'inductance de ligne",
        ],
        bonnes: [1],
        explication: "Le pont de diodes ne conduit que dans un sens : l'énergie renvoyée par l'onduleur s'accumule dans le condensateur de bus. Un hacheur de freinage, cousin du hacheur de cette séance, l'écoule dans une résistance.",
        resume: "Énergie de freinage",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Cours Correction du facteur de puissance. Le facteur de puissance de l'alimentation vaut $0{,}70$. Un collègue propose une batterie de condensateurs au primaire, comme pour un moteur asynchrone. Qu'en pensez-vous ?</p>",
        options: [
          "Bonne idée : le facteur de puissance passera à 1",
          "Inefficace : le fondamental du courant est presque en phase, la perte vient de la déformation ; il faut une inductance de lissage ou un correcteur actif",
          "Il faut plutôt une inductance en parallèle au primaire",
          "Il suffit de surdimensionner le transformateur",
        ],
        bonnes: [1],
        explication: "La compensation capacitive corrige un déphasage. Ici $\\lambda = (I_1/I)\\cos\\varphi_1$ avec $\\cos\\varphi_1$ voisin de $1$ : c'est le facteur de déformation qui est faible.",
        resume: "Compensation et courant déformé",
      },
    ],
    { titre: "Sept questions de révision" }
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
    titre: "Où en suis-je sur les semi-conducteurs et la conversion ?",
  });
  if (auto) ressources.push(auto);
}
