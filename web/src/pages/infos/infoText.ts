import type { Metric } from "../../../../server/src/types";
import { getLang } from "../../i18n/lang";

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

export const METRIC_INFO_EN: Record<Metric, MetricInfo> = {
  co2: {
    what: "The carbon dioxide we breathe out. Outdoor air holds about 420 ppm; in a closed, occupied room the level rises fast.",
    why: "It is the best sign of poorly renewed air. When CO₂ rises, humidity, smells, viruses and other indoor pollutants build up with it.",
    unitHelp: "ppm: parts per million. 1,000 ppm = 0.1% of the air.",
    todo: "Open the window wide for 5 to 10 minutes, or two opposite windows for a draught. If the level climbs back quickly, the room lacks ventilation for the number of people.",
    danger: "Around 1,000 ppm, some people feel tired, get headaches and lose focus. 5,000 ppm is the occupational exposure limit over 8 hours (INRS). CO₂ only becomes directly toxic at several percent (tens of thousands of ppm), which a normal room never reaches: at home it mostly serves as a warning about air quality.",
  },
  pm25: {
    what: "Fine particles under 2.5 micrometres: smoke, combustion, outdoor pollution, cooking, candles, incense.",
    why: "They are small enough to reach deep into the lungs and pass into the blood.",
    unitHelp: "µg/m³: micrograms of particles per cubic metre of air.",
    todo: "Find the source (cooking, candle, smoke) and ventilate if the outdoor air is cleaner. During an outdoor pollution peak, keep the windows closed instead and ventilate at the least polluted times.",
    danger: "There is no threshold without effect. The WHO (2021) recommends not exceeding 15 µg/m³ on average over 24 hours and 5 µg/m³ on average over the year. Lasting exposure promotes respiratory and cardiovascular disease. A brief peak, while cooking for instance, matters much less than a high level day after day.",
  },
  temp: {
    what: "The air temperature in the room, where the board sits.",
    why: "Too cold or too hot, the body spends energy regulating itself: you sleep badly and focus badly.",
    unitHelp: "°C: degrees Celsius.",
    todo: "Too cold: heat and close the windows after airing. Too hot: close shutters and windows during the day, ventilate at night when it's cooler outside, and drink regularly.",
    danger: "The WHO recommends at least 18 °C at home in cold weather, a little more for vulnerable people. The colder it gets, the more respiratory and cardiovascular risks rise. In heatwaves, sleep suffers and the risk of dehydration goes up, especially for the elderly, babies and the sick.",
  },
  hum: {
    what: "Relative humidity: the amount of water vapour in the air, compared with the most it can hold at that temperature.",
    why: "Air that is too dry irritates; air that is too humid grows mould and dust mites.",
    unitHelp: "%: relative humidity. 100% = saturated air, water condenses.",
    todo: "Too dry: ventilate for shorter periods in very cold weather, turn the heating down a little, dry laundry indoors. Too humid: ventilate after showers and cooking, don't block the vents, heat a little.",
    danger: "Below 30%, throat, nose and eyes get irritated and some viruses spread more easily. Above 60% for long periods, dust mites and mould grow, which worsens allergies and asthma.",
  },
  snd: {
    what: "The sound level picked up by the board's microphone. Without calibration, the app shows a raw amplitude with no unit. Once sound is calibrated in Settings, it estimates it in decibels (dB).",
    why: "High background noise is tiring and disturbs focus and sleep, even when you stop noticing it.",
    unitHelp: "dB: decibels. +10 dB sounds about twice as loud. The app's dB are estimates: it isn't a sound meter.",
    todo: "Find the source (ventilation, appliance, street) and move it away or close the street-side window. For a loud environment that lasts, hearing protection helps.",
    danger: "For hearing, the risk starts around 80 to 85 dB(A) over a working day (European directive 2003/10/EC). Every +3 dB halves the equivalent exposure time: 88 dB(A) for 4 hours equals 85 dB(A) for 8 hours.",
  },
};

/** Texts of the active language. */
export const metricInfo = (m: Metric): MetricInfo => (getLang() === "en" ? METRIC_INFO_EN : METRIC_INFO)[m];
