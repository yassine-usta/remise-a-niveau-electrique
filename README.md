# Remise à niveau en ingénierie électrique, 90 jours

Site statique publiant, jour après jour, un parcours de remise à niveau en ingénierie électrique.
Chaque séance est un cours autonome : intuition physique, théorie dérivée, schémas, exercices corrigés,
quiz, fiche de mémorisation et auto-évaluation, le tout jouable directement dans le navigateur.

**Adresse du site** : https://yassine-usta.github.io/remise-a-niveau-electrique/

Le programme pédagogique officiel est `programme/programme-90-jours.md`. Ce fichier ne doit jamais être
modifié : il fait foi pour la structure imposée de chaque cours (sections A à P) et pour le plan des 90 jours.

## Fonctionnement

Chaque soir, une routine clone ce dépôt, produit le cours du jour suivant en respectant le programme,
puis pousse le résultat sur `main`. Le site est servi par GitHub Pages depuis la racine de `main`,
sans étape de build : pas de bundler, pas de dépendance à installer, uniquement des fichiers statiques.

Les bibliothèques externes sont chargées depuis `cdn.jsdelivr.net` avec des versions fixées :
GSAP 3.12.5 et ScrollTrigger, Lenis 1.1.14, KaTeX 0.16.11 avec son rendu automatique, Mermaid 10.9.1.
Si l'une d'elles est inaccessible, le site reste lisible et navigable.

## Structure du dépôt

```
index.html                     coquille unique du site
assets/css/site.css            thème clair et sombre, mise en page, composants
assets/js/app.js               navigation, routage par hash, chargement des cours, Lenis, GSAP
assets/js/moteur.js            bibliothèque partagée : exercices, quiz, cartes, simulations
cours/<slug>/contenu.html      texte d'une séance, fragment HTML
cours/<slug>/cours.js          partie interactive de la séance
cours/_demo/                   démonstration du moteur, non listée au sommaire
data/sommaire.json             liste des cours publiés
data/modules.json              les quatorze modules du parcours
data/progression.json          état d'avancement, paramètres et fil rouge
programme/programme-90-jours.md  programme officiel, non modifiable
outils/verifier.mjs            contrôles d'intégrité, sans dépendance
```

## Contrat d'un cours

Un cours est un dossier `cours/<slug>/` composé de deux fichiers obligatoires et d'un dossier facultatif.

### `contenu.html`

Fragment HTML, sans `<html>`, `<head>`, `<body>` ni `<script>`. Sa racine est :

```html
<article class="cours" data-slug="<slug>">
  <h2 id="a-pourquoi">A. Pourquoi cette notion est importante</h2>
  ...
</article>
```

- Les sections suivent les lettres A à P du programme, chaque `h2` portant un `id` unique.
- Les formules sont écrites en KaTeX, entre `$...$` en ligne et `$$...$$` en bloc.
- Les diagrammes Mermaid sont placés dans `<pre class="mermaid">`, les schémas ASCII dans `<pre class="ascii">`.
- Les points de montage des composants interactifs sont de simples conteneurs vides, par exemple
  `<div id="exercices"></div>`, remplis par `cours.js`.

Classes utilitaires disponibles : `encadre` (avec les variantes `attention`, `astuce`, `hypothese`,
`industriel`), `encadre-titre`, `formule-cle`, `formule-cle-legende`, `grille-2`, `liste-objectifs`,
`cadre-tableau`, `ascii`.

### `cours.js`

Module ES exposant exactement deux fonctions :

```js
export async function init(racine, api) { /* construit la partie interactive */ }
export function detruire() { /* libère tout ce que init a créé */ }
```

`racine` est l'élément `<article class="cours">` inséré dans la page. `api` est le moteur commun.
`detruire()` est appelée avant le chargement du cours suivant : toute simulation, tout écouteur et
tout minuteur créé par `init` doit y être libéré.

### `assets/` (facultatif)

Images ou SVG propres à la séance, référencés en chemin relatif depuis `contenu.html`.

### Entrée au sommaire

Chaque cours ajoute une entrée à `data/sommaire.json` :

