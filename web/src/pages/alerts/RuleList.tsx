import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { api } from "../../api";
import { Button, Field, Skeleton, useConfirm, useToast } from "../../components/ui";
import type { AlertRule } from "../../../../server/src/types";
import { ruleSummary } from "./format";
import { t } from "../../i18n/dict";

interface Props {
  rules: AlertRule[] | null;
  error: string | null;
  calibrated: boolean;
  onChange: Dispatch<SetStateAction<AlertRule[] | null>>;
}

export function RuleList({ rules, error, calibrated, onChange }: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  // Closing the form unmounts the focused input: hand focus back to the row.
  const closeForm = (kind: string) => {
    setOpenKind(null);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-kind="${kind}"] .al-rule-name`)?.focus();
    });
  };

  // Functional update: two quick toggles must not overwrite each other.
  const replace = (r: AlertRule) => onChange((rs) => rs && rs.map((x) => (x.kind === r.kind ? r : x)));

  async function toggle(r: AlertRule) {
    try {
      replace(await api.updateAlertRule(r.kind, { enabled: !r.enabled }));
    } catch (e) {
      toast("bad", (e as Error).message);
    }
  }

  async function reset() {
    if (!await confirm({
      title: t().alerts.restoreTitle,
      body: t().alerts.restoreBody,
      confirmLabel: t().alerts.restore,
    })) return;
    setBusy(true);
    try {
      onChange((await api.resetAlertRules()).rules);
      setOpenKind(null);
      toast("good", t().alerts.restored);
    } catch (e) {
      toast("bad", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="al-rules" aria-labelledby="al-rules-title">
      <h3 id="al-rules-title" className="label-caps">{t().alerts.rules}</h3>
      {!rules && error ? (
        <p className="small tone-warn" role="alert"><span aria-hidden>▲</span> {t().alerts.loadFailed(error)}</p>
      ) : !rules ? <Skeleton height={240} /> : (
        <>
          <ul className="al-rule-list" ref={listRef}>
            {rules.map((r) => (
              <li key={r.kind} data-kind={r.kind} className={r.enabled ? "al-rule" : "al-rule off"}>
                <div className="al-rule-row">
                  <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)}
                         aria-label={t().alerts.enableRule(r.label)} />
                  <button type="button" className="al-rule-name" aria-expanded={openKind === r.kind}
                          aria-controls={openKind === r.kind ? `al-edit-${r.kind}` : undefined} onClick={() => setOpenKind(openKind === r.kind ? null : r.kind)}>
                    {r.label}
                  </button>
                  <span className="al-rule-sum muted">{ruleSummary(r)}</span>
                </div>
                {r.kind === "snd_high" && !calibrated && (
                  <p className="al-rule-note muted">{t().alerts.calibrateFirst}<a href="#/reglages">{t().alerts.settings}</a>{t().alerts.calibrateFirstEnd}</p>
                )}
                {openKind === r.kind && (
                  <RuleForm rule={r} onSaved={(saved) => { replace(saved); closeForm(r.kind); }} onCancel={() => closeForm(r.kind)} />
                )}
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="al-reset" onClick={reset} loading={busy}>{t().alerts.defaults}</Button>
        </>
      )}
    </section>
  );
}

function RuleForm({ rule, onSaved, onCancel }: { rule: AlertRule; onSaved: (r: AlertRule) => void; onCancel: () => void }) {
  const toast = useToast();
  const [threshold, setThreshold] = useState(rule.threshold === null ? "" : String(rule.threshold).replace(".", t().alerts.decimalSep));
  const [minutes, setMinutes] = useState(String(Math.round(rule.duration_s / 60)));
  const [errors, setErrors] = useState<{ threshold?: string; minutes?: string }>({});
  const [busy, setBusy] = useState(false);
  const hasThreshold = rule.metric !== null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const num = Number(threshold.trim().replace(",", "."));
    const m = Number(minutes.trim());
    const next: typeof errors = {};
    if (hasThreshold && (!threshold.trim() || !Number.isFinite(num))) next.threshold = t().alerts.numberExpected;
    if (!Number.isInteger(m) || m < 1 || m > 240) next.minutes = t().alerts.minutesRange;
    setErrors(next);
    if (next.threshold || next.minutes) return;
    setBusy(true);
    try {
      const saved = await api.updateAlertRule(rule.kind, { ...(hasThreshold ? { threshold: num } : {}), duration_s: m * 60 });
      toast("good", t().alerts.ruleSaved(rule.label));
      onSaved(saved);
    } catch (err) {
      // The server only rejects the threshold range (duration is checked above).
      const msg = (err as Error).message;
      const range = /between (-?[\d.]+) and (-?[\d.]+)/.exec(msg);
      const sep = t().alerts.decimalSep;
      const text = range ? t().alerts.between(range[1]!.replace(".", sep), range[2]!.replace(".", sep), rule.unit) : msg;
      setErrors(hasThreshold ? { threshold: text } : { minutes: text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id={`al-edit-${rule.kind}`} className="al-rule-form" onSubmit={save}>
      {hasThreshold && (
        <Field label={<>{t().alerts.threshold} (<span className="unit">{rule.unit}</span>)</>} error={errors.threshold}>
          <input className="input mono" inputMode="decimal" value={threshold} autoComplete="off" autoFocus
                 aria-invalid={errors.threshold ? true : undefined}
                 onChange={(e) => { setThreshold(e.target.value); setErrors({ ...errors, threshold: undefined }); }} />
        </Field>
      )}
      <Field label={<>{t().alerts.duration} (<span className="unit">min</span>)</>} error={errors.minutes}>
        <input className="input mono" inputMode="numeric" value={minutes} autoComplete="off" autoFocus={!hasThreshold}
               aria-invalid={errors.minutes ? true : undefined}
               onChange={(e) => { setMinutes(e.target.value); setErrors({ ...errors, minutes: undefined }); }} />
      </Field>
      <div className="al-rule-actions">
        <Button type="submit" variant="primary" size="sm" loading={busy}>{t().alerts.save}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t().alerts.cancel}</Button>
      </div>
    </form>
  );
}
