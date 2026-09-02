import { useEffect, useState } from "react";

import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

type Finding = {
  description: string;
  severity: "high" | "medium" | "low";
};

type Review = {
  overall: string;
  health_score: number;
  bugs: Finding[];
  security: Finding[];
  performance: Finding[];
  quality: Finding[];
  suggestions: string[];
};

type ReviewHistoryItem = {
  id: string;
  code: string;
  language: string;
  review: Review;
  createdAt: string;
};

const HISTORY_KEY = "codelens-review-history";

// YOUR DEPLOYED BACKEND
const API_URL = "https://codelens-ai-code-review-backend.vercel.app";

function loadSavedHistory(): ReviewHistoryItem[] {
  try {
    const savedHistory = localStorage.getItem(HISTORY_KEY);

    if (!savedHistory) {
      return [];
    }

    const parsedHistory = JSON.parse(savedHistory);

    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    return parsedHistory;
  } catch (error) {
    console.error("Could not load review history:", error);
    return [];
  }
}

function App() {
  const [language, setLanguage] = useState("JavaScript");
  const [code, setCode] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [history, setHistory] =
    useState<ReviewHistoryItem[]>(loadSavedHistory);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error("Could not save review history:", error);
    }
  }, [history]);

  const handleReview = async () => {
    if (!code.trim()) {
      setErrorMessage(
        "Please paste some code before starting the review."
      );
      return;
    }

    setIsReviewing(true);
    setReview(null);
    setErrorMessage("");

    try {
      const response = await fetch(`${API_URL}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code,
          language,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Backend error:", data);

        throw new Error(
          data?.detail
            ? typeof data.detail === "string"
              ? data.detail
              : JSON.stringify(data.detail)
            : "The backend could not complete the review."
        );
      }

      if (!data.review) {
        throw new Error("The backend returned an empty review.");
      }

      setReview(data.review);

      const historyItem: ReviewHistoryItem = {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`,
        code,
        language,
        review: data.review,
        createdAt: new Date().toISOString(),
      };

      setHistory((previousHistory) => [
        historyItem,
        ...previousHistory,
      ]);
    } catch (error) {
      console.error("Review error:", error);

      if (
        error instanceof TypeError &&
        error.message === "Failed to fetch"
      ) {
        setErrorMessage(
          "Unable to connect to CodeLens AI. Please make sure the backend is deployed and try again."
        );
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "Something went wrong while reviewing your code."
        );
      }
    } finally {
      setIsReviewing(false);
    }
  };

  const handleClear = () => {
    setCode("");
    setReview(null);
    setErrorMessage("");
  };

  const loadHistoryItem = (item: ReviewHistoryItem) => {
    setCode(item.code);
    setLanguage(item.language);
    setReview(item.review);
    setErrorMessage("");
    setShowHistory(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const deleteHistoryItem = (id: string) => {
    setHistory((previousHistory) =>
      previousHistory.filter((item) => item.id !== id)
    );
  };

  const clearHistory = () => {
    if (history.length === 0) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete all review history?"
    );

    if (confirmed) {
      setHistory([]);
    }
  };

  const getTotalIssues = () => {
    if (!review) return 0;

    return (
      review.bugs.length +
      review.security.length +
      review.performance.length +
      review.quality.length
    );
  };

  const getSeverityCount = (
    severity: "high" | "medium" | "low"
  ) => {
    if (!review) return 0;

    const allFindings = [
      ...review.bugs,
      ...review.security,
      ...review.performance,
      ...review.quality,
    ];

    return allFindings.filter(
      (item) => item.severity === severity
    ).length;
  };

  const getHealthLabel = () => {
    if (!review) return "—";

    if (review.health_score >= 90) {
      return "Excellent";
    }

    if (review.health_score >= 75) {
      return "Good";
    }

    if (review.health_score >= 60) {
      return "Needs Attention";
    }

    return "Critical";
  };

  const getBarWidth = (count: number) => {
    const total = getTotalIssues();

    if (count === 0 || total === 0) {
      return "0%";
    }

    return `${Math.max((count / total) * 100, 8)}%`;
  };

  const renderFindings = (
    findings: Finding[],
    emptyMessage: string
  ) => {
    if (findings.length === 0) {
      return (
        <div className="no-issues">
          {emptyMessage}
        </div>
      );
    }

    return findings.map((item, index) => (
      <div
        className={`finding-card severity-${item.severity}`}
        key={`${item.severity}-${index}-${item.description}`}
      >
        <span className="severity-badge">
          {item.severity}
        </span>

        <p>{item.description}</p>
      </div>
    ));
  };

  return (
    <div className="app">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-mark">◈</span>
          <span>CodeLens</span>
        </div>

        <div className="nav-actions">
          <span className="nav-item">
            Docs
          </span>

          <button
            className="history-nav-button"
            onClick={() =>
              setShowHistory(!showHistory)
            }
          >
            History

            {history.length > 0 && (
              <span className="history-count">
                {history.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {showHistory && (
        <aside className="history-panel">
          <div className="history-header">
            <div>
              <span className="section-label">
                CODELENS
              </span>

              <h2>Review History</h2>
            </div>

            <button
              className="history-close"
              onClick={() =>
                setShowHistory(false)
              }
              aria-label="Close history"
            >
              ×
            </button>
          </div>

          {history.length === 0 ? (
            <div className="history-empty">
              <div>◷</div>

              <p>No reviews yet.</p>

              <span>
                Your completed reviews will
                appear here.
              </span>
            </div>
          ) : (
            <>
              <div className="history-toolbar">
                <span>
                  {history.length}{" "}
                  {history.length === 1
                    ? "review"
                    : "reviews"}
                </span>

                <button
                  className="clear-history-button"
                  onClick={clearHistory}
                >
                  Clear all
                </button>
              </div>

              <div className="history-list">
                {history.map((item) => (
                  <div
                    className="history-item"
                    key={item.id}
                  >
                    <button
                      className="history-item-main"
                      onClick={() =>
                        loadHistoryItem(item)
                      }
                    >
                      <div className="history-item-top">
                        <span className="history-language">
                          {item.language}
                        </span>

                        <span
                          className={`history-score ${
                            item.review.health_score >= 90
                              ? "score-excellent"
                              : item.review.health_score >= 75
                              ? "score-good"
                              : item.review.health_score >= 60
                              ? "score-warning"
                              : "score-critical"
                          }`}
                        >
                          {item.review.health_score}
                        </span>
                      </div>

                      <p>
                        {item.code
                          .split("\n")[0]
                          .slice(0, 45)}

                        {item.code.length > 45
                          ? "..."
                          : ""}
                      </p>

                      <span className="history-date">
                        {new Date(
                          item.createdAt
                        ).toLocaleString()}
                      </span>
                    </button>

                    <button
                      className="history-delete"
                      onClick={() =>
                        deleteHistoryItem(item.id)
                      }
                      title="Delete review"
                      aria-label="Delete review"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      )}

      <main className="dashboard">
        <section className="hero">
          <p className="eyebrow">
            AI-POWERED CODE ANALYSIS
          </p>

          <h1>
            Code reviews, powered by AI.
          </h1>

          <p className="hero-description">
            Detect bugs, security issues, and
            performance problems before they
            reach production.
          </p>
        </section>

        <section className="top-dashboard">
          <div className="panel code-panel">
            <div className="panel-header">
              <div>
                <span className="panel-title">
                  YOUR CODE
                </span>

                <span className="panel-subtitle">
                  Paste your code below
                </span>
              </div>

              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value)
                }
                disabled={isReviewing}
              >
                <option>JavaScript</option>
                <option>TypeScript</option>
                <option>Python</option>
                <option>Java</option>
                <option>C++</option>
                <option>C#</option>
              </select>
            </div>

            <textarea
              placeholder="// Paste your code here..."
              value={code}
              onChange={(e) =>
                setCode(e.target.value)
              }
              disabled={isReviewing}
            />

            <div className="code-footer">
              <span>
                {code.length} characters
              </span>

              <div className="code-actions">
                {code && !isReviewing && (
                  <button
                    className="clear-button"
                    onClick={handleClear}
                  >
                    Clear
                  </button>
                )}

                <button
                  onClick={handleReview}
                  disabled={isReviewing}
                >
                  {isReviewing ? (
                    <>
                      <span className="loading-spinner"></span>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Review Code
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="error-message">
                <span>⚠</span>
                <p>{errorMessage}</p>
              </div>
            )}
          </div>

          <div className="dashboard-card health-card">
            <div className="card-heading">
              <div>
                <span className="section-label">
                  CODE HEALTH
                </span>

                <h3>Overall score</h3>
              </div>

              <span className="card-icon">
                ✦
              </span>
            </div>

            {!review ? (
              <div className="waiting-state">
                {isReviewing ? (
                  <>
                    <div className="analyzing-icon">
                      ✦
                    </div>

                    <p>
                      AI is analyzing your
                      code...
                    </p>
                  </>
                ) : (
                  <>
                    <div className="waiting-number">
                      —
                    </div>

                    <p>
                      Run a review to calculate
                      health
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="health-content">
                <div
                  className="health-circle"
                  style={
                    {
                      "--score": `${review.health_score * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <div className="health-circle-inner">
                    <strong>
                      {review.health_score}
                    </strong>

                    <span>/100</span>
                  </div>
                </div>

                <div className="health-status">
                  <span className="health-label">
                    {getHealthLabel()}
                  </span>

                  <p>
                    Based on the AI code
                    analysis.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="dashboard-card statistics-card">
            <div className="card-heading">
              <div>
                <span className="section-label">
                  ISSUES
                </span>

                <h3>
                  Severity overview
                </h3>
              </div>
            </div>

            <div className="statistics-grid">
              <div className="stat-box total">
                <strong>
                  {review
                    ? getTotalIssues()
                    : "—"}
                </strong>

                <span>Total</span>
              </div>

              <div className="stat-box high">
                <strong>
                  {review
                    ? getSeverityCount("high")
                    : "—"}
                </strong>

                <span>High</span>
              </div>

              <div className="stat-box medium">
                <strong>
                  {review
                    ? getSeverityCount("medium")
                    : "—"}
                </strong>

                <span>Medium</span>
              </div>

              <div className="stat-box low">
                <strong>
                  {review
                    ? getSeverityCount("low")
                    : "—"}
                </strong>

                <span>Low</span>
              </div>
            </div>
          </div>

          <div className="dashboard-card graph-card">
            <div className="card-heading">
              <div>
                <span className="section-label">
                  ISSUE BREAKDOWN
                </span>

                <h3>
                  Analysis by category
                </h3>
              </div>
            </div>

            <div className="category-chart">
              {[
                ["Bugs", review?.bugs.length ?? 0],
                [
                  "Security",
                  review?.security.length ?? 0,
                ],
                [
                  "Performance",
                  review?.performance.length ?? 0,
                ],
                [
                  "Quality",
                  review?.quality.length ?? 0,
                ],
              ].map(([label, count]) => (
                <div
                  className="chart-row"
                  key={label}
                >
                  <div className="chart-top">
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>

                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: review
                          ? getBarWidth(Number(count))
                          : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="review-dashboard">
          {!review ? (
            <div className="empty-review">
              <div className="ai-icon">
                ✦
              </div>

              <h2>
                {isReviewing
                  ? "AI is reviewing your code"
                  : "Your review will appear here"}
              </h2>

              <p>
                {isReviewing
                  ? "Please wait while CodeLens analyzes your code for bugs, security risks, performance issues, and code quality."
                  : "Submit your code and our AI will analyze it for bugs, security risks, performance issues, and improvements."}
              </p>

              {isReviewing && (
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="overall-card">
                <div>
                  <span className="section-label">
                    OVERALL ASSESSMENT
                  </span>

                  <h2>
                    Code analysis summary
                  </h2>
                </div>

                <p>{review.overall}</p>
              </div>

              <div className="findings-grid">
                <div className="finding-section">
                  <div className="finding-heading">
                    <span className="finding-symbol">
                      🐛
                    </span>

                    <div>
                      <span className="section-label">
                        CATEGORY
                      </span>

                      <h3>
                        Bugs & Errors
                      </h3>
                    </div>
                  </div>

                  {renderFindings(
                    review.bugs,
                    "No bugs found."
                  )}
                </div>

                <div className="finding-section">
                  <div className="finding-heading">
                    <span className="finding-symbol">
                      🔒
                    </span>

                    <div>
                      <span className="section-label">
                        CATEGORY
                      </span>

                      <h3>Security</h3>
                    </div>
                  </div>

                  {renderFindings(
                    review.security,
                    "No security issues found."
                  )}
                </div>

                <div className="finding-section">
                  <div className="finding-heading">
                    <span className="finding-symbol">
                      ⚡
                    </span>

                    <div>
                      <span className="section-label">
                        CATEGORY
                      </span>

                      <h3>Performance</h3>
                    </div>
                  </div>

                  {renderFindings(
                    review.performance,
                    "No performance issues found."
                  )}
                </div>

                <div className="finding-section">
                  <div className="finding-heading">
                    <span className="finding-symbol">
                      ✨
                    </span>

                    <div>
                      <span className="section-label">
                        CATEGORY
                      </span>

                      <h3>
                        Code Quality
                      </h3>
                    </div>
                  </div>

                  {renderFindings(
                    review.quality,
                    "No quality issues found."
                  )}
                </div>
              </div>

              <div className="suggestions-card">
                <div className="finding-heading">
                  <span className="finding-symbol">
                    💡
                  </span>

                  <div>
                    <span className="section-label">
                      RECOMMENDATIONS
                    </span>

                    <h3>Suggestions</h3>
                  </div>
                </div>

                <div className="suggestions-list">
                  {review.suggestions.length === 0 ? (
                    <div className="no-issues">
                      No additional suggestions.
                    </div>
                  ) : (
                    review.suggestions.map(
                      (item, index) => (
                        <div
                          className="suggestion-item"
                          key={`${index}-${item}`}
                        >
                          <span>
                            {String(
                              index + 1
                            ).padStart(2, "0")}
                          </span>

                          <p>{item}</p>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;