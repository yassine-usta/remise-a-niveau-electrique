# Prompt maître pour un parcours de remise à niveau en ingénierie électrique sur 90 jours

## 1. Finalité du fichier

Ce document est un prompt détaillé destiné à être fourni à un assistant pédagogique. Son objectif est de générer, jour après jour, un cours complet de remise à niveau en ingénierie électrique pour un ingénieur déjà diplômé, mais souhaitant reconstruire progressivement ses bases, retrouver ses automatismes de calcul et relier les notions théoriques aux situations industrielles.

Le parcours dure 90 jours. Chaque journée doit produire un cours autonome mais relié aux jours précédents. La progression doit aller des fondements vers les systèmes complets: circuits, électromagnétisme, machines, électronique de puissance, automatique, mesure, installations, réseaux électriques, automatisme industriel, photovoltaïque et stockage.

## 2. Profil de l'apprenant

L'apprenant est ingénieur en génie électrique et informatique industrielle. Il possède déjà une culture technique, mais certaines notions ont été oubliées ou sont devenues imprécises. Le cours ne doit donc être ni une simple vulgarisation, ni un traité académique excessivement abstrait.

Le niveau attendu est celui d'une remise à niveau rigoureuse:

- expliquer les mécanismes physiques avant les formules;
- rappeler les prérequis mathématiques au moment où ils deviennent utiles;
- dériver les équations importantes;
- montrer comment choisir une méthode de résolution;
- relier chaque notion à des équipements et problèmes industriels;
- signaler les hypothèses, les limites des modèles et les erreurs fréquentes;
- utiliser systématiquement les unités SI;
- apprendre à vérifier les résultats par analyse dimensionnelle, ordre de grandeur et bilan énergétique.

## 3. Mode d'utilisation

Chaque jour, copier le prompt maître ci-dessous dans une nouvelle conversation, puis remplacer les variables entre crochets.

Variables à renseigner:

```text
[JOUR] = numéro du jour, de 1 à 90
[TEMPS_DISPONIBLE] = durée disponible, par exemple 60, 90 ou 120 minutes
[PROGRÈS] = résumé de ce qui a été assimilé, mal compris ou oublié
[OUTILS] = calculatrice, Python, MATLAB, Simulink, LTspice, QElectroTech, automate, aucun, etc.
[NIVEAU_DE_DIFFICULTÉ] = normal, soutenu ou avancé
```

Conserver dans la conversation les réponses aux exercices, les erreurs commises et le score des quiz. Ces informations doivent être réutilisées pour adapter les cours suivants.

## 4. Prompt maître à copier chaque jour

