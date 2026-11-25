import { useState } from "react";
import { Button, Modal } from "./ui";
import { t } from "../i18n/dict";
import { getLang } from "../i18n/lang";

// Shows a freshly issued secret once. The server only keeps its hash.
// `secret` is the text copied to the clipboard; null keeps the modal closed.
export function SecretReveal({ title, intro, secret, confirmLabel, onClose }: {
  title: string; intro: React.ReactNode; secret: string | null; confirmLabel: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const close = () => { setCopied(false); onClose(); };
  return (
    <Modal open={secret !== null} onClose={close} labelledBy="token-title">
      <div className="modal-body">
        <h2 id="token-title">{title}</h2>
        <p>{intro}<strong>{t().shell.neverShownAgain}</strong></p>
        <div className="secret">
          <code>{secret ?? ""}</code>
          <Button size="sm"
                  onClick={() => navigator.clipboard.writeText(secret ?? "").then(() => setCopied(true))}>
            {copied ? t().shell.copied : t().shell.copy}
          </Button>
        </div>
      </div>
      <div className="modal-actions">
        <Button variant="primary" onClick={close}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function TokenReveal({ deviceId, token, onClose }: { deviceId: string; token: string | null; onClose: () => void }) {
  return (
    <SecretReveal title={t().shell.tokenOf(deviceId)}
                  intro={getLang() === "en"
                    ? <>Copy this line into the firmware's <code>.env</code>, then rebuild and flash the board.</>
                    : <>Copie cette ligne dans le <code>.env</code> du firmware, puis recompile et flashe la carte.</>}
                  secret={token === null ? null : `DEVICE_TOKEN=${token}`}
                  confirmLabel={t().shell.tokenCopied} onClose={onClose} />
  );
}
