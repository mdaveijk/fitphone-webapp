import { useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { Overview } from "./components/Overview";
import { ReviewForm } from "./components/ReviewForm";
import { mergeScreenshots, parseScreenshot } from "./lib/parser";
import { recognizeScreenshots, type RecognitionProgress } from "./lib/ocr";
import { loadMeasurements, saveMeasurement } from "./lib/storage";
import type {
  Measurement,
  MeasurementDraft,
  ParsedScreenshot,
  PartialDate,
  Platform,
} from "./lib/types";
import { localDate, validateFiles } from "./lib/validation";

function emptyDraft(date = ""): MeasurementDraft {
  return {
    date,
    hours: "",
    minutes: "",
    pickups: "",
    pickupMetric: "",
    apps: [],
    confirmed: false,
    dailyConfirmed: false,
  };
}
function recognizedDraft(result: ParsedScreenshot): MeasurementDraft {
  const duration = (minutes: number | null) =>
    minutes === null
      ? { hours: "", minutes: "" }
      : {
          hours: String(Math.floor(minutes / 60)),
          minutes: String(minutes % 60),
        };
  return {
    ...emptyDraft(result.date ?? ""),
    ...duration(result.screenTimeMinutes),
    pickups: result.pickups === null ? "" : String(result.pickups),
    pickupMetric: result.pickupMetric ?? "",
    apps: result.apps.map((a) => ({
      name: a.name,
      ...duration(a.durationMinutes),
    })),
  };
}
function Preview({
  file,
  onRemove,
  disabled = false,
}: {
  file: File;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <li className="preview-item">
      <img src={url || undefined} alt={`Voorbeeld van ${file.name}`} />
      <div>
        <strong>{file.name}</strong>
        <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
      </div>
      {onRemove && (
        <button
          className="icon-button"
          disabled={disabled}
          aria-label={`Verwijder ${file.name}`}
          onClick={onRemove}
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </li>
  );
}

export default function App() {
  const [tab, setTab] = useState<"check" | "overview">("check");
  const [platform, setPlatform] = useState<Platform>("ios");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RecognitionProgress>({
    percent: 0,
    message: "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [review, setReview] = useState<{
    draft: MeasurementDraft;
    source: Measurement["source"];
    warnings: string[];
    partialDate?: PartialDate | null;
  } | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [storageError, setStorageError] = useState("");
  const [success, setSuccess] = useState(false);
  const [rawText, setRawText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isReview = review !== null;
  useEffect(() => {
    try {
      setMeasurements(loadMeasurements());
    } catch {
      setStorageError(
        "Opgeslagen metingen zijn niet beschikbaar. Bestaande gegevens worden niet overschreven als ze onleesbaar zijn.",
      );
    }
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    headingRef.current?.focus();
  }, [isReview, tab]);

  function selectFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = [...files, ...Array.from(event.target.files ?? [])];
    const problems = validateFiles(selected);
    setErrors(problems);
    if (!problems.length) setFiles(selected);
    event.target.value = "";
    setSuccess(false);
  }
  async function recognize() {
    const problems = validateFiles(files);
    setErrors(problems);
    if (problems.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setSuccess(false);
    try {
      const texts = await recognizeScreenshots(
        files,
        setProgress,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const result = mergeScreenshots(texts.map(parseScreenshot));
      setRawText(texts.map((t, i) => `Screenshot ${i + 1}\n${t}`).join("\n\n"));
      setReview({
        draft: recognizedDraft(result),
        source: "screenshot",
        warnings: result.warnings,
        partialDate: result.partialDate,
      });
    } catch (error) {
      if (!controller.signal.aborted)
        setErrors([
          `${error instanceof Error ? error.message : "Herkenning mislukt."} Je kunt opnieuw proberen of handmatig invullen.`,
        ]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }
  function reset() {
    setTab("check");
    setReview(null);
    setFiles([]);
    setErrors([]);
    setRawText("");
    setSuccess(false);
  }
  function save(measurement: Measurement) {
    setMeasurements(saveMeasurement(measurement));
    setStorageError("");
    setFiles([]);
    setRawText("");
    setReview(null);
    setSuccess(true);
    setTab("overview");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("check");
          }}
          aria-label="Fitphone Check"
        >
          <span className="brand-mark">
            <i />
            <i />
          </span>
          <span>
            fitphone<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="prototype-label">CHECK PROTOTYPE</span>
      </header>
      <main>
        {storageError && (
          <p role="alert" className="error-box">
            {storageError}
          </p>
        )}
        {success && (
          <div className="success-box" role="status">
            <Icon name="check" /> Je meting is opgeslagen. Je screenshots zijn
            uit de app verwijderd.
          </div>
        )}
        {tab === "overview" ? (
          <Overview measurements={measurements} onNew={reset} />
        ) : (
          <>
            <section className="intro">
              <span className="eyebrow">
                <span className="tiny-dot" /> Stap 1 · Check
              </span>
              <h1 ref={headingRef} tabIndex={-1}>
                {review ? (
                  "Even kijken. Dan opslaan."
                ) : (
                  <>
                    Meer inzicht.
                    <br />
                    <span>Minder overtypen.</span>
                  </>
                )}
              </h1>
              <p>
                {review
                  ? "Maak van je screenshot een meting die klopt."
                  : "Ontdek je telefoongebruik. Neem je schermtijd eenvoudig over met een screenshot."}
              </p>
            </section>
            <ol className="steps" aria-label="Voortgang">
              {["Uploaden", "Herkennen", "Controleren", "Opslaan"].map(
                (step, i) => {
                  const current = review ? 2 : busy ? 1 : 0;
                  return (
                    <li
                      key={step}
                      className={
                        i < current ? "done" : i === current ? "active" : ""
                      }
                      aria-current={i === current ? "step" : undefined}
                    >
                      <span>
                        {i < current ? <Icon name="check" size={14} /> : i + 1}
                      </span>
                      {step}
                    </li>
                  );
                },
              )}
            </ol>
            <div className="content-grid">
              <section className="card main-card">
                {review ? (
                  <>
                    {files.length > 0 && (
                      <details className="reference-screenshots">
                        <summary>
                          Vergelijk met je screenshots ({files.length})
                        </summary>
                        <ul className="previews">
                          {files.map((file, i) => (
                            <Preview file={file} key={i} />
                          ))}
                        </ul>
                      </details>
                    )}
                    <ReviewForm
                      partialDate={review.partialDate}
                      draft={review.draft}
                      onDraftChange={(draft) =>
                        setReview((current) =>
                          current ? { ...current, draft } : current,
                        )
                      }
                      source={review.source}
                      platform={platform}
                      warnings={review.warnings}
                      onSave={save}
                      onRetry={() => {
                        setReview(null);
                        setRawText("");
                        setErrors([]);
                      }}
                      replacing={(date) =>
                        measurements.some(
                          (m) => m.date === date && m.platform === platform,
                        )
                      }
                    />
                    {rawText && (
                      <details className="ocr-details">
                        <summary>Bekijk herkende tekst</summary>
                        <pre>{rawText}</pre>
                      </details>
                    )}
                  </>
                ) : (
                  <>
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">Jouw telefoongebruik</span>
                        <h2>Begin met een screenshot</h2>
                      </div>
                      <span className="feature-icon">
                        <Icon name="phone" size={25} />
                      </span>
                    </div>
                    <fieldset className="platform-field">
                      <legend>Welke telefoon gebruik je?</legend>
                      <div className="platform-options">
                        {(["ios", "android"] as const).map((p) => (
                          <label
                            className={platform === p ? "selected" : ""}
                            key={p}
                          >
                            <input
                              type="radio"
                              name="platform"
                              checked={platform === p}
                              disabled={busy}
                              onChange={() => setPlatform(p)}
                            />
                            <span>{p === "ios" ? "iPhone" : "Android"}</span>
                            <small>
                              {p === "ios" ? "Schermtijd" : "Digitaal welzijn"}
                            </small>
                            {platform === p && <Icon name="check" size={18} />}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className={`upload-zone ${busy ? "disabled" : ""}`}>
                      <span className="upload-symbol">
                        <Icon name="upload" size={27} />
                      </span>
                      <strong>
                        {files.length
                          ? "Nog een screenshot toevoegen"
                          : "Kies je screenshot"}
                      </strong>
                      <span>Tik om een bestand te kiezen</span>
                      <small>
                        PNG, JPEG of WebP · max. 10 MB per bestand · max. 5
                      </small>
                      <input
                        type="file"
                        aria-label="Screenshots kiezen"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={busy}
                        onChange={selectFiles}
                      />
                    </label>
                    {files.length > 0 && (
                      <ul className="previews">
                        {files.map((file, i) => (
                          <Preview
                            key={`${file.name}-${file.lastModified}-${i}`}
                            file={file}
                            disabled={busy}
                            onRemove={() => {
                              setFiles(files.filter((_, index) => i !== index));
                              setErrors([]);
                            }}
                          />
                        ))}
                      </ul>
                    )}
                    {errors.length > 0 && (
                      <div role="alert" className="error-box">
                        <ul>
                          {errors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {busy && (
                      <div
                        className="progress-area"
                        role="status"
                        aria-live="polite"
                      >
                        <div>
                          <span className="spinner" />
                          <span>{progress.message}</span>
                        </div>
                        <progress
                          value={progress.percent}
                          max="100"
                          aria-label="Herkenningsvoortgang"
                        />
                        <button
                          className="text-button"
                          onClick={() => abortRef.current?.abort()}
                        >
                          Herkenning annuleren
                        </button>
                      </div>
                    )}
                    <button
                      className="button primary wide"
                      disabled={!files.length || busy}
                      onClick={recognize}
                    >
                      {busy ? "Bezig met herkennen…" : "Gegevens herkennen"}
                      {!busy && <Icon name="arrow" size={18} />}
                    </button>
                    <div className="or-divider">
                      <span>of</span>
                    </div>
                    <button
                      className="button secondary wide"
                      disabled={busy}
                      onClick={() => {
                        setReview({
                          draft: emptyDraft(localDate()),
                          source: "manual",
                          warnings: [],
                        });
                        setErrors([]);
                        setFiles([]);
                        setSuccess(false);
                      }}
                    >
                      Gegevens handmatig invullen
                    </button>
                  </>
                )}
              </section>
              <aside className="sidebar">
                <section className="tip-card">
                  <span className="eyebrow">Zo vind je je overzicht</span>
                  <h2>
                    {platform === "ios" ? "Op je iPhone" : "Op je Android"}
                  </h2>
                  <ol className="instructions">
                    {(platform === "ios"
                      ? [
                          "Open Instellingen → Schermtijd.",
                          "Tik op Bekijk alle app- en websiteactiviteit.",
                          "Kies Dag en de gewenste datum.",
                        ]
                      : [
                          "Open Instellingen → Digitaal welzijn en ouderlijk toezicht.",
                          "Open het dashboard met je gebruik.",
                          "Kies één dag en de gewenste datum.",
                        ]
                    ).map((text, i) => (
                      <li key={text}>
                        <span>{i + 1}</span>
                        {text}
                      </li>
                    ))}
                  </ol>
                  <p className="tip-footnote">
                    Maak een screenshot met de totale schermtijd, je apps of je
                    telling. Gebruik meerdere screenshots van dezelfde dag als
                    niet alles in beeld past. De precieze namen kunnen per
                    toestel verschillen.
                  </p>
                </section>
                <section className="privacy-note">
                  <span className="privacy-icon">
                    <Icon name="shield" size={22} />
                  </span>
                  <div>
                    <h3>Je screenshot blijft bij jou</h3>
                    <p>
                      Herkenning gebeurt in je browser. Je screenshot wordt niet
                      verstuurd of opgeslagen. Alleen je bevestigde meting wordt
                      lokaal bewaard.
                    </p>
                    <p>
                      De herkenningssoftware en Nederlandse en Engelse
                      taalbestanden worden via internet geladen.
                    </p>
                  </div>
                </section>
                <div className="experiment-note">
                  <span className="tag">In ontwikkeling</span>
                  <p>
                    Dit is een experiment. Niet elk screenshot wordt goed
                    herkend. Je kunt altijd zelf aanvullen.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Hoofdnavigatie">
        <button
          disabled={busy}
          className={tab === "check" ? "active" : ""}
          aria-current={tab === "check" ? "page" : undefined}
          onClick={() => setTab("check")}
        >
          <Icon name="phone" />
          <span>Check</span>
        </button>
        <button
          disabled={busy}
          className={tab === "overview" ? "active" : ""}
          aria-current={tab === "overview" ? "page" : undefined}
          onClick={() => setTab("overview")}
        >
          <Icon name="chart" />
          <span>
            Metingen{" "}
            {measurements.length > 0 && (
              <span className="count-badge">{measurements.length}</span>
            )}
          </span>
        </button>
      </nav>
    </div>
  );
}
