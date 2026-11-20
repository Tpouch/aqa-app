import type { Metric } from "../../../../server/src/types";

// Texts of the Infos page. Zone thresholds are NOT written here: the page reads
// them from metrics.ts so they always match the charts. The figures in `danger`
// are health references (WHO, INRS, EU directive), not the app's zones.
export interface MetricInfo {
  what: string;
  why: string;
  unitHelp: string;
  todo: string;
  danger: string;
}

export const METRIC_INFO: Record<Metric, MetricInfo> = {
  co2: {
    what: "Le dioxyde de carbone que l'on rejette en respirant. Dehors, l'air en contient environ 420 ppm ; dans une pièce fermée et occupée, le taux monte vite.",
    why: "C'est le meilleur signe d'un air mal renouvelé. Quand le CO₂ monte, l'humidité, les odeurs, les virus et les autres polluants intérieurs s'accumulent avec lui.",
    unitHelp: "ppm : parties par million. 1 000 ppm = 0,1 % de l'air.",
    todo: "Ouvre la fenêtre en grand 5 à 10 minutes, ou deux fenêtres opposées pour faire un courant d'air. Si le taux remonte vite, la pièce manque d'aération pour le nombre de personnes.",
    danger: "Vers 1 000 ppm, certaines personnes ressentent fatigue, maux de tête et baisse de concentration. 5 000 ppm est la valeur limite d'exposition au travail sur 8 heures (INRS). Le CO₂ ne devient directement toxique qu'à des taux de plusieurs pour cent (des dizaines de milliers de ppm), qu'on n'atteint pas dans une pièce normale : à la maison, il sert surtout d'alerte sur la qualité de l'air.",
  },
  pm25: {
    what: "Les particules fines de moins de 2,5 micromètres : fumée, combustion, pollution extérieure, cuisson, bougies, encens.",
    why: "Elles sont assez petites pour descendre jusqu'au fond des poumons et passer dans le sang.",
    unitHelp: "µg/m³ : microgrammes de particules par mètre cube d'air.",
    todo: "Repère la source (cuisson, bougie, fumée) et aère si l'air extérieur est plus propre. Pendant un pic de pollution dehors, garde plutôt les fenêtres fermées et aère aux heures les moins polluées.",
    danger: "Il n'existe pas de seuil sans effet. L'OMS (2021) recommande de ne pas dépasser 15 µg/m³ en moyenne sur 24 heures et 5 µg/m³ en moyenne sur l'année. Une exposition qui dure favorise les maladies respiratoires et cardiovasculaires. Un pic bref, pendant la cuisson par exemple, compte beaucoup moins qu'un niveau élevé jour après jour.",
  },
  temp: {
    what: "La température de l'air de la pièce, là où la carte est posée.",
    why: "Trop froid ou trop chaud, le corps dépense de l'énergie pour se réguler : on dort mal, on se concentre mal.",
    unitHelp: "°C : degrés Celsius.",
    todo: "Trop froid : chauffe et ferme les fenêtres après avoir aéré. Trop chaud : ferme volets et fenêtres en journée, aère la nuit quand il fait plus frais dehors, et bois régulièrement.",
    danger: "L'OMS recommande au moins 18 °C chez soi par temps froid, un peu plus pour les personnes fragiles. Plus il fait froid, plus les risques respiratoires et cardiovasculaires augmentent. Par fortes chaleurs, le sommeil se dégrade et le risque de déshydratation monte, surtout pour les personnes âgées, les bébés et les malades.",
  },
  hum: {
    what: "L'humidité relative : la quantité de vapeur d'eau dans l'air, comparée au maximum qu'il peut contenir à cette température.",
    why: "Un air trop sec irrite ; un air trop humide fait pousser moisissures et acariens.",
    unitHelp: "% : humidité relative. 100 % = air saturé, l'eau se condense.",
    todo: "Trop sec : aère moins longtemps par grand froid, baisse un peu le chauffage, fais sécher du linge à l'intérieur. Trop humide : aère après la douche et la cuisine, ne bouche pas les aérations, chauffe un peu.",
    danger: "Sous 30 %, gorge, nez et yeux s'irritent et certains virus circulent plus facilement. Au-dessus de 60 % de façon durable, acariens et moisissures se développent, ce qui aggrave allergies et asthme.",
  },
  snd: {
    what: "Le niveau sonore capté par le micro de la carte. Sans calibration, l'app affiche une amplitude brute, sans unité. Une fois le son calibré dans Réglages, elle l'estime en décibels (dB).",
    why: "Un bruit de fond élevé fatigue, gêne la concentration et le sommeil, même quand on finit par ne plus y faire attention.",
    unitHelp: "dB : décibels. +10 dB est perçu environ deux fois plus fort. Les dB de l'app sont estimés : ce n'est pas un sonomètre.",
    todo: "Repère la source (ventilation, appareil, rue) et éloigne-la ou ferme la fenêtre côté rue. Pour un environnement fort qui dure, des protections auditives aident.",
    danger: "Pour l'audition, le risque commence vers 80 à 85 dB(A) sur une journée de travail (directive européenne 2003/10/CE). Chaque +3 dB divise par deux la durée d'exposition équivalente : 88 dB(A) pendant 4 heures équivaut à 85 dB(A) pendant 8 heures.",
  },
};
