import { useState } from "react";
import type {
  Measurement,
  MeasurementDraft,
  PartialDate,
  Platform,
} from "../lib/types";
import { completePartialDate, weekdayMatches } from "../lib/dates";
import { localDate, toMeasurement, validateDraft } from "../lib/validation";
import { Icon } from "./Icon";

export function ReviewForm({
  draft,
  onDraftChange,
  platform,
  source,
  warnings,
  replacing,
  onSave,
  onRetry,
  partialDate,
}: {
  draft: MeasurementDraft;
  onDraftChange: (draft: MeasurementDraft) => void;
  platform: Platform;
  source: Measurement["source"];
  warnings: string[];
  replacing: (date: string) => boolean;
  onSave: (measurement: Measurement) => void;
  onRetry: () => void;
  partialDate?: PartialDate | null;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const partialLabel = partialDate
    ? new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(
        new Date(Date.UTC(2000, partialDate.month - 1, partialDate.day)),
      )
    : "";
  const update = (patch: Partial<MeasurementDraft>) =>
    onDraftChange({ ...draft, confirmed: false, ...patch });
  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems = validateDraft(draft);
    setErrors(problems);
    if (problems.length) {
      document.getElementById("review-errors")?.focus();
      return;
    }
    try {
      onSave(toMeasurement(draft, platform, source));
    } catch {
      setErrors([
        "Opslaan is niet gelukt. Controleer of je browser lokale opslag toestaat en voldoende ruimte heeft. Je invoer is behouden.",
      ]);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="review-form">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Jouw dag in beeld</span>
          <h2>Klopt alles?</h2>
        </div>
        <span className="tag">
          {source === "manual" ? "Handmatig" : "Controle nodig"}
        </span>
      </div>
      <p className="muted">
        {source === "screenshot"
          ? "Herkenning kan fouten maken. Controleer elk veld met je screenshot."
          : "Neem de dagwaarden over uit de instellingen van je telefoon."}{" "}
        Leeg betekent onbekend; vul alleen 0 in als dat echt de waarde is.
      </p>
      {warnings.length > 0 && (
        <div className="notice">
          <strong>Even controleren</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div
        id="review-errors"
        tabIndex={-1}
        role={errors.length ? "alert" : undefined}
      >
        {errors.length > 0 && (
          <div className="error-box">
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {partialDate && !draft.date && (
        <div className="notice partial-date">
          <p>
            <strong>{partialLabel} herkend.</strong> Het jaar staat niet in het
            screenshot. Vul alleen het jaar aan; dag en maand nemen we over.
          </p>
          <label>
            Jaar van de meting
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max={new Date().getFullYear()}
              placeholder="JJJJ"
              value={year}
              onChange={(event) => {
                const value = event.target.value;
                setYear(value);
                const date = completePartialDate(partialDate, value);
                if (date) update({ date });
              }}
            />
          </label>
        </div>
      )}
      {partialDate &&
        draft.date &&
        !weekdayMatches(draft.date, partialDate) && (
          <p className="notice" role="status">
            De gekozen datum valt niet op de herkende{" "}
            {
              [
                "zondag",
                "maandag",
                "dinsdag",
                "woensdag",
                "donderdag",
                "vrijdag",
                "zaterdag",
              ][partialDate.weekday!]
            }
            . Controleer het jaar en de meetdatum.
          </p>
        )}
      <label className="field">
        Meetdatum
        <input
          type="date"
          value={draft.date}
          max={localDate()}
          onChange={(e) => update({ date: e.target.value })}
        />
        <small>Kies de datum van de meting, niet de uploaddatum.</small>
      </label>
      <fieldset>
        <legend>
          <Icon name="clock" size={18} /> Totale schermtijd
        </legend>
        <div className="duration-fields">
          <label>
            Uren
            <input
              inputMode="numeric"
              type="number"
              min="0"
              max="24"
              placeholder="—"
              value={draft.hours}
              onChange={(e) => update({ hours: e.target.value })}
            />
          </label>
          <label>
            Minuten
            <input
              inputMode="numeric"
              type="number"
              min="0"
              max="59"
              placeholder="—"
              value={draft.minutes}
              onChange={(e) => update({ minutes: e.target.value })}
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <Icon name="phone" size={18} /> Hoe vaak pak je je telefoon?
        </legend>
        <p className="field-help">
          Oppakken, ontgrendelen en activeren zijn verschillende tellingen. Kies
          het label dat je telefoon toont.
        </p>
        <div className="count-fields">
          <label>
            Type telling
            <select
              value={draft.pickupMetric}
              onChange={(e) =>
                update({
                  pickupMetric: e.target
                    .value as MeasurementDraft["pickupMetric"],
                })
              }
            >
              <option value="">Kies een type</option>
              <option value="pickups">Opgepakt (pickups)</option>
              <option value="unlocks">Ontgrendeld (unlocks)</option>
              <option value="activations">Geactiveerd</option>
            </select>
          </label>
          <label>
            Aantal
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="10000"
              placeholder="Onbekend"
              value={draft.pickups}
              onChange={(e) => update({ pickups: e.target.value })}
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>
          <Icon name="chart" size={18} /> Meestgebruikte apps
        </legend>
        <p className="field-help">
          Voeg alleen apps toe die bij deze dag horen. Ontbreekt een duur? Vul
          die zelf in of verwijder de rij.
        </p>
        <div className="app-rows">
          {draft.apps.map((app, index) => (
            <div className="app-row" key={index}>
              <label className="app-name">
                App {index + 1}
                <input
                  maxLength={100}
                  value={app.name}
                  placeholder="Bijv. Instagram"
                  onChange={(e) =>
                    update({
                      apps: draft.apps.map((a, i) =>
                        i === index ? { ...a, name: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Uren
                <input
                  aria-label={`App ${index + 1} uren`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="24"
                  placeholder="—"
                  value={app.hours}
                  onChange={(e) =>
                    update({
                      apps: draft.apps.map((a, i) =>
                        i === index ? { ...a, hours: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Min
                <input
                  aria-label={`App ${index + 1} minuten`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="59"
                  placeholder="—"
                  value={app.minutes}
                  onChange={(e) =>
                    update({
                      apps: draft.apps.map((a, i) =>
                        i === index ? { ...a, minutes: e.target.value } : a,
                      ),
                    })
                  }
                />
              </label>
              <button
                className="icon-button remove-app"
                type="button"
                aria-label={`Verwijder app ${index + 1}`}
                onClick={() =>
                  update({ apps: draft.apps.filter((_, i) => i !== index) })
                }
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-button"
          type="button"
          disabled={draft.apps.length >= 30}
          onClick={() =>
            update({
              apps: [...draft.apps, { name: "", hours: "", minutes: "" }],
            })
          }
        >
          <Icon name="plus" size={18} /> App toevoegen
        </button>
      </fieldset>
      {replacing(draft.date) && (
        <p className="notice">
          Er is al een meting voor deze datum en dit platform. Opslaan vervangt
          die meting.
        </p>
      )}
      <div className="confirmations">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.dailyConfirmed}
            onChange={(e) => update({ dailyConfirmed: e.target.checked })}
          />
          <span>
            Deze gegevens horen bij één gekozen dag, en zijn geen weektotaal of
            gemiddelde.
          </span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.confirmed}
            onChange={(e) =>
              onDraftChange({ ...draft, confirmed: e.target.checked })
            }
          />
          <span>
            Ik heb alle ingevulde gegevens en de meetdatum gecontroleerd.
          </span>
        </label>
      </div>
      <button className="button primary wide" type="submit">
        <Icon name="check" size={19} /> Meting opslaan
      </button>
      <button className="button quiet wide" type="button" onClick={onRetry}>
        {source === "screenshot"
          ? "Andere screenshots proberen"
          : "Terug naar uploaden"}
      </button>
    </form>
  );
}
