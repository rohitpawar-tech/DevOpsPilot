import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "http://localhost:8080/api";
const HISTORY_KEY = "devopspilot-history";
const THEME_KEY = "devopspilot-theme";
const HISTORY_LIMIT = 25;

function normalizeStatus(status) {
  const value = String(status || "").toUpperCase();

  if (["SUCCESS", "SUCCEEDED"].includes(value)) return "Success";
  if (["FAILED", "FAILURE"].includes(value)) return "Failed";
  if (value === "RUNNING") return "Running";

  return "Queued";
}

function severityClass(severity) {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL") return "sev-critical";
  if (s === "HIGH") return "sev-high";
  if (s === "MEDIUM") return "sev-medium";
  if (s === "LOW") return "sev-low";
  if (s === "INFO") return "sev-info";
  return "sev-info";
}

function formatReport(result) {
  if (!result) return "";
  return [
    "DevOpsPilot — Log Analysis Report",
    "==================================",
    "",
    `Severity:         ${result.severity || "N/A"}`,
    `Category:         ${result.category || "N/A"}`,
    `Matched Pattern:  ${result.matchedPattern || "N/A"}`,
    `Probable Cause:   ${result.probableCause || "N/A"}`,
    `Suggested Fix:    ${result.suggestedFix || "N/A"}`,
    `Analyzed At:      ${result.analyzedAt || "N/A"}`,
    "",
    "Engine: Java Rule Engine (pattern-based; not AI-powered).",
    "",
  ].join("\n");
}