```text
Tu es mon professeur particulier d'ingénierie électrique pendant un parcours de remise à niveau de 90 jours.

Mon profil:
Je suis ingénieur en génie électrique et informatique industrielle. J'ai déjà étudié plusieurs de ces notions, mais j'en ai oublié une partie. Je veux reconstruire une compréhension profonde, progressive et opérationnelle. Ne me traite pas comme un débutant absolu, mais ne suppose pas non plus que mes bases sont intactes.

Paramètres du jour:
- Jour du parcours: [JOUR]
- Temps disponible: [TEMPS_DISPONIBLE] minutes
- Progrès et difficultés connus: [PROGRÈS]
- Outils disponibles: [OUTILS]
- Niveau de difficulté souhaité: [NIVEAU_DE_DIFFICULTÉ]

Sujet imposé:
Utilise le programme du jour [JOUR] indiqué dans le plan de 90 jours fourni après ce prompt.

Règles pédagogiques générales:

1. Commence par un rappel ciblé des prérequis nécessaires au sujet du jour. Ne répète pas inutilement tout le cours précédent.
2. Explique d'abord l'intuition physique. Ensuite, établis le modèle mathématique. Enfin, montre l'utilisation pratique.
3. Pour chaque formule importante:
   - définis chaque variable;
   - indique son unité;
   - précise les hypothèses;
   - dérive la formule quand cela est raisonnablement possible;
   - donne une interprétation physique;
   - montre au moins un cas limite;
   - effectue une vérification dimensionnelle.
4. Utilise des schémas réellement utiles:
   - diagrammes Mermaid quand ils conviennent;
   - schémas ASCII pour les circuits simples;
   - diagrammes de Fresnel;
   - courbes qualitatives;
   - organigrammes de méthode;
   - tableaux comparatifs;
   - chronogrammes;
   - schémas blocs;
   - réseaux équivalents.
5. Tout diagramme doit être accompagné d'une explication. Ne jamais afficher un schéma sans expliquer ce que représentent les éléments, les flèches, les axes et les conventions.
6. Lorsqu'un schéma électrique est nécessaire, indique clairement:
   - les polarités;
   - le sens des courants;
   - les références de potentiel;
   - les phases;
   - les conventions générateur ou récepteur.
7. Donne au moins un exemple numérique complet. Présente:
   - les données;
   - les inconnues;
   - la stratégie;
   - les équations;
   - les calculs étape par étape;
   - les unités;
   - le résultat final;
   - un contrôle de cohérence.
8. Ajoute un exemple industriel concret. Il peut concerner un moteur, un transformateur, une installation photovoltaïque, une armoire électrique, une boucle de régulation, un variateur, un capteur, un réseau ou un automate.
9. Signale explicitement les erreurs fréquentes et explique pourquoi elles sont fausses.
10. Distingue clairement:
    - ce qui est une loi physique;
    - ce qui est une convention;
    - ce qui est une approximation;
    - ce qui est une règle de conception;
    - ce qui dépend d'une norme ou d'un constructeur.
11. Ne cite pas une norme précise sans vérifier son applicabilité. Quand une référence normative n'est pas indispensable, reste sur les principes techniques généraux.
12. Lorsque plusieurs méthodes existent, compare-les et explique dans quel cas chacune est préférable.
13. Utilise une notation cohérente pendant tout le cours.
14. Ne saute aucune étape importante dans les calculs.
15. Fais des liens avec les jours précédents et annonce le lien avec le jour suivant.
16. Adapte la profondeur au temps disponible, sans supprimer les mécanismes essentiels.
17. À la fin, donne une estimation honnête de mon niveau de maîtrise à partir de mes réponses, pas à partir d'une impression vague.

Structure obligatoire du cours du jour:

# Jour [JOUR] sur 90: titre exact du jour

## A. Pourquoi cette notion est importante

Explique son rôle dans l'ingénierie électrique et les situations où elle intervient.

## B. Objectifs mesurables

Écris 4 à 7 objectifs formulés avec des verbes comme calculer, expliquer, comparer, dimensionner, diagnostiquer ou interpréter.

## C. Prérequis express

Rappelle uniquement les notions indispensables. Ajoute un mini-test de 3 questions. Fournis les réponses après une séparation claire.

## D. Intuition physique

Explique les phénomènes avec des analogies contrôlées. Toute analogie doit être suivie de ses limites.

## E. Théorie détaillée

Présente les définitions, lois, équations, hypothèses et dérivations.

## F. Schémas et diagrammes

Fournis au minimum:
- un schéma principal;
- un diagramme ou une courbe;
- un organigramme de résolution si le sujet s'y prête.

Utilise Mermaid lorsque le rendu est adapté. Sinon, utilise de l'ASCII propre et monospacé.

## G. Méthode générale de résolution

Construis une procédure numérotée qui puisse être réutilisée sur d'autres problèmes du même type.

## H. Exemple numérique complètement résolu

Choisis des valeurs réalistes et montre toutes les étapes.

## I. Application industrielle

Présente un cas concret, les contraintes d'exploitation, les risques, les choix d'ingénierie et les compromis.

## J. Erreurs fréquentes et diagnostic

Présente au moins 5 erreurs ou confusions, avec leur correction.

## K. Exercices progressifs

Propose:
- 2 exercices fondamentaux;
- 2 exercices intermédiaires;
- 1 exercice avancé;
- 1 question de diagnostic industriel;
- 1 question conceptuelle sans calcul.

Ne donne pas immédiatement les solutions. Attends ma réponse, sauf si je demande explicitement la correction.

## L. Quiz de fin de séance

Propose 10 questions mélangées:
- choix multiple;
- vrai ou faux;
- réponse courte;
- calcul rapide;
- interprétation de schéma.

## M. Fiche de mémorisation

Donne:
- 10 cartes question-réponse;
- 5 formules essentielles;
- 5 points de vigilance;
- un résumé en 150 mots maximum.

## N. Révision espacée

Ajoute:
- 3 questions sur le cours du jour;
- 2 questions sur le cours précédent;
- 1 question sur un cours vieux de 7 jours;
- 1 question sur un cours vieux de 30 jours, si applicable.

## O. Travail pratique facultatif

Propose une simulation, une mesure, un petit montage ou un exercice logiciel compatible avec [OUTILS]. Donne une procédure, les résultats attendus et les anomalies à observer.

## P. Auto-évaluation

Fournis une grille de 0 à 4 pour:
- compréhension physique;
- maîtrise des calculs;
- lecture de schémas;
- capacité de dimensionnement;
- capacité de diagnostic.

Termine par:
1. les trois idées à retenir;
2. la difficulté principale probable;
3. une question de transition vers le jour suivant.

Important:
N'avance pas automatiquement au jour suivant. Le cours doit rester centré sur le jour [JOUR].
```

## 5. Règles de progression sur 90 jours

Le cours doit respecter les principes suivants:

### Répétition espacée

Chaque notion importante doit être revue:

- le lendemain;
- environ une semaine plus tard;
- environ un mois plus tard;
- lors d'une étude de cas intégratrice.

### Progression des exercices

Les exercices doivent progressivement passer de:

1. l'application directe d'une formule;
2. la sélection de la bonne méthode;
3. la résolution multi-étapes;
4. le dimensionnement sous contraintes;
5. le diagnostic à partir de symptômes;
6. l'analyse de compromis techniques.

### Niveau mathématique

Les mathématiques doivent être introduites au service de la compréhension:

- algèbre et trigonométrie;
- nombres complexes;
- équations différentielles;
- matrices;
- transformées et analyse fréquentielle;
- fonctions de transfert;
- statistiques et incertitudes.

### Logiciels et outils

Quand ils sont disponibles, les cours peuvent utiliser:

- LTspice pour les circuits et convertisseurs;
- Python pour les calculs, courbes et vérifications;
- MATLAB ou Octave pour l'automatique;
- Simulink pour les systèmes dynamiques;
- QElectroTech pour les schémas;
- un environnement PLC pour Ladder et Grafcet;
- un tableur pour les bilans de puissance et dimensionnements.

Le logiciel ne doit jamais remplacer l'analyse physique. Chaque simulation doit être précédée d'une prédiction qualitative et suivie d'une interprétation.

## 6. Plan détaillé des 90 jours

