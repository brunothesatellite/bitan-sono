Tu es un expert UX/UI spécialisé dans les tableaux de bord et la visualisation de données acoustiques pour des applications desktop (PyQt/PySide ou WebView).

Je développe une application Python sous Windows connectée à un sonomètre (Bitan). Mon objectif est de mesurer l'ambiance sonore d'un appartement où vivent deux jeunes garçons énergiques et une famille très expressive. L'enjeu est d'apporter de la sérénité sans être culpabilisant ou autoritaire.

J'aimerais que tu génères le code d'un fichier HTML/CSS/JS unique (`dashboard_mockup.html`) pour valider la maquette visuelle et l'ergonomie avant de coder l'interface finale en Python.

### Recommandations UX/UI & Style :
- **Thème :** Moderne, épuré, mode sombre très doux ou mode clair chaleureux (palette inspirée de la sérénité : bleus apaisants, verts doux, orange/rouge pastel pour la vigilance).
- **Ton :** Bienveillant, ludique, constructif ("Météo de la maison", pas "Police du bruit").

### Composants demandés dans la maquette :
1. **Header :** 
   - Statut de la connexion au sonomètre (ex: "Sonomètre Bitan connecté").
   - Indice du moment (ex: "Ambiance actuelle : Pétillante mais sereine 🟢").

2. **Panneau Temps Réel (Le "Baromètre") :**
   - Affichage du $LA_{eq, 1s}$ et $LA_{eq, 1min}$ actuel (en large).
   - Un jauge/vumètre visuel avec 4 zones de couleur :
     - $< 55\text{ dB}$ (Vert) : Serein / Calme
     - $55 - 65\text{ dB}$ (Jaune) : Vie de famille active
     - $65 - 75\text{ dB}$ (Orange) : Zone de vigilance / Animation
     - $> 75\text{ dB}$ (Rouge pastel) : Pic de bruit / Surchauffe
   - Un mini-widget "Dosimètre / Temps en Zone Rouge" (ex: "Temps $> 75\text{ dB}$ aujourd'hui : 14 min").

3. **Panneau Statistiques & Analyse de la Session :**
   - KPI Cards : $L_{10}$ (Pics de bruit), $L_{50}$ (Médiane), $L_{90}$ (Bruit de fond), et $LA_{eq, total}$.
   - Un emplacement pour le graphique temporel (utilise Chart.js via CDN pour afficher une courbe réaliste avec une zone rouge horizontale au-delà de $75\text{ dB}$).

4. **Panneau "Conseils & Coaching Familial" :**
   - Une carte affichant une alerte contextuelle intelligente ou un conseil bienveillant basé sur les statistiques calculées.
   - *Exemple :* "Le bruit de fond ($L_{90}$) est un peu élevé. Pensez à éteindre les écrans ou bruits parasites en arrière-plan !" ou "Les garçons ont dépensé beaucoup d'énergie ($L_{10}$ élevé) entre 17h et 18h. C'est le bon moment pour un temps calme (Legos, lecture)."

5. **Interactivité minimale en JS :**
   - Simule un flux de données (un intervalle JS qui met à jour les chiffres et la jauge toutes les secondes avec un léger bruit aléatoire entre 48 dB et 78 dB).

Fournis-moi un fichier HTML complet et directement exécutable dans le navigateur.