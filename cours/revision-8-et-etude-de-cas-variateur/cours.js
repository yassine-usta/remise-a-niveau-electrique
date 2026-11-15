/* ==========================================================================
   cours/revision-8-et-etude-de-cas-variateur/cours.js
   Révision 8 et étude de cas variateur : bus continu chargé à puissance
   constante, énergie de freinage d'une charge quadratique, transitoire
   thermique du dissipateur, mode commun selon la longueur du câble, et
   méthode de diagnostic appliquée au variateur de la pompe du projet fil rouge.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;

/* Données de la pompe (valeurs du projet fil rouge ou supposées). */
const OMEGA0 = (1475 * TAU) / 60; /* 154,46 rad/s */
const OMEGA_S = (1250 * TAU) / 60; /* vitesse de service, 130,9 rad/s */
const C0 = 194.2; /* couple de la pompe à OMEGA0, N.m */
const ETA = 0.92; /* rendement en génératrice, supposé */
const CBUS = 2.2e-3; /* capacité du bus, F */
const R_PONT = 0.389; /* résistance équivalente du pont, ohm */
const R_P = 47; /* résistance de précharge, ohm */
const C_TH = 3600; /* capacité thermique du dissipateur, J/K */
const R_HA0 = 0.12; /* résistance thermique saine, K/W */
const P_SERVICE = 19700; /* puissance au bus au point de service, W */
const F_SERVICE = 42.25; /* fréquence au point de service, Hz */

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

function v0De(U) {
  return 1.3505 * U - 1.7;
}

/** Tension du bus alimentant une puissance constante P à travers Rt ; NaN si aucune solution. */
function vBus(U, P, Rt) {
  const V0 = v0De(U);
  const d = V0 * V0 - 4 * Rt * P;
  if (d < 0) return NaN;
  return (V0 + Math.sqrt(d)) / 2;
}

/** Puissance pour laquelle le bus vaut V (lieu d'une frontière dans le plan P, U). */
function pourTension(U, V, Rt) {
  return (V * (v0De(U) - V)) / Rt;
}

/**
 * Arrêt en rampe de la pompe : intégration de la mécanique et du bilan du bus.
 * p : { T, J, V0, reg, Wi, tmax } ; renvoie des échantillons tous les 20 ms.
 */
function simulerArret(p) {
  const T = p.T;
  const J = p.J;
  const reg = Boolean(p.reg);
  const tmax = p.tmax || 25;
  const dt = 1e-3;
  let w = p.Wi != null ? p.Wi : OMEGA0;
  let V = p.V0;
  let t = 0;
  let trip = null;
  let tstop = null;
  let Wg = 0;
  let Vmax = V;
  let regule = false;
  const pts = { t: [], wRef: [], w: [], V: [] };
  const pente = OMEGA0 / T;
  const wDepart = w;
  let k = 0;
  while (t <= tmax + dt / 2) {
    if (k % 20 === 0) {
      pts.t.push(t);
      pts.wRef.push(Math.max(0, wDepart - pente * t));
      pts.w.push(w);
      pts.V.push(V);
    }
    const Cr = C0 * (w / OMEGA0) ** 2;
    let dw;
    if (trip === null && w > 0) {
      let Cm = Cr - J * pente;
      let Pg = Cm < 0 ? -ETA * Cm * w : 0;
      if (reg && V >= 760 && Pg > 0) {
        Pg = 0;
        Cm = 0;
        regule = true;
      }
      dw = (Cm - Cr) / J;
      if (Pg > 0) {
        V = Math.sqrt(V * V + (2 * Pg * dt) / CBUS);
        Wg += Pg * dt;
      }
      if (!reg && V >= 800) trip = t;
    } else {
      dw = -Cr / J;
    }
    Vmax = Math.max(Vmax, V);
    w = Math.max(0, w + dw * dt);
    if (tstop === null && w <= 3) tstop = t;
    t += dt;
    k += 1;
  }
  return { pts, trip, tstop, Wg, Vmax, regule };
}

/** Interpolation linéaire dans des échantillons réguliers. */
function interpoler(ts, ys, t) {
  if (t <= ts[0]) return ys[0];
  const n = ts.length - 1;
  if (t >= ts[n]) return ys[n];
  const pas = ts[1] - ts[0];
  const i = Math.min(n - 1, Math.floor((t - ts[0]) / pas));
  const r = (t - ts[i]) / pas;
  return ys[i] + (ys[i + 1] - ys[i]) * r;
}

/** Pertes du variateur selon la fréquence de la pompe : modèle linéaire en puissance. */
function pertesDe(f) {
  const Pr = 20.0 * Math.pow(f / F_SERVICE, 3); /* kW au réseau */
  return 34.84 + 12.783 * Pr;
}

function etatThermique(f, Ta, Rha) {
  const L = pertesDe(f);
  const dDiode = (24.3 * L) / 455.4; /* 1,0 K/W */
  const dIgbt = ((43.2 * L) / 455.4) * 0.3;
  const Th0 = Ta + R_HA0 * L;
  const ThInf = Ta + Rha * L;
  const tau = Rha * C_TH;
  return { L, dDiode, dIgbt, Th0, ThInf, tau };
}

function thAt(e, t) {
  return e.ThInf - (e.ThInf - e.Th0) * Math.exp(-t / e.tau);
}