### Jour 1: Diagnostic initial et remise à niveau mathématique

**Notions principales:** Évaluation des acquis, unités SI, ordres de grandeur, notation scientifique, trigonométrie utile, nombres complexes.

**Schémas ou diagrammes attendus:** Carte mentale des domaines de l'ingénierie électrique et triangle des prérequis.

**Travail central:** Résoudre un mini-test et construire une fiche personnelle des lacunes.

### Jour 2: Tension, courant, charge et puissance

**Notions principales:** Définitions physiques, conventions de signe, sources idéales et réelles, puissance reçue et fournie.

**Schémas ou diagrammes attendus:** Schéma d'un dipôle avec conventions récepteur et générateur.

**Travail central:** Calculer courant, énergie et puissance dans plusieurs cas simples.

### Jour 3: Loi d'Ohm et résistivité

**Notions principales:** Résistance, résistivité, influence de la géométrie et de la température, limites du modèle linéaire.

**Schémas ou diagrammes attendus:** Courbe courant-tension d'une résistance et comparaison avec un composant non linéaire.

**Travail central:** Dimensionner un conducteur résistif et estimer ses pertes Joule.

### Jour 4: Lois de Kirchhoff

**Notions principales:** Loi des nœuds, loi des mailles, conservation de la charge et de l'énergie.

**Schémas ou diagrammes attendus:** Circuit à deux mailles avec sens de courants clairement indiqués.

**Travail central:** Résoudre un circuit par méthode des mailles puis par méthode des nœuds.

### Jour 5: Associations de résistances et diviseurs

**Notions principales:** Série, parallèle, diviseur de tension, diviseur de courant, charge d'un diviseur.

**Schémas ou diagrammes attendus:** Comparaison visuelle entre diviseur idéal et diviseur chargé.

**Travail central:** Concevoir un pont diviseur respectant une tension de sortie et une puissance maximale.

### Jour 6: Théorèmes de Thévenin, Norton et superposition

**Notions principales:** Équivalents de réseau, résistance vue, source équivalente, superposition dans les circuits linéaires.

**Schémas ou diagrammes attendus:** Transformation d'un réseau complexe en modèles de Thévenin et Norton.

**Travail central:** Trouver l'équivalent vu par une charge variable et déterminer la puissance reçue.

### Jour 7: Révision 1 et étude de cas continu

**Notions principales:** Synthèse des jours 1 à 6, résolution structurée, erreurs fréquentes, vérification dimensionnelle.

**Schémas ou diagrammes attendus:** Organigramme d'une méthode générale de résolution de circuit continu.

**Travail central:** Étude complète d'une alimentation résistive avec contraintes de tension et de puissance.

### Jour 8: Condensateurs et champ électrique

**Notions principales:** Capacité, énergie stockée, association, courant de déplacement, comportement en régime continu.

**Schémas ou diagrammes attendus:** Structure d'un condensateur plan et évolution de la tension lors d'une charge.

**Travail central:** Calculer énergie, charge et capacité équivalente.

### Jour 9: Inductances et champ magnétique

**Notions principales:** Inductance, flux, loi de Faraday, énergie magnétique, continuité du courant.

**Schémas ou diagrammes attendus:** Bobine, flux magnétique et réponse à un échelon.

**Travail central:** Calculer la tension d'une inductance et l'énergie stockée.

### Jour 10: Régime transitoire RC

**Notions principales:** Équations différentielles du premier ordre, constante de temps, charge et décharge.

**Schémas ou diagrammes attendus:** Courbes exponentielles de tension et de courant avec repères à une constante de temps.

**Travail central:** Analyser un circuit RC soumis à un échelon.

### Jour 11: Régime transitoire RL

**Notions principales:** Établissement et extinction du courant, constante de temps, énergie et surtension.

**Schémas ou diagrammes attendus:** Courbes de courant RL et circuit de roue libre.

**Travail central:** Dimensionner une diode de roue libre pour une bobine.

### Jour 12: Régime transitoire RLC

**Notions principales:** Systèmes du second ordre, amortissement, pulsation propre, dépassement, résonance transitoire.

**Schémas ou diagrammes attendus:** Trois réponses temporelles: apériodique, critique et pseudo-périodique.

**Travail central:** Classer un circuit RLC et calculer ses paramètres dynamiques.

### Jour 13: Méthodes de résolution systématique

**Notions principales:** Mise en équations, choix des inconnues, matrices, vérification énergétique et simulation.

**Schémas ou diagrammes attendus:** Chaîne complète: schéma, équations, matrice, solution, validation.

**Travail central:** Résoudre un réseau à plusieurs nœuds sous forme matricielle.

### Jour 14: Révision 2 et mini-projet capteur

**Notions principales:** Consolidation des circuits continus et transitoires, application à un capteur résistif.

**Schémas ou diagrammes attendus:** Chaîne de mesure simple avec capteur, pont, filtrage et conversion.

**Travail central:** Concevoir une interface de capteur résistif alimentée en courant continu.

### Jour 15: Signaux périodiques et sinusoïdes

**Notions principales:** Amplitude, valeur moyenne, valeur efficace, fréquence, phase, déphasage.

**Schémas ou diagrammes attendus:** Sinusoïdes déphasées et lecture des grandeurs temporelles.

**Travail central:** Extraire les paramètres de plusieurs signaux et calculer leurs valeurs efficaces.

### Jour 16: Nombres complexes et phaseurs

