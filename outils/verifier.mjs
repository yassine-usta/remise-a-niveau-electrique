#!/usr/bin/env node
/* ==========================================================================
   outils/verifier.mjs
   Contrôles d'intégrité du site, sans aucune dépendance.
   Sortie non nulle en cas d'échec : utilisable tel quel dans la routine
   quotidienne avant la publication d'un nouveau cours.

   Usage : node outils/verifier.mjs
   ========================================================================== */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const erreurs = [];
const avertissements = [];
let controles = 0;

function chemin(...parties) {
  return join(RACINE, ...parties);
}

function relatif(absolu) {
  return relative(RACINE, absolu).split("\\").join("/");
}

function verifier(condition, message) {
  controles += 1;
  if (!condition) erreurs.push(message);
  return Boolean(condition);
}

function avertir(condition, message) {
  if (!condition) avertissements.push(message);
}

function lire(absolu) {
  return readFileSync(absolu, "utf8");
}

function lireJson(relatifChemin) {
  const absolu = chemin(relatifChemin);
  controles += 1;
  if (!existsSync(absolu)) {
    erreurs.push("Fichier absent : " + relatifChemin);
    return null;
  }
  try {
    return JSON.parse(lire(absolu));
  } catch (erreur) {
    erreurs.push("JSON invalide dans " + relatifChemin + " : " + erreur.message);
    return null;
  }
}

/* --------------------------------------------------------------------------
   1. Fichiers de données
   -------------------------------------------------------------------------- */

const sommaire = lireJson("data/sommaire.json");
const modules = lireJson("data/modules.json");
const progression = lireJson("data/progression.json");

verifier(Array.isArray(sommaire), "data/sommaire.json doit contenir un tableau.");
verifier(Array.isArray(modules) && modules.length > 0, "data/modules.json doit contenir un tableau non vide.");
verifier(progression && typeof progression === "object", "data/progression.json doit contenir un objet.");

if (Array.isArray(modules)) {
  for (const module of modules) {
    verifier(
      module && typeof module.id === "string" && typeof module.titre === "string",
      "Chaque module doit porter un id et un titre : " + JSON.stringify(module)
    );
    verifier(
      Number.isInteger(module.jour_debut) && Number.isInteger(module.jour_fin) && module.jour_debut <= module.jour_fin,
      "Bornes de jours incohérentes pour le module " + (module && module.id)
    );
  }
  const couverture = new Set();
  for (const module of modules) {
    for (let jour = module.jour_debut; jour <= module.jour_fin; jour += 1) couverture.add(jour);
  }
  verifier(couverture.size === 90, "Les modules doivent couvrir exactement les 90 jours, or " + couverture.size + " jours sont couverts.");
}

/* --------------------------------------------------------------------------
   2. Cohérence de la progression
   -------------------------------------------------------------------------- */

if (progression && typeof progression === "object") {
  const historique = Array.isArray(progression.historique) ? progression.historique : null;
  verifier(historique !== null, "data/progression.json doit contenir un tableau historique.");
  if (historique) {
    verifier(
      progression.prochain_jour === historique.length + 1,
      "prochain_jour doit valoir " + (historique.length + 1) + " (entrées d'historique plus un), or il vaut " + progression.prochain_jour + "."
    );
  }
  verifier(progression.total_jours === 90, "total_jours doit valoir 90.");
  verifier(Array.isArray(progression.fil_rouge), "data/progression.json doit contenir un tableau fil_rouge.");
}

/* --------------------------------------------------------------------------
   3. Entrées du sommaire et dossiers de cours
   -------------------------------------------------------------------------- */

const slugsSommaire = [];