function tempsLimite(e, lim) {
  if (e.Th0 >= lim) return 0;
  if (e.ThInf <= lim) return Infinity;
  return e.tau * Math.log((e.ThInf - e.Th0) / (e.ThInf - lim));
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
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

function fleche(x1, y1, x2, y2, id, attributs = "") {
  return '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '" marker-end="url(#' + id + ')"' + attributs + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
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

function ligneV(c, repere, couleurs, x, libelle, motif = [2, 4]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
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

function pointRepere(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  c.save();
  c.fillStyle = couleurs.accent;
  c.beginPath();
  c.arc(px, py, 5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    c.fillStyle = couleurs.texte;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -9 : 9), py - 9);
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

function correctionEtapes(lignes, legende, largeur = 600) {
  return (conteneur, moteurApi) => {
    const v = etapes(lignes, legende, largeur);
    schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
  };
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

/** Boucle d'animation suspendue hors écran et arrêtée au nettoyage. */
function boucleAnimation(api, conteneur, pas) {
  if (api.mouvementReduit || typeof requestAnimationFrame !== "function") return;
  let visible = true;
  let id = 0;
  let dernier = 0;
  function image(instant) {
    id = 0;
    if (!visible) return;
    const ecoule = dernier ? Math.min(0.05, (instant - dernier) / 1000) : 0;
    dernier = instant;
    pas(ecoule);
    id = requestAnimationFrame(image);
  }
  if (typeof IntersectionObserver === "function") {
    const observateur = new IntersectionObserver((entrees) => {
      visible = entrees.some((e) => e.isIntersecting);
      if (visible && !id) {
        dernier = 0;
        id = requestAnimationFrame(image);
      }
    });
    observateur.observe(conteneur);
    nettoyeurs.push(() => observateur.disconnect());
  }
  id = requestAnimationFrame(image);
  nettoyeurs.push(() => {
    visible = false;
    if (id) cancelAnimationFrame(id);
    id = 0;
  });
}

function duree(api, t) {
  if (!Number.isFinite(t)) return "jamais";
  if (t < 1) return nb(api, t * 1000, 0) + " ms";
  if (t < 120) return nb(api, t, t < 10 ? 2 : 1) + " s";
  return nb(api, t / 60, 1) + " min";
}

/* Chaîne simplifiée du variateur, réutilisée par l'exercice et le quiz de lecture de schéma. */
function dessinChaine(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += '<rect x="10" y="60" width="80" height="60" rx="6"/><rect x="110" y="60" width="80" height="60" rx="6"/>';
  s += '<rect x="210" y="60" width="100" height="60" rx="6"/><rect x="330" y="60" width="90" height="60" rx="6"/>';
  s += '<rect x="440" y="60" width="90" height="60" rx="6"/><rect x="550" y="60" width="70" height="60" rx="6"/>';
  s += '<circle cx="675" cy="90" r="30"/>';
  s += '<path d="M375 120V150M365 150H385" stroke-dasharray="4 3"/>';
  s += "</g>" + TRAITS + ' stroke-width="2.4">';
  s += fleche(90, 90, 110, 90, id) + fleche(190, 90, 210, 90, id) + fleche(310, 90, 330, 90, id) + fleche(420, 90, 440, 90, id) + fleche(530, 90, 550, 90, id) + fleche(620, 90, 645, 90, id);
  s += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(22, 86, "réseau") + texte(22, 102, "400 V");
  s += texte(118, 86, "fusibles") + texte(118, 102, "aR");
  s += texte(218, 86, "précharge") + texte(218, 102, "Rp et KM2");
  s += texte(338, 86, "bus, C") + texte(338, 102, "2,2 mF");
  s += texte(448, 86, "onduleur") + texte(448, 102, "IGBT");
  s += texte(556, 86, "capteurs") + texte(556, 102, "courant");
  s += texte(665, 94, "M");
  s += texte(330, 168, "mesure Ubus") + texte(20, 40, "sens du transfert en traction : flèches");
  s += "</g>";
  return s;
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
  construireFlux(racine, api);
  construireFenetreBus(racine, api);
  construireArret(racine, api);
  construireThermique(racine, api);
  construireArbre(racine, api);
  construireCourbeExemple(racine, api);
  construireChrono(racine, api);
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
    ["#e-modele-figure svg", 1.4],
    ["#e-couples-figure svg", 1.5],
    ["#f-schema-principal svg", 2.0],
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
      id: "c1-cinetique",
      titre: "Énergie cinétique de la pompe",
      niveau: "fondamental",
      enonce:
        "<p>L'ensemble moteur et pompe a une inertie $J = 0{,}5\\ \\mathrm{kg\\cdot m^2}$ et tourne à $1475\\ \\mathrm{tr/min}$. " +
        "Quelle énergie cinétique stocke-t-il, en joules ?</p>",
      valeur: 0.5 * 0.5 * OMEGA0 * OMEGA0,
      unite: "J",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Énergie cinétique",
      etapes: [
        { texte: "Conversion : $\\Omega = 1475 \\times 2\\pi/60 = 154{,}46\\ \\mathrm{rad/s}$." },
        { texte: "$W = \\tfrac12 J\\Omega^2 = 0{,}5 \\times 0{,}5 \\times 154{,}46^2 = 0{,}25 \\times 23\\,858$." },
        { texte: "$W = 5965\\ \\mathrm{J}$.", note: "Vingt fois la réserve du bus entre 540 et 760 V : l'inertie ne peut pas se vider entièrement dans le bus." },
      ],
      visuelCorrection: correctionEtapes(
        ["Ω = 1475 × 2π / 60 = 154,46 rad/s", "W = ½ J Ω² = 0,25 × 23 858", "W = 5965 J, soit 19 fois 314,6 J"],
        "Énergie cinétique comparée à la réserve du bus."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-reserve",
      titre: "Réserve d'énergie du bus",
      niveau: "fondamental",
      enonce:
        "<p>Le bus de $2{,}2\\ \\mathrm{mF}$ est à $540\\ \\mathrm{V}$. Quelle énergie peut-il absorber avant d'atteindre $760\\ \\mathrm{V}$, " +
        "seuil du régulateur de surtension, en joules ?</p>",
      valeur: 0.5 * CBUS * (760 * 760 - 540 * 540),
      unite: "J",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Réserve",
      etapes: [
        { texte: "L'énergie stockée vaut $\\tfrac12 CV^2$ ; la réserve est la différence entre les deux niveaux." },
        { texte: "$\\Delta W = \\tfrac12 \\times 2{,}2 \\times 10^{-3} \\times (760^2 - 540^2) = 1{,}1 \\times 10^{-3} \\times 286\\,000$." },
        { texte: "$\\Delta W = 314{,}6\\ \\mathrm{J}$.", note: "Erreur classique : calculer $\\tfrac12 C(760 - 540)^2 = 53\\ \\mathrm{J}$, six fois trop peu." },
      ],
      visuelCorrection: correctionEtapes(
        ["ΔW = ½ C (V2² - V1²)", "= 1,1e-3 × (577 600 - 291 600)", "= 1,1e-3 × 286 000 = 314,6 J", "et non ½ C (V2 - V1)² = 53 J"],
        "Réserve d'énergie du bus entre 540 et 760 V."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-dissipateur",
      titre: "Température du dissipateur au nominal",
      niveau: "fondamental",
      enonce:
        "<p>Le dissipateur commun reçoit $455{,}4\\ \\mathrm{W}$ ; sa résistance vers l'air vaut $0{,}12\\ \\mathrm{K/W}$ et l'air de l'armoire " +
        "est à $40\\ \\mathrm{^\\circ C}$. Quelle est sa température en régime établi, en degrés Celsius ?</p>",
      valeur: 40 + 0.12 * 455.4,
      unite: "°C",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Température du dissipateur",
      etapes: [
        { texte: "En régime établi, toute la puissance traverse $R_{ha}$ : $T_h = T_a + R_{ha}P$." },
        { texte: "$T_h = 40 + 0{,}12 \\times 455{,}4 = 40 + 54{,}6$." },
        { texte: "$T_h = 94{,}6\\ \\mathrm{^\\circ C}$.", note: "La jonction la plus chaude du pont est $24{,}3\\ \\mathrm{K}$ au-dessus, à $118{,}9\\ \\mathrm{^\\circ C}$." },
      ],
      visuelCorrection: correctionEtapes(
        ["T_h = T_a + R_ha P", "= 40 + 0,12 × 455,4", "= 94,6 °C ; pont : + 24,3 K = 118,9 °C"],
        "Loi d'Ohm thermique du dissipateur."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : flux d'énergie et réservoirs pendant un cycle
   -------------------------------------------------------------------------- */

function profilCycle(Td) {
  const J = 0.5;
  const dt = 1e-3;
  const pas = 0.02;
  const tAcc = (10 * OMEGA_S) / OMEGA0;
  const echant = { t: [], w: [], P: [], V: [], phase: [] };
  let w = 0;
  let V = vBus(400, 0, R_PONT);
  let trip = null;
  let prochain = 0;
  for (let k = 0; k <= 40000; k += 1) {
    const t = k * dt;
    let P = 0;
    let phase = "arrêt";
    const Cr = C0 * (w / OMEGA0) ** 2;
    if (t < tAcc) {
      phase = "accélération";
      w = (OMEGA0 * t) / 10;
      const Cm = Cr + (J * OMEGA0) / 10;
      P = (Cm * w) / ETA;
      V = vBus(400, P, R_PONT);
    } else if (t < 20) {
      phase = "régime";
      w = OMEGA_S;
      P = (Cr * w) / ETA;
      V = vBus(400, P, R_PONT);
    } else if (w > 0.5) {
      const pente = OMEGA0 / Td;
      if (trip === null) {
        let Cm = Cr - J * pente;
        if (Cm >= 0) {
          phase = "ralentissement, la pompe freine seule";
          P = (Cm * w) / ETA;
          V = vBus(400, P, R_PONT);
        } else {
          phase = "ralentissement, freinage générateur";
          P = ETA * Cm * w;
          V = Math.sqrt(V * V + (2 * -P * dt) / CBUS);
          if (V >= 800) {
            trip = t;
          }
        }
        w = Math.max(0, w + ((Cm - Cr) / J) * dt);
      } else {
        phase = "défaut de surtension, roue libre";
        w = Math.max(0, w - (Cr / J) * dt);
      }
    } else {
      phase = trip !== null ? "défaut de surtension, arrêt" : "arrêt";
    }
    if (t >= prochain - dt / 2) {
      echant.t.push(t);
      echant.w.push(w);
      echant.P.push(P);
      echant.V.push(V);
      echant.phase.push(phase);
      prochain += pas;
    }
  }
  return { echant, trip };
}

function construireFlux(racine, api) {
  const figure = racine.querySelector("#d-flux-figure");
  if (!figure) return;
  const svg = figure.querySelector("svg");
  if (!svg) return;
  ressources.push(api.dessiner(svg, { duree: 1.4 }));

  const chemins = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => svg.querySelector("#d-flux-" + id));
  const groupe = svg.querySelector("#d-flux-points");
  const jaugeBus = svg.querySelector("#d-jauge-bus");
  const jaugeCin = svg.querySelector("#d-jauge-cin");
  const jaugePertes = svg.querySelector("#d-jauge-pertes");
  const texteV = svg.querySelector("#d-flux-vbus");
  const texteVitesse = svg.querySelector("#d-flux-vitesse");
  const textePhase = svg.querySelector("#d-flux-phase");
  const texteSens = svg.querySelector("#d-flux-sens");
  if (!groupe || chemins.some((c) => !c)) return;

  const longueurs = chemins.map((c) => (typeof c.getTotalLength === "function" ? c.getTotalLength() : 50));
  const points = chemins.map(() => {
    const liste = [];
    for (let i = 0; i < 4; i += 1) {
      const cercle = svgEl("circle", { r: 3.6, cx: -10, cy: -10 });
      groupe.appendChild(cercle);
      liste.push(cercle);
    }
    return liste;
  });
  nettoyeurs.push(() => {
    for (const liste of points) for (const cercle of liste) cercle.remove();
  });

  let profil = profilCycle(10);
  const etat = { t: 0, Td: 10, P: 0, V: 538.5, w: 0, decalage: 0 };

  const valeurs = api.sim.valeurs("#d-flux-valeurs", [
    { id: "t", libelle: "Temps du cycle", unite: "s", decimales: 1 },
    { id: "w", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "P", libelle: "Puissance onduleur vers moteur", unite: "kW", decimales: 2 },
    { id: "V", libelle: "Tension du bus", unite: "V", decimales: 0 },
    { id: "phase", libelle: "Phase", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function placer() {
    const Pk = etat.P / 1000;
    const sens = Pk > 0.05 ? 1 : Pk < -0.05 ? -1 : 0;
    const intensite = Math.min(1, Math.abs(Pk) / 33);
    const pertes = sens > 0 ? 34.8 + 12.78 * Pk : sens < 0 ? 20 + 6 * Math.abs(Pk) : 0;
    chemins.forEach((chemin, k) => {
      const estPertes = k >= 4;
      let actifs = 0;
      let direction = 1;
      if (estPertes) {
        actifs = pertes > 1 ? Math.max(1, Math.round((pertes / 460) * 4)) : 0;
      } else if (sens > 0) {
        actifs = Math.max(1, Math.round(intensite * 4));
      } else if (sens < 0) {
        actifs = k >= 2 ? Math.max(1, Math.round(Math.min(1, intensite * 8) * 4)) : 0;
        direction = -1;
      }
      points[k].forEach((cercle, i) => {
        if (i >= actifs) {
          cercle.setAttribute("cx", "-10");
          cercle.setAttribute("cy", "-10");
          return;
        }
        let u = (i / actifs + etat.decalage * (0.4 + intensite)) % 1;
        if (direction < 0) u = 1 - u;
        const pt = chemin.getPointAtLength(u * longueurs[k]);
        cercle.setAttribute("cx", pt.x.toFixed(1));
        cercle.setAttribute("cy", pt.y.toFixed(1));
      });
    });
    if (jaugeBus) jaugeBus.setAttribute("width", Math.max(0, Math.min(58, (58 * (etat.V - 500)) / 300)).toFixed(1));
    if (jaugeCin) jaugeCin.setAttribute("width", Math.max(0, Math.min(58, 58 * (etat.w / OMEGA0) ** 2)).toFixed(1));
    if (jaugePertes) jaugePertes.setAttribute("width", Math.max(0, Math.min(158, (158 * pertes) / 460)).toFixed(1));
    if (texteSens) {
      texteSens.textContent =
        sens > 0 ? "flux : du réseau vers la pompe" : sens < 0 ? "flux : de la pompe vers le bus, pont bloqué" : "flux : nul";
    }
  }

  function majTemps(t) {
    etat.t = t;
    const e = profil.echant;
    const i = Math.max(0, Math.min(e.t.length - 1, Math.round(t / 0.02)));
    etat.P = e.P[i];
    etat.V = e.V[i];
    etat.w = e.w[i];
    if (texteV) texteV.textContent = nb(api, etat.V, 0) + " V";
    if (texteVitesse) texteVitesse.textContent = nb(api, (etat.w * 60) / TAU, 0) + " tr/min";
    if (textePhase) textePhase.textContent = "phase : " + e.phase[i];
    if (valeurs) valeurs.maj({ t, w: (etat.w * 60) / TAU, P: etat.P / 1000, V: etat.V, phase: e.phase[i] });
    placer();
  }

  const curseurs = api.sim.curseurs(
    "#d-flux-curseurs",
    [{ id: "Td", libelle: "Rampe de ralentissement (50 Hz à zéro)", min: 2, max: 12, pas: 0.5, valeur: 10, unite: "s" }],
    (lues) => {
      etat.Td = lues.Td;
      profil = profilCycle(lues.Td);
      majTemps(etat.t);
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-flux-lecteur", {
    de: 0,
    a: 40,
    duree: 20,
    boucle: false,
    auto: false,
    libelle: "Cycle de la pompe",
    rappel: (t) => majTemps(t),
  });
  if (lecteur) ressources.push(lecteur);

  boucleAnimation(api, figure, (ecoule) => {
    etat.decalage = (etat.decalage + ecoule * 0.9) % 1;
    placer();
  });
  majTemps(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : fenêtre de fonctionnement du bus (point déplaçable)
   -------------------------------------------------------------------------- */

function construireFenetreBus(racine, api) {
  const conteneur = racine.querySelector("#e-bus-vivant");
  if (!conteneur) return;
  const B = { x: 70, y: 30, l: 540, h: 270 };
  const lMin = Math.log10(100);
  const lMax = Math.log10(40000);
  const xP = (P) => B.x + ((Math.log10(Math.max(P, 1)) - lMin) / (lMax - lMin)) * B.l;
  const Pde = (x) => Math.pow(10, lMin + ((x - B.x) / B.l) * (lMax - lMin));
  const yU = (U) => B.y + ((440 - U) / 100) * B.h;
  const Ude = (y) => 440 - ((y - B.y) / B.h) * 100;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 360",
    role: "img",
    "aria-label": "Plan puissance prélevée en échelle logarithmique et tension du réseau, frontières de 510 V, de 400 V et de la puissance maximale, point de fonctionnement déplaçable",
  });
  let axes = '<g fill="none" stroke="currentColor" stroke-width="1.5">';
  axes += '<rect x="' + B.x + '" y="' + B.y + '" width="' + B.l + '" height="' + B.h + '"/>';
  for (const P of [100, 1000, 10000]) {
    axes += '<path d="M' + xP(P).toFixed(1) + " " + B.y + "V" + (B.y + B.h) + '" stroke-dasharray="1 4" stroke-width="1"/>';
  }
  for (const U of [360, 380, 400, 420]) {
    axes += '<path d="M' + B.x + " " + yU(U).toFixed(1) + "H" + (B.x + B.l) + '" stroke-dasharray="1 4" stroke-width="1"/>';
  }
  axes += "</g>";
  axes += ECRITS.replace('font-size="12"', 'font-size="11"');
  axes += texte(xP(100) - 12, B.y + B.h + 16, "0,1") + texte(xP(1000) - 6, B.y + B.h + 16, "1") + texte(xP(10000) - 8, B.y + B.h + 16, "10");
  axes += texte(xP(40000) - 14, B.y + B.h + 16, "40") + texte(B.x + B.l - 220, B.y + B.h + 34, "puissance prélevée (kW, échelle log)");
  for (const U of [340, 360, 380, 400, 420, 440]) axes += texte(B.x - 34, yU(U) + 4, String(U));
  axes += texte(8, B.y - 12, "tension du réseau U (V)");
  axes += "</g>";
  const groupeAxes = svgEl("g");
  groupeAxes.innerHTML = axes;
  svg.appendChild(groupeAxes);

  const frontieres = svgEl("g", { fill: "none", stroke: "currentColor" });
  const f510 = svgEl("path", { "stroke-width": "2", "stroke-dasharray": "10 5" });
  const f400 = svgEl("path", { "stroke-width": "2", "stroke-dasharray": "4 4" });
  const fMax = svgEl("path", { "stroke-width": "2.4" });
  frontieres.append(f510, f400, fMax);
  svg.appendChild(frontieres);
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.appendChild(etiquettes);
  const reperes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "10.5" });
  reperes.innerHTML =
    '<path d="M' + xP(32200).toFixed(1) + " " + (yU(400) - 6).toFixed(1) + "V" + (yU(400) + 6).toFixed(1) + '" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M' + xP(19700).toFixed(1) + " " + (yU(400) - 6).toFixed(1) + "V" + (yU(400) + 6).toFixed(1) + '" stroke="currentColor" stroke-width="2"/>' +
    texte(xP(19700) - 60, yU(400) + 20, "service") + texte(xP(32200) - 100, yU(400) - 10, "pleine vitesse");
  svg.appendChild(reperes);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  function chemin(fn, Rt) {
    let d = "";
    let ouvert = false;
    for (let U = 340; U <= 440.001; U += 1) {
      const P = fn(U, Rt);
      if (!(P >= 100 && P <= 40000)) {
        ouvert = false;
        continue;
      }
      d += (ouvert ? "L" : "M") + xP(P).toFixed(1) + " " + yU(U).toFixed(1);
      ouvert = true;
    }
    return d || "M0 0";
  }

  const etat = { P: 19700, U: 400, km2: 0 };

  function majFrontieres() {
    const Rt = etat.km2 ? R_PONT + R_P : R_PONT;
    f510.setAttribute("d", chemin((U, R) => pourTension(U, 510, R), Rt));
    f400.setAttribute("d", chemin((U, R) => pourTension(U, 400, R), Rt));
    fMax.setAttribute("d", chemin((U, R) => (v0De(U) * v0De(U)) / (4 * R), Rt));
    if (etat.km2) {
      etiquettes.innerHTML =
        texte(xP(330) - 10, yU(436), "510 V") + texte(xP(500) - 30, yU(350), "400 V") + texte(xP(1500) + 6, yU(352), "effondrement") +
        texte(B.x + 260, B.y + 40, "KM2 ouvert : tout se joue vers 1 kW");
    } else {
      etiquettes.innerHTML =
        texte(xP(2500), yU(386), "510 V : repli") + texte(B.x + 12, yU(430), "normal") + texte(B.x + 12, yU(360), "repli à 48 Hz") +
        texte(B.x + 200, B.y + 40, "400 V et effondrement hors cadre");
    }
  }

  const valeurs = api.sim.valeurs("#e-bus-valeurs", [
    { id: "P", libelle: "Puissance prélevée", unite: "kW", decimales: 2 },
    { id: "U", libelle: "Tension du réseau", unite: "V", decimales: 0 },
    { id: "V0", libelle: "Tension à vide du modèle, V0", unite: "V", decimales: 1 },
    { id: "V", libelle: "Tension du bus", format: (v) => v },
    { id: "I", libelle: "Courant du bus", format: (v) => v },
    { id: "Rp", libelle: "Puissance dans Rp", format: (v) => v },
    { id: "etat", libelle: "État du variateur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function evaluer() {
    const Rt = etat.km2 ? R_PONT + R_P : R_PONT;
    const V = vBus(etat.U, etat.P, Rt);
    const I = Number.isFinite(V) ? etat.P / V : NaN;
    let verdict;
    if (!Number.isFinite(V)) verdict = "aucun équilibre : le bus s'effondre, déclenchement en sous-tension";
    else if (V < 400) verdict = "sous-tension : déclenchement";
    else if (V < 510) verdict = "repli à 48 Hz demandé";
    else verdict = "fonctionnement normal";
    if (valeurs) {
      valeurs.maj({
        P: etat.P / 1000,
        U: etat.U,
        V0: v0De(etat.U),
        V: Number.isFinite(V) ? nb(api, V, 1) + " V" : "pas de solution",
        I: Number.isFinite(I) ? nb(api, I, 2) + " A" : "indéfini",
        Rp: etat.km2 ? (Number.isFinite(I) ? nb(api, R_P * I * I, 0) + " W" : "au-delà de toute tenue") : "0 W, KM2 fermé",
        etat: verdict,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: B.x, y: B.y, largeur: B.l, hauteur: B.h },
    valeur: { x: xP(etat.P), y: yU(etat.U) },
    pas: 1,
    libelle: "Point de fonctionnement : puissance et tension du réseau",
    rappel(mesure) {
      etat.P = Math.max(100, Math.min(40000, Pde(mesure.x)));
      etat.U = Math.max(340, Math.min(440, Ude(mesure.y)));
      evaluer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-bus-curseurs",
    [{ id: "km2", libelle: "Contacteur de précharge KM2", min: 0, max: 1, pas: 1, valeur: 0, format: (x) => (Math.round(x) ? "resté ouvert" : "fermé") }],
    (lues) => {
      etat.km2 = Math.round(lues.km2);
      majFrontieres();
      evaluer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  majFrontieres();
  ressources.push(api.dessiner([groupeAxes, frontieres], { declencheur: conteneur, duree: 1.2 }));
  evaluer();
}

/* --------------------------------------------------------------------------
   E. Simulation : arrêt de la pompe et tension du bus
   -------------------------------------------------------------------------- */

function construireArret(racine, api) {
  if (!racine.querySelector("#e-decel-bus")) return;
  const etat = { T: 2, J: 0.5, V0: 540, reg: 0, t: 0, res: null };
  const TMAX = 25;

  const traceW = api.sim.traceur("#e-decel-vitesse", {
    titre: "Vitesse de la pompe pendant l'arrêt",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "vitesse",
    yUnite: "tr/min",
    xMin: 0,
    xMax: TMAX,
    yMin: 0,
    yMax: 1600,
    ratio: 0.36,
    series: [
      { id: "ref", nom: "consigne de la rampe", points: [] },
      { id: "w", nom: "vitesse réelle", points: [] },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "t = " + nb(api, etat.t, 2) + " s");
    },
  });
  if (traceW) ressources.push(traceW);

  const traceV = api.sim.traceur("#e-decel-bus", {
    titre: "Tension du bus pendant l'arrêt",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: TMAX,
    yMin: 500,
    yMax: 850,
    ratio: 0.36,
    series: [{ id: "V", nom: "tension du bus", points: [] }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 760, "régulateur 760 V");
      ligneH(c, repere, couleurs, 800, "déclenchement 800 V", [3, 3]);
      ligneV(c, repere, couleurs, etat.t, null);
      if (etat.res && etat.res.trip !== null) pointRepere(c, repere, couleurs, etat.res.trip, 800, "défaut à " + nb(api, etat.res.trip, 2) + " s");
    },
  });
  if (traceV) ressources.push(traceV);

  const valeurs = api.sim.valeurs("#e-decel-valeurs", [
    { id: "tc", libelle: "Instant du lecteur", unite: "s", decimales: 2 },
    { id: "wc", libelle: "Vitesse à cet instant", unite: "tr/min", decimales: 0 },
    { id: "vc", libelle: "Bus à cet instant", unite: "V", decimales: 0 },
    { id: "wx", libelle: "Début du freinage générateur", unite: "tr/min", decimales: 0 },
    { id: "wg", libelle: "Énergie renvoyée au bus", unite: "J", decimales: 0 },
    { id: "vmax", libelle: "Tension maximale du bus", unite: "V", decimales: 0 },
    { id: "issue", libelle: "Issue", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function serie(nom) {
    const r = etat.res.pts;
    return r.t.map((t, i) => [t, nom === "ref" ? (r.wRef[i] * 60) / TAU : nom === "w" ? (r.w[i] * 60) / TAU : r.V[i]]);
  }

  function majInstant() {
    const r = etat.res;
    const wc = interpoler(r.pts.t, r.pts.w, etat.t);
    const vc = interpoler(r.pts.t, r.pts.V, etat.t);
    const wx = OMEGA0 * Math.sqrt(Math.min(1, (etat.J * OMEGA0) / (C0 * etat.T)));
    let issue;
    if (r.trip !== null) issue = "déclenchement en surtension à " + nb(api, r.trip, 2) + " s, puis roue libre ; sous 30 tr/min à " + duree(api, r.tstop);
    else if (r.regule) issue = "régulateur actif : bus plafonné à 760 V, arrêt allongé à " + duree(api, r.tstop);
    else issue = "rampe tenue, sous 30 tr/min à " + duree(api, r.tstop);
    if (valeurs) valeurs.maj({ tc: etat.t, wc: (wc * 60) / TAU, vc, wx: (wx * 60) / TAU, wg: r.Wg, vmax: r.Vmax, issue });
    if (traceW) traceW.demanderRendu();
    if (traceV) traceV.demanderRendu();
  }

  function recalculer() {
    etat.res = simulerArret({ T: etat.T, J: etat.J, V0: etat.V0, reg: etat.reg, tmax: TMAX });
    if (traceW) {
      traceW.definirDonnees("ref", serie("ref"));
      traceW.definirDonnees("w", serie("w"));
    }
    if (traceV) traceV.definirDonnees("V", serie("V"));
    majInstant();
  }

  const curseurs = api.sim.curseurs(
    "#e-decel-curseurs",
    [
      { id: "T", libelle: "Durée de rampe T (50 Hz à zéro)", min: 1, max: 12, pas: 0.5, valeur: 2, unite: "s" },
      { id: "J", libelle: "Inertie J", min: 0.3, max: 1, pas: 0.05, valeur: 0.5, unite: "kg.m²" },
      { id: "V0", libelle: "Tension initiale du bus", min: 510, max: 623, pas: 1, valeur: 540, unite: "V" },
      { id: "reg", libelle: "Régulateur de surtension", min: 0, max: 1, pas: 1, valeur: 0, format: (x) => (Math.round(x) ? "activé" : "désactivé") },
    ],
    (lues) => {
      etat.T = lues.T;
      etat.J = lues.J;
      etat.V0 = lues.V0;
      etat.reg = Math.round(lues.reg);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-decel-lecteur", {
    de: 0,
    a: TMAX,
    duree: 12.5,
    boucle: false,
    auto: false,
    libelle: "Temps de l'arrêt",
    rappel: (t) => {
      etat.t = t;
      if (etat.res) majInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);
  if (!etat.res) recalculer();
}

/* --------------------------------------------------------------------------
   E. Simulation : échauffement du dissipateur
   -------------------------------------------------------------------------- */

function construireThermique(racine, api) {
  if (!racine.querySelector("#e-therm-trace")) return;
  const etat = { f: 42.25, Ta: 45, Rha: 0.18, tmin: 0, e: null };

  const trace = api.sim.traceur("#e-therm-trace", {
    titre: "Températures après le changement de refroidissement",
    xTitre: "temps",
    xUnite: "min",
    yTitre: "température",
    yUnite: "°C",
    xMin: 0,
    xMax: 30,
    yMin: 20,
    yMax: 180,
    ratio: 0.44,
    series: [
      { id: "th", nom: "dissipateur T_h" },
      { id: "tjp", nom: "jonction du pont" },
      { id: "tji", nom: "jonction d'un IGBT" },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 100, "seuil 100 °C");
      ligneH(c, repere, couleurs, 125, "limite jonctions 125 °C", [3, 3]);
      ligneV(c, repere, couleurs, etat.tmin, null);
      if (etat.e) {
        const tl = tempsLimite(etat.e, 100);
        if (Number.isFinite(tl) && tl / 60 <= 30) pointRepere(c, repere, couleurs, tl / 60, 100, "déclenchement à " + duree(api, tl));
      }
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-therm-valeurs", [
    { id: "L", libelle: "Pertes au dissipateur", unite: "W", decimales: 1 },
    { id: "th0", libelle: "Dissipateur avant, à 0,12 K/W", unite: "°C", decimales: 1 },
    { id: "thInf", libelle: "Valeur finale", unite: "°C", decimales: 1 },
    { id: "tau", libelle: "Constante de temps", unite: "s", decimales: 0 },
    { id: "tl", libelle: "Temps avant 100 °C", format: (v) => v },
    { id: "tc", libelle: "Dissipateur à l'instant du lecteur", unite: "°C", decimales: 1 },
    { id: "tj", libelle: "Jonction du pont à cet instant", unite: "°C", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majInstant() {
    const e = etat.e;
    const th = thAt(e, etat.tmin * 60);
    const tl = tempsLimite(e, 100);
    if (valeurs) {
      valeurs.maj({
        L: e.L,
        th0: e.Th0,
        thInf: e.ThInf,
        tau: e.tau,
        tl: tl === 0 ? "déjà au-delà" : Number.isFinite(tl) ? duree(api, tl) : "jamais atteint",
        tc: th,
        tj: th + e.dDiode,
      });
    }
    if (trace) trace.demanderRendu();
  }

  function recalculer() {
    etat.e = etatThermique(etat.f, etat.Ta, etat.Rha);
    const e = etat.e;
    if (trace) {
      trace.definirFonction("th", (m) => thAt(e, m * 60));
      trace.definirFonction("tjp", (m) => thAt(e, m * 60) + e.dDiode);
      trace.definirFonction("tji", (m) => thAt(e, m * 60) + e.dIgbt);
    }
    majInstant();
  }

  const curseurs = api.sim.curseurs(
    "#e-therm-curseurs",
    [
      { id: "f", libelle: "Fréquence de la pompe", min: 25, max: 50, pas: 0.25, valeur: 42.25, unite: "Hz" },
      { id: "Ta", libelle: "Air de l'armoire", min: 20, max: 50, pas: 1, valeur: 45, unite: "°C" },
      { id: "Rha", libelle: "Résistance thermique à partir de zéro", min: 0.1, max: 0.7, pas: 0.01, valeur: 0.18, unite: "K/W" },
    ],
    (lues) => {
      etat.f = lues.f;
      etat.Ta = lues.Ta;
      etat.Rha = lues.Rha;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-therm-lecteur", {
    de: 0,
    a: 30,
    duree: 15,
    boucle: false,
    auto: false,
    libelle: "Temps après le changement",
    rappel: (m) => {
      etat.tmin = m;
      if (etat.e) majInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);
  if (!etat.e) recalculer();
}

/* --------------------------------------------------------------------------
   G. Animation : arbre de diagnostic interactif
   -------------------------------------------------------------------------- */

const ARBRE = [
  {
    code: "Surtension du bus",
    moments: [
      {
        nom: "En ralentissement",
        cause: "rampe trop courte, régulateur de surtension désactivé ou inertie sous-estimée",
        attendu: "T_min = 3,5 s pour J = 0,5 kg.m² depuis 540 V ; 8,9 s pour 0,8 kg.m²",
        mesure: "lire la rampe et le régulateur, comparer à la sauvegarde ; enregistrer Ubus pendant un arrêt",
      },
      {
        nom: "À l'arrêt ou à vide",
        cause: "réseau haut ou mesure du bus défaillante",
        attendu: "622 V à vide au réseau haut, sous le seuil de 800 V : un défaut à vide est anormal",
        mesure: "tension du réseau à la centrale ; comparer Ubus affichée et mesurée au voltmètre",
      },
    ],
  },
  {
    code: "Sous-tension",
    moments: [
      {
        nom: "Quelques secondes après la marche",
        cause: "contacteur de précharge KM2 resté ouvert",
        attendu: "puissance limitée à 1,53 kW ; 400 V franchis à 1,17 kW, environ 3,3 s après la marche",
        mesure: "hors tension : bobine, alimentation et contact de KM2 ; résistance Rp",
      },
      {
        nom: "Aléatoire, à tout moment",
        cause: "creux du réseau ou phase perdue",
        attendu: "creux visible à l'enregistreur ; phase perdue : ondulation du bus de l'ordre de 170 V en charge",
        mesure: "enregistreur de la centrale de mesure ; tensions en amont et en aval des fusibles aR",
      },
    ],
  },
  {
    code: "Surintensité ou défaut terre",
    moments: [
      {
        nom: "Dès les premières impulsions",
        cause: "court-circuit ou défaut d'isolement du câble, du moteur ou d'un module",
        attendu: "chaque impulsion porte la pleine tension du bus : défaut immédiat",
        mesure: "câble et moteur déconnectés : résistances entre phases puis essai d'isolement ; jamais variateur raccordé",
      },
      {
        nom: "Après une à deux secondes de rampe",
        cause: "réglage (rampe, tension à basse fréquence, limitation) ou mécanique",
        attendu: "déclenchement lié à la fréquence atteinte, 5 à 10 Hz ; courant croissant avant le défaut",
        mesure: "journal : fréquence et courant au déclenchement ; essai avec rampe doublée ; rotation libre de la pompe",
      },
    ],
  },
  {
    code: "Surchauffe",
    moments: [
      {
        nom: "En une minute, toute saison",
        cause: "ventilateur arrêté, R_ha voisine de 0,6 K/W",
        attendu: "54 s au nominal, environ 7 min au point de service",
        mesure: "ventilateur, son alimentation et son fusible",
      },
      {
        nom: "L'après-midi, au fort débit",
        cause: "ailettes encrassées ou air de l'armoire trop chaud",
        attendu: "R_ha = (T_h - T_a) / P : 0,18 K/W au lieu de 0,12",
        mesure: "relever T_h, T_a et la puissance ; nettoyer ; vérifier l'extraction de l'armoire",
      },
    ],
  },
];

function construireArbre(racine, api) {
  const conteneur = racine.querySelector("#g-arbre-vivant");
  const choix = racine.querySelector("#g-arbre-choix");
  const verdict = racine.querySelector("#g-arbre-verdict");
  if (!conteneur || !choix || !verdict) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 410",
    role: "img",
    "aria-label": "Arbre de diagnostic : un défaut signalé, quatre codes, deux moments du cycle par code",
  });
  const aretes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.6" });
  const noeuds = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.6" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  svg.append(aretes, noeuds, ecrits);

  const racineN = svgEl("rect", { x: 10, y: 185, width: 140, height: 50, rx: 8 });
  noeuds.appendChild(racineN);
  ecrits.innerHTML += texte(22, 206, "défaut signalé") + texte(22, 224, "par le variateur");

  const elementsCode = [];
  const elementsMoment = [];
  const aretesCode = [];
  const aretesMoment = [];
  ARBRE.forEach((branche, i) => {
    const y = 30 + 100 * i;
    const cy = y + 22;
    const rect = svgEl("rect", { x: 210, y, width: 210, height: 44, rx: 8 });
    noeuds.appendChild(rect);
    elementsCode.push(rect);
    ecrits.innerHTML += texte(220, cy + 4, branche.code);
    const a = svgEl("path", { d: "M150 210C180 210 180 " + cy + " 210 " + cy });
    aretes.appendChild(a);
    aretesCode.push(a);
    branche.moments.forEach((m, j) => {
      const k = 2 * i + j;
      const my = 8 + 51 * k;
      const mcy = my + 19;
      const r = svgEl("rect", { x: 460, y: my, width: 290, height: 38, rx: 7 });
      noeuds.appendChild(r);
      elementsMoment.push(r);
      ecrits.innerHTML += texte(472, mcy + 4, m.nom);
      const b = svgEl("path", { d: "M420 " + cy + "C440 " + cy + " 440 " + mcy + " 460 " + mcy });
      aretes.appendChild(b);
      aretesMoment.push(b);
    });
  });
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(svg, { declencheur: conteneur, duree: 1.3 }));

  const etat = { code: -1, moment: -1 };
  const rangCodes = document.createElement("div");
  rangCodes.className = "sim-commandes";
  const rangMoments = document.createElement("div");
  rangMoments.className = "sim-commandes";
  choix.append(rangCodes, rangMoments);
  const sortie = document.createElement("p");
  verdict.appendChild(sortie);
  sortie.textContent = "Choisissez d'abord un code de défaut.";
  nettoyeurs.push(() => {
    svg.remove();
    rangCodes.remove();
    rangMoments.remove();
    sortie.remove();
  });

  const boutonsCodes = ARBRE.map((branche, i) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "m-bouton secondaire";
    bouton.textContent = branche.code;
    bouton.setAttribute("aria-pressed", "false");
    bouton.addEventListener("click", () => {
      etat.code = i;
      etat.moment = -1;
      majBoutons();
      appliquer();
    });
    rangCodes.appendChild(bouton);
    return bouton;
  });
  const boutonsMoments = [0, 1].map((j) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "m-bouton secondaire";
    bouton.hidden = true;
    bouton.setAttribute("aria-pressed", "false");
    bouton.addEventListener("click", () => {
      etat.moment = j;
      majBoutons();
      appliquer();
    });
    rangMoments.appendChild(bouton);
    return bouton;
  });

  function majBoutons() {
    boutonsCodes.forEach((b, i) => b.setAttribute("aria-pressed", String(i === etat.code)));
    boutonsMoments.forEach((b, j) => {
      if (etat.code < 0) {
        b.hidden = true;
        return;
      }
      b.hidden = false;
      b.textContent = ARBRE[etat.code].moments[j].nom;
      b.setAttribute("aria-pressed", String(j === etat.moment));
    });
  }

  let traceChemin = null;
  function appliquer() {
    const actifs = [];
    aretesCode.forEach((a, i) => {
      const actif = i === etat.code;
      a.setAttribute("opacity", etat.code < 0 || actif ? "1" : "0.2");
      a.setAttribute("stroke-width", actif ? "3.4" : "1.6");
      if (actif) actifs.push(a);
    });
    elementsCode.forEach((r, i) => {
      r.setAttribute("stroke-width", i === etat.code ? "3" : "1.6");
      r.setAttribute("opacity", etat.code < 0 || i === etat.code ? "1" : "0.35");
    });
    aretesMoment.forEach((b, k) => {
      const i = Math.floor(k / 2);
      const j = k % 2;
      const actif = i === etat.code && j === etat.moment;
      const visible = etat.code < 0 || i === etat.code;
      b.setAttribute("opacity", visible ? (etat.moment < 0 || actif ? "1" : "0.3") : "0.15");
      b.setAttribute("stroke-width", actif ? "3.4" : "1.6");
      if (actif) actifs.push(b);
    });
    elementsMoment.forEach((r, k) => {
      const i = Math.floor(k / 2);
      const j = k % 2;
      const actif = i === etat.code && j === etat.moment;
      r.setAttribute("stroke-width", actif ? "3" : "1.6");
      r.setAttribute("opacity", etat.code < 0 || i === etat.code ? "1" : "0.3");
    });
    if (traceChemin && typeof traceChemin.detruire === "function") traceChemin.detruire();
    if (actifs.length) {
      traceChemin = api.dessiner(actifs, { declencheur: conteneur, duree: 0.8 });
      ressources.push(traceChemin);
    }
    if (etat.code < 0) sortie.textContent = "Choisissez d'abord un code de défaut.";
    else if (etat.moment < 0) sortie.textContent = "Code choisi : " + ARBRE[etat.code].code + ". Précisez maintenant le moment du cycle où il survient.";
    else {
      const m = ARBRE[etat.code].moments[etat.moment];
      sortie.textContent =
        "Cause la plus probable : " + m.cause + ". Valeur attendue : " + m.attendu + ". Première mesure : " + m.mesure + ".";
    }
  }
  majBoutons();
  appliquer();
}

/* --------------------------------------------------------------------------
   H. Courbe de l'exemple : tension maximale selon la rampe
   -------------------------------------------------------------------------- */

function vmaxRampe(T, J, V0 = 540) {
  const W = (ETA * J * J * OMEGA0 ** 3) / (4 * C0 * T);
  return Math.sqrt(V0 * V0 + (2 * W) / CBUS);
}

function construireCourbeExemple(racine, api) {
  if (!racine.querySelector("#h-courbe")) return;
  const trace = api.sim.traceur("#h-courbe", {
    titre: "Tension maximale du bus selon la rampe",
    xTitre: "durée de rampe T",
    xUnite: "s",
    yTitre: "tension maximale",
    yUnite: "V",
    xMin: 1.5,
    xMax: 12,
    yMin: 550,
    yMax: 1000,
    ratio: 0.42,
    series: [
      { id: "j05", nom: "J = 0,5 kg.m²", fonction: (T) => vmaxRampe(T, 0.5) },
      { id: "j08", nom: "J = 0,8 kg.m², majorée", fonction: (T) => vmaxRampe(T, 0.8) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 760, "760 V");
      ligneH(c, repere, couleurs, 800, "800 V", [3, 3]);
      pointRepere(c, repere, couleurs, 2, vmaxRampe(2, 0.5), "usine : 887 V");
      pointRepere(c, repere, couleurs, 3.468, 760, "T_min = 3,47 s");
      pointRepere(c, repere, couleurs, 10, vmaxRampe(10, 0.5), "retenue : 625 V");
    },
  });
  if (trace) ressources.push(trace);
}

/* --------------------------------------------------------------------------
   I. Animation : chronogramme du démarrage, KM2 sain ou resté ouvert
   -------------------------------------------------------------------------- */

function chronogramme(km2Ouvert) {
  const Rt = km2Ouvert ? R_PONT + R_P : R_PONT;
  const V0 = v0De(400);
  const pts = { t: [], P: [], V: [], f: [] };
  let trip = null;
  let Vtrip = V0;
  for (let k = 0; k <= 600; k += 1) {
    const t = k * 0.01;
    const f = Math.min(5 * t, F_SERVICE);
    let P = P_SERVICE * Math.pow(f / F_SERVICE, 3);
    let V;
    if (trip === null) {
      V = vBus(400, P, Rt);
      if (!Number.isFinite(V) || V < 400) {
        trip = t;
        Vtrip = Number.isFinite(V) ? V : 400;
        V = Vtrip;
      }
    } else {
      P = 0;
      V = V0 - (V0 - Vtrip) * Math.exp(-(t - trip) / (R_P * CBUS));
    }
    pts.t.push(t);
    pts.P.push(trip !== null && t > trip ? 0 : P);
    pts.V.push(V);
    pts.f.push(trip !== null && t > trip ? 0 : f);
  }
  return { pts, trip, Rt };
}

function construireChrono(racine, api) {
  if (!racine.querySelector("#i-chrono-bus")) return;
  const etat = { km2: 1, t: 0, res: chronogramme(true) };

  const traceP = api.sim.traceur("#i-chrono-puissance", {
    titre: "Puissance prélevée sur le bus",
    xTitre: "temps après l'ordre de marche",
    xUnite: "s",
    yTitre: "puissance",
    yUnite: "kW",
    xMin: 0,
    xMax: 6,
    yMin: 0,
    yMax: 8,
    ratio: 0.32,
    series: [{ id: "P", nom: "puissance demandée par la pompe", points: [] }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 1.53, "1,53 kW : maximum avec KM2 ouvert");
      ligneV(c, repere, couleurs, etat.t, null);
    },
  });
  if (traceP) ressources.push(traceP);

  const traceV = api.sim.traceur("#i-chrono-bus", {
    titre: "Tension du bus",
    xTitre: "temps après l'ordre de marche",
    xUnite: "s",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 6,
    yMin: 350,
    yMax: 560,
    ratio: 0.32,
    series: [{ id: "V", nom: "tension du bus", points: [] }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 400, "sous-tension 400 V", [3, 3]);
      ligneV(c, repere, couleurs, etat.t, "t = " + nb(api, etat.t, 2) + " s");
      if (etat.res.trip !== null) pointRepere(c, repere, couleurs, etat.res.trip, 400, "défaut à " + nb(api, etat.res.trip, 2) + " s");
    },
  });
  if (traceV) ressources.push(traceV);

  const valeurs = api.sim.valeurs("#i-chrono-valeurs", [
    { id: "f", libelle: "Fréquence de sortie", unite: "Hz", decimales: 2 },
    { id: "P", libelle: "Puissance prélevée", unite: "kW", decimales: 3 },
    { id: "V", libelle: "Tension du bus", unite: "V", decimales: 1 },
    { id: "I", libelle: "Courant du bus", unite: "A", decimales: 2 },
    { id: "Rp", libelle: "Puissance dans Rp", unite: "W", decimales: 0 },
    { id: "etat", libelle: "État", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majInstant() {
    const r = etat.res.pts;
    const f = interpoler(r.t, r.f, etat.t);
    const P = interpoler(r.t, r.P, etat.t);
    const V = interpoler(r.t, r.V, etat.t);
    const I = V > 0 ? P / V : 0;
    const enDefaut = etat.res.trip !== null && etat.t >= etat.res.trip;
    if (valeurs) {
      valeurs.maj({
        f,
        P: P / 1000,
        V,
        I,
        Rp: etat.km2 ? R_P * I * I : 0,
        etat: enDefaut ? "déclenché en sous-tension, bus rechargé par Rp" : etat.km2 ? "marche, KM2 resté ouvert" : "marche normale",
      });
    }
    if (traceP) traceP.demanderRendu();
    if (traceV) traceV.demanderRendu();
  }

  function recalculer() {
    etat.res = chronogramme(Boolean(etat.km2));
    const r = etat.res.pts;
    if (traceP) traceP.definirDonnees("P", r.t.map((t, i) => [t, r.P[i] / 1000]));
    if (traceV) traceV.definirDonnees("V", r.t.map((t, i) => [t, r.V[i]]));
    majInstant();
  }

  const curseurs = api.sim.curseurs(
    "#i-chrono-curseurs",
    [{ id: "km2", libelle: "Contacteur de précharge KM2", min: 0, max: 1, pas: 1, valeur: 1, format: (x) => (Math.round(x) ? "resté ouvert" : "fermé") }],
    (lues) => {
      etat.km2 = Math.round(lues.km2);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#i-chrono-lecteur", {
    de: 0,
    a: 6,
    duree: 6,
    boucle: false,
    auto: false,
    libelle: "Temps après l'ordre de marche",
    rappel: (t) => {
      etat.t = t;
      majInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);
  recalculer();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-bus-reseau-bas",
      titre: "Fondamental 1 : bus à pleine vitesse sous réseau bas",
      niveau: "fondamental",
      enonce:
        "<p>Le réseau descend à $360\\ \\mathrm{V}$. Le variateur de la pompe prélève $32{,}2\\ \\mathrm{kW}$ sur le bus à pleine vitesse ; " +
        "le pont a pour modèle $V_0 = 1{,}3505\\,U - 1{,}7$ et $R = 0{,}389\\ \\Omega$, KM2 fermé. Quelle est la tension du bus, en volts ? " +
        "Le variateur se replie-t-il, déclenche-t-il ?</p>",
      valeur: vBus(360, 32200, R_PONT),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension du bus",
      etapes: [
        { texte: "Tension à vide du modèle : $V_0 = 1{,}3505 \\times 360 - 1{,}7 = 484{,}5\\ \\mathrm{V}$." },
        { texte: "Équation : $V^2 - V_0V + RP = 0$, avec $RP = 0{,}389 \\times 32\\,200 = 12\\,526\\ \\mathrm{V^2}$." },
        { texte: "Discriminant : $484{,}5^2 - 4 \\times 12\\,526 = 234\\,740 - 50\\,103 = 184\\,637$, de racine $429{,}7$." },
        { texte: "$V = (484{,}5 + 429{,}7)/2 = 457{,}1\\ \\mathrm{V}$, et $I_d = 32\\,200/457{,}1 = 70{,}4\\ \\mathrm{A}$." },
        {
          texte: "Sous $510\\ \\mathrm{V}$ : le repli à $48\\ \\mathrm{Hz}$ est demandé ; au-dessus de $400\\ \\mathrm{V}$ : pas de déclenchement.",
          note: "Contrôle : la chute $V_0 - V = 27{,}4\\ \\mathrm{V}$ vaut bien $R\\,I_d = 0{,}389 \\times 70{,}4$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension du bus selon la puissance",
          xTitre: "puissance",
          xUnite: "kW",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: 380,
          yMax: 560,
          series: [
            { id: "u400", nom: "réseau 400 V", fonction: (p) => vBus(400, p * 1000, R_PONT) },
            { id: "u360", nom: "réseau 360 V", fonction: (p) => vBus(360, p * 1000, R_PONT) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 510, "repli 510 V");
            ligneH(c, repere, couleurs, 400, "sous-tension 400 V", [3, 3]);
            pointRepere(c, repere, couleurs, 32.2, vBus(360, 32200, R_PONT), "457,1 V");
          },
        });
      },
    })
  );

  const eSvcExact = { Th0: 40 + 0.12 * 290.5, ThInf: 40 + 0.6 * 290.5, tau: 0.6 * C_TH };
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-ventilateur",
      titre: "Fondamental 2 : panne du ventilateur au point de service",
      niveau: "fondamental",
      enonce:
        "<p>Au point de service, le dissipateur reçoit $290{,}5\\ \\mathrm{W}$, avec $R_{ha} = 0{,}12\\ \\mathrm{K/W}$, $C_{th} = 3600\\ \\mathrm{J/K}$ " +
        "et un air à $40\\ \\mathrm{^\\circ C}$. Le ventilateur s'arrête : $R_{ha}$ passe à $0{,}6\\ \\mathrm{K/W}$. Au bout de combien de secondes le " +
        "seuil de surchauffe de $100\\ \\mathrm{^\\circ C}$ est-il atteint ?</p>",
      valeur: tempsLimite(eSvcExact, 100),
      unite: "s",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "Temps avant le seuil",
      etapes: [
        { texte: "Départ : $T_{h0} = 40 + 0{,}12 \\times 290{,}5 = 74{,}9\\ \\mathrm{^\\circ C}$." },
        { texte: "Arrivée : $T_{h\\infty} = 40 + 0{,}6 \\times 290{,}5 = 214{,}3\\ \\mathrm{^\\circ C}$ ; constante de temps $\\tau = 0{,}6 \\times 3600 = 2160\\ \\mathrm{s}$." },
        { texte: "$t = \\tau\\ln\\dfrac{T_{h\\infty} - T_{h0}}{T_{h\\infty} - 100} = 2160 \\ln\\dfrac{139{,}4}{114{,}3} = 2160 \\times 0{,}199$." },
        { texte: "$t \\approx 429\\ \\mathrm{s}$, environ sept minutes.", note: "Au nominal, le même calcul donne 54 s : la charge change tout." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Échauffement après la panne du ventilateur",
          xTitre: "temps",
          xUnite: "min",
          yTitre: "température du dissipateur",
          yUnite: "°C",
          xMin: 0,
          xMax: 15,
          yMin: 60,
          yMax: 150,
          series: [{ id: "th", nom: "T_h(t)", fonction: (m) => thAt(eSvcExact, m * 60) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 100, "seuil 100 °C");
            pointRepere(c, repere, couleurs, tempsLimite(eSvcExact, 100) / 60, 100, "429 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-phase",
      titre: "Intermédiaire 1 : perte d'une phase du réseau",
      niveau: "intermédiaire",
      enonce:
        "<p>Un fusible aR d'entrée fond : le pont ne redresse plus qu'une tension composée, et le condensateur du bus doit fournir seul le " +
        "courant pendant l'essentiel de chaque demi-période. Au point de service, $I_d = 36{,}8\\ \\mathrm{A}$, $C = 2{,}2\\ \\mathrm{mF}$. " +
        "En majorant la durée de décharge par une demi-période de $10\\ \\mathrm{ms}$, quelle est l'ondulation crête à crête du bus, en volts ?</p>",
      valeur: (36.8 * 0.01) / CBUS,
      unite: "V",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "Ondulation crête à crête",
      etapes: [
        { texte: "Le condensateur cède la charge $Q = I_d\\,\\Delta t = 36{,}8 \\times 0{,}01 = 0{,}368\\ \\mathrm{C}$ entre deux crêtes." },
        { texte: "$\\Delta V = Q/C = 0{,}368/2{,}2 \\times 10^{-3} = 167\\ \\mathrm{V}$." },
        {
          texte: "Depuis la crête de $565{,}7\\ \\mathrm{V}$, le bus descendrait vers $399\\ \\mathrm{V}$ : sous-tension, ou repli imposé par la détection d'ondulation.",
          note: "Approximation majorante : la recharge prend une partie de la demi-période, et la puissance constante fait croître le courant quand la tension baisse.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Bus avec une seule tension composée, modèle majorant",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension du bus",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: 350,
          yMax: 600,
          series: [
            {
              id: "v",
              nom: "tension du bus",
              fonction: (ms) => {
                const u = ms % 10;
                const dv = (36.8 * 0.01) / CBUS;
                return u < 9 ? 565.7 - (dv * u) / 10 : 565.7 - dv * 0.9 + (dv * 0.9 * (u - 9)) / 1;
              },
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 400, "sous-tension 400 V", [3, 3]);
            ligneH(c, repere, couleurs, 565.7, "crête 565,7 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k4-schema-km2",
      titre: "Intermédiaire 2 : lecture de schéma",
      niveau: "intermédiaire",
      consigne: "Cliquez sur l'élément le plus probablement en cause.",
      enonce:
        "<p>Le variateur se met sous tension sans défaut et affiche $564\\ \\mathrm{V}$ à l'arrêt. À chaque ordre de marche, il déclenche en " +
        "sous-tension environ trois secondes plus tard ; le réseau est stable à $400\\ \\mathrm{V}$ selon la centrale de mesure.</p>",
      viewBox: "0 0 720 190",
      dessin: dessinChaine("fl-k4"),
      zones: [
        { x: 8, y: 56, largeur: 84, hauteur: 68, etiquette: "réseau" },
        { x: 108, y: 56, largeur: 84, hauteur: 68, etiquette: "fusibles" },
        { x: 208, y: 56, largeur: 104, hauteur: 68, etiquette: "précharge", juste: true },
        { x: 328, y: 56, largeur: 94, hauteur: 68, etiquette: "condensateur" },
        { x: 438, y: 56, largeur: 94, hauteur: 68, etiquette: "onduleur" },
        { x: 642, y: 58, largeur: 66, hauteur: 64, etiquette: "moteur" },
      ],
      etapes: [
        { texte: "Bus à $564\\ \\mathrm{V}$ à l'arrêt : le pont, les fusibles et la précharge laissent passer le faible courant à vide." },
        { texte: "Le réseau est stable : un creux est exclu. Une phase perdue ne donnerait pas un défaut aussi régulier à faible puissance." },
        { texte: "Si KM2 reste ouvert, $R_p = 47\\ \\Omega$ limite la puissance à $V_0^2/(4R_t) = 1{,}53\\ \\mathrm{kW}$ ; le bus passe sous $400\\ \\mathrm{V}$ à $1{,}17\\ \\mathrm{kW}$." },
        { texte: "La puissance de la pompe, cubique en fréquence, atteint $1{,}17\\ \\mathrm{kW}$ vers $16{,}5\\ \\mathrm{Hz}$, $3{,}3\\ \\mathrm{s}$ après la marche.", note: "C'est le dossier 1 de la section I." },
      ],
      visuelCorrection: correctionEtapes(
        ["à l'arrêt : 564 V, la précharge suffit au courant à vide", "KM2 ouvert : P_max = 538,5² / (4 × 47,389) = 1530 W", "400 V franchis à 1169 W, soit 16,5 Hz et 3,3 s", "cause : précharge, KM2 resté ouvert"],
        "Raisonnement de lecture du schéma."
      ),
    })
  );

  const tminCumul = (ETA * 0.64 * OMEGA0 ** 3) / (2 * C0 * CBUS * (760 * 760 - 622.3 * 622.3));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-rampe",
      titre: "Avancé : rampe minimale au pire cas",
      niveau: "avancé",
      enonce:
        "<p>On veut que le bus ne dépasse pas $760\\ \\mathrm{V}$ à l'arrêt depuis $1475\\ \\mathrm{tr/min}$, sans compter sur le régulateur. Pire cas : " +
        "inertie majorée à $0{,}8\\ \\mathrm{kg\\cdot m^2}$ et bus à $622{,}3\\ \\mathrm{V}$ au début du freinage (réseau haut, faible charge). " +
        "Avec $\\eta = 0{,}92$, $C_0 = 194{,}2\\ \\mathrm{N\\cdot m}$ et $C = 2{,}2\\ \\mathrm{mF}$, quelle est la rampe minimale, en secondes ? " +
        "La rampe de $10\\ \\mathrm{s}$ suffit-elle seule ?</p>",
      valeur: tminCumul,
      unite: "s",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Rampe minimale",
      etapes: [
        { texte: "Réserve : $\\tfrac12 C(760^2 - 622{,}3^2) = 1{,}1 \\times 10^{-3} \\times (577\\,600 - 387\\,257) = 209{,}4\\ \\mathrm{J}$." },
        { texte: "Numérateur : $\\eta J^2\\Omega_0^3/(4C_0) = 0{,}92 \\times 0{,}64 \\times 3{,}6851 \\times 10^6/776{,}8 = 2793\\ \\mathrm{J\\cdot s}$." },
        { texte: "$T_{min} = 2793/209{,}4 = 13{,}3\\ \\mathrm{s}$." },
        {
          texte: "La rampe de $10\\ \\mathrm{s}$ ne suffit pas seule au cumul des pires cas : le régulateur doit rester actif, et l'arrêt sera alors allongé.",
          note: "Contrôle par proportionnalité : $3{,}47 \\times 2{,}56 \\times 314{,}6/209{,}4 = 13{,}3\\ \\mathrm{s}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension maximale au pire cas",
          xTitre: "durée de rampe",
          xUnite: "s",
          yTitre: "tension maximale",
          yUnite: "V",
          xMin: 4,
          xMax: 20,
          yMin: 650,
          yMax: 950,
          series: [{ id: "v", nom: "J = 0,8 kg.m², départ 622,3 V", fonction: (T) => vmaxRampe(T, 0.8, 622.3) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 760, "760 V");
            pointRepere(c, repere, couleurs, tminCumul, 760, "13,3 s");
            ligneV(c, repere, couleurs, 10, "rampe de 10 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic-cable",
      titre: "Diagnostic industriel : le câble de 150 mètres",
      niveau: "diagnostic",
      enonce:
        "<p>Dossier 3 de la section I. Relevés imaginés : le journal indique une surintensité instantanée à $7{,}5\\ \\mathrm{Hz}$, le courant " +
        "ayant crû pendant $1{,}2\\ \\mathrm{s}$ avant le seuil ; l'isolement de chaque phase vers le PE dépasse $500\\ \\mathrm{M\\Omega}$, câble et " +
        "moteur déconnectés ; la pince haute fréquence mesure $8{,}8\\ \\mathrm{A}$ crête par front ; l'écran est continu et serré à $360$ degrés aux " +
        "deux extrémités. Quelles conclusions ces mesures justifient-elles ?</p>",
      multiple: true,
      options: [
        { texte: "Le défaut d'isolement du câble neuf est écarté.", juste: true },
        { texte: "Le courant de mode commun est conforme à la prévision de $8{,}6\\ \\mathrm{A}$ : il n'est pas excessif.", juste: true },
        { texte: "La cause est à chercher du côté des réglages ou de la mécanique : rampe, tension à basse fréquence, limitation, rotation de la pompe.", juste: true },
        { texte: "Le variateur est défectueux et doit être remplacé sans autre essai." },
        { texte: "Le câble deux fois plus long a doublé la crête de mode commun, ce qui explique le défaut." },
      ],
      etapes: [
        { texte: "Plus de $500\\ \\mathrm{M\\Omega}$ par phase : aucun chemin vers la terre ; un défaut d'isolement serait d'ailleurs immédiat, chaque impulsion portant la pleine tension." },
        { texte: "$8{,}8\\ \\mathrm{A}$ mesurés pour $8{,}6\\ \\mathrm{A}$ prévus : la crête dépend de $Z_0$, presque inchangée, et le phénomène ne dépend pas de la fréquence." },
        { texte: "Le courant croît pendant $1{,}2\\ \\mathrm{s}$ et le défaut survient à $7{,}5\\ \\mathrm{Hz}$ : signature d'une grandeur liée à la vitesse, réglage ou charge mécanique." },
        { texte: "Remplacer le variateur ne se justifie pas : aucune mesure ne le met en cause.", note: "Étape suivante : comparer les paramètres à la sauvegarde, essayer une rampe doublée, vérifier la rotation libre de la pompe consignée." },
      ],
      visuelCorrection: correctionEtapes(
        ["isolement > 500 MΩ : défaut d'isolement écarté", "8,8 A mesurés pour 8,6 A prévus : mode commun normal", "courant croissant, défaut à 7,5 Hz : grandeur liée à la vitesse", "suite : paramètres, rampe doublée, rotation libre"],
        "Élimination des hypothèses du dossier 3."
      ),
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Question conceptuelle : pourquoi l'inertie au carré ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi l'énergie renvoyée au bus par une décélération sur pompe centrifuge croît comme le carré de l'inertie, " +
        "alors que l'énergie cinétique ne croît que comme l'inertie.</p>",
      motsCles: [["couple", "deceleration", "freinage"], ["proportionnel", "double", "j"], ["vitesse plus haute", "plus tot", "plus haute", "vitesse"], ["pompe", "charge", "absorbe"]],
      minimum: 3,
      exemple: "Deux ou trois phrases : reliez le couple de décélération, la vitesse où commence le freinage et l'énergie restante.",
      etapes: [
        { texte: "La rampe impose un couple de décélération $J\\Omega_0/T$, proportionnel à $J$." },
        { texte: "Le moteur ne freine que lorsque le couple de la pompe devient inférieur à ce couple : une inertie double fait commencer le freinage à une vitesse plus haute, $\\Omega_x \\propto \\sqrt{J}$." },
        { texte: "L'énergie qui reste alors à évacuer, de l'ordre de $J\\Omega_x^2$, croît comme $J \\times J$ : un facteur vient de l'énergie cinétique, l'autre du freinage plus précoce, où la pompe a moins de temps pour absorber.", note: "C'est pourquoi une inertie mal connue est la première incertitude à lever dans un calcul de freinage." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Couple de charge et couples de décélération pour deux inerties",
          xTitre: "vitesse",
          xUnite: "rad/s",
          yTitre: "couple",
          yUnite: "N.m",
          xMin: 0,
          xMax: 160,
          yMin: 0,
          yMax: 200,
          series: [
            { id: "cr", nom: "couple de la pompe", fonction: (w) => C0 * (w / OMEGA0) ** 2 },
            { id: "j1", nom: "J Ω0 / T, J = 0,5", fonction: () => (0.5 * OMEGA0) / 2 },
            { id: "j2", nom: "J Ω0 / T, J = 1,0", fonction: () => (1.0 * OMEGA0) / 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            const wx1 = OMEGA0 * Math.sqrt((0.5 * OMEGA0) / (C0 * 2));
            const wx2 = OMEGA0 * Math.sqrt((1.0 * OMEGA0) / (C0 * 2));
            pointRepere(c, repere, couleurs, wx1, (0.5 * OMEGA0) / 2, "Ωx = " + nb(api, wx1, 1));
            pointRepere(c, repere, couleurs, wx2, (1.0 * OMEGA0) / 2, "Ωx = " + nb(api, wx2, 1));
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["bus à 564 V à l'arrêt : entrée saine à vide", "défaut 3 s après la marche, à faible puissance", "KM2 ouvert : P_max = 1,53 kW"], "Signature du contacteur de précharge resté ouvert."),
  etapes(["régulateur : plus d'énergie renvoyée au-delà de 760 V", "la pompe freine seule, de plus en plus lentement", "arrêt d'environ 20 s au lieu de 2 s"], "Effet du régulateur de surtension."),
  etapes(["W = 1091 / 5 = 218,2 J", "V = √(540² + 2 × 218,2 / 2,2e-3)", "= √(291 600 + 198 364) = 700 V"], "Tension maximale pour une rampe de 5 s."),
  etapes(["chaque impulsion applique ± E, quelle que soit la fréquence", "mode commun et surtensions de front : dès la 1re impulsion", "un défaut à 5-10 Hz suit une grandeur liée à la vitesse"], "Indice temporel."),
  etapes(["T_h = T_a + R_ha P", "= 45 + 0,18 × 290,5", "= 97,3 °C, sous le seuil, sans marge"], "Dissipateur encrassé au point de service."),
  () => ({ viewBox: "0 0 720 190", dessin: dessinChaine("fl-qv6"), legende: "Le défaut terre est détecté par la somme des trois courants de phase, mesurée par les capteurs de courant de sortie." }),
  etapes(["Z0 = √(L/C) : 20,1 → 21,0 Ω, crête 8,9 → 8,6 A", "énergie et charge par front : + 62 %", "f0 : 251 → 149 kHz, oscillation plus longue"], "Câble de 85 m contre 150 m."),
  etapes(["W_g = η J² Ω0³ / (4 C0 T)", "J × 2 → W_g × 4", "rampe minimale × 4"], "Dépendance en J²."),
  etapes(["P_max = V0² / (4 Rt)", "= 538,5² / (4 × 47,389)", "= 289 982 / 189,56 = 1530 W"], "Puissance maximale avec KM2 ouvert."),
  etapes(["consigner, attendre la décharge, vérifier l'absence de tension", "déconnecter câble et moteur du variateur", "essai d'isolement phase par phase vers le PE"], "Préparer un essai d'isolement."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Le variateur affiche $564\\ \\mathrm{V}$ à l'arrêt et déclenche en sous-tension trois secondes après chaque ordre de marche, réseau stable. Cause la plus probable ?</p>",
        options: ["Un creux du réseau", "Des condensateurs du bus vieillis", "Le contacteur de précharge KM2 resté ouvert", "Le ventilateur du dissipateur arrêté"],
        bonnes: [2],
        explication: "Avec $R_p$ en série, la puissance est bornée à $1{,}53\\ \\mathrm{kW}$ : la pompe l'atteint en quelques secondes de rampe.",
        resume: "Signature de KM2 ouvert",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Activer le régulateur de surtension permet d'arrêter la pompe en $2\\ \\mathrm{s}$ sans déclencher.</p>",
        reponse: false,
        explication: "Il évite le déclenchement en refusant l'énergie, ce qui allonge l'arrêt : une vingtaine de secondes pour la pompe.",
        resume: "Régulateur de surtension",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Rampe de $5\\ \\mathrm{s}$, $\\eta J^2\\Omega_0^3/(4C_0) = 1091\\ \\mathrm{J\\cdot s}$, bus de $2{,}2\\ \\mathrm{mF}$ parti de $540\\ \\mathrm{V}$. Tension maximale, en volts ?</p>",
        valeur: vmaxRampe(5, 0.5),
        unite: "V",
        tolerance: 0.01,
        explication: "$W_g = 218{,}2\\ \\mathrm{J}$ ; $V = \\sqrt{540^2 + 2 \\times 218{,}2/2{,}2 \\times 10^{-3}} = 700\\ \\mathrm{V}$.",
        resume: "Tension après freinage",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi un défaut lié aux fronts de commutation se manifeste-t-il dès les premières impulsions, quelle que soit la fréquence de sortie ?</p>",
        motsCles: [["impulsion", "front", "commutation"], ["pleine", "tension du bus", "bus", "amplitude"], ["frequence", "vitesse", "independ"]],
        minimum: 2,
        explication: "Chaque impulsion de modulation applique la pleine tension du bus, $\\pm E$, avec les mêmes fronts à $1\\ \\mathrm{Hz}$ qu'à $50\\ \\mathrm{Hz}$ ; seule la largeur des impulsions change.",
        resume: "Indice temporel",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Point de service, $290{,}5\\ \\mathrm{W}$ de pertes, ailettes encrassées à $0{,}18\\ \\mathrm{K/W}$, air à $45\\ \\mathrm{^\\circ C}$. Température finale du dissipateur, en degrés Celsius ?</p>",
        valeur: 45 + 0.18 * 290.5,
        unite: "°C",
        tolerance: 0.01,
        explication: "$45 + 0{,}18 \\times 290{,}5 = 97{,}3\\ \\mathrm{^\\circ C}$ : sous le seuil de $100\\ \\mathrm{^\\circ C}$, mais sans marge.",
        resume: "Dissipateur encrassé",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cette chaîne, quel élément fournit la mesure qui détecte un défaut d'une phase à la terre ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 720 190",
        dessin: dessinChaine("fl-q6"),
        zones: [
          { x: 208, y: 56, largeur: 104, hauteur: 68, etiquette: "précharge" },
          { x: 328, y: 126, largeur: 110, hauteur: 50, etiquette: "mesure Ubus" },
          { x: 548, y: 56, largeur: 74, hauteur: 68, etiquette: "capteurs", juste: true },
          { x: 642, y: 58, largeur: 66, hauteur: 64, etiquette: "moteur" },
        ],
        explication: "La somme des trois courants de phase est nulle sans défaut ; un courant qui revient par la terre la rend non nulle. Ce sont les capteurs de courant de sortie qui la fournissent.",
        resume: "Détection du défaut terre",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Le câble moteur passe de $85$ à $150\\ \\mathrm{m}$. Quelles grandeurs du mode commun augmentent nettement ?</p>",
        options: [
          { texte: "La crête du courant par front" },
          { texte: "L'énergie dissipée par front", juste: true },
          { texte: "La charge déplacée par front", juste: true },
          { texte: "L'impédance caractéristique $Z_0$" },
          { texte: "La période d'oscillation", juste: true },
        ],
        multiple: true,
        explication: "$Z_0$ et donc la crête sont presque inchangées ; l'énergie et la charge croissent de $62\\ \\%$, et $f_0$ passe de $251$ à $149\\ \\mathrm{kHz}$.",
        resume: "Longueur du câble",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>À rampe égale, doubler l'inertie de la machine entraînée quadruple l'énergie renvoyée au bus par une charge quadratique.</p>",
        reponse: true,
        explication: "$W_g = \\eta J^2\\Omega_0^3/(4C_0T)$ : l'énergie croît comme $J^2$.",
        resume: "Inertie au carré",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>KM2 resté ouvert : $V_0 = 538{,}5\\ \\mathrm{V}$, $R_t = 47{,}389\\ \\Omega$. Puissance maximale transmissible au bus, en watts ?</p>",
        valeur: (538.5 * 538.5) / (4 * 47.389),
        unite: "W",
        tolerance: 0.02,
        explication: "$P_{max} = V_0^2/(4R_t) = 538{,}5^2/189{,}56 = 1530\\ \\mathrm{W}$.",
        resume: "Puissance maximale",
      },
      {
        type: "courte",
        enonce: repere(9) + "<p>Que faut-il impérativement faire avant un essai d'isolement du câble et du moteur d'un variateur ?</p>",
        motsCles: [["deconnect", "debranch", "separ", "isoler du variateur"], ["variateur"], ["consign", "absence de tension", "verifi", "decharg"]],
        minimum: 2,
        explication: "Consigner, attendre la décharge et vérifier l'absence de tension, puis déconnecter câble et moteur du variateur : la tension d'essai détruirait l'électronique.",
        resume: "Essai d'isolement",
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
      { categorie: "Image", question: "Quels sont les réservoirs d'énergie d'un variateur ?", reponse: "Le bus, environ $315\\ \\mathrm{J}$ utiles ; l'inertie, $5965\\ \\mathrm{J}$ ; le dissipateur, $3600\\ \\mathrm{J/K}$ ; les capacités du câble, $510\\ \\mu\\mathrm{J}$ par front. Chaque défaut typique est un débordement." },
      { categorie: "Bus", question: "Quelle équation donne la tension d'un bus chargé à puissance constante ?", reponse: "$V^2 - V_0V + R_tP = 0$, racine haute $V = (V_0 + \\sqrt{V_0^2 - 4R_tP})/2$ ; la racine basse est instable." },
      { categorie: "Précharge", question: "Quelle est la signature d'un contacteur de précharge resté ouvert ?", reponse: "Bus normal à l'arrêt, sous-tension quelques secondes après la marche : $P_{max} = V_0^2/(4R_t) = 1{,}53\\ \\mathrm{kW}$ pour la pompe, et $R_p$ qui chauffe." },
      { categorie: "Freinage", question: "Quelle énergie une pompe centrifuge renvoie-t-elle au bus pendant une rampe ?", reponse: "$W_g = \\eta J^2\\Omega_0^3/(4C_0T)$, indépendante de la vitesse de départ au-dessus de $\\Omega_x$ ; $109\\ \\mathrm{J}$ en $10\\ \\mathrm{s}$, $546\\ \\mathrm{J}$ en $2\\ \\mathrm{s}$." },
      { categorie: "Rampe", question: "Comment choisir la rampe de décélération ?", reponse: "$T_{min} = \\eta J^2\\Omega_0^3/(2C_0C(V_{lim}^2 - V_0^2))$ : $3{,}47\\ \\mathrm{s}$ pour la pompe ; marge sur $J$, qui pèse au carré, et sur $V_0$, jusqu'à $622\\ \\mathrm{V}$." },
      { categorie: "Régulateur", question: "Que fait le régulateur de surtension ?", reponse: "Il refuse l'énergie au-delà de $760\\ \\mathrm{V}$ et allonge la rampe réelle : pas de déclenchement, mais pas d'arrêt plus court." },
      { categorie: "Thermique", question: "Comment diagnostiquer un dissipateur encrassé ?", reponse: "Mesurer $T_h$, $T_a$ et estimer $P$ en régime stable : $R_{ha} = (T_h - T_a)/P$, à comparer à la valeur saine de $0{,}12\\ \\mathrm{K/W}$." },
      { categorie: "Signature", question: "Ventilateur arrêté ou encrassement : comment les distinguer ?", reponse: "Ventilateur arrêté : déclenchement en une minute au nominal, en toute saison. Encrassement : défaut l'après-midi, en été, au fort débit, et seulement alors." },
      { categorie: "Mode commun", question: "Que change un câble plus long sur le mode commun ?", reponse: "Presque rien sur la crête, $(E/3)/Z_0$ ; tout sur la charge, l'énergie et la durée de chaque oscillation : $+62\\ \\%$ de $85$ à $150\\ \\mathrm{m}$." },
      { categorie: "Sécurité", question: "Quelles sont les deux règles absolues avant de mesurer ?", reponse: "Vérifier l'absence de tension sur le bus après le délai de décharge ; ne jamais faire d'essai d'isolement variateur raccordé." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["P = V (V0 - V) / R", "= 510 × (538,5 - 510) / 0,389", "= 510 × 28,5 / 0,389 = 37,4 kW"], "Puissance qui amène le bus à 510 V sous 400 V de réseau."),
  etapes(["crête = (E/3) / Z0", "Z0 = √(L/C) ne dépend pas de la longueur", "8,9 A sur 85 m, 8,6 A sur 150 m"], "Crête de mode commun."),
  etapes(["été, après-midi, fort débit : seulement alors", "R_ha accrue : encrassement ou air chaud", "ventilateur arrêté : 1 min au nominal, toute saison"], "Signature de l'encrassement."),
  etapes(["W = ½ C V̂²", "= 0,5 × 2,2e-3 × 565,7²", "= 352 J par mise sous tension"], "Énergie dissipée par la précharge."),
  etapes(["court-circuit de bras : détruit en ~10 µs", "fusible aR : fond en millisecondes", "seule la désaturation dans le driver agit à temps"], "Fusible et court-circuit de bras."),
  etapes(["t = ½ C (V1² - V2²) / P", "= 1,1e-3 × (523,9² - 400²) / 19 700", "= 1,1e-3 × 114 471 / 19 700 = 6,39 ms"], "Maintien du bus à puissance constante."),
  etapes(["R_th = 10 000 + 250 = 10 250 Ω", "f_c = 1 / (2π R_th C)", "= 1 / (2π × 10 250 × 1e-6) = 15,5 Hz"], "Coupure avec la résistance de Thévenin."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Réseau à $400\\ \\mathrm{V}$, KM2 fermé ($V_0 = 538{,}5\\ \\mathrm{V}$, $R = 0{,}389\\ \\Omega$). Quelle puissance prélevée amène le bus au seuil de repli de $510\\ \\mathrm{V}$, en kilowatts ?</p>",
        valeur: pourTension(400, 510, R_PONT) / 1000,
        unite: "kW",
        tolerance: 0.02,
        explication: "$P = V(V_0 - V)/R = 510 \\times 28{,}5/0{,}389 = 37{,}4\\ \\mathrm{kW}$, au-delà de la pleine vitesse : à $400\\ \\mathrm{V}$, pas de repli.",
        resume: "Frontière de repli",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Passer de $85$ à $150\\ \\mathrm{m}$ de câble fait presque doubler la crête du courant de mode commun par front.</p>",
        reponse: false,
        explication: "La crête vaut $(E/3)/Z_0$ et $Z_0 = \\sqrt{L/C}$ est une propriété par mètre : $8{,}9$ puis $8{,}6\\ \\mathrm{A}$.",
        resume: "Crête de mode commun",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Un variateur déclenche en surchauffe l'après-midi en été, au fort débit, jamais le matin. Cause la plus probable ?</p>",
        options: ["Ventilateur arrêté", "Ailettes encrassées ou air de l'armoire trop chaud", "Court-circuit de bras", "Réseau trop haut"],
        bonnes: [1],
        explication: "Un ventilateur arrêté déclencherait en une minute au nominal en toute saison ; ici, seule la conjonction air chaud et forte charge suffit : $R_{ha}$ a augmenté.",
        resume: "Encrassement",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Énergie dissipée dans la résistance de précharge du bus de $2{,}2\\ \\mathrm{mF}$ chargé jusqu'à la crête de $565{,}7\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.5 * CBUS * 565.7 * 565.7,
        unite: "J",
        tolerance: 0.01,
        explication: "$\\tfrac12 \\times 2{,}2 \\times 10^{-3} \\times 565{,}7^2 = 352\\ \\mathrm{J}$, quelle que soit la valeur de $R_p$.",
        resume: "Énergie de précharge",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours précédent. Les fusibles aR d'entrée protègent les IGBT d'un court-circuit de bras de l'onduleur.</p>",
        reponse: false,
        explication: "Un fusible agit en millisecondes ; un IGBT désaturé est détruit en une dizaine de microsecondes. Seule la désaturation dans le driver agit à temps.",
        resume: "Fusible et IGBT",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Le bus de $2{,}2\\ \\mathrm{mF}$ est à $523{,}9\\ \\mathrm{V}$ quand le réseau disparaît ; l'onduleur prélève $19{,}7\\ \\mathrm{kW}$ constants. Combien de temps avant $400\\ \\mathrm{V}$, en millisecondes ?</p>",
        valeur: (0.5 * CBUS * (523.9 * 523.9 - 400 * 400) / 19700) * 1000,
        unite: "ms",
        tolerance: 0.02,
        explication: "$t = \\tfrac12 C(V_1^2 - V_2^2)/P = 1{,}1 \\times 10^{-3} \\times 114\\,471/19\\,700 = 6{,}39\\ \\mathrm{ms}$ : le bus ne franchit pas une microcoupure d'une demi-période.",
        resume: "Maintien à puissance constante",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Une mesure $4$-$20\\ \\mathrm{mA}$ est lue sur un shunt de $250\\ \\Omega$, suivi d'un filtre RC de $10\\ \\mathrm{k\\Omega}$ et $1\\ \\mu\\mathrm{F}$ attaquant une entrée de très grande impédance. Fréquence de coupure, en hertz, en tenant compte de la source ?</p>",
        valeur: 1 / (TAU * 10250 * 1e-6),
        unite: "Hz",
        tolerance: 0.02,
        explication: "Le condensateur voit $R_{th} = 10\\,000 + 250 = 10\\,250\\ \\Omega$ : $f_c = 1/(2\\pi \\times 10\\,250 \\times 10^{-6}) = 15{,}5\\ \\mathrm{Hz}$, et $-48\\ \\mathrm{dB}$ à $4\\ \\mathrm{kHz}$.",
        resume: "Filtre de mesure",
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
    titre: "Où en suis-je sur l'intégration et le diagnostic d'un variateur ?",
  });
  if (auto) ressources.push(auto);
}
