Tu es un expert Python et traitement du signal acoustique.

Je construis le module de calcul statistique pour mon application de sonomètre (Sonomètre Bitan en USB).
Ce module reçoit en continu des flux de décibels ($LA_{eq, 1s}$) ou traite un tableau numpy/pandas issu d'un fichier d'enregistrement.

Écris une classe Python `SoundAnalytics` propre, type-hintée et documentée avec les fonctionnalités suivantes :

1. **Gestion du Buffer Glissant (Temps Réel) :**
   - Accepter l'injection continue de valeurs ($dB(A)$).
   - Calculer le $LA_{eq}$ glissant sur une fenêtre configurable (ex: 1 sec, 10 sec, 1 min, 5 min). Attention : la moyenne de décibels doit se faire en échelle énergétique ($10 \cdot \log_{10}(\text{moyenne}(10^{L/10}))$).
   - Calculer la dose de bruit accumulée (durée totale passée au-dessus de seuils configurables, ex: $65\text{ dB}$, $75\text{ dB}$).

2. **Analyse Globale de Session / Enregistrement (Post-processing) :**
   - Calcul des percentiles : $L_{10}$ (bruit crête/pics), $L_{50}$ (médiane), $L_{90}$ (bruit de fond continu).
   - Détection des périodes / plages horaires contiguës où le niveau dépasse $75\text{ dB}$ pendant plus de $N$ secondes.

3. **Générateur de Conseils / Diagnostic :**
   - Une méthode `generate_family_coaching_advice()` qui analyse $L_{90}$, $L_{10}$, $LA_{eq}$ et la durée des pics pour retourner un objet (ou dictionnaire) contenant :
     - La "Météo de la maison" (ex: "Calme", "Animée", "Tempétueuse").
     - 2 à 3 conseils bienveillants et pragmatiques adaptés à la vie familiale.

Formule les calculs avec `numpy` pour être rapide et efficace.