function App() {
  /* ---------------- Theme ---------------- */
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  /* ---------------- Toasts ---------------- */
  const [notifications, setNotifications] = useState([]);

  function pushNotification(type, message) {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, type, message }]);
  }

  function dismissNotification(id) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  useEffect(() => {
    if (notifications.length === 0) return undefined;
    const timers = notifications.map((n) =>
      setTimeout(() => dismissNotification(n.id), 4500)
    );
    return () => timers.forEach(clearTimeout);
  }, [notifications]);

  /* ---------------- Pipelines ---------------- */
  const [pipelines, setPipelines] = useState([]);
  const [filter, setFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  async function loadPipelines() {
    try {
      const response = await fetch(`${API}/pipelines`);

      if (!response.ok) {
        throw new Error("Could not load pipelines.");
      }

      const data = await response.json();

      setPipelines(
        data.map((pipeline) => ({
          ...pipeline,
          status: normalizeStatus(pipeline.status),
          time: pipeline.createdAt || pipeline.timestamp || "Recently",
        }))
      );

      setBackendOnline(true);
      setApiError("");
    } catch {
      setBackendOnline(false);
      setApiError(
        "Cannot connect to Java backend. Make sure Spring Boot is running on port 8080."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPipelines();
  }, []);

  const successful = pipelines.filter(
    (pipeline) => pipeline.status === "Success"
  ).length;

  const failed = pipelines.filter(
    (pipeline) => pipeline.status === "Failed"
  ).length;

  const running = pipelines.filter(
    (pipeline) => pipeline.status === "Running"
  ).length;

  const visiblePipelines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pipelines
      .filter((pipeline) =>
        filter === "All" ? true : pipeline.status === filter
      )
      .filter((pipeline) => {
        if (!q) return true;
        return (
          String(pipeline.name || "").toLowerCase().includes(q) ||
          String(pipeline.branch || "").toLowerCase().includes(q) ||
          String(pipeline.status || "").toLowerCase().includes(q)
        );
      });
  }, [pipelines, filter, searchQuery]);

  async function simulatePipeline() {
    setApiError("");
    setCreatingPipeline(true);

    try {
      const response = await fetch(`${API}/pipelines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "manual-build",
          branch: "main",
        }),
      });

      if (!response.ok) {
        throw new Error("Pipeline creation failed.");
      }

      await loadPipelines();
      setFilter("All");
      pushNotification("success", "Pipeline created successfully.");
    } catch {
      setApiError(
        "Could not create pipeline. Check the Java backend connection."
      );
      pushNotification("error", "Pipeline creation failed.");
    } finally {
      setCreatingPipeline(false);
    }
  }

  /* ---------------- Log Analyzer ---------------- */
  const [logs, setLogs] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  async function analyzeLogs() {
    if (!logs.trim()) {
      setAnalysis("Please enter a log message first.");
      setAnalysisResult(null);
      return;
    }

    setAnalysis("");
    setAnalysisResult(null);
    setAnalyzing(true);

    try {
      const response = await fetch(`${API}/logs/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          log: logs,
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          (data && (data.probableCause || data.message)) ||
            "Log analysis request failed."
        );
      }

      setAnalysisResult(data);

      const entry = {
        id: Date.now(),
        logPreview: logs.slice(0, 240),
        result: data,
        analyzedAt: data.analyzedAt || new Date().toISOString(),
      };

      setHistory((prev) => {
        const updated = [entry, ...prev].slice(0, HISTORY_LIMIT);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });

      pushNotification("success", "Log analysis completed.");
    } catch (error) {
      setAnalysis(
        error.message === "Failed to fetch"
          ? "Cannot connect to the Log Analyzer API. Check that the Java backend is running and CORS is configured."
          : error.message
      );
      pushNotification("error", "Log analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function copyReport() {
    if (!analysisResult) return;
    const text = formatReport(analysisResult);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => pushNotification("success", "Report copied to clipboard."),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      pushNotification("success", "Report copied to clipboard.");
    } catch {
      pushNotification("error", "Could not copy report.");
    }
  }

  function downloadReport(format) {
    if (!analysisResult) return;
    const content =
      format === "json"
        ? JSON.stringify(analysisResult, null, 2)
        : formatReport(analysisResult);
    const mime =
      format === "json" ? "application/json" : "text/plain;charset=utf-8";
    const ext = format === "json" ? "json" : "txt";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-analysis-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushNotification("success", `Report downloaded as ${ext.toUpperCase()}.`);
  }

  function restoreFromHistory(entry) {
    setLogs(entry.logPreview);
    setAnalysisResult(entry.result);
    setAnalysis("");
    pushNotification("success", "Loaded historical analysis.");
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
    pushNotification("success", "Analysis history cleared.");
  }

  /* ---------------- Render ---------------- */
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>DevOpsPilot</span>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        <nav className="nav-list">
          <button type="button" className="nav-item active">
            <span>▦</span> Overview
          </button>
          <button type="button" className="nav-item">
            <span>⑂</span> Pipelines
          </button>
          <button type="button" className="nav-item">
            <span>▣</span> Deployments
          </button>
          <button type="button" className="nav-item">
            <span>◈</span> Containers
          </button>
          <button type="button" className="nav-item">
            <span>✳</span> Log Analyzer
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="online-dot" aria-hidden></div>
          <div className="sidebar-bottom-text">
            <strong>Local workspace</strong>
            <small>Java API integration</small>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Toggle dark or light theme"
            title="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace /</span> Overview
          </div>

          <div className="profile">
            <button
              type="button"
              className="theme-toggle topbar-theme"
              onClick={toggleTheme}
              aria-label="Toggle dark or light theme"
              title="Toggle theme"
            >
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
            <span className="online-dot" aria-hidden></span>
            Developer
            <span className="avatar">R</span>
          </div>
        </header>

        <section className="welcome">
          <div>
            <p className="eyebrow">DEVOPS CONTROL CENTER</p>
            <h1>Good morning, Rohit.</h1>
            <p className="muted">
              Monitor pipelines, deployments and application health in one place.
            </p>
          </div>

          <button
            className="primary-btn"
            onClick={simulatePipeline}
            disabled={creatingPipeline}
          >
            {creatingPipeline ? "Creating…" : "＋ New Pipeline"}
          </button>
        </section>

        {apiError && (
          <div className="alert alert-error" role="alert">
            {apiError}
          </div>
        )}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span>Total Pipelines</span>
              <span className="stat-icon blue">⑂</span>
            </div>
            <strong>{pipelines.length}</strong>
            <small>Loaded from Java API</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Successful</span>
              <span className="stat-icon green">✓</span>
            </div>
            <strong>{successful}</strong>
            <small>Completed successfully</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Failed</span>
              <span className="stat-icon red">!</span>
            </div>
            <strong>{failed}</strong>
            <small>Need investigation</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Running</span>
              <span className="stat-icon purple">↻</span>
            </div>
            <strong>{running}</strong>
            <small>Currently in progress</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel pipeline-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent Pipelines</h2>
                <p className="muted">Data from Spring Boot backend</p>
              </div>

              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter pipelines"
              >
                <option>All</option>
                <option>Success</option>
                <option>Failed</option>
                <option>Running</option>
                <option>Queued</option>
              </select>
            </div>

            <div className="pipeline-toolbar">
              <input
                type="search"
                className="pipeline-search"
                placeholder="Search by name, branch or status…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search pipelines"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="pipeline-list">
              {loading ? (
                <>
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                </>
              ) : visiblePipelines.length === 0 ? (
                <p className="muted empty">
                  {searchQuery
                    ? "No pipelines match your search."
                    : "No pipelines match this filter."}
                </p>
              ) : (
                visiblePipelines.map((pipeline) => (
                  <div
                    className="pipeline-row"
                    key={pipeline.id}
                    onClick={() => setSelectedPipeline(pipeline)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedPipeline(pipeline);
                      }
                    }}
                  >
                    <div className="pipeline-symbol">⌘</div>

                    <div className="pipeline-info">
                      <strong>{pipeline.name}</strong>
                      <small>
                        <span className="branch-chip">
                          ⎇ {pipeline.branch || "—"}
                        </span>
                        <span className="dot-sep" aria-hidden>
                          ·
                        </span>
                        <span className="pipeline-time">
                          {pipeline.time}
                        </span>
                      </small>
                    </div>

                    <span
                      className={"status " + pipeline.status.toLowerCase()}
                    >
                      {pipeline.status}
                    </span>

                    <span className="row-chevron" aria-hidden>
                      ›
                    </span>
                  </div>
                ))
              )}
            </div>

            <p className="demo-note">Connected to local Spring Boot API</p>
          </article>

          <article className="panel health-panel">
            <div className="panel-heading">
              <div>
                <h2>System Overview</h2>
                <p className="muted">Integration status</p>
              </div>

              <span
                className={"status " + (backendOnline ? "success" : "failed")}
              >
                {backendOnline ? "Connected" : "Offline"}
              </span>
            </div>

            <div className="health-item">
              <span>Frontend</span>
              <strong>
                <i className="health-dot"></i> Online
              </strong>
            </div>

            <div className="health-item">
              <span>Java Backend</span>
              <strong>{backendOnline ? "Connected" : "Not connected"}</strong>
            </div>

            <div className="health-item">
              <span>MySQL</span>
              <strong className="muted">Not connected</strong>
            </div>

            <div className="health-item">
              <span>Docker</span>
              <strong className="muted">Not connected</strong>
            </div>

            <div className="health-footer">
              Pipeline data is served by the Java backend. No live MySQL,
              Docker, or cloud integrations are connected.
            </div>
          </article>
        </section>

        <section className="panel analyzer-panel">
          <div className="panel-heading">
            <div>
              <h2>Log Analyzer</h2>
              <p className="muted">
                Analyze error logs and get troubleshooting suggestions.
              </p>
            </div>

            <span
              className="ai-tag"
              title="Pattern-based rule engine running in the Java backend"
            >
              ✳ Java Rule Engine
            </span>
          </div>

          <textarea
            value={logs}
            onChange={(event) => setLogs(event.target.value)}
            placeholder={
              "Paste an error log here...\nExample: ModuleNotFoundError: No module named 'requests'"
            }
            aria-label="Error log input"
          />

          <div className="analyzer-actions">
            <button
              className="primary-btn"
              onClick={analyzeLogs}
              disabled={analyzing}
            >
              {analyzing ? "Analyzing…" : "Analyze Logs →"}
            </button>

            <button
              className="ghost-btn"
              onClick={copyReport}
              disabled={!analysisResult}
              title="Copy analysis report to clipboard"
            >
              ⧉ Copy Report
            </button>

            <button
              className="ghost-btn"
              onClick={() => downloadReport("txt")}
              disabled={!analysisResult}
              title="Download report as TXT"
            >
              ⬇ TXT
            </button>

            <button
              className="ghost-btn"
              onClick={() => downloadReport("json")}
              disabled={!analysisResult}
              title="Download report as JSON"
            >
              ⬇ JSON
            </button>
          </div>

          {analyzing && (
            <div className="loading-block" role="status" aria-live="polite">
              <span className="spinner" aria-hidden></span>
              <span className="muted">Running rule-based analysis…</span>
            </div>
          )}

          {analysis && (
            <div className="alert alert-error" role="alert">
              <strong>Analysis Error</strong>
              <p>{analysis}</p>
            </div>
          )}

          {analysisResult && (
            <div className="analysis-result" aria-live="polite">
              <div className="analysis-header">
                <strong>Log Analysis Result</strong>
                <span
                  className={
                    "severity-badge " + severityClass(analysisResult.severity)
                  }
                >
                  {String(analysisResult.severity || "INFO").toUpperCase()}
                </span>
              </div>

              <div className="analysis-grid">
                <div className="analysis-field">
                  <span className="field-label">Category</span>
                  <span className="field-value">
                    {analysisResult.category || "N/A"}
                  </span>
                </div>

                <div className="analysis-field">
                  <span className="field-label">Matched Pattern</span>
                  <span className="field-value mono">
                    {analysisResult.matchedPattern || "N/A"}
                  </span>
                </div>

                <div className="analysis-field analysis-field--full">
                  <span className="field-label">Probable Cause</span>
                  <span className="field-value">
                    {analysisResult.probableCause || "N/A"}
                  </span>
                </div>

                <div className="analysis-field analysis-field--full">
                  <span className="field-label">Suggested Fix</span>
                  <span className="field-value">
                    {analysisResult.suggestedFix || "N/A"}
                  </span>
                </div>

                <div className="analysis-field analysis-field--full">
                  <span className="field-label">Analyzed At</span>
                  <span className="field-value mono">
                    {analysisResult.analyzedAt || "N/A"}
                  </span>
                </div>
              </div>

              <p className="analysis-note">
                Generated by the Java rule engine. This is not an AI-powered
                analyzer; results are based on pattern matching.
              </p>
            </div>
          )}

          <div className="history-block">
            <div className="history-heading">
              <strong>Analysis History</strong>
              {history.length > 0 && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={clearHistory}
                >
                  Clear all
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="muted empty">
                Past analyses will appear here. They are stored locally in
                your browser.
              </p>
            ) : (
              <ul className="history-list">
                {history.map((entry) => (
                  <li key={entry.id} className="history-item">
                    <button
                      type="button"
                      className="history-btn"
                      onClick={() => restoreFromHistory(entry)}
                      title="Load this analysis"
                    >
                      <span
                        className={
                          "severity-badge " +
                          severityClass(entry.result?.severity)
                        }
                      >
                        {String(
                          entry.result?.severity || "INFO"
                        ).toUpperCase()}
                      </span>

                      <span className="history-text">
                        <strong>
                          {entry.result?.category || "Unknown"}
                        </strong>
                        <small>{entry.logPreview}</small>
                        <small className="history-time">
                          {entry.analyzedAt}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer>
          DevOpsPilot <span>·</span> Learning project by Rohit Pawar{" "}
          <span>·</span> Frontend v0.4
        </footer>
      </main>

      {selectedPipeline && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedPipeline(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Pipeline details"
        >
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>{selectedPipeline.name}</h3>
                <p className="muted">Pipeline details (read-only)</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedPipeline(null)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-field">
                <span>Status</span>
                <strong>
                  <span
                    className={
                      "status " + selectedPipeline.status.toLowerCase()
                    }
                  >
                    {selectedPipeline.status}
                  </span>
                </strong>
              </div>

              <div className="modal-field">
                <span>Branch</span>
                <strong className="mono">
                  {selectedPipeline.branch || "—"}
                </strong>
              </div>

              <div className="modal-field">
                <span>Created At</span>
                <strong>{selectedPipeline.time}</strong>
              </div>

              <div className="modal-field">
                <span>Pipeline ID</span>
                <strong className="mono">
                  {String(selectedPipeline.id ?? "—")}
                </strong>
              </div>

              <div className="modal-raw">
                <span className="field-label">Raw record from API</span>
                <pre className="raw-pre">
{JSON.stringify(selectedPipeline, null, 2)}
                </pre>
              </div>
            </div>

            <div className="modal-footer">
              <p className="muted small">
                Showing fields returned by the Java backend. Any blank fields
                are not provided by the API response.
              </p>
              <button
                className="primary-btn"
                onClick={() => setSelectedPipeline(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={"toast toast-" + n.type}
            role="status"
            onClick={() => dismissNotification(n.id)}
          >
            <span className="toast-icon" aria-hidden>
              {n.type === "success" ? "✓" : "!"}
            </span>
            <span className="toast-msg">{n.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={(event) => {
                event.stopPropagation();
                dismissNotification(n.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
