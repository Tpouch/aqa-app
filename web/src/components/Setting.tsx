import type { ReactNode } from "react";

// One settings row: label and help on the left, controls on the right.
export function Setting({ title, help, children, tone }: { title: string; help: ReactNode; children: ReactNode; tone?: "bad" }) {
  const id = `st-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={`setting${tone ? ` ${tone}` : ""}`} aria-labelledby={id}>
      <div className="setting-intro">
        <h3 id={id} className={tone ? "label-caps tone-bad" : "label-caps"}>{title}</h3>
        <p className="muted small">{help}</p>
      </div>
      <div className="setting-body">{children}</div>
    </section>
  );
}
