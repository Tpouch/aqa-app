import { t } from "../i18n/dict";
import { getLang, setLang, useLang } from "../i18n/lang";

// Shows the other language; its label is written in that language.
export function LangToggle() {
  useLang();
  const d = t().lang;
  return (
    <button type="button" className="sb-link" lang={d.otherLang} aria-label={d.switchTo}
            onClick={() => setLang(getLang() === "en" ? "fr" : "en")}>{d.other}</button>
  );
}
