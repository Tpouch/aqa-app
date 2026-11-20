import { CheckIcon, CopyIcon, KeyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button, Modal } from "./ui";

// Shows a freshly issued device token once. The server only keeps its hash.
export function TokenReveal({ deviceId, token, onClose }: { deviceId: string; token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `DEVICE_TOKEN=${token ?? ""}`;
  return (
    <Modal open={token !== null} onClose={() => { setCopied(false); onClose(); }} labelledBy="token-title">
      <div className="modal-body">
        <h2 id="token-title"><KeyIcon size={22} aria-hidden />Jeton de {deviceId}</h2>
        <p>Copie cette ligne dans le <code>.env</code> du firmware, puis recompile et flashe la carte.
          <strong> Elle ne sera plus jamais affichée.</strong></p>
        <div className="secret">
          <code>{snippet}</code>
          <Button size="sm" iconOnly variant="ghost"
                  icon={copied ? <CheckIcon size={18} aria-hidden /> : <CopyIcon size={18} aria-hidden />}
                  onClick={() => navigator.clipboard.writeText(snippet).then(() => setCopied(true))}>
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </div>
      <div className="modal-actions">
        <Button variant="primary" onClick={() => { setCopied(false); onClose(); }}>J'ai copié le jeton</Button>
      </div>
    </Modal>
  );
}