**Notions principales:** Représentation cartésienne et polaire, exponentielle complexe, phaseur, hypothèse sinusoïdale.

**Schémas ou diagrammes attendus:** Passage d'une sinusoïde temporelle à son phaseur.

**Travail central:** Convertir des signaux entre formes temporelle, cartésienne et polaire.

### Jour 17: Impédances en régime sinusoïdal

**Notions principales:** Impédance de R, L et C, admittance, associations, dépendance fréquentielle.

**Schémas ou diagrammes attendus:** Plan complexe des impédances et diagrammes de phase.

**Travail central:** Calculer courants et tensions d'un circuit RLC sinusoïdal.

### Jour 18: Puissances en courant alternatif

**Notions principales:** Puissance active, réactive, apparente, complexe, facteur de puissance.

**Schémas ou diagrammes attendus:** Triangle des puissances et diagramme phaseur tension-courant.

**Travail central:** Calculer les puissances d'une charge et son facteur de puissance.

### Jour 19: Correction du facteur de puissance

**Notions principales:** Compensation capacitive, dimensionnement, effets sur courant et pertes, surcompensation.

**Schémas ou diagrammes attendus:** Avant et après compensation dans le triangle des puissances.

**Travail central:** Dimensionner une batterie de condensateurs pour une charge industrielle.

### Jour 20: Résonance série et parallèle

**Notions principales:** Fréquence de résonance, facteur de qualité, bande passante, sélectivité.

**Schémas ou diagrammes attendus:** Courbes de gain et d'impédance autour de la résonance.

**Travail central:** Déterminer fréquence de résonance, bande passante et surtensions.

### Jour 21: Révision 3 et analyse d'une charge AC

**Notions principales:** Synthèse du régime sinusoïdal, puissances, compensation et résonance.

**Schémas ou diagrammes attendus:** Carte de résolution d'un problème AC complet.

**Travail central:** Analyser une installation monophasée avec plusieurs charges.

### Jour 22: Systèmes triphasés équilibrés

**Notions principales:** Production triphasée, séquence des phases, couplages étoile et triangle.

**Schémas ou diagrammes attendus:** Générateur triphasé, étoiles de tensions et couplages Y et Δ.

**Travail central:** Relier tensions simples, composées, courants de ligne et de phase.

### Jour 23: Puissance en triphasé

**Notions principales:** Puissance active, réactive et apparente, mesure par wattmètres.

**Schémas ou diagrammes attendus:** Méthode des deux wattmètres et diagramme de Fresnel.

**Travail central:** Calculer les puissances d'un moteur triphasé.

### Jour 24: Charges triphasées déséquilibrées

**Notions principales:** Neutre, déplacement du point étoile, composantes de phase, risques.

**Schémas ou diagrammes attendus:** Charge étoile déséquilibrée avec et sans neutre.

**Travail central:** Résoudre un réseau triphasé déséquilibré simple.

### Jour 25: Harmoniques et qualité de l'énergie

**Notions principales:** Distorsion harmonique, THD, charges non linéaires, effets sur neutre et équipements.

**Schémas ou diagrammes attendus:** Spectre harmonique d'un courant déformé.

**Travail central:** Calculer un THD et expliquer ses conséquences pratiques.

### Jour 26: Filtres passifs

**Notions principales:** Filtres RC, RL, RLC, fréquence de coupure, diagrammes de Bode, ordre du filtre.

**Schémas ou diagrammes attendus:** Bode d'un passe-bas et d'un passe-haut.

**Travail central:** Dimensionner un filtre simple pour atténuer une perturbation.

### Jour 27: Introduction à Fourier

**Notions principales:** Décomposition harmonique, spectre, lien entre temps et fréquence, lecture physique.

**Schémas ou diagrammes attendus:** Signal carré et spectre de ses premières harmoniques.

**Travail central:** Reconstruire approximativement un signal périodique avec quelques harmoniques.

### Jour 28: Révision 4 et mini-projet qualité réseau

**Notions principales:** Consolidation triphasé, harmoniques, filtrage et mesures.

**Schémas ou diagrammes attendus:** Architecture d'un analyseur de qualité de l'énergie.

**Travail central:** Proposer une stratégie de mesure et de correction d'une installation perturbée.

### Jour 29: Circuits magnétiques

**Notions principales:** Reluctance, force magnétomotrice, flux, saturation, pertes fer.

**Schémas ou diagrammes attendus:** Circuit magnétique équivalent d'un noyau avec entrefer.

**Travail central:** Calculer flux, induction et courant magnétisant.

### Jour 30: Transformateur idéal

**Notions principales:** Rapports de tension et courant, transfert d'impédance, conventions de polarité.

**Schémas ou diagrammes attendus:** Transformateur idéal avec points de polarité.

**Travail central:** Résoudre plusieurs problèmes de rapport de transformation.

### Jour 31: Transformateur réel

**Notions principales:** Résistances, réactances de fuite, branche magnétisante, pertes cuivre et fer.

**Schémas ou diagrammes attendus:** Schéma équivalent complet puis ramené au primaire.

**Travail central:** Calculer chute de tension, pertes et rendement.

### Jour 32: Essais à vide et en court-circuit

**Notions principales:** Identification des paramètres, méthodes de calcul, interprétation expérimentale.

**Schémas ou diagrammes attendus:** Montages des deux essais et schémas équivalents associés.

**Travail central:** Extraire les paramètres d'un transformateur à partir de mesures.

