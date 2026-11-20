import { Setting } from "../../components/Setting";
import { METRICS, type DeviceSummary, type Metric } from "../../../../server/src/types";
import { bandRanges, metricDef, SOUND_DB_BANDS } from "../../metrics";
import { METRIC_INFO } from "./infoText";

// What each measurement means, its zones (read from metrics.ts, never copied)
// and from what level it becomes a health concern.
export function InfosPage({ device }: { device: DeviceSummary | null }) {
  return (
    <div className="st">
      <h2 className="st-title">Comprendre les mesures</h2>
      <p className="inf-intro">
        Chaque valeur tombe dans une <strong>zone</strong> : un mot et une couleur (vert = bon, ambre = à surveiller,
        rouge = mauvais). Ce sont les mêmes zones que sur les graphiques et dans la colonne de gauche. Elles indiquent
        le confort ; le paragraphe « Quand ça devient dangereux » donne, lui, les repères de santé.
      </p>
      {METRICS.map((m) => <MetricSection key={m} metric={m} uncalibrated={m === "snd" && device !== null && !device.sound_calibration} />)}
      <p className="muted small inf-sources">
        Sources : OMS, lignes directrices sur la qualité de l'air (2021) et sur le logement et la santé (2018) ; INRS,
        valeurs limites d'exposition professionnelle ; directive européenne 2003/10/CE sur le bruit au travail.
        Ces repères informent, ils ne remplacent pas un avis médical.
      </p>
    </div>
  );
}

function MetricSection({ metric, uncalibrated }: { metric: Metric; uncalibrated: boolean }) {
  const def = metricDef(metric, null);
  const info = METRIC_INFO[metric];
  const bands = def.bands ?? SOUND_DB_BANDS;
  const unit = metric === "snd" ? "dB" : def.unit;
  const ranges = bandRanges(bands, unit);
  return (
    <Setting title={def.label} help={info.unitHelp}>
      <p>{info.what}</p>
      <p>{info.why}</p>
      {uncalibrated && (
        <p className="callout warn">
          <span aria-hidden>▲</span>
          <span>Le son de cette carte n'est pas encore calibré : il s'affiche en amplitude brute. Les zones ci-dessous
            s'appliqueront une fois le son <a href="#/reglages">calibré dans Réglages</a>.</span>
        </p>
      )}
      <table className="st-table inf-zones">
        <caption className="sr-only">Zones de {def.label}</caption>
        <thead><tr><th scope="col">Zone</th><th scope="col">Plage</th></tr></thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={b.word}><td className={`tone-${b.tone}`}>{b.word}</td><td className="num">{ranges[i]}</td></tr>
          ))}
        </tbody>
      </table>
      <div>
        <h4 className="label-caps">Quoi faire</h4>
        <p>{info.todo}</p>
      </div>
      <div>
        <h4 className="label-caps">Quand ça devient dangereux</h4>
        <p>{info.danger}</p>
      </div>
    </Setting>
  );
}
