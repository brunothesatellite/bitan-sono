Tu es un développeur GUI Python chevronné.

J'ai mon moteur de calcul `SoundAnalytics` et ma maquette d'interface. Je souhaite maintenant intégrer ce panneau de statistiques dans mon application Python Windows principale.

Aide-moi à implémenter l'interface graphique (utilise [PyQt6 / PySide6 / PyQt5] — *précise ton framework*).

Consignes :
1. Crée un composant réutilisable `StatisticsPanelWidget` qui intègre :
   - Les indicateurs $LA_{eq}$, $L_{10}$, $L_{50}$, $L_{90}$.
   - Un graphique d'évolution en temps réel fluide (utilise `pyqtgraph` pour des performances optimales sans lag à la rafraîchissement).
   - La zone d'affichage des alertes et conseils bienveillants.
2. Assure-toi que les calculs statistiques lourds ou la réception des trames sonomètre tournent dans un thread séparé (`QThread`) pour ne jamais bloquer l'UI.
3. Intègre un système de slots/signals clairs pour mettre à jour les statistiques dès qu'une nouvelle mesure arrive.

Fournis un code Python modulaire et directement exécutable sous Windows.