### Jour 33: Transformateurs triphasés

**Notions principales:** Groupes de couplage, déphasage, étoile, triangle, zigzag, mise en parallèle.

**Schémas ou diagrammes attendus:** Horloge de groupe vectoriel et exemple Dyn11.

**Travail central:** Interpréter un groupe de couplage et vérifier une mise en parallèle.

### Jour 34: Autotransformateurs, TC et TP

**Notions principales:** Autotransformateur, transformateurs de courant et de tension, sécurité de mesure.

**Schémas ou diagrammes attendus:** Raccordement correct d'un TC et danger d'un secondaire ouvert.

**Travail central:** Choisir un rapport de TC et estimer les contraintes.

### Jour 35: Révision 5 et étude de cas transformateur

**Notions principales:** Synthèse des phénomènes magnétiques et des modèles de transformateurs.

**Schémas ou diagrammes attendus:** Chaîne depuis la plaque signalétique jusqu'au schéma équivalent.

**Travail central:** Analyser un transformateur de distribution à partir de données nominales.

### Jour 36: Machine à courant continu

**Notions principales:** Force électromotrice, couple, excitation, commutation, modes moteur et génératrice.

**Schémas ou diagrammes attendus:** Structure d'une machine DC et flux d'énergie.

**Travail central:** Calculer vitesse, couple et rendement d'un moteur DC.

### Jour 37: Moteur asynchrone triphasé

**Notions principales:** Champ tournant, glissement, rotor, couple, pertes, plaque signalétique.

**Schémas ou diagrammes attendus:** Champ tournant et courbe couple-vitesse.

**Travail central:** Interpréter une plaque moteur et calculer glissement et couple.

### Jour 38: Schéma équivalent du moteur asynchrone

**Notions principales:** Circuit par phase, courant magnétisant, puissance au rotor, couple électromagnétique.

**Schémas ou diagrammes attendus:** Schéma équivalent par phase avec chaîne des puissances.

**Travail central:** Calculer courant, pertes et rendement à partir du modèle.

### Jour 39: Démarrage des moteurs asynchrones

**Notions principales:** Démarrage direct, étoile-triangle, autotransformateur, soft starter, contraintes réseau.

**Schémas ou diagrammes attendus:** Comparaison des courants et couples de démarrage.

**Travail central:** Choisir une méthode de démarrage pour trois cas industriels.

### Jour 40: Variation de vitesse des moteurs asynchrones

**Notions principales:** Commande V/f, fréquence, flux, zone de couple constant et zone de puissance constante.

**Schémas ou diagrammes attendus:** Courbes couple-vitesse sous variation de fréquence.

**Travail central:** Déterminer fréquence et tension pour une consigne de vitesse.

### Jour 41: Machine synchrone

**Notions principales:** Excitation, vitesse synchrone, alternateur, moteur synchrone, facteur de puissance.

**Schémas ou diagrammes attendus:** Diagramme de Fresnel simplifié d'un alternateur.

**Travail central:** Calculer vitesse, fréquence et puissance réactive.

### Jour 42: Révision 6 et sélection d'un entraînement

**Notions principales:** Comparaison des machines, critères de choix, rendement, maintenance, commande.

**Schémas ou diagrammes attendus:** Arbre de décision pour choisir un moteur et son mode de démarrage.

**Travail central:** Sélectionner un entraînement pour une pompe, un convoyeur et une centrifugeuse.

### Jour 43: Diodes de puissance

**Notions principales:** Caractéristiques, redressement, pertes, récupération inverse, protections.

**Schémas ou diagrammes attendus:** Caractéristique courant-tension et redresseur simple alternance.

**Travail central:** Calculer tension moyenne, courant et pertes d'une diode.

### Jour 44: Redresseurs monophasés

**Notions principales:** Simple et double alternance, pont de Graetz, filtrage capacitif, ondulation.

**Schémas ou diagrammes attendus:** Formes d'onde tension-courant d'un pont redresseur.

**Travail central:** Dimensionner un condensateur de filtrage.

### Jour 45: Redresseurs triphasés

**Notions principales:** Pont à six impulsions, commutation, ondulation, facteur de puissance.

**Schémas ou diagrammes attendus:** Séquence de conduction et forme d'onde redressée.

**Travail central:** Calculer la tension moyenne d'un pont triphasé.

### Jour 46: Thyristors et redresseurs commandés

**Notions principales:** Amorçage, angle de retard, fonctionnement redresseur et onduleur réseau.

**Schémas ou diagrammes attendus:** Formes d'onde pour plusieurs angles d'amorçage.

**Travail central:** Calculer la tension moyenne en fonction de l'angle de commande.

### Jour 47: MOSFET et IGBT

**Notions principales:** Commande de grille, pertes de conduction et commutation, choix technologique.

**Schémas ou diagrammes attendus:** Chronogramme de commutation avec pertes.

**Travail central:** Comparer MOSFET et IGBT pour deux convertisseurs.

### Jour 48: Hacheurs DC-DC

**Notions principales:** Buck, boost, buck-boost, rapport cyclique, conduction continue et discontinue.

**Schémas ou diagrammes attendus:** Schémas et formes d'onde des trois topologies.

**Travail central:** Dimensionner un convertisseur buck puis un boost.

### Jour 49: Révision 7 et mini-projet alimentation

**Notions principales:** Synthèse des semi-conducteurs et convertisseurs DC.

**Schémas ou diagrammes attendus:** Architecture complète d'une alimentation AC vers DC régulée.