if (Array.isArray(sommaire)) {
  const vus = new Set();
  for (const entree of sommaire) {
    const nom = entree && entree.slug ? String(entree.slug) : "(sans slug)";
    if (!verifier(entree && typeof entree.slug === "string" && entree.slug.length > 0, "Entrée de sommaire sans slug : " + JSON.stringify(entree))) continue;
    verifier(!vus.has(entree.slug), "Slug en double dans data/sommaire.json : " + entree.slug);
    vus.add(entree.slug);
    slugsSommaire.push(entree.slug);

    verifier(/^[a-z0-9-]+$/.test(entree.slug), "Slug non conforme (minuscules, chiffres et tirets) : " + entree.slug);
    verifier(typeof entree.titre === "string" && entree.titre.trim().length > 0, "Titre manquant pour " + nom);
    verifier(typeof entree.module === "string" && entree.module.length > 0, "Module manquant pour " + nom);
    verifier(Number.isInteger(entree.ordre) && entree.ordre >= 1 && entree.ordre <= 90, "Ordre invalide pour " + nom);
    verifier(typeof entree.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entree.date), "Date manquante ou mal formée (AAAA-MM-JJ) pour " + nom);
    verifier(typeof entree.resume === "string" && entree.resume.trim().length > 0, "Résumé manquant pour " + nom);
    verifier(Number.isFinite(entree.duree_min) && entree.duree_min > 0, "Durée manquante ou invalide pour " + nom);

    if (Array.isArray(modules) && typeof entree.module === "string") {
      verifier(
        modules.some((module) => module.id === entree.module),
        "Le module " + entree.module + " de " + nom + " n'existe pas dans data/modules.json"
      );
    }

    const dossier = chemin("cours", entree.slug);
    if (verifier(existsSync(dossier) && statSync(dossier).isDirectory(), "Dossier manquant : cours/" + entree.slug + "/")) {
      verifier(existsSync(join(dossier, "contenu.html")), "Fichier manquant : cours/" + entree.slug + "/contenu.html");
      verifier(existsSync(join(dossier, "cours.js")), "Fichier manquant : cours/" + entree.slug + "/cours.js");
    }
  }

  const ordres = sommaire.filter((entree) => entree && Number.isInteger(entree.ordre)).map((entree) => entree.ordre);
  avertir(new Set(ordres).size === ordres.length, "Plusieurs cours partagent le même numéro d'ordre.");
}

/* --------------------------------------------------------------------------
   4. Dossiers présents dans cours/
   -------------------------------------------------------------------------- */

const dossierCours = chemin("cours");
const dossiers = existsSync(dossierCours)
  ? readdirSync(dossierCours, { withFileTypes: true })
      .filter((entree) => entree.isDirectory())
      .map((entree) => entree.name)
  : [];

