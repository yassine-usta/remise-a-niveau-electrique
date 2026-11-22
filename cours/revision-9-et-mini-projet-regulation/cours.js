/* ==========================================================================
   cours/revision-9-et-mini-projet-regulation/cours.js
   Révision 9 et mini-projet régulation : tour de boucle après un à-coup de
   charge (lecteur et curseur), budget de phase avec poignée sur la pulsation
   de coupure, choix du réglage, réponses de l'exemple, saturation de couple
   et anti-emballement, exercices, quiz, cartes, révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const DEG = 180 / Math.PI;

/* Convoyeur : K en (m/s)/%, tm en s, retard du variateur en s, limites en %,
   dx : avance de la bande pour un front du codeur, en m. */
const CV = { K: 0.0375, tm: 0.8, thv: 0.01, umin: -100, umax: 100, dx: 1.5 / 25 / 4096 };

/* --------------------------------------------------------------------------
   Outils généraux
   -------------------------------------------------------------------------- */

function svgEl(nom, attributs = {}) {
  const element = document.createElementNS(SVG_NS, nom);
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

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  if (!Number.isFinite(py) || py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif);
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

function ligneV(c, repere, couleurs, x, motif = [1, 3]) {
  const px = repere.versX(x);
  if (!Number.isFinite(px) || px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.restore();
}

/** Points hors de la fenêtre verticale masqués : la courbe est interrompue. */
function ecreter(points, yMin, yMax) {
  return points.map(([t, v]) => [t, Number.isFinite(v) && v >= yMin && v <= yMax ? v : NaN]);
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
function dessinEtapes(lignes, largeur = 640) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 640) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function correctionEtapes(lignes, legende, largeur = 640) {
  return (conteneur, moteurApi) => {
    const v = etapes(lignes, legende, largeur);
    schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
  };
}

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

/** Ajoute un visuel animé sous le verdict de chaque question d'un quiz. */
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

/* --------------------------------------------------------------------------
   Calcul : boucle de vitesse du convoyeur
   -------------------------------------------------------------------------- */

/**
 * Boucle de vitesse du convoyeur, numérique ou continue.
 * o : { Kc, Ti, Te, delai (0 ou 1), aw, Tt, prefiltre, quantif, continu,
 *       r(t), d(t), tMax, h, pas }
 * Renvoie les temps, la vitesse réelle, la commande appliquée, la vitesse
 * mesurée et la commande calculée avant la borne.
 */
function simConvoyeur(o) {
  const h = o.h || 0.0005;
  const n = Math.round(o.tMax / h);
  const Te = o.Te || 0.005;
  const nT = Math.max(1, Math.round(Te / h));
  const nRet = Math.round(CV.thv / h);
  const file = new Array(nRet + 1);
  const a = Math.exp(-h / CV.tm);
  const r0 = o.r(0);
  const d0 = o.d(0);
  const u0 = r0 / CV.K + d0;
  file.fill(u0);
  let tete = 0;
  let v = r0;
  let pos = 0;
  let posPrec = 0;
  let x = u0;
  let rf = r0;
  let ucmd = u0;
  let attente = u0;
  let ci = u0;
  let ucal = u0;
  let vm = r0;
  const pf = Math.exp(-Te / o.Ti);
  const Tt = o.Tt || 0.4;
  const pas = o.pas || 20;
  const ts = [];
  const vs = [];
  const us = [];
  const vms = [];
  const ucs = [];
  for (let k = 0; k < n; k += 1) {
    const t = k * h;
    const r = o.r(t);
    const d = o.d(t);
    let ua;
    if (o.continu) {
      const rr = o.prefiltre ? (rf += (h / o.Ti) * (r - rf)) : r;
      const e = rr - v;
      ci += (o.Kc / o.Ti) * e * h;
      const uc = o.Kc * e + ci;
      const usat = Math.min(CV.umax, Math.max(CV.umin, uc));
      if (o.aw) ci += (h / Tt) * (usat - uc);
      ucal = uc;
      ua = usat;
      vm = v;
    } else {
      if (k % nT === 0) {
        if (k === 0) vm = r0;
        else if (o.quantif) vm = ((Math.floor(pos / CV.dx) - Math.floor(posPrec / CV.dx)) * CV.dx) / Te;
        else vm = (pos - posPrec) / Te;
        posPrec = pos;
        rf = o.prefiltre ? pf * rf + (1 - pf) * r : r;
        const e = rf - vm;
        x += ((o.Kc * Te) / o.Ti) * e;
        const uc = o.Kc * e + x;
        ucal = uc;
        const usat = Math.min(CV.umax, Math.max(CV.umin, uc));
        if (o.aw) x += (Te / Tt) * (usat - uc);
        if (o.delai) {
          ucmd = attente;
          attente = usat;
        } else ucmd = usat;
      }
      ua = ucmd;
    }
    /* file circulaire : la valeur lue a été écrite nRet pas plus tôt */
    file[tete] = ua;
    tete = (tete + 1) % file.length;
    const ur = o.continu ? ua : file[tete];
    v = a * v + (1 - a) * CV.K * (ur - d);
    pos += v * h;
    if (k % pas === 0) {
      ts.push(t);
      vs.push(v);
      us.push(ua);
      vms.push(vm);
      ucs.push(ucal);
    }
  }
  return { ts, vs, us, vms, ucs };
}

/** Dépassement en % et temps d'établissement à 5 % d'un échelon de r0 à r1 appliqué en t0. */
function perfConsigne(res, t0, r0, r1) {
  const amp = r1 - r0;
  let pic = -Infinity;
  let t5 = 0;
  for (let i = 0; i < res.ts.length; i += 1) {
    if (res.ts[i] < t0) continue;
    const y = (res.vs[i] - r0) / amp;
    if (y > pic) pic = y;
    if (Math.abs(y - 1) > 0.05) t5 = res.ts[i] - t0;
  }
  return { D: Math.max(0, (pic - 1) * 100), t5 };
}

/** Creux de vitesse, instant du creux et retour dans la bande, après une perturbation en t0. */
function perfCharge(res, t0, t1, rref, bande = 0.005) {
  let creux = Infinity;
  let tc = 0;
  let tr = 0;
  for (let i = 0; i < res.ts.length; i += 1) {
    const t = res.ts[i];
    if (t < t0 || t > t1) continue;
    const e = res.vs[i] - rref;
    if (e < creux) {
      creux = e;
      tc = t - t0;
    }
    if (Math.abs(e) > bande) tr = t - t0;
  }
  return { creux: -creux, tc, tr };
}

/** Marges de la boucle PI et convoyeur avec un retard total th. */
function marge(Kc, Ti, th, tm = CV.tm) {
  const L = (w) => {
    const nr = Kc * CV.K;
    const ni = Kc * CV.K * w * Ti;
    const dr = -w * w * Ti * tm;
    const di = w * Ti;
    const dm = dr * dr + di * di;
    const re = (nr * dr + ni * di) / dm;
    const im = (ni * dr - nr * di) / dm;
    const c = Math.cos(-w * th);
    const s = Math.sin(-w * th);
    return [re * c - im * s, re * s + im * c];
  };
  const phase = (w) => -Math.PI / 2 + Math.atan(w * Ti) - Math.atan(w * tm) - w * th;
  let lo = 1e-3;
  let hi = 1e4;
  for (let i = 0; i < 120; i += 1) {
    const m = Math.sqrt(lo * hi);
    if (Math.hypot(...L(m)) > 1) lo = m;
    else hi = m;
  }
  const wc = lo;
  const MP = 180 + phase(wc) * DEG;
  let w180 = null;
  if (th > 0) {
    let a = 1e-3;
    let b = 1e4;
    if (phase(b) < -Math.PI) {
      for (let i = 0; i < 120; i += 1) {
        const m = Math.sqrt(a * b);
        if (phase(m) > -Math.PI) a = m;
        else b = m;
      }
      w180 = a;
    }
  }
  const gm = w180 ? -20 * Math.log10(Math.hypot(...L(w180))) : Infinity;
  return { wc, MP, w180, gm };
}

function kcCompensation(wc) {
  return (CV.tm * wc) / CV.K;
}

function retardTotal(Te, delai) {
  return Te / 2 + (delai ? Te : 0) + Te / 2 + CV.thv;
}

const echelonConsigne = (t) => (t >= 0.2 ? 1.42 : 1.4);
const chargeFixe = () => 10;
const consigneFixe = () => 1.45;
const acoupCharge = (t) => (t >= 0.2 ? 20 : 10);

function ecartMm(res, ref) {
  return res.ts.map((t, i) => [t, (res.vs[i] - ref) * 1000]);
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireTourDeBoucle(racine, api);
  construireBudget(racine, api);
  construireReglage(racine, api);
  construireExemple(racine, api);
  construireSaturation(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(
      racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-synthese-tableau, #e-statut-tableau, #i-boucles"),
      { decalage: 0.05 }
    )
  );
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
    ["#e-modele-figure svg", 2.2],
    ["#e-fenetre-figure svg", 1.8],
    ["#f-schema-principal svg", 2.6],
  ];
  for (const [selecteur, d] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: d }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-premier-ordre",
      titre: "Temps d'établissement d'un premier ordre",
      niveau: "fondamental",
      enonce: "<p>Une boucle fermée se comporte comme un premier ordre de constante de temps $0{,}25\\ \\mathrm{s}$. Au bout de combien de temps, en secondes, sa réponse à un échelon reste-t-elle à moins de $5\\ \\%$ de la valeur finale ?</p>",
      valeur: Math.log(20) * 0.25,
      unite: "s",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Temps d'établissement",
      etapes: [
        { texte: "Écart relatif à la valeur finale : $e^{-t/\\tau}$." },
        { texte: "$e^{-t/\\tau} = 0{,}05 \\Rightarrow t = \\tau\\ln 20 = 0{,}25 \\times 2{,}996$." },
        { texte: "$t_5 = 0{,}749\\ \\mathrm{s}$, soit environ $3\\tau$.", note: "Pour une boucle compensée, $\\tau = 1/\\omega_c$ : $t_5 \\approx 3/\\omega_c$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle d'un premier ordre de 0,25 s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "réponse relative",
          yUnite: "",
          xMin: 0,
          xMax: 1.5,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "y", nom: "1 - exp(-t / 0,25)", fonction: (t) => 1 - Math.exp(-t / 0.25) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.95, "95 %", [3, 4]);
            ligneV(c, r, couleurs, 0.749, [6, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-budget",
      titre: "Phase perdue par l'échantillonnage",
      niveau: "fondamental",
      enonce: "<p>Une boucle a une pulsation de coupure de $4\\ \\mathrm{rad/s}$. Elle est calculée toutes les $20\\ \\mathrm{ms}$, avec une sortie écrite au top suivant. Quelle phase, en degrés, le bloqueur et le délai de calcul lui retirent-ils ensemble ?</p>",
      valeur: 1.5 * 4 * 0.02 * DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Phase perdue",
      etapes: [
        { texte: "Retard équivalent : $T_e/2 + T_e = 1{,}5\\,T_e = 30\\ \\mathrm{ms}$." },
        { texte: "Phase : $\\omega_c \\times 1{,}5\\,T_e = 4 \\times 0{,}03 = 0{,}12\\ \\mathrm{rad}$." },
        { texte: "$0{,}12 \\times 180/\\pi = 6{,}88^\\circ$.", note: "Une mesure par comptage ajouterait encore $T_e/2$, soit $2{,}29^\\circ$." },
      ],
      visuelCorrection: correctionEtapes(
        ["θ = Te/2 (bloqueur) + Te (calcul) = 30 ms", "Δφ = ωc θ = 4 × 0,03 = 0,12 rad", "Δφ = 6,88°"],
        "Phase perdue par le bloqueur et le délai de calcul."
      ),
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-statique",
      titre: "Erreur statique face à une charge",
      niveau: "fondamental",
      enonce: "<p>Un procédé du premier ordre subit un couple résistant constant. Quels correcteurs ramènent la vitesse exactement à la consigne en régime établi ?</p>",
      options: [
        { texte: "Un correcteur proportionnel seul, de gain élevé" },
        { texte: "Un PI", juste: true },
        { texte: "Un correcteur intégral pur", juste: true },
        { texte: "Un correcteur proportionnel et dérivé" },
      ],
      etapes: [
        { texte: "En régime établi, le moteur doit fournir un couple supplémentaire égal à la charge." },
        { texte: "Un correcteur sans intégrateur ne fournit ce couple qu'avec un écart non nul : $e = \\Delta u/K_c$." },
        { texte: "Avec un intégrateur, la commande peut rester décalée alors que l'écart est nul.", note: "Le PI ou l'intégral pur conviennent ; le PI réagit plus vite grâce à son action proportionnelle." },
      ],
      visuelCorrection: correctionEtapes(
        ["P seul : Δu = Kc e ⇒ e = Δu / Kc ≠ 0", "avec intégrateur : u = Kc e + x, x absorbe Δu", "régime établi : e = 0"],
        "Pourquoi l'intégrateur annule l'erreur statique."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Tour de boucle après un à-coup de charge : lecteur et curseur
   -------------------------------------------------------------------------- */

function construireTourDeBoucle(racine, api) {
  const conteneur = racine.querySelector("#d-tour-vivant");
  if (!conteneur) return;
  const P = { x0: 150, x1: 700, tMax: 3, haut: 22, pasBande: 92, hBande: 62 };
  const X = (t) => P.x0 + ((P.x1 - P.x0) * t) / P.tMax;
  const bandes = [
    { id: "d", nom: "charge d", unite: "%", lo: 5, hi: 25, init: 10, dec: 0 },
    { id: "u", nom: "commande u", unite: "%", lo: 44, hi: 64, init: 48.67, dec: 1 },
    { id: "v", nom: "vitesse v", unite: "m/s", lo: 1.33, hi: 1.46, init: 1.45, dec: 2 },
    { id: "vm", nom: "mesure vm", unite: "m/s", lo: 1.33, hi: 1.46, init: 1.45, dec: 2 },
  ];
  bandes.forEach((b, i) => {
    b.y0 = P.haut + i * P.pasBande;
    b.Y = (val) => b.y0 + P.hBande - (P.hBande * (Math.min(b.hi, Math.max(b.lo, val)) - b.lo)) / (b.hi - b.lo);
  });
  const etat = { wc: 4, t: P.tMax, res: null };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 410",
    role: "img",
    "aria-label": "Quatre chronogrammes superposés sur trois secondes : charge, commande de couple, vitesse réelle et vitesse mesurée du convoyeur après un à-coup de charge de 10 pour cent, avec la ligne de l'instant présent",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-tb-fl") + "</defs>" + TRAITS + ' stroke-width="1.2">';
  for (const b of bandes) {
    d += '<path d="M' + P.x0 + " " + (b.y0 + P.hBande) + "H" + P.x1 + '" opacity="0.5"/>';
    d += '<path d="M' + P.x0 + " " + b.y0 + "V" + (b.y0 + P.hBande) + '" opacity="0.5"/>';
    d += '<path d="M' + P.x0 + " " + b.Y(b.init).toFixed(1) + "H" + P.x1 + '" stroke-dasharray="6 5" stroke-width="1"/>';
  }
  const yAxe = P.haut + 4 * P.pasBande - 14;
  d += '<path d="M' + P.x0 + " " + yAxe + "H" + (P.x1 + 12) + '" marker-end="url(#d-tb-fl)"/>';
  let grad = "";
  for (let i = 0; i <= 6; i += 1) grad += "M" + X(i * 0.5).toFixed(1) + " " + (yAxe - 4) + "v8";
  d += '<path d="' + grad + '"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const b of bandes) {
    d += texte(8, b.y0 + 24, b.nom) + texte(8, b.y0 + 40, "(" + b.unite + ")");
    d += texte(P.x0 - 6, b.y0 + 10, nb(api, b.hi, b.dec), ' text-anchor="end"');
    d += texte(P.x0 - 6, b.y0 + P.hBande, nb(api, b.lo, b.dec), ' text-anchor="end"');
  }
  for (let i = 0; i <= 6; i += 1) d += texte(X(i * 0.5), yAxe + 18, nb(api, i * 0.5, 1), ' text-anchor="middle"');
  d += texte(P.x1 + 12, yAxe - 8, "t (s)", ' text-anchor="end"');
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const courbes = bandes.map(() => svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6", "stroke-linejoin": "round" }));
  const present = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 3" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(...courbes, present, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-tour-valeurs", [
    { id: "t", libelle: "Instant présent", format: (v) => v },
    { id: "kc", libelle: "PI par compensation", format: (v) => v },
    { id: "ecart", libelle: "Écart de vitesse à l'instant présent", format: (v) => v },
    { id: "creux", libelle: "Chute maximale et instant du creux", format: (v) => v },
    { id: "retour", libelle: "Retour dans ± 5 mm/s", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function simuler() {
    etat.res = simConvoyeur({
      Kc: kcCompensation(etat.wc),
      Ti: CV.tm,
      Te: 0.005,
      delai: 1,
      aw: true,
      r: consigneFixe,
      d: acoupCharge,
      tMax: 6,
      pas: 10,
    });
    etat.perf = perfCharge(etat.res, 0.2, 6, 1.45, 0.005);
  }

  function dessinerCourbes() {
    const res = etat.res;
    const tNow = Math.max(0, Math.min(P.tMax, etat.t));
    const series = [res.ts.map((t) => acoupCharge(t)), res.us, res.vs, res.vms];
    bandes.forEach((b, j) => {
      let s = "";
      for (let i = 0; i < res.ts.length; i += 1) {
        const t = res.ts[i];
        if (t > tNow + 1e-9) break;
        s += (i ? "L" : "M") + X(t).toFixed(1) + " " + b.Y(series[j][i]).toFixed(1);
      }
      courbes[j].setAttribute("d", s);
    });
    present.setAttribute("d", "M" + X(tNow).toFixed(1) + " " + (P.haut - 6) + "V" + (yAxe - 2));
    const i = Math.min(res.ts.length - 1, Math.round(tNow / 0.005));
    const aDroite = X(tNow) > 560;
    etiquette.innerHTML = texte(X(tNow) + (aDroite ? -6 : 6), P.haut - 8, "instant présent " + nb(api, tNow, 2) + " s", aDroite ? ' text-anchor="end"' : "");
    if (valeurs) {
      valeurs.maj({
        t: nb(api, tNow, 2) + " s",
        kc: "ωc = " + nb(api, etat.wc, 0) + " rad/s, Kc = " + nb(api, kcCompensation(etat.wc), 1) + " %/(m/s), Ti = 0,8 s",
        ecart: nb(api, (res.vs[i] - 1.45) * 1000, 1) + " mm/s, commande " + nb(api, res.us[i], 1) + " %",
        creux: nb(api, etat.perf.creux * 1000, 1) + " mm/s à " + nb(api, etat.perf.tc, 2) + " s après l'à-coup",
        retour: nb(api, etat.perf.tr, 2) + " s après l'à-coup",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-tour-curseurs",
    [{ id: "wc", libelle: "Pulsation de coupure visée ωc", min: 2, max: 16, pas: 1, valeur: etat.wc, unite: "rad/s" }],
    (v) => {
      etat.wc = v.wc;
      simuler();
      dessinerCourbes();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-tour-lecteur", {
    de: 0,
    a: P.tMax,
    duree: 9,
    boucle: true,
    auto: false,
    libelle: "Avancée de l'instant présent",
    rappel: (t) => {
      etat.t = t;
      if (etat.res) dessinerCourbes();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(P.tMax);
  }
  simuler();
  dessinerCourbes();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Budget de phase : poignée sur ωc, curseurs sur Te, calcul et variateur
   -------------------------------------------------------------------------- */

function construireBudget(racine, api) {
  const conteneur = racine.querySelector("#e-budget-vivant");
  if (!conteneur) return;
  const P = { x0: 60, x1: 660, rail: 62, yb: 158, hb: 46 };
  const XR = (lw) => P.x0 + ((P.x1 - P.x0) * lw) / 2;
  const XD = (deg) => P.x0 + ((P.x1 - P.x0) * deg) / 180;
  const etat = { lw: 1, Te: 0.005, delai: 1, thv: 0.01 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 330",
    role: "img",
    "aria-label": "Rail logarithmique de la pulsation de coupure de 1 à 100 radians par seconde avec une poignée, et barre de 180 degrés découpée entre l'intégrateur, le bloqueur, le calcul, le comptage, le variateur et la marge de phase",
  });
  const decor = svgEl("g");
  let d = "<defs>";
  d += '<pattern id="e-bu-ob" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 6L6 0" stroke="currentColor" stroke-width="1.2"/></pattern>';
  d += '<pattern id="e-bu-qu" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 0H6M0 0V6" stroke="currentColor" stroke-width="1"/></pattern>';
  d += '<pattern id="e-bu-pt" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="1.1" fill="currentColor"/></pattern>';
  d += '<pattern id="e-bu-ho" patternUnits="userSpaceOnUse" width="6" height="5"><path d="M0 2.5H6" stroke="currentColor" stroke-width="1.2"/></pattern>';
  d += "</defs>" + TRAITS + ' stroke-width="1.3">';
  d += '<path d="M' + P.x0 + " " + P.rail + "H" + P.x1 + '" stroke-dasharray="2 4"/>';
  let gr = "";
  for (const w of [1, 2, 5, 10, 20, 50, 100]) gr += "M" + XR(Math.log10(w)).toFixed(1) + " " + (P.rail - 6) + "v12";
  d += '<path d="' + gr + '"/>';
  d += '<rect x="' + P.x0 + '" y="' + P.yb + '" width="' + (P.x1 - P.x0) + '" height="' + P.hb + '" stroke-width="1.6"/>';
  d += '<path d="M' + XD(135).toFixed(1) + " " + (P.yb - 16) + "V" + (P.yb + P.hb + 10) + '" stroke-dasharray="6 4" stroke-width="1.6"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const w of [1, 2, 5, 10, 20, 50, 100]) d += texte(XR(Math.log10(w)), P.rail + 24, String(w), ' text-anchor="middle"');
  d += texte(P.x0, P.rail - 20, "pulsation de coupure ωc (rad/s), échelle logarithmique : déplacer la poignée");
  d += texte(XD(135), P.yb - 22, "marge de 45°", ' text-anchor="middle"');
  d += texte(P.x0, P.yb + P.hb + 22, "0°") + texte(P.x1, P.yb + P.hb + 22, "180°", ' text-anchor="end"');
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const motifs = [
    { id: "int", nom: "intégrateur", fill: "currentColor", opacity: "0.22" },
    { id: "bl", nom: "bloqueur", fill: "url(#e-bu-ob)", opacity: "1" },
    { id: "ca", nom: "calcul", fill: "url(#e-bu-qu)", opacity: "1" },
    { id: "co", nom: "comptage", fill: "url(#e-bu-pt)", opacity: "1" },
    { id: "va", nom: "variateur", fill: "url(#e-bu-ho)", opacity: "1" },
  ];
  const rects = motifs.map((m) => svgEl("rect", { y: P.yb, height: P.hb, fill: m.fill, "fill-opacity": m.opacity, stroke: "currentColor", "stroke-width": "1" }));
  const legende = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const pastilles = svgEl("g");
  const verdict = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12", "font-weight": "700" });
  svg.append(...rects, pastilles, legende, verdict);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  /* légende fixe : un échantillon de chaque motif et sa valeur */
  const xs = [60, 192, 318, 432, 560];
  pastilles.innerHTML = motifs
    .map(
      (m, i) =>
        '<rect x="' + xs[i] + '" y="246" width="18" height="14" fill="' + m.fill + '" fill-opacity="' + m.opacity + '" stroke="currentColor" stroke-width="1"/>'
    )
    .join("") +
    '<rect x="' + 60 + '" y="276" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/>';

  const valeurs = api.sim.valeurs("#e-budget-valeurs", [
    { id: "wc", libelle: "Pulsation de coupure", format: (v) => v },
    { id: "theta", libelle: "Retard total θ", format: (v) => v },
    { id: "perte", libelle: "Phase consommée par les retards", format: (v) => v },
    { id: "mp", libelle: "Marge de phase", format: (v) => v },
    { id: "mg", libelle: "Marge de gain et ω180", format: (v) => v },
    { id: "temax", libelle: "Te maximale pour 10° d'échantillonnage", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function recalculer() {
    const wc = 10 ** etat.lw;
    const parts = [90, (wc * etat.Te * DEG) / 2, wc * (etat.delai ? etat.Te : 0) * DEG, (wc * etat.Te * DEG) / 2, wc * etat.thv * DEG];
    let x = 0;
    parts.forEach((p, i) => {
      const debut = Math.min(180, x);
      const fin = Math.min(180, x + p);
      rects[i].setAttribute("x", XD(debut).toFixed(1));
      rects[i].setAttribute("width", Math.max(0, XD(fin) - XD(debut)).toFixed(1));
      x += p;
    });
    const perte = x - 90;
    const mp = 180 - x;
    const theta = retardTotal(etat.Te, etat.delai) - CV.thv + etat.thv;
    let lib = "";
    lib += texte(xs[0] + 24, 257, "intégrateur 90°");
    lib += texte(xs[1] + 24, 257, "bloqueur " + nb(api, parts[1], 2) + "°");
    lib += texte(xs[2] + 24, 257, "calcul " + nb(api, parts[2], 2) + "°");
    lib += texte(xs[3] + 24, 257, "comptage " + nb(api, parts[3], 2) + "°");
    lib += texte(xs[4] + 24, 257, "variateur " + nb(api, parts[4], 2) + "°");
    lib += texte(84, 287, "marge de phase restante, segment vide : " + nb(api, mp, 1) + "°");
    legende.innerHTML = lib;
    let v = "";
    if (mp <= 0) v = texte(P.x1, P.yb - 22, "marge négative : boucle instable", ' text-anchor="end"');
    else if (mp < 45) v = texte(P.x1, P.yb - 22, "marge sous 45° : réglage refusé", ' text-anchor="end"');
    verdict.innerHTML = v;
    if (valeurs) {
      const w180 = Math.PI / (2 * theta);
      valeurs.maj({
        wc: nb(api, wc, wc < 10 ? 2 : 1) + " rad/s",
        theta: nb(api, theta * 1000, 1) + " ms",
        perte: nb(api, perte, 2) + "°",
        mp: nb(api, mp, 1) + "°",
        mg: (theta > 0 ? nb(api, 20 * Math.log10(w180 / wc), 1) + " dB, ω180 = " + nb(api, w180, 1) + " rad/s" : "infinie"),
        temax: nb(api, (10 / DEG / (wc * (etat.delai ? 2 : 1))) * 1000, 2) + " ms",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: P.x0, y: P.rail },
    a: { x: P.x1, y: P.rail },
    min: 0,
    max: 2,
    pas: 0.01,
    valeur: etat.lw,
    libelle: "Pulsation de coupure, échelle logarithmique",
    format: (m) => "ωc = " + nb(api, 10 ** (typeof m === "number" ? m : m.valeur), 1) + " rad/s",
    rappel(m) {
      etat.lw = typeof m === "number" ? m : m.valeur;
      recalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-budget-curseurs",
    [
      { id: "Te", libelle: "Période d'échantillonnage Te", min: 1, max: 50, pas: 1, valeur: 5, unite: "ms" },
      { id: "delai", libelle: "Écriture de la commande", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v ? "au top suivant" : "dès la fin du calcul") },
      { id: "thv", libelle: "Retard du variateur et de la liaison θv", min: 0, max: 30, pas: 1, valeur: 10, unite: "ms" },
    ],
    (v) => {
      etat.Te = v.Te / 1000;
      etat.delai = v.delai;
      etat.thv = v.thv / 1000;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Choix du réglage : curseurs ωc, Ti et préfiltre
   -------------------------------------------------------------------------- */

function construireReglage(racine, api) {
  if (!racine.querySelector("#e-reglage-consigne")) return;
  const etat = { wc: 10, Ti: 0.8, pf: 0 };
  const base = { Te: 0.005, delai: 1, aw: true };
  const refC = simConvoyeur({ ...base, Kc: kcCompensation(10), Ti: 0.8, r: echelonConsigne, d: chargeFixe, tMax: 2 });
  const refD = simConvoyeur({ ...base, Kc: kcCompensation(10), Ti: 0.8, r: consigneFixe, d: acoupCharge, tMax: 3 });

  const valeurs = api.sim.valeurs("#e-reglage-valeurs", [
    { id: "kc", libelle: "Gain Kc et temps Ti", format: (v) => v },
    { id: "marges", libelle: "Marges de phase et de gain", format: (v) => v },
    { id: "cons", libelle: "Consigne : dépassement et t5", format: (v) => v },
    { id: "pert", libelle: "Perturbation : chute et retour", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const traceC = api.sim.traceur("#e-reglage-consigne", {
    titre: "Échelon de consigne de 20 mm/s",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "écart de vitesse",
    yUnite: "mm/s",
    xMin: 0,
    xMax: 2,
    yMin: -2,
    yMax: 28,
    ratio: 0.42,
    series: [
      { id: "ref", nom: "compensation, ωc = 10 rad/s", points: ecartMm(refC, 1.4) },
      { id: "choix", nom: "réglage choisi", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 20, "", [7, 5]);
      ligneH(c, r, couleurs, 21, "consigne et bande ± 5 %", [2, 4]);
      ligneH(c, r, couleurs, 19, "", [2, 4]);
    },
  });
  if (traceC) ressources.push(traceC);

  const traceD = api.sim.traceur("#e-reglage-charge", {
    titre: "À-coup de charge de 10 % du couple nominal",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "écart de vitesse",
    yUnite: "mm/s",
    xMin: 0,
    xMax: 3,
    yMin: -50,
    yMax: 15,
    ratio: 0.42,
    series: [
      { id: "ref", nom: "compensation, ωc = 10 rad/s", points: ecartMm(refD, 1.45) },
      { id: "choix", nom: "réglage choisi", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, -40, "chute admise 40 mm/s", [7, 5]);
      ligneH(c, r, couleurs, 5, "bande ± 5 mm/s", [2, 4]);
      ligneH(c, r, couleurs, -5, "", [2, 4]);
    },
  });
  if (traceD) ressources.push(traceD);

  function recalculer() {
    const Kc = kcCompensation(etat.wc);
    const o = { ...base, Kc, Ti: etat.Ti, prefiltre: Boolean(etat.pf) };
    const rc = simConvoyeur({ ...o, r: echelonConsigne, d: chargeFixe, tMax: 2 });
    const rd = simConvoyeur({ ...o, r: consigneFixe, d: acoupCharge, tMax: 3 });
    if (traceC) traceC.definirDonnees("choix", ecreter(ecartMm(rc, 1.4), -2, 28));
    if (traceD) traceD.definirDonnees("choix", ecreter(ecartMm(rd, 1.45), -50, 15));
    const pc = perfConsigne(rc, 0.2, 1.4, 1.42);
    const pd = perfCharge(rd, 0.2, 3, 1.45, 0.005);
    const m = marge(Kc, etat.Ti, retardTotal(0.005, 1));
    if (valeurs) {
      valeurs.maj({
        kc: nb(api, Kc, 1) + " %/(m/s), Ti = " + nb(api, etat.Ti, 2) + " s" + (etat.pf ? ", préfiltre actif" : ""),
        marges: nb(api, m.MP, 1) + "°, " + nb(api, m.gm, 1) + " dB",
        cons: (pc.D < 0.05 ? "aucun" : nb(api, pc.D, 1) + " %") + ", t5 = " + (pc.t5 >= 1.79 ? "au-delà de 1,8 s" : nb(api, pc.t5, 2) + " s"),
        pert: nb(api, pd.creux * 1000, 1) + " mm/s, retour en " + (pd.tr >= 2.79 ? "au-delà de 2,8 s" : nb(api, pd.tr, 2) + " s"),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-reglage-curseurs",
    [
      { id: "wc", libelle: "Pulsation visée ωc, qui fixe Kc", min: 4, max: 16, pas: 0.5, valeur: etat.wc, unite: "rad/s" },
      { id: "Ti", libelle: "Temps d'action intégrale Ti", min: 0.2, max: 1.2, pas: 0.05, valeur: etat.Ti, unite: "s", chiffres: 2 },
      { id: "pf", libelle: "Préfiltre de consigne 1/(1 + Ti s)", min: 0, max: 1, pas: 1, valeur: etat.pf, format: (v) => (v ? "actif" : "inactif") },
    ],
    (v) => {
      etat.wc = v.wc;
      etat.Ti = v.Ti;
      etat.pf = v.pf;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   H. Réponses des deux réglages successifs
   -------------------------------------------------------------------------- */

function construireExemple(racine, api) {
  if (!racine.querySelector("#h-consigne")) return;
  const r1 = { Kc: kcCompensation(4), Ti: 0.8, Te: 0.02, delai: 1, aw: true };
  const r2 = { Kc: kcCompensation(10), Ti: 0.8, Te: 0.005, delai: 1, aw: true };
  const c1 = simConvoyeur({ ...r1, r: echelonConsigne, d: chargeFixe, tMax: 2 });
  const c2 = simConvoyeur({ ...r2, r: echelonConsigne, d: chargeFixe, tMax: 2 });
  const d1 = simConvoyeur({ ...r1, r: consigneFixe, d: acoupCharge, tMax: 4 });
  const d2 = simConvoyeur({ ...r2, r: consigneFixe, d: acoupCharge, tMax: 4 });
  const noms = ["ωc = 4 rad/s, Te = 20 ms", "ωc = 10 rad/s, Te = 5 ms"];

  const tc = api.sim.traceur("#h-consigne", {
    titre: "Échelon de consigne de 20 mm/s",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "écart de vitesse",
    yUnite: "mm/s",
    xMin: 0,
    xMax: 2,
    yMin: -2,
    yMax: 25,
    ratio: 0.42,
    series: [
      { id: "a", nom: noms[0], points: ecartMm(c1, 1.4) },
      { id: "b", nom: noms[1], points: ecartMm(c2, 1.4) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 20, "", [7, 5]);
      ligneH(c, r, couleurs, 21, "consigne et bande ± 5 %", [2, 4]);
      ligneH(c, r, couleurs, 19, "", [2, 4]);
    },
  });
  if (tc) ressources.push(tc);

  const td = api.sim.traceur("#h-charge", {
    titre: "À-coup de charge de 10 %",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "écart de vitesse",
    yUnite: "mm/s",
    xMin: 0,
    xMax: 4,
    yMin: -80,
    yMax: 15,
    ratio: 0.42,
    series: [
      { id: "a", nom: noms[0], points: ecartMm(d1, 1.45) },
      { id: "b", nom: noms[1], points: ecartMm(d2, 1.45) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, -40, "chute admise 40 mm/s", [7, 5]);
      ligneH(c, r, couleurs, 5, "bande ± 5 mm/s", [2, 4]);
      ligneH(c, r, couleurs, -5, "", [2, 4]);
    },
  });
  if (td) ressources.push(td);
}

/* --------------------------------------------------------------------------
   I. Saturation de couple et anti-emballement
   -------------------------------------------------------------------------- */

function construireSaturation(racine, api) {
  if (!racine.querySelector("#i-saturation-vitesse")) return;
  const tMax = 12;
  const etat = { dp: 70, Te: 0.005, delai: 1 };

  const valeurs = api.sim.valeurs("#i-saturation-valeurs", [
    { id: "seuil", libelle: "Charge de début de saturation", format: (v) => v },
    { id: "vsat", libelle: "Vitesse minimale pendant l'accumulation", format: (v) => v },
    { id: "ucal", libelle: "Commande calculée maximale, sans et avec recalcul", format: (v) => v },
    { id: "surv", libelle: "Dépassement après la fin, sans et avec recalcul", format: (v) => v },
    { id: "retour", libelle: "Retour dans ± 5 mm/s, sans et avec recalcul", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const tv = api.sim.traceur("#i-saturation-vitesse", {
    titre: "Vitesse de la bande",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "vitesse",
    yUnite: "m/s",
    xMin: 0,
    xMax: tMax,
    yMin: 0,
    yMax: 3,
    ratio: 0.42,
    series: [
      { id: "sans", nom: "sans anti-emballement", points: [] },
      { id: "avec", nom: "avec recalcul, Tt = 0,4 s", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1.45, "consigne 1,45 m/s", [7, 5]);
      ligneV(c, r, couleurs, 1, [2, 4]);
      ligneV(c, r, couleurs, 5, [2, 4]);
    },
  });
  if (tv) ressources.push(tv);

  const tu = api.sim.traceur("#i-saturation-couple", {
    titre: "Couple appliqué et couple calculé",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "couple",
    yUnite: "%",
    xMin: 0,
    xMax: tMax,
    yMin: -20,
    yMax: 300,
    ratio: 0.42,
    series: [
      { id: "us", nom: "appliqué, sans recalcul", points: [] },
      { id: "cs", nom: "calculé, sans recalcul", points: [] },
      { id: "ua", nom: "appliqué, avec recalcul", points: [] },
      { id: "ca", nom: "calculé, avec recalcul", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 100, "limite 100 %", [7, 5]);
    },
  });
  if (tu) ressources.push(tu);

  function recalculer() {
    const d = (t) => (t >= 1 && t < 5 ? etat.dp : 10);
    const o = { Kc: kcCompensation(10), Ti: 0.8, Te: etat.Te, delai: etat.delai, Tt: 0.4, r: consigneFixe, d, tMax };
    const sans = simConvoyeur({ ...o, aw: false });
    const avec = simConvoyeur({ ...o, aw: true });
    const pts = (res, cle) => res.ts.map((t, i) => [t, res[cle][i]]);
    if (tv) {
      tv.definirDonnees("sans", ecreter(pts(sans, "vs"), 0, 3));
      tv.definirDonnees("avec", ecreter(pts(avec, "vs"), 0, 3));
    }
    if (tu) {
      tu.definirDonnees("us", pts(sans, "us"));
      tu.definirDonnees("cs", ecreter(pts(sans, "ucs"), -20, 300));
      tu.definirDonnees("ua", pts(avec, "us"));
      tu.definirDonnees("ca", ecreter(pts(avec, "ucs"), -20, 300));
    }
    const bilan = (res) => {
      let vmin = Infinity;
      let vmax = -Infinity;
      let tr = 0;
      let ucmax = -Infinity;
      for (let i = 0; i < res.ts.length; i += 1) {
        const t = res.ts[i];
        if (t >= 1 && t < 5) {
          vmin = Math.min(vmin, res.vs[i]);
          ucmax = Math.max(ucmax, res.ucs[i]);
        }
        if (t >= 5) {
          vmax = Math.max(vmax, res.vs[i]);
          if (Math.abs(res.vs[i] - 1.45) > 0.005) tr = t - 5;
        }
      }
      return { vmin, surv: Math.max(0, vmax - 1.45), tr, ucmax };
    };
    const bs = bilan(sans);
    const ba = bilan(avec);
    const fin = (x) => (x >= tMax - 5 - 0.02 ? "plus de 7 s" : nb(api, x, 2) + " s");
    if (valeurs) {
      valeurs.maj({
        seuil: nb(api, 100 - 1.45 / CV.K, 1) + " % ; charge choisie " + nb(api, etat.dp, 0) + " %",
        vsat: nb(api, ba.vmin, 3) + " m/s (équilibre saturé " + nb(api, Math.min(1.45, CV.K * (100 - etat.dp)), 3) + " m/s)",
        ucal: nb(api, bs.ucmax, 1) + " % et " + nb(api, ba.ucmax, 1) + " %",
        surv: nb(api, bs.surv * 1000, 1) + " mm/s et " + nb(api, ba.surv * 1000, 1) + " mm/s",
        retour: fin(bs.tr) + " et " + fin(ba.tr),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-saturation-curseurs",
    [
      { id: "dp", libelle: "Couple résistant pendant l'accumulation", min: 20, max: 90, pas: 5, valeur: etat.dp, unite: "%" },
      { id: "Te", libelle: "Période d'échantillonnage Te", min: 2, max: 50, pas: 1, valeur: 5, unite: "ms" },
      { id: "delai", libelle: "Écriture de la commande", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v ? "au top suivant" : "dès la fin du calcul") },
    ],
    (v) => {
      etat.dp = v.dp;
      etat.Te = v.Te / 1000;
      etat.delai = v.delai;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

/** Chute de vitesse d'une boucle compensée continue après un échelon de charge. */
function chuteAnalytique(t, wc, Kd0 = CV.K * 10, tm = CV.tm) {
  if (t <= 0) return 0;
  return (-Kd0 / (tm * (wc - 1 / tm))) * (Math.exp(-t / tm) - Math.exp(-wc * t));
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-compensation",
      titre: "Réglage par compensation d'un agitateur",
      niveau: "fondamental",
      enonce:
        "<p>Un agitateur entraîné en couple a pour modèle $G(s) = 0{,}5/(1 + 1{,}5\\,s)$, en (tr/min)/%. On veut une boucle fermée équivalente à un premier ordre de constante de temps $0{,}2\\ \\mathrm{s}$, par un PI qui compense la constante de temps. Quel gain $K_c$ faut-il, en %/(tr/min) ?</p>",
      valeur: 15,
      unite: "%/(tr/min)",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Gain Kc",
      etapes: [
        { texte: "Compensation : $T_i = \\tau_m = 1{,}5\\ \\mathrm{s}$, d'où $CG = K_cK/(\\tau_m s) = \\omega_c/s$." },
        { texte: "Constante de temps visée $1/\\omega_c = 0{,}2\\ \\mathrm{s}$ : $\\omega_c = 5\\ \\mathrm{rad/s}$." },
        { texte: "$K_c = \\tau_m\\omega_c/K = 1{,}5 \\times 5/0{,}5 = 15\\ \\%/(\\mathrm{tr/min})$.", note: "Temps d'établissement attendu : $3/\\omega_c = 0{,}6\\ \\mathrm{s}$, contre $4{,}5\\ \\mathrm{s}$ en boucle ouverte." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse relative à un échelon : boucle ouverte et boucle fermée",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "réponse relative",
          yUnite: "",
          xMin: 0,
          xMax: 5,
          yMin: 0,
          yMax: 1.1,
          series: [
            { id: "bo", nom: "boucle ouverte, τ = 1,5 s", fonction: (t) => 1 - Math.exp(-t / 1.5) },
            { id: "bf", nom: "boucle fermée, 1/ωc = 0,2 s", fonction: (t) => 1 - Math.exp(-t / 0.2) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.95, "95 %", [3, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-codeur",
      titre: "Résolution d'une mesure de vitesse par comptage",
      niveau: "fondamental",
      enonce:
        "<p>Un codeur de $500$ points, lu en quadrature avec comptage des quatre fronts, équipe un moteur. La vitesse est calculée en comptant les fronts pendant $10\\ \\mathrm{ms}$. Quelle est la résolution de cette mesure, en tr/min ?</p>",
      valeur: 3,
      unite: "tr/min",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Résolution",
      etapes: [
        { texte: "Fronts par tour : $4 \\times 500 = 2000$." },
        { texte: "Un front par période vaut $1/2000$ de tour en $0{,}01\\ \\mathrm{s}$, soit $0{,}05\\ \\mathrm{tr/s}$." },
        { texte: "$0{,}05 \\times 60 = 3\\ \\mathrm{tr/min}$.", note: "À $1500\\ \\mathrm{tr/min}$, la mesure contient $500$ fronts : résolution de $0{,}2\\ \\%$. Doubler la période divise la résolution par deux, mais ajoute $5\\ \\mathrm{ms}$ de retard." },
      ],
      visuelCorrection: correctionEtapes(
        ["fronts par tour : 4 × 500 = 2000", "un front en 10 ms : 1/2000 tr / 0,01 s = 0,05 tr/s", "résolution : 0,05 × 60 = 3 tr/min"],
        "Résolution d'une vitesse obtenue par comptage."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-periode",
      titre: "Période maximale pour un budget de phase",
      niveau: "intermédiaire",
      enonce:
        "<p>Une boucle de vitesse vise $\\omega_c = 10\\ \\mathrm{rad/s}$. La vitesse est mesurée par comptage sur une période, la commande est écrite au top suivant, et l'on réserve $8^\\circ$ aux effets de l'échantillonnage. Quelle période maximale peut-on retenir, en millisecondes ?</p>",
      valeur: (8 / DEG / 20) * 1000,
      unite: "ms",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Période maximale",
      etapes: [
        { texte: "Retards liés à l'échantillonnage : bloqueur $T_e/2$, calcul $T_e$, comptage $T_e/2$, soit $2T_e$." },
        { texte: "Condition : $2\\,\\omega_cT_e \\le 8^\\circ = 0{,}1396\\ \\mathrm{rad}$." },
        { texte: "$T_e \\le 0{,}1396/20 = 6{,}98\\ \\mathrm{ms}$ : on retiendrait $5\\ \\mathrm{ms}$.", note: "Sans le comptage, on aurait trouvé $9{,}31\\ \\mathrm{ms}$ et retenu à tort $10\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Phase consommée par l'échantillonnage à ωc = 10 rad/s",
          xTitre: "période",
          xUnite: "ms",
          yTitre: "phase",
          yUnite: "°",
          xMin: 0,
          xMax: 15,
          yMin: 0,
          yMax: 18,
          series: [
            { id: "a", nom: "avec comptage : 2 ωc Te", fonction: (te) => 2 * 10 * te * 1e-3 * DEG },
            { id: "b", nom: "sans comptage : 1,5 ωc Te", fonction: (te) => 1.5 * 10 * te * 1e-3 * DEG },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 8, "budget de 8°", [6, 4]);
            ligneV(c, r, couleurs, 6.98, [3, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-chute",
      titre: "Chute de vitesse après un à-coup de charge",
      niveau: "intermédiaire",
      enonce:
        "<p>Le convoyeur du cours, $K = 0{,}0375\\ \\mathrm{(m/s)/\\%}$ et $\\tau_m = 0{,}8\\ \\mathrm{s}$, est régulé par un PI qui compense $\\tau_m$, avec $\\omega_c = 6\\ \\mathrm{rad/s}$ ; on néglige les retards. Un à-coup de charge de $10\\ \\%$ survient. Quelle est la chute maximale de vitesse, en mm/s ?</p>",
      valeur: 51.70,
      unite: "mm/s",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Chute maximale",
      etapes: [
        { texte: "$Kd_0/\\tau_m = 0{,}375/0{,}8 = 0{,}469\\ \\mathrm{m/s^2}$ ; $\\omega_c - 1/\\tau_m = 6 - 1{,}25 = 4{,}75\\ \\mathrm{s^{-1}}$." },
        { texte: "Instant du creux : $t^\\ast = \\ln(6 \\times 0{,}8)/4{,}75 = 1{,}569/4{,}75 = 0{,}330\\ \\mathrm{s}$." },
        { texte: "$|\\Delta v| = (0{,}469/4{,}75)\\bigl(e^{-0{,}413} - e^{-1{,}981}\\bigr) = 0{,}0987 \\times 0{,}524 = 51{,}7\\ \\mathrm{mm/s}$.", note: "Le critère de $40\\ \\mathrm{mm/s}$ n'est pas tenu : il faut au moins $8{,}4\\ \\mathrm{rad/s}$ sans retard." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Chute de vitesse calculée pour trois pulsations",
          xTitre: "temps après l'à-coup",
          xUnite: "s",
          yTitre: "écart de vitesse",
          yUnite: "mm/s",
          xMin: 0,
          xMax: 3,
          yMin: -75,
          yMax: 5,
          series: [
            { id: "a", nom: "ωc = 4 rad/s", fonction: (t) => chuteAnalytique(t, 4) * 1000 },
            { id: "b", nom: "ωc = 6 rad/s", fonction: (t) => chuteAnalytique(t, 6) * 1000 },
            { id: "c", nom: "ωc = 10 rad/s", fonction: (t) => chuteAnalytique(t, 10) * 1000 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -40, "chute admise 40 mm/s", [6, 4]);
            ligneH(c, r, couleurs, -51.7, "51,7 mm/s", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-temperature",
      titre: "Mini-projet : régulation de température d'un bac de lavage",
      niveau: "avancé",
      enonce:
        "<p>Un bac de lavage est chauffé par des résistances commandées par un gradateur à train d'ondes. Essai indiciel : gain $K = 0{,}5\\ \\mathrm{K/\\%}$, constante de temps $\\tau = 900\\ \\mathrm{s}$, retard $\\theta = 60\\ \\mathrm{s}$, dû au transport de l'eau jusqu'à la sonde. On règle un PI par la méthode lambda, $T_i = \\tau$ et $K_c = \\tau/\\bigl(K(\\lambda + \\theta)\\bigr)$, avec $\\lambda = 3\\theta$. Calculez $K_c$, la pulsation de coupure, puis la marge de phase, en degrés.</p>",
      valeur: 90 - 0.25 * DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Marge de phase",
      etapes: [
        { texte: "$\\lambda = 180\\ \\mathrm{s}$ ; $K_c = 900/(0{,}5 \\times 240) = 7{,}5\\ \\%/\\mathrm{K}$, $T_i = 900\\ \\mathrm{s}$." },
        { texte: "Boucle ouverte : $L(s) = \\dfrac{K_cK}{\\tau s}e^{-\\theta s} = \\dfrac{e^{-60s}}{240\\,s}$ ; $|L| = 1$ pour $\\omega_c = 1/240 = 4{,}17 \\times 10^{-3}\\ \\mathrm{rad/s}$." },
        { texte: "$M_\\varphi = 90^\\circ - \\omega_c\\theta = 90^\\circ - 0{,}25\\ \\mathrm{rad} = 90 - 14{,}32 = 75{,}7^\\circ$." },
        { texte: "Période : budget de $5^\\circ$, sortie au top suivant, $1{,}5\\,\\omega_cT_e \\le 0{,}0873$, d'où $T_e \\le 14\\ \\mathrm{s}$ ; le train d'ondes du gradateur, de l'ordre de la seconde, doit rester bien plus court que $T_e$.", note: "Réponse de consigne : $e^{-\\theta s}/(1 + \\lambda s)$, établie à $5\\ \\%$ en $\\theta + \\lambda\\ln 20 = 599\\ \\mathrm{s}$, sans dépassement." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse de consigne attendue du bac, échelon de 5 K",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "écart de température",
          yUnite: "K",
          xMin: 0,
          xMax: 1000,
          yMin: 0,
          yMax: 5.6,
          series: [{ id: "y", nom: "retard 60 s puis premier ordre λ = 180 s", fonction: (t) => (t < 60 ? 0 : 5 * (1 - Math.exp(-(t - 60) / 180))) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 4.75, "95 %", [3, 4]);
            ligneV(c, r, couleurs, 599, [6, 4]);
            ligneV(c, r, couleurs, 60, [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-tache",
      titre: "Convoyeur dégradé après une migration d'automate",
      niveau: "diagnostic",
      enonce:
        "<p>Après une migration du programme, la boucle de vitesse du convoyeur, inchangée par ailleurs ($K_c = 213{,}3\\ \\%/(\\mathrm{m/s})$, $T_i = 0{,}8\\ \\mathrm{s}$), tourne dans une tâche de $20\\ \\mathrm{ms}$ au lieu de $5\\ \\mathrm{ms}$. On observe un dépassement d'environ $4\\ \\%$ sur les échelons de consigne et une chute de vitesse de $42\\ \\mathrm{mm/s}$ aux à-coups de charge, au lieu de $36$. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Le retard total passe de 20 à 50 ms : la marge de phase tombe de 78,5° à environ 61°, d'où le dépassement.", juste: true },
        { texte: "La chute de 42 mm/s dépasse la limite de 40 mm/s : le cahier des charges n'est plus tenu.", juste: true },
        { texte: "Le codeur est défaillant, puisque la mesure est moins précise." },
        { texte: "Augmenter Kc compenserait la perte de rapidité sans inconvénient." },
      ],
      etapes: [
        { texte: "$\\theta = 2 \\times 20 + 10 = 50\\ \\mathrm{ms}$ ; perte $10 \\times 0{,}05 = 0{,}5\\ \\mathrm{rad} = 28{,}6^\\circ$ : marge voisine de $61^\\circ$, marge de gain $9{,}9\\ \\mathrm{dB}$." },
        { texte: "Moins de marge : boucle moins amortie, d'où le dépassement ; retard plus long avant la réaction, d'où la chute plus forte." },
        { texte: "Remède : revenir à la tâche de $5\\ \\mathrm{ms}$. Augmenter $K_c$ réduirait encore la marge ; la mesure à $20\\ \\mathrm{ms}$ est au contraire plus résolue.", note: "Le symptôme suit le changement de période, pas un défaut matériel." },
      ],
      visuelCorrection(conteneur, moteur) {
        const o = { Kc: kcCompensation(10), Ti: 0.8, delai: 1, aw: true, r: consigneFixe, d: acoupCharge, tMax: 3 };
        const a = simConvoyeur({ ...o, Te: 0.005 });
        const b = simConvoyeur({ ...o, Te: 0.02 });
        traceCorrection(moteur, conteneur, {
          titre: "À-coup de charge de 10 % : tâche de 5 ms et tâche de 20 ms",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "écart de vitesse",
          yUnite: "mm/s",
          xMin: 0,
          xMax: 3,
          yMin: -50,
          yMax: 10,
          series: [
            { id: "a", nom: "Te = 5 ms", points: ecartMm(a, 1.45) },
            { id: "b", nom: "Te = 20 ms", points: ecartMm(b, 1.45) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -40, "chute admise 40 mm/s", [6, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-pole-compense",
      titre: "Pourquoi le retour reste lent ?",
      niveau: "conceptuel",
      enonce:
        "<p>Le PI du convoyeur compense la constante de temps $\\tau_m = 0{,}8\\ \\mathrm{s}$ : la réponse à la consigne est un premier ordre rapide de constante de temps $0{,}1\\ \\mathrm{s}$. Expliquez sans calcul pourquoi, après un à-coup de charge, la vitesse revient pourtant à la consigne avec une constante de temps voisine de $0{,}8\\ \\mathrm{s}$.</p>",
      motsCles: [
        ["pole", "constante de temps", "tau", "lent"],
        ["compens", "simplifi", "annul", "zero"],
        ["perturbation", "charge", "couple"],
        ["consigne", "transfert", "chemin", "entree"],
      ],
      minimum: 3,
      exemple: "Deux ou trois phrases : dites où le pôle lent disparaît, et où il reste.",
      etapes: [
        { texte: "Le zéro du PI annule le pôle lent du procédé dans le produit $CG$, donc dans le transfert de consigne." },
        { texte: "La charge entre directement dans le procédé, avant ce produit : son transfert contient encore $1/(1 + \\tau_m s)$." },
        { texte: "Après le creux, c'est ce mode lent qui subsiste : retour en $e^{-t/\\tau_m}$.", note: "Pour l'accélérer, il faut $T_i &lt; \\tau_m$, au prix d'un dépassement de consigne que l'on corrige par un préfiltre." },
      ],
      visuelCorrection: correctionEtapes(
        ["consigne : V/R = ωc / (s + ωc), pôle lent compensé", "charge : V/D = -K s / ((1 + τm s)(s + ωc))", "le pôle -1/τm reste : retour en exp(-t / τm)"],
        "Le pôle compensé ne disparaît que du transfert de consigne."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const BLOCS_QUIZ = [
  { x: 40, nom: "régulateur", sous: "PI" },
  { x: 190, nom: "variateur", sous: "couple" },
  { x: 340, nom: "convoyeur", sous: "K, τm" },
  { x: 490, nom: "codeur", sous: "comptage" },
];

function dessinBoucleQuiz(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.5">';
  for (const b of BLOCS_QUIZ) s += '<rect x="' + b.x + '" y="70" width="110" height="56" rx="8"/>';
  s += '<path d="M150 98H186" marker-end="url(#' + id + ')"/><path d="M300 98H336" marker-end="url(#' + id + ')"/><path d="M450 98H486" marker-end="url(#' + id + ')"/>';
  s += '<path d="M545 126V180H95V130" marker-end="url(#' + id + ')"/>';
  s += '<path d="M395 30V66" marker-end="url(#' + id + ')"/>';
  s += "</g>" + ECRITS;
  for (const b of BLOCS_QUIZ) s += texte(b.x + 55, 96, b.nom, ' text-anchor="middle"') + texte(b.x + 55, 114, b.sous, ' text-anchor="middle" font-size="10"');
  s += texte(395, 24, "charge d", ' text-anchor="middle"') + texte(320, 196, "vitesse mesurée vm", ' text-anchor="middle"');
  s += texte(168, 90, "u", ' text-anchor="middle"') + texte(318, 90, "Cm", ' text-anchor="middle"') + texte(468, 90, "v", ' text-anchor="middle"');
  s += "</g>";
  return s;
}

function zonesBoucleQuiz() {
  return BLOCS_QUIZ.map((b) => ({ x: b.x, y: 70, largeur: 110, hauteur: 56, etiquette: b.nom, juste: b.nom === "variateur" }));
}

const VISUELS_QUIZ = [
  etapes(["boucle compensée : V/R = ωc / (s + ωc)", "premier ordre de constante 1/ωc", "t5 = ln 20 / ωc ≈ 3 / ωc"], "Temps d'établissement d'une boucle compensée."),
  etapes(["vm = (x(k) - x(k-1)) / Te", "moyenne de v sur la dernière période", "vitesse du milieu de l'intervalle : retard Te/2"], "Retard d'une mesure par comptage."),
  etapes(["Kc = τm ωc / K", "= 0,5 × 5 / 0,02", "= 125"], "Gain du PI par compensation."),
  etapes(["couple limité à 100 % : u appliqué ≠ u calculé", "l'intégrale continue d'accumuler l'écart", "recalcul : x ← x + (Te/Tt)(us - uc)"], "Rôle de l'anti-emballement."),
  etapes(["Mφ = 90° - ωc θ", "ωc θ = 10 × 0,02 = 0,2 rad = 11,46°", "Mφ = 78,54°"], "Marge de phase d'une boucle compensée avec retard."),
  () => ({ viewBox: "0 0 640 210", dessin: dessinBoucleQuiz("fl-qv5"), legende: "La limite de couple est un paramètre du variateur : c'est elle qui sépare la commande calculée de la commande appliquée." }),
  etapes(["θ : 2 × 5 + 10 = 20 ms → 2 × 20 + 10 = 50 ms", "perte : 11,5° → 28,6°", "marge : 78,5° → 61,4°"], "Effet de la période sur la marge."),
  etapes(["u = r/K + PI", "E = R τm s / ((1 + τm s)(1 + L))", "rampe : erreur finale nulle tant que u ne sature pas"], "Anticipation statique et rampe."),
  etapes(["boucle de classe un : e = a / ωc", "= 0,5 / 5", "= 0,1 m/s"], "Traînage en rampe."),
  etapes(["q = 60 / (4096 Te) en tr/min", "q ≤ 0,5 ⇒ Te ≥ 60 / (4096 × 0,5)", "Te ≥ 29,3 ms"], "Borne basse de la période."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Une boucle de vitesse est réglée par compensation, sans retard notable. Quel est son temps d'établissement à $5\\ \\%$ sur un échelon de consigne ?</p>",
        options: ["$1/\\omega_c$", "$3/\\omega_c$", "$\\pi/\\omega_c$", "$3\\tau_m$"],
        bonnes: [1],
        explication: "La boucle fermée vaut $\\omega_c/(s + \\omega_c)$ : premier ordre de constante de temps $1/\\omega_c$, établi en $\\ln 20/\\omega_c \\approx 3/\\omega_c$. Le terme $3\\tau_m$ concerne le retour après une perturbation.",
        resume: "Consigne et ωc",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Mesurer une vitesse en comptant les fronts d'un codeur pendant chaque période ajoute un retard moyen d'une demi-période.</p>",
        reponse: true,
        explication: "Le comptage fournit la vitesse moyenne sur la dernière période, c'est-à-dire la vitesse du milieu de l'intervalle : $T_e/2$ de retard, à ajouter au bloqueur et au calcul.",
        resume: "Retard du comptage",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Procédé $K/(1 + \\tau_ms)$ avec $K = 0{,}02$ et $\\tau_m = 0{,}5\\ \\mathrm{s}$ ; on vise $\\omega_c = 5\\ \\mathrm{rad/s}$ par compensation. Valeur de $K_c$ ?</p>",
        valeur: 125,
        unite: "",
        tolerance: 0.005,
        explication: "$K_c = \\tau_m\\omega_c/K = 0{,}5 \\times 5/0{,}02 = 125$, avec $T_i = 0{,}5\\ \\mathrm{s}$.",
        resume: "Réglage par compensation",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi faut-il un anti-emballement quand le couple du variateur est limité à $100\\ \\%$ ?</p>",
        motsCles: [["integr", "etat"], ["satur", "limit", "borne", "butee"], ["accumul", "croit", "emball", "augment", "grimpe"], ["depasse", "survitesse", "retour", "lent"]],
        minimum: 2,
        explication: "En saturation, la commande appliquée ne suit plus la commande calculée, mais l'intégrale continue d'accumuler l'écart ; au retour, elle doit se vider, d'où un long maintien au couple maximal et une survitesse. Le recalcul la ramène vers la commande réellement appliquée.",
        resume: "Anti-emballement",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Boucle compensée, $\\omega_c = 10\\ \\mathrm{rad/s}$, retard total $\\theta = 20\\ \\mathrm{ms}$. Marge de phase, en degrés ?</p>",
        valeur: 90 - 0.2 * DEG,
        unite: "°",
        tolerance: 0.005,
        explication: "$M_\\varphi = 90^\\circ - \\omega_c\\theta = 90^\\circ - 0{,}2\\ \\mathrm{rad} = 90 - 11{,}46 = 78{,}54^\\circ$.",
        resume: "Marge et retard",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Voici les quatre maillons de la boucle du convoyeur. Lequel impose la limite qui rend l'anti-emballement nécessaire ?</p>",
        consigne: "Cliquez sur le maillon correspondant.",
        viewBox: "0 0 640 210",
        dessin: dessinBoucleQuiz("fl-q5"),
        zones: zonesBoucleQuiz(),
        explication: "Le variateur borne le couple à $\\pm 100\\ \\%$ de $C_n$ : au-delà, la commande calculée par le régulateur n'est plus appliquée. Ni le codeur ni le convoyeur n'imposent de borne à la commande.",
        resume: "Lecture du schéma bloc",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>La boucle du convoyeur ($\\omega_c = 10\\ \\mathrm{rad/s}$, sortie au top suivant, comptage, variateur de $10\\ \\mathrm{ms}$) passe d'une tâche de $5$ à $20\\ \\mathrm{ms}$. Que devient sa marge de phase ?</p>",
        options: ["Elle reste à $78{,}5^\\circ$", "Elle tombe à environ $61^\\circ$", "Elle tombe à environ $45^\\circ$", "Elle devient négative"],
        bonnes: [1],
        explication: "$\\theta$ passe de $20$ à $2 \\times 20 + 10 = 50\\ \\mathrm{ms}$ ; perte $0{,}5\\ \\mathrm{rad} = 28{,}6^\\circ$ ; marge $61{,}4^\\circ$.",
        resume: "Période et marge",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Ajouter à la sortie du PI une anticipation statique $r/K$ annule le traînage en rampe, tant que la commande ne sature pas.</p>",
        reponse: true,
        explication: "Avec $u = r/K + C(r - v)$, l'écart vaut $E = R\\,\\tau_ms/\\bigl((1 + \\tau_ms)(1 + L)\\bigr)$, dont la valeur finale est nulle pour une rampe. L'intégrale fournit alors le couple d'accélération et se vide à la fin de la rampe : léger dépassement, que supprime l'anticipation d'accélération.",
        resume: "Anticipation",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une boucle compensée de pulsation $\\omega_c = 5\\ \\mathrm{rad/s}$, sans anticipation, suit une rampe de consigne de $0{,}5\\ \\mathrm{m/s^2}$. Traînage en régime de rampe, en m/s ?</p>",
        valeur: 0.1,
        unite: "m/s",
        tolerance: 0.005,
        explication: "Boucle de classe un, $L = \\omega_c/s$ : $e = a/\\omega_c = 0{,}5/5 = 0{,}1\\ \\mathrm{m/s}$.",
        resume: "Traînage",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Un codeur donne $4096$ fronts par tour. On veut une résolution de vitesse de $0{,}5\\ \\mathrm{tr/min}$ par simple comptage. Période minimale, en millisecondes ?</p>",
        valeur: (60 / (4096 * 0.5)) * 1000,
        unite: "ms",
        tolerance: 0.01,
        explication: "Un front par période vaut $60/(4096\\,T_e)$ tr/min ; $\\le 0{,}5$ impose $T_e \\ge 60/2048 = 29{,}3\\ \\mathrm{ms}$.",
        resume: "Résolution et période",
      },
    ],
    { titre: "Quiz : dix questions mélangées" }
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
      { categorie: "Démarche", question: "Dans quel ordre conçoit-on une régulation ?", reponse: "Modèle, cahier des charges, pulsation de coupure, budget de phase, période, réglage, robustesse, grands signaux, implantation ; retour en arrière si une contrainte d'aval l'impose." },
      { categorie: "Modèle", question: "D'où vient la constante de temps d'un convoyeur entraîné en couple ?", reponse: "$\\tau_m = J/f$ : inertie ramenée divisée par la pente du frottement. Sans frottement, le procédé devient un intégrateur." },
      { categorie: "Consigne", question: "Quelle pulsation pour un $t_5$ donné, en boucle compensée ?", reponse: "$\\omega_c \\approx 3/t_5$, puisque la boucle fermée est un premier ordre de constante $1/\\omega_c$." },
      { categorie: "Perturbation", question: "Comment estimer la chute de vitesse due à un à-coup de charge ?", reponse: "$|\\Delta v|_{\\max} \\lesssim Kd_0/(\\tau_m\\omega_c)$ : décélération initiale multipliée par le temps de réaction $1/\\omega_c$ ; valeur exacte par $\\Delta v(t)$." },
      { categorie: "Compensation", question: "Pourquoi le retour après une perturbation reste-t-il lent ?", reponse: "Le pôle $-1/\\tau_m$ est compensé dans le transfert de consigne seulement ; il reste dans le transfert de perturbation : retour en $e^{-t/\\tau_m}$." },
      { categorie: "Budget", question: "Quels retards compte-t-on dans une boucle numérique de vitesse ?", reponse: "Bloqueur $T_e/2$, calcul $0$ ou $T_e$, comptage $T_e/2$, variateur et liaison $\\theta_v$ ; $M_\\varphi = 90^\\circ - \\omega_c\\theta$." },
      { categorie: "Période", question: "Quelles sont les deux bornes de la période ?", reponse: "En haut, le budget de phase : $T_e \\le \\Delta\\varphi_{\\max}/(2\\omega_c)$ ; en bas, la résolution : $T_e \\ge \\Delta x/q_{v,\\max}$." },
      { categorie: "Deux degrés", question: "À quoi sert un préfiltre de consigne ?", reponse: "À régler la boucle pour la perturbation, avec $T_i &lt; \\tau_m$, puis à supprimer le dépassement de consigne dû au zéro non compensé, sans toucher au rejet." },
      { categorie: "Saturation", question: "Que se passe-t-il sans anti-emballement après une saturation de couple ?", reponse: "La commande calculée grimpe très au-delà de la limite ; au retour, le moteur reste au couple maximal jusqu'à ce que l'intégrale se vide : survitesse et long retour." },
      { categorie: "Rampe", question: "Que vaut le traînage en rampe et comment le supprimer ?", reponse: "$a/\\omega_c$ pour une boucle de classe un ; anticipation $r/K + \\tau_m\\dot r/K$, qui fournit aussi le couple d'accélération $\\tau_ma/K$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["t5 ≈ 3 / ωc", "ωc = 3 / 1,5", "= 2 rad/s"], "Pulsation de coupure pour un temps d'établissement."),
  etapes(["consigne : pôle lent compensé", "perturbation : pôle -1/τm conservé", "retour en exp(-t/τm), plus lent que 3/ωc"], "Consigne et perturbation n'ont pas la même dynamique."),
  etapes(["2 ωc Te ≤ 10° = 0,1745 rad", "Te ≤ 0,1745 / (2 × 2)", "= 43,6 ms"], "Borne haute de la période."),
  etapes(["q0 = Kc (1 + Te/Ti)", "= 2 × (1 + 0,5/4)", "= 2,25"], "Coefficient q0 par Euler arrière."),
  etapes(["m = arrondi(98/100) = 1", "fapp = |98 - 100|", "= 2 Hz"], "Fréquence apparente."),
  etapes(["I = P / U", "= 20 000 / 540", "= 37,04 A"], "Courant d'un bus continu à puissance constante."),
  etapes(["indice horaire 11", "11 × 30°", "= 330°, soit 30° d'avance de la basse tension"], "Déphasage du groupe Dyn11."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Quelle pulsation de coupure, en rad/s, viser pour qu'une boucle compensée s'établisse à $5\\ \\%$ en $1{,}5\\ \\mathrm{s}$ ?</p>",
        valeur: 2,
        unite: "rad/s",
        tolerance: 0.01,
        explication: "$t_5 \\approx 3/\\omega_c$, donc $\\omega_c = 3/1{,}5 = 2\\ \\mathrm{rad/s}$ ; valeur exacte $\\ln 20/1{,}5 = 2{,}0\\ \\mathrm{rad/s}$.",
        resume: "Consigne et ωc",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Avec un PI qui compense la constante de temps du procédé, le retour après un à-coup de charge est aussi rapide que la réponse à la consigne.</p>",
        reponse: false,
        explication: "Le pôle lent reste dans le transfert de perturbation : la fin du retour suit $e^{-t/\\tau_m}$, bien plus lente que $3/\\omega_c$.",
        resume: "Pôle compensé",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. $\\omega_c = 2\\ \\mathrm{rad/s}$, mesure par comptage et sortie au top suivant, budget de $10^\\circ$ pour l'échantillonnage. Période maximale, en millisecondes ?</p>",
        valeur: (10 / DEG / 4) * 1000,
        unite: "ms",
        tolerance: 0.01,
        explication: "$2\\,\\omega_cT_e \\le 0{,}1745\\ \\mathrm{rad}$, donc $T_e \\le 0{,}1745/4 = 43{,}6\\ \\mathrm{ms}$.",
        resume: "Période maximale",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. PI $K_c = 2$, $T_i = 4\\ \\mathrm{s}$, discrétisé par Euler arrière avec $T_e = 0{,}5\\ \\mathrm{s}$. Valeur de $q_0$ ?</p>",
        valeur: 2.25,
        unite: "",
        tolerance: 0.005,
        explication: "$q_0 = K_c(1 + T_e/T_i) = 2 \\times 1{,}125 = 2{,}25$ ; $q_1 = -2$.",
        resume: "Coefficients du PI numérique",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. Une composante de $98\\ \\mathrm{Hz}$ est échantillonnée à $100\\ \\mathrm{Hz}$ sans filtre. Fréquence apparente, en hertz ?</p>",
        valeur: 2,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$m = 1$, $f_{\\mathrm{app}} = |98 - 100| = 2\\ \\mathrm{Hz}$ : une oscillation lente que la boucle prendrait pour une vraie variation.",
        resume: "Repliement",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. L'onduleur d'un variateur prélève $20\\ \\mathrm{kW}$ sur un bus continu de $540\\ \\mathrm{V}$. Courant moyen du bus, en ampères ?</p>",
        valeur: 20000 / 540,
        unite: "A",
        tolerance: 0.01,
        explication: "$I = P/U = 20\\,000/540 = 37{,}0\\ \\mathrm{A}$. À puissance constante, si la tension du bus baisse, le courant augmente : comportement de résistance incrémentale négative.",
        resume: "Bus à puissance constante",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Un transformateur est couplé Dyn11. Quel retard de phase, en degrés, de la tension basse tension sur la tension haute tension homologue l'indice horaire désigne-t-il ?</p>",
        valeur: 330,
        unite: "°",
        tolerance: 0.005,
        explication: "Indice horaire $11$ : $11 \\times 30^\\circ = 330^\\circ$ de retard, soit $30^\\circ$ d'avance de la basse tension sur la haute tension.",
        resume: "Indice horaire",
      },
    ],
    { titre: "Révision espacée : sept questions" }
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
    titre: "Où en suis-je sur la conception d'une régulation ?",
  });
  if (auto) ressources.push(auto);
}