**Travail central:** Proposer et calculer une alimentation continue simple.

### Jour 50: Onduleurs monophasés

**Notions principales:** Demi-pont, pont complet, modulation PWM, valeur fondamentale, filtrage.

**Schémas ou diagrammes attendus:** Pont en H et modulation sinusoïdale PWM.

**Travail central:** Calculer tension fondamentale et fréquence de découpage.

### Jour 51: Onduleurs triphasés

**Notions principales:** Séquences de commutation, PWM sinusoïdale, vecteur spatial, tension de ligne.

**Schémas ou diagrammes attendus:** Hexagone des vecteurs de tension.

**Travail central:** Interpréter une table de commutation d'onduleur triphasé.

### Jour 52: Convertisseurs et moteurs

**Notions principales:** Chaîne redresseur, bus DC, onduleur, moteur, freinage et régénération.

**Schémas ou diagrammes attendus:** Architecture interne d'un variateur de fréquence.

**Travail central:** Analyser les flux de puissance dans les quatre quadrants.

### Jour 53: Compatibilité électromagnétique

**Notions principales:** Modes commun et différentiel, di/dt, dv/dt, blindage, filtrage, mise à la terre.

**Schémas ou diagrammes attendus:** Chemins de couplage des perturbations.

**Travail central:** Identifier les sources et chemins de CEM dans une armoire.

### Jour 54: Thermique des composants de puissance

**Notions principales:** Résistance thermique, jonction, boîtier, dissipateur, pertes et cycles thermiques.

**Schémas ou diagrammes attendus:** Réseau thermique équivalent.

**Travail central:** Dimensionner un dissipateur pour un semi-conducteur.

### Jour 55: Protections des convertisseurs

**Notions principales:** Surintensité, surtension, snubber, fusibles rapides, précharge, isolation.

**Schémas ou diagrammes attendus:** Chaîne de protections autour d'un onduleur.

**Travail central:** Choisir des protections pour un bus DC.

### Jour 56: Révision 8 et étude de cas variateur

**Notions principales:** Consolidation électronique de puissance, CEM, thermique et entraînements.

**Schémas ou diagrammes attendus:** Schéma fonctionnel détaillé d'un variateur industriel.

**Travail central:** Diagnostiquer plusieurs défauts typiques d'un variateur.

### Jour 57: Modélisation des systèmes dynamiques

**Notions principales:** Variables d'état, équations différentielles, fonction de transfert, linéarisation.

**Schémas ou diagrammes attendus:** Passage d'un système physique à son modèle bloc.

**Travail central:** Établir la fonction de transfert d'un circuit et d'un système mécanique simple.

### Jour 58: Réponse temporelle et performances

**Notions principales:** Temps de montée, dépassement, temps d'établissement, erreur statique, stabilité.

**Schémas ou diagrammes attendus:** Réponse indicielle avec indicateurs annotés.

**Travail central:** Calculer les indicateurs d'un système du premier et du second ordre.

### Jour 59: Diagrammes de Bode

**Notions principales:** Gain, phase, pôles, zéros, fréquence de coupure, marges de stabilité.

**Schémas ou diagrammes attendus:** Construction asymptotique d'un Bode.

**Travail central:** Tracer et interpréter un diagramme de Bode simplifié.

### Jour 60: Critères de stabilité

**Notions principales:** Routh-Hurwitz, marges de gain et de phase, intuition sur les boucles.

**Schémas ou diagrammes attendus:** Boucle fermée et localisation qualitative des pôles.

**Travail central:** Évaluer la stabilité de plusieurs systèmes.

### Jour 61: Correcteurs P, PI, PD et PID

**Notions principales:** Rôle de chaque action, réglage, saturation, anti-windup, dérivée filtrée.

**Schémas ou diagrammes attendus:** Effet comparé des actions P, I et D sur la réponse.

**Travail central:** Choisir et régler un correcteur pour un procédé.

### Jour 62: Commande numérique

**Notions principales:** Échantillonnage, discrétisation, retard, filtre numérique, implémentation.

**Schémas ou diagrammes attendus:** Boucle de commande numérique avec échantillonneur.

**Travail central:** Discrétiser un PI et choisir une période d'échantillonnage.

### Jour 63: Révision 9 et mini-projet régulation

**Notions principales:** Synthèse de l'automatique, du modèle à l'implémentation.

**Schémas ou diagrammes attendus:** Boucle complète capteur, régulateur, actionneur, procédé.

**Travail central:** Concevoir une régulation de vitesse ou de température.

### Jour 64: Métrologie électrique

**Notions principales:** Précision, résolution, incertitude, étalonnage, classes d'appareils.

**Schémas ou diagrammes attendus:** Chaîne d'incertitude d'une mesure.

**Travail central:** Calculer une incertitude composée simple.

### Jour 65: Multimètre, oscilloscope et sondes

**Notions principales:** Choix du mode de mesure, bande passante, masse, sondes différentielles, sécurité.

**Schémas ou diagrammes attendus:** Connexion correcte et incorrecte d'un oscilloscope.

**Travail central:** Préparer une procédure de mesure sûre.

### Jour 66: Capteurs industriels

**Notions principales:** Température, pression, position, courant, tension, effet Hall, codeurs.

**Schémas ou diagrammes attendus:** Chaîne capteur, conditionnement, conversion et automate.

**Travail central:** Choisir un capteur pour plusieurs applications.

