import type { Measurement } from "../lib/types";
import { Icon } from "./Icon";

export const formatDuration = (minutes: number | null) =>
  minutes === null
    ? "Onbekend"
    : `${Math.floor(minutes / 60)} u ${minutes % 60} min`;
const metrics = {
  pickups: "keer opgepakt",
  unlocks: "ontgrendelingen",
  activations: "activeringen",
};

export function Overview({
  measurements,
  onNew,
}: {
  measurements: Measurement[];
  onNew: () => void;
}) {
  return (
    <section className="overview">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Check · overzicht</span>
          <h1>Jouw metingen</h1>
        </div>
        <button className="button secondary" onClick={onNew}>
          <Icon name="plus" size={18} /> Nieuwe meting
        </button>
      </div>
      <p className="muted">
        Een momentopname van je telefoongebruik. Alleen door jou bevestigde
        dagmetingen staan hier.
      </p>
      {!measurements.length && (
        <div className="empty-state">
          <span className="feature-icon">
            <Icon name="chart" size={32} />
          </span>
          <h2>Begin met je eerste dag</h2>
          <p>Upload een screenshot of vul je gegevens handmatig in.</p>
          <button className="button primary" onClick={onNew}>
            Meting toevoegen <Icon name="arrow" size={18} />
          </button>
        </div>
      )}
      <div className="measurement-list">
        {measurements.map((m) => (
          <article className="measurement card" key={`${m.date}-${m.platform}`}>
            <div className="section-heading">
              <h2>
                {new Intl.DateTimeFormat("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date(`${m.date}T12:00:00`))}
              </h2>
              <span className="tag">
                {m.platform === "ios" ? "iOS" : "Android"} ·{" "}
                {m.source === "screenshot" ? "Screenshot" : "Handmatig"}
              </span>
            </div>
            <div className="measurement-stats">
              <div>
                <span className="muted">Schermtijd</span>
                <strong>{formatDuration(m.screenTimeMinutes)}</strong>
              </div>
              <div>
                <span className="muted">
                  {m.pickupMetric ? metrics[m.pickupMetric] : "Telefoontelling"}
                </span>
                <strong>{m.pickups ?? "Onbekend"}</strong>
              </div>
            </div>
            {m.apps.length > 0 && (
              <ul className="usage-list">
                {m.apps.map((app) => (
                  <li key={app.name}>
                    <span>{app.name}</span>
                    <strong>{formatDuration(app.durationMinutes)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      <p className="storage-note">
        <Icon name="shield" size={17} /> Prototype: metingen worden alleen in
        deze browser bewaard. Wissen van browsergegevens verwijdert ook je
        metingen.
      </p>
    </section>
  );
}