```json
{
  "slug": "regime-transitoire-rc",
  "titre": "Régime transitoire RC",
  "module": "stockage-energie-transitoires",
  "ordre": 10,
  "date": "2026-01-15",
  "resume": "Charge et décharge d'un condensateur, constante de temps et lecture des chronogrammes.",
  "duree_min": 90
}
```

`ordre` est le numéro interne du jour : il sert au tri et n'apparaît jamais dans l'interface.
Les cours sont toujours présentés par leur titre.

## Le moteur commun

`cours.js` reçoit l'objet `api`, seul point d'entrée autorisé.

| Appel | Rôle |
| --- | --- |
| `api.gsap`, `api.ScrollTrigger`, `api.lenis` | bibliothèques déjà initialisées, ou `null` |
| `api.mouvementReduit` | vrai si l'utilisateur demande des animations réduites |
| `api.reveler(elements, options)` | apparition au défilement |
| `api.exercice.qcm(conteneur, def)` | choix unique ou multiple |
| `api.exercice.vraiFaux(conteneur, def)` | affirmation à trancher |
| `api.exercice.numerique(conteneur, def)` | résultat chiffré, unité et tolérance relative |
| `api.exercice.reponseCourte(conteneur, def)` | réponse rédigée, jugée sur des mots-clés |
| `api.exercice.schema(conteneur, def)` | clic sur les zones d'un SVG |
| `api.quiz(conteneur, questions, options)` | enchaînement de questions et score final |
| `api.cartes(conteneur, cartes, options)` | cartes question-réponse qui se retournent |
| `api.autoEvaluation(conteneur, criteres, options)` | grille de 0 à 4, mémorisée localement |
| `api.sim.curseurs(conteneur, parametres, rappel)` | curseurs avec valeur et unité |
| `api.sim.traceur(conteneur, options)` | courbes, axes gradués, légende |
| `api.sim.oscilloscope(conteneur, options)` | signaux défilants, base de temps réglable |
| `api.sim.fresnel(conteneur, options)` | phaseurs animés et projections |
| `api.sim.bode(conteneur, options)` | gain et phase en échelle logarithmique |
| `api.sim.spectre(conteneur, options)` | spectre en barres |
| `api.stockage.lire / ecrire / effacer` | mémoire locale propre au cours |
| `api.util.formater / lireNombre / normaliser` | utilitaires de calcul et de comparaison |

Règle commune aux exercices : la correction reste masquée jusqu'à une tentative ou un clic explicite sur
"Voir la correction". Elle est ensuite révélée étape par étape, et chaque exercice accepte une fonction
`visuelCorrection(conteneur, api)` pour ajouter un tracé, un schéma annoté ou un phaseur animé.

Toutes les simulations s'adaptent au redimensionnement et au thème, se mettent en pause hors de l'écran
et exposent une méthode `detruire()`.

La page `#/demo` montre l'ensemble de ces composants en fonctionnement sur un circuit RC. Elle sert de
test du moteur et de modèle pour la rédaction d'un nouveau cours.

## Vérification et mise au point

```bash
node outils/verifier.mjs      # contrôles d'intégrité, sortie non nulle en cas d'échec
python3 -m http.server 8080   # puis ouvrir http://localhost:8080/
```

Le script contrôle la validité des fichiers JSON, l'unicité des slugs, la présence des fichiers de chaque
cours, l'absence de balise `script` dans les contenus, la concordance des `data-slug`, la syntaxe de tous
les modules JavaScript, la cohérence de `prochain_jour` avec l'historique, l'absence de tiret cadratin,
de demi-cadratin et d'emoji, et la présence du programme.

## Conventions de rédaction

Français avec tous les accents, y compris sur les capitales. Guillemets droits uniquement. Aucun tiret
cadratin ni demi-cadratin, aucun double tiret en guise de ponctuation. Aucun emoji. Unités du système
international, séparateur décimal français dans les textes, notation anglo-saxonne tolérée dans le code.

## Accessibilité

Thème clair et sombre avec bascule, respect de `prefers-reduced-motion` (animations réduites et défilement
fluide désactivé), navigation complète au clavier, palette de recherche par `Ctrl+K`, mise en page sans
défilement horizontal dès 360 pixels de large. La mémorisation locale est facultative : le site reste
pleinement fonctionnel lorsque le stockage du navigateur est refusé.