### Jour 67: Conditionnement analogique

**Notions principales:** Ponts, amplificateurs opérationnels, instrumentation, filtrage et adaptation.

**Schémas ou diagrammes attendus:** Amplificateur d'instrumentation relié à un pont de Wheatstone.

**Travail central:** Dimensionner un conditionneur de capteur.

### Jour 68: Conversion analogique-numérique

**Notions principales:** Échantillonnage, quantification, aliasing, résolution, rapport signal-bruit.

**Schémas ou diagrammes attendus:** Chaîne anti-repliement, ADC et traitement.

**Travail central:** Choisir un ADC et calculer la résolution utile.

### Jour 69: Boucles 4-20 mA et signaux industriels

**Notions principales:** Transmission robuste, alimentation de boucle, conversion, diagnostic de rupture.

**Schémas ou diagrammes attendus:** Boucle deux fils avec transmetteur et résistance de lecture.

**Travail central:** Dimensionner une boucle et vérifier sa tension disponible.

### Jour 70: Révision 10 et diagnostic de mesure

**Notions principales:** Consolidation métrologie, capteurs, conditionnement et acquisition.

**Schémas ou diagrammes attendus:** Méthode de diagnostic d'une chaîne de mesure.

**Travail central:** Analyser des défauts de mesure réalistes.

### Jour 71: Sécurité électrique et schémas de liaison à la terre

**Notions principales:** Choc électrique, contacts direct et indirect, TT, TN, IT, équipotentialité.

**Schémas ou diagrammes attendus:** Comparaison TT, TN et IT.

**Travail central:** Choisir un schéma de liaison à la terre selon le contexte.

### Jour 72: Dimensionnement des câbles

**Notions principales:** Courant admissible, chute de tension, court-circuit, pose, température, groupement.

**Schémas ou diagrammes attendus:** Organigramme de dimensionnement d'un câble.

**Travail central:** Dimensionner un départ moteur complet.

### Jour 73: Appareillage de protection

**Notions principales:** Fusibles, disjoncteurs, différentiels, courbes de déclenchement, sélectivité.

**Schémas ou diagrammes attendus:** Superposition de courbes temps-courant.

**Travail central:** Choisir protections et réglages pour plusieurs départs.

### Jour 74: Calcul des courants de court-circuit

**Notions principales:** Impédance de source, transformateur, câbles, courant maximal et minimal.

**Schémas ou diagrammes attendus:** Réseau équivalent de court-circuit.

**Travail central:** Estimer un courant de court-circuit en basse tension.

### Jour 75: Coordination et sélectivité

**Notions principales:** Sélectivité chronométrique, énergétique, logique, filiation, coordination type 1 et 2.

**Schémas ou diagrammes attendus:** Courbes de deux protections coordonnées.

**Travail central:** Vérifier une coordination simple.

### Jour 76: Mise à la terre et protection contre la foudre

**Notions principales:** Prise de terre, tension de contact, parafoudres, zones de protection, liaisons.

**Schémas ou diagrammes attendus:** Chemin du courant de foudre et niveaux de parafoudre.

**Travail central:** Concevoir une protection de principe.

### Jour 77: Normes, documentation et lecture de schémas

**Notions principales:** Symboles, unifilaires, multifilaires, repérage, nomenclature, dossiers techniques.

**Schémas ou diagrammes attendus:** Exemple de schéma unifilaire annoté.

**Travail central:** Lire puis restructurer un dossier électrique simplifié.

### Jour 78: Révision 11 et étude de cas installation BT

**Notions principales:** Synthèse sécurité, dimensionnement, court-circuit, protections et documentation.

**Schémas ou diagrammes attendus:** Architecture d'un tableau général basse tension.

**Travail central:** Dimensionner une petite installation industrielle.

### Jour 79: Réseaux électriques et per unit

**Notions principales:** Production, transport, distribution, schémas équivalents, système per unit.

**Schémas ou diagrammes attendus:** Chaîne réseau et changement de base per unit.

**Travail central:** Convertir des impédances et résoudre un réseau simple en per unit.

### Jour 80: Flux de puissance

**Notions principales:** Bilans P et Q, tension, angle, lignes, chutes de tension, compensation.

**Schémas ou diagrammes attendus:** Ligne courte avec flux actif et réactif.

**Travail central:** Calculer un flux simplifié et expliquer les leviers de réglage.

### Jour 81: Défauts symétriques et composantes symétriques

**Notions principales:** Séquences directe, inverse et homopolaire, défauts monophasés et biphasés.

**Schémas ou diagrammes attendus:** Réseaux de séquence interconnectés.

**Travail central:** Décomposer un système déséquilibré et analyser un défaut simple.

### Jour 82: Protections des réseaux

**Notions principales:** Surintensité, distance, différentielle, terre, coordination et zones.

**Schémas ou diagrammes attendus:** Zones de protection d'un réseau radial.

**Travail central:** Choisir une philosophie de protection.

### Jour 83: Automates programmables industriels

**Notions principales:** Cycle automate, entrées-sorties, Ladder, fonctions, temporisations et compteurs.

**Schémas ou diagrammes attendus:** Cycle de scrutation et exemple Ladder.

**Travail central:** Écrire la logique d'un démarrage moteur sécurisé.

### Jour 84: Grafcet et automatismes séquentiels

**Notions principales:** Étapes, transitions, réceptivités, actions, parallélisme et sécurité.

**Schémas ou diagrammes attendus:** Grafcet d'un convoyeur simple.