for (const nom of dossiers) {
  if (nom !== "_demo" && slugsSommaire.length && !slugsSommaire.includes(nom)) {
    avertissements.push("Le dossier cours/" + nom + "/ n'est référencé par aucune entrée de data/sommaire.json");
  }

  const fichierContenu = join(dossierCours, nom, "contenu.html");
  if (verifier(existsSync(fichierContenu), "Fichier manquant : cours/" + nom + "/contenu.html")) {
    const contenu = lire(fichierContenu);

    verifier(!/<script\b/i.test(contenu), "cours/" + nom + "/contenu.html ne doit contenir aucune balise script.");
    verifier(!/<\/?(html|head|body)\b/i.test(contenu), "cours/" + nom + "/contenu.html doit être un fragment, sans html, head ni body.");

    const balise = contenu.match(/<article\b[^>]*>/i);
    if (verifier(Boolean(balise), "cours/" + nom + "/contenu.html doit avoir un article pour racine.")) {
      const ouverture = balise[0];
      verifier(/class\s*=\s*["'][^"']*\bcours\b/i.test(ouverture), "L'article racine de cours/" + nom + " doit porter la classe cours.");
      const attribut = ouverture.match(/data-slug\s*=\s*["']([^"']+)["']/i);
      if (verifier(Boolean(attribut), "L'article racine de cours/" + nom + " doit porter un attribut data-slug.")) {
        verifier(
          attribut[1] === nom,
          "data-slug vaut " + attribut[1] + " alors que le dossier est cours/" + nom + "/"
        );
      }
    }

    verifier(/<h2\b/i.test(contenu), "cours/" + nom + "/contenu.html doit contenir au moins une section h2.");
    const titresSansId = (contenu.match(/<h2\b[^>]*>/gi) || []).filter((titre) => !/\bid\s*=/.test(titre));
    verifier(titresSansId.length === 0, "Chaque h2 de cours/" + nom + "/contenu.html doit porter un id (" + titresSansId.length + " sans id).");
  }
}

/* --------------------------------------------------------------------------
   5. Syntaxe des modules JavaScript
   -------------------------------------------------------------------------- */

const fichiersJs = [chemin("assets/js/app.js"), chemin("assets/js/moteur.js")];
for (const nom of dossiers) {
  const fichier = join(dossierCours, nom, "cours.js");
  if (verifier(existsSync(fichier), "Fichier manquant : cours/" + nom + "/cours.js")) fichiersJs.push(fichier);
}

for (const fichier of fichiersJs) {
  if (!existsSync(fichier)) {
    verifier(false, "Fichier JavaScript manquant : " + relatif(fichier));
    continue;
  }
  controles += 1;
  try {
    execFileSync(process.execPath, ["--check", fichier], { stdio: "pipe" });
  } catch (erreur) {
    const details = String(erreur.stderr || erreur.message).split("\n").slice(0, 4).join(" ").trim();
    erreurs.push("Erreur de syntaxe dans " + relatif(fichier) + " : " + details);
  }
  const source = lire(fichier);
  if (fichier.endsWith("cours.js")) {
    verifier(/export\s+(async\s+)?function\s+init\b/.test(source), relatif(fichier) + " doit exporter une fonction init.");
    verifier(/export\s+function\s+detruire\b/.test(source), relatif(fichier) + " doit exporter une fonction detruire.");
  }
}

/* --------------------------------------------------------------------------
   6. Typographie : pas de tiret cadratin, de demi-cadratin ni d'emoji
   -------------------------------------------------------------------------- */

function fichiersARelire() {
  const liste = [chemin("index.html"), chemin("assets/css/site.css"), chemin("assets/js/app.js"), chemin("assets/js/moteur.js")];
  for (const nom of dossiers) {
    for (const fichier of ["contenu.html", "cours.js"]) {
      const absolu = join(dossierCours, nom, fichier);
      if (existsSync(absolu)) liste.push(absolu);
    }
  }
  return liste.filter((absolu) => existsSync(absolu));
}

const interdits = [
  { motif: /\u2014/g, nom: "tiret cadratin" },
  { motif: /\u2013/g, nom: "demi-cadratin" },
  { motif: /\p{Extended_Pictographic}/gu, nom: "emoji" },
];

for (const fichier of fichiersARelire()) {
  const source = lire(fichier);
  const lignes = source.split("\n");
  for (const interdit of interdits) {
    controles += 1;
    const positions = [];
    lignes.forEach((ligne, index) => {
      interdit.motif.lastIndex = 0;
      if (interdit.motif.test(ligne)) positions.push(index + 1);
    });
    if (positions.length) {
      erreurs.push(
        relatif(fichier) + " contient un " + interdit.nom + " (ligne" + (positions.length > 1 ? "s" : "") + " " + positions.slice(0, 8).join(", ") + ")"
      );
    }
  }
}

/* --------------------------------------------------------------------------
   7. Fichiers structurants du site
   -------------------------------------------------------------------------- */

for (const attendu of [
  "programme/programme-90-jours.md",
  "index.html",
  "assets/css/site.css",
  "assets/js/app.js",
  "assets/js/moteur.js",
  "cours/_demo/contenu.html",
  "cours/_demo/cours.js",
  ".nojekyll",
  "package.json",
]) {
  verifier(existsSync(chemin(attendu)), "Fichier attendu manquant : " + attendu);
}

const indexSource = existsSync(chemin("index.html")) ? lire(chemin("index.html")) : "";
verifier(!/(src|href)\s*=\s*["']\//.test(indexSource), "index.html doit n'utiliser que des chemins relatifs (le site est publié dans un sous-dossier).");

/* --------------------------------------------------------------------------
   Rapport
   -------------------------------------------------------------------------- */

const cours = slugsSommaire.length;
console.log("");
console.log("Vérification du parcours de remise à niveau");
console.log("-------------------------------------------");
console.log("Cours au sommaire  : " + cours + " sur 90");
console.log("Dossiers de cours  : " + dossiers.length + " (dont la démonstration)");
console.log("Contrôles effectués : " + controles);

if (avertissements.length) {
  console.log("");
  console.log("Avertissements :");
  for (const message of avertissements) console.log("  . " + message);
}

if (erreurs.length) {
  console.log("");
  console.log("Erreurs (" + erreurs.length + ") :");
  for (const message of erreurs) console.log("  x " + message);
  console.log("");
  process.exit(1);
}

console.log("");
console.log("Tout est conforme.");
console.log("");
