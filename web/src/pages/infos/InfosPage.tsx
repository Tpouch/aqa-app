import { Setting } from "../../components/Setting";
import { METRICS, type DeviceSummary, type Metric } from "../../../../server/src/types";
import { bandRanges, metricDef, SOUND_DB_BANDS } from "../../metrics";
import { t } from "../../i18n/dict";
import { getLang } from "../../i18n/lang";
import { zoneWord } from "../../i18n/vocab";
import { metricInfo } from "./infoText";

// What each measurement means, its zones (read from metrics.ts, never copied)
// and from what level it becomes a health concern.
export function InfosPage({ device }: { device: DeviceSummary | null }) {
  return (
    <div className="st">
      <h2 className="st-title">{t().infos.title}</h2>
      {getLang() === "en" ? (
        <p className="inf-intro">
          Every value falls into a <strong>zone</strong>: a word and a colour (green = good, amber = keep an eye on it,
          red = bad). They are the same zones as on the charts and in the left column. They show comfort;
          the “When it becomes dangerous” paragraph gives the health references.
        </p>
      ) : (
        <p className="inf-intro">
          Chaque valeur tombe dans une <strong>zone</strong> : un mot et une couleur (vert = bon, ambre = à surveiller,
          rouge = mauvais). Ce sont les mêmes zones que sur les graphiques et dans la colonne de gauche. Elles indiquent
          le confort ; le paragraphe « Quand ça devient dangereux » donne, lui, les repères de santé.
        </p>
      )}
      {METRICS.map((m) => <MetricSection key={m} metric={m} uncalibrated={m === "snd" && device !== null && !device.sound_calibration} />)}
      <p className="muted small inf-sources">
        {t().infos.sources}
      </p>
    </div>
  );
}

function MetricSection({ metric, uncalibrated }: { metric: Metric; uncalibrated: boolean }) {
  const def = metricDef(metric, null);
  const info = metricInfo(metric);
  const bands = def.bands ?? SOUND_DB_BANDS.map((b) => ({ ...b, word: zoneWord(b.word) }));
  const unit = metric === "snd" ? "dB" : def.unit;
  const ranges = bandRanges(bands, unit);
  return (
    <Setting title={def.label} help={info.unitHelp}>
      <p>{info.what}</p>
      <p>{info.why}</p>
      {uncalibrated && (
        <p className="callout warn">
          <span aria-hidden>▲</span>
          {getLang() === "en"
            ? <span>This board's sound isn't calibrated yet: it shows as raw amplitude. The zones below
              will apply once the sound is <a href="#/reglages">calibrated in Settings</a>.</span>
            : <span>Le son de cette carte n'est pas encore calibré : il s'affiche en amplitude brute. Les zones ci-dessous
              s'appliqueront une fois le son <a href="#/reglages">calibré dans Réglages</a>.</span>}
        </p>
      )}
      <table className="st-table inf-zones">
        <caption className="sr-only">{t().infos.zonesOf(def.label)}</caption>
        <thead><tr><th scope="col">{t().infos.zone}</th><th scope="col">{t().infos.range}</th></tr></thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={b.word}><td className={`tone-${b.tone}`}>{b.word}</td><td className="num">{ranges[i]}</td></tr>
          ))}
        </tbody>
      </table>
      <div>
        <h4 className="label-caps">{t().infos.todo}</h4>
        <p>{info.todo}</p>
      </div>
      <div>
        <h4 className="label-caps">{t().infos.danger}</h4>
        <p>{info.danger}</p>
      </div>
    </Setting>
  );
}