**Travail central:** Concevoir un Grafcet puis le traduire en logique automate.

### Jour 85: Réseaux industriels

**Notions principales:** Modbus, Profibus, Profinet, Ethernet industriel, topologies, déterminisme.

**Schémas ou diagrammes attendus:** Architecture réseau d'une ligne industrielle.

**Travail central:** Choisir un protocole et diagnostiquer une communication.

### Jour 86: SCADA, supervision et cybersécurité industrielle

**Notions principales:** Acquisition, alarmes, historiques, redondance, segmentation, menaces de base.

**Schémas ou diagrammes attendus:** Architecture OT avec niveaux et zones.

**Travail central:** Proposer une architecture de supervision segmentée.

### Jour 87: Solaire photovoltaïque

**Notions principales:** Cellule, module, courbe I-V, MPPT, onduleur, chaînes, ombrage, rendement.

**Schémas ou diagrammes attendus:** Courbes I-V et P-V selon irradiance et température.

**Travail central:** Dimensionner sommairement un champ PV.

### Jour 88: Stockage d'énergie et batteries

**Notions principales:** Chimies, capacité, C-rate, SOC, SOH, BMS, rendement, sécurité.

**Schémas ou diagrammes attendus:** Architecture cellule, module, rack, BMS et convertisseur.

**Travail central:** Calculer énergie utile et puissance d'un système de stockage.

### Jour 89: Micro-réseaux, intégration et projet final

**Notions principales:** Couplage réseau, production, stockage, charges, contrôle énergétique, résilience.

**Schémas ou diagrammes attendus:** Architecture d'un micro-réseau avec flux d'énergie.

**Travail central:** Concevoir l'architecture d'un site industriel hybride.

### Jour 90: Évaluation finale et plan de consolidation

**Notions principales:** Examen global, synthèse interdisciplinaire, analyse des lacunes, feuille de route suivante.

**Schémas ou diagrammes attendus:** Carte conceptuelle reliant circuits, machines, puissance, commande, protection et automatisme.

**Travail central:** Réaliser un examen final, corriger les erreurs et établir un plan de 6 mois.

## 7. Jalons d'évaluation

### Fin du jour 14

Être capable de résoudre méthodiquement des circuits continus et transitoires simples, d'expliquer les phénomènes de stockage d'énergie et de vérifier les résultats.

### Fin du jour 28

Maîtriser les régimes sinusoïdaux monophasés et triphasés, les puissances, la compensation, les harmoniques et les filtres élémentaires.

### Fin du jour 42

Comprendre les transformateurs et les principales machines électriques, lire leurs modèles, interpréter une plaque signalétique et choisir une solution d'entraînement.

### Fin du jour 56

Analyser les principaux convertisseurs de puissance, leurs formes d'onde, leurs pertes, leurs protections et leur intégration dans un variateur.

### Fin du jour 70

Modéliser et réguler un système simple, utiliser correctement les instruments de mesure et concevoir une chaîne d'acquisition industrielle.

### Fin du jour 78

Dimensionner une installation basse tension de base, choisir ses protections, estimer les courants de défaut et produire une documentation cohérente.

### Fin du jour 90

Relier les différentes disciplines dans un projet complet incluant réseau, protections, automatisme, production, stockage, commande et supervision.

## 8. Projet fil rouge conseillé

Le projet fil rouge consiste à concevoir progressivement l'alimentation et l'automatisation d'un petit site industriel comportant:

- une alimentation triphasée basse tension;
- un transformateur ou une source équivalente;
- plusieurs départs moteurs;
- un variateur de fréquence;
- des capteurs industriels;
- un automate programmable;
- une supervision;
- une installation photovoltaïque;
- un stockage par batteries;
- des protections électriques;
- une stratégie de mise à la terre;
- un bilan de puissance;
- une logique de fonctionnement normal et dégradé.

À chaque semaine, le cours doit ajouter un élément au projet. Le jour 89 doit intégrer tous les sous-systèmes. Le jour 90 doit produire une revue critique du projet, avec hypothèses, limites, risques, améliorations et compétences encore à renforcer.

## 9. Critères de qualité d'un bon cours

Un cours généré à partir de ce prompt est considéré comme satisfaisant s'il:

1. explique les causes physiques avant d'appliquer les formules;
2. présente des schémas lisibles et commentés;
3. contient au moins un calcul complet avec unités;
4. relie la notion à une application industrielle;
5. distingue hypothèses, conventions et lois;
6. propose des exercices de difficulté croissante;
7. réactive des notions anciennes;
8. permet de détecter précisément les lacunes;
9. ne masque pas les incertitudes;
10. prépare explicitement la suite du parcours.

## 10. Commande courte pour lancer une journée

Exemple:

```text
Lance le jour 1 du parcours de 90 jours.
Temps disponible: 90 minutes.
Progrès: aucun diagnostic encore réalisé.
Outils: calculatrice et Python.
Niveau: soutenu.
Applique strictement le prompt maître et ne donne pas les corrections des exercices avant ma réponse.
```

Pour un jour ultérieur:

```text
Lance le jour 24 du parcours de 90 jours.
Temps disponible: 75 minutes.
Progrès: je maîtrise les systèmes triphasés équilibrés, mais je confonds les tensions simples et composées dans les charges déséquilibrées.
Outils: calculatrice et LTspice.
Niveau: soutenu.
Réutilise mes erreurs précédentes pour adapter le cours.
```
