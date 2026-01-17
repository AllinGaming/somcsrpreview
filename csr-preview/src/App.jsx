import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const SHEET_ID = "1-9jt6ofXzOICrUGsw509xeystkNIc2YCgPyB6V2tCjU";
const SHEETS = [
  { name: "Kara40 CSR", gid: null },
  { name: "NAXX CSR", gid: null },
  { name: "AQ CSR", gid: null },
  { name: "ES CSR", gid: null },
  { name: "BWL CSR", gid: null },
  { name: "MC CSR", gid: null },
];

const COL_INDEX = { item: 10, name: 11, value: 12 };
const DEFAULT_FILTERS = { query: "" };

function parseCSV(text) {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      current.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      current.push(value);
      rows.push(current);
      current = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || current.length) {
    current.push(value);
    rows.push(current);
  }

  return rows;
}

function sanitizeRow(row) {
  return row.map((cell) => (cell ?? "").trim());
}

function sheetUrls(sheet) {
  const encoded = encodeURIComponent(sheet.name);
  const urls = [
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encoded}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${encoded}`,
  ];
  if (sheet.gid) {
    urls.push(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sheet.gid}`,
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${sheet.gid}`
    );
  }
  return urls;
}

async function fetchCsvWithFallback(sheet) {
  const urls = sheetUrls(sheet);
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { text: await response.text(), url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Fetch failed");
}

function parseCsr(value) {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function csrTier(value) {
  if (value == null) {
    return { label: "No score", className: "empty" };
  }
  if (value >= 75) {
    return { label: "High", className: "gold" };
  }
  if (value >= 50) {
    return { label: "Medium", className: "green" };
  }
  if (value >= 25) {
    return { label: "Low", className: "stone" };
  }
  return { label: "Very low", className: "ash" };
}

function applyFilters(rows, filters) {
  const query = filters.query.trim().toLowerCase();
  if (!query) {
    return rows;
  }
  return rows.filter(
    (row) =>
      row.item.toLowerCase().includes(query) ||
      row.name.toLowerCase().includes(query)
  );
}

function sortRows(rows, sort) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort.key === "csr") {
      const left = a.csrNumber ?? -Infinity;
      const right = b.csrNumber ?? -Infinity;
      return sort.dir === "asc" ? left - right : right - left;
    }
    if (sort.key === "item") {
      return sort.dir === "asc"
        ? a.item.localeCompare(b.item)
        : b.item.localeCompare(a.item);
    }
    return sort.dir === "asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name);
  });
  return sorted;
}

function buildCopyText(rows) {
  return rows
    .map((row) => `${row.item}\t${row.name}\t${row.value}`)
    .join("\n");
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q") ?? "",
  };
}

function writeFiltersToUrl(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);

  const search = params.toString();
  const nextUrl = `${window.location.pathname}${
    search ? `?${search}` : ""
  }${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

export default function App() {
  const [activeSheet, setActiveSheet] = useState(SHEETS[0].name);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showSearch, setShowSearch] = useState(false);
  const [sort, setSort] = useState({ key: "csr", dir: "desc" });
  const [copyStatus, setCopyStatus] = useState("Copy sheet");
  const firstRender = useRef(true);
  const sheetNavRef = useRef(null);
  const [statusHidden, setStatusHidden] = useState(false);
  const hideStatusTimeout = useRef(null);

  const [sheets, setSheets] = useState(
    SHEETS.map((sheet) => ({
      ...sheet,
      status: "loading",
      rows: [],
      sourceUrl: "",
      error: null,
      updatedAt: null,
    }))
  );

  useEffect(() => {
    function readHash() {
      const raw = window.location.hash.replace(/^#\/?/, "");
      return raw ? decodeURIComponent(raw) : "";
    }

    function updateHash(name) {
      window.location.hash = `#/${encodeURIComponent(name)}`;
    }

    function handleHashChange() {
      const next = readHash();
      const exists = SHEETS.some((sheet) => sheet.name === next);
      if (next && exists) {
        setActiveSheet(next);
      } else {
        setActiveSheet(SHEETS[0].name);
        updateHash(SHEETS[0].name);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    if (!readHash()) {
      updateHash(SHEETS[0].name);
    } else {
      handleHashChange();
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const urlFilters = readFiltersFromUrl();
    const hasUrlFilters = Object.values(urlFilters).some((value) => value);
    if (hasUrlFilters) {
      setFilters(urlFilters);
      return;
    }
    try {
      const saved = localStorage.getItem("csrFilters");
      if (saved) {
        setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(saved) });
      }
    } catch {
      setFilters(DEFAULT_FILTERS);
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      localStorage.setItem("csrFilters", JSON.stringify(filters));
    } catch {
      // ignore storage errors
    }
    writeFiltersToUrl(filters);
  }, [filters]);

  useEffect(() => {
    if (filters.query && !showSearch) {
      setShowSearch(true);
    }
  }, [filters.query, showSearch]);

  useEffect(() => {
    const nav = sheetNavRef.current;
    if (!nav) return undefined;

    function handleWheel(event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      if (nav.scrollWidth <= nav.clientWidth) {
        return;
      }
      event.preventDefault();
      nav.scrollLeft += event.deltaY;
    }

    nav.addEventListener("wheel", handleWheel, { passive: false });
    return () => nav.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSheet(sheet, index) {
      try {
        const { text, url } = await fetchCsvWithFallback(sheet);
        const rawRows = parseCSV(text).map(sanitizeRow);
        const rows = rawRows
          .map((cells, rowIndex) => {
            const item = (cells[COL_INDEX.item] ?? "").trim();
            const name = (cells[COL_INDEX.name] ?? "").trim();
            const value = (cells[COL_INDEX.value] ?? "").trim();
            return {
              cells,
              rowNumber: rowIndex + 1,
              item,
              name,
              value,
              csrNumber: parseCsr(value),
            };
          })
          .filter((row) => row.rowNumber > 1)
          .filter((row) => row.item || row.name || row.value);
        if (!cancelled) {
          setSheets((prev) =>
            prev.map((entry, i) =>
              i === index
                ? {
                    ...entry,
                    status: "ready",
                    rows,
                    sourceUrl: url,
                    error: null,
                    updatedAt: new Date(),
                  }
                : entry
            )
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSheets((prev) =>
            prev.map((entry, i) =>
              i === index
                ? {
                    ...entry,
                    status: "error",
                    error: error.message,
                  }
                : entry
            )
          );
        }
      }
    }

    SHEETS.forEach((sheet, index) => {
      loadSheet(sheet, index);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const isReady = useMemo(() => {
    const loaded = sheets.filter((sheet) => sheet.status === "ready").length;
    return loaded === sheets.length;
  }, [sheets]);

  const active = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];

  const filteredRows = useMemo(() => {
    if (!active) {
      return [];
    }
    return applyFilters(active.rows, filters);
  }, [active, filters]);

  const sortedRows = useMemo(
    () => sortRows(filteredRows, sort),
    [filteredRows, sort]
  );

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setShowSearch(false);
  }

  function openSearch() {
    setShowSearch(true);
  }

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "csr" ? "desc" : "asc" };
    });
  }

  async function copySheet() {
    const text = buildCopyText(sortedRows);
    if (!text) {
      setCopyStatus("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied");
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopyStatus("Copied");
      } catch {
        setCopyStatus("Copy failed");
      }
    }
  }

  useEffect(() => {
    if (copyStatus !== "Copy sheet") {
      const timeout = setTimeout(() => setCopyStatus("Copy sheet"), 1600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [copyStatus]);

  useEffect(() => {
    if (hideStatusTimeout.current) {
      clearTimeout(hideStatusTimeout.current);
      hideStatusTimeout.current = null;
    }
    if (!isReady) {
      setStatusHidden(false);
      return undefined;
    }
    setStatusHidden(false);
    hideStatusTimeout.current = setTimeout(() => {
      setStatusHidden(true);
      hideStatusTimeout.current = null;
    }, 5000);
    return () => {
      if (hideStatusTimeout.current) {
        clearTimeout(hideStatusTimeout.current);
        hideStatusTimeout.current = null;
      }
    };
  }, [isReady]);

  return (
    <div className="app">
      <section className="top-bar">
        <nav className="sheet-nav" ref={sheetNavRef}>
          {SHEETS.map((sheet) => {
            const count =
              sheets.find((entry) => entry.name === sheet.name)?.rows.length ??
              0;
            return (
              <a
                key={sheet.name}
                href={`#/${encodeURIComponent(sheet.name)}`}
                className={sheet.name === activeSheet ? "active" : ""}
              >
                {sheet.name} <span>({count || "-"})</span>
              </a>
            );
          })}
        </nav>
        <div
          className={`status ${isReady ? "status--ready" : ""} ${
            statusHidden ? "status--hidden" : ""
          }`}
          role="status"
          aria-label={isReady ? "Synced" : "Syncing"}
          aria-hidden={statusHidden}
        >
          <span className="status-dot" aria-hidden />
        </div>
      </section>

      <section className="grid">
        {active && (
          <article className={`sheet ${active.status}`} key={active.name}>
            <header className="module-header">
              <div className="module-title">
                <div>
                  <h2>{active.name}</h2>
                </div>
              </div>
              <div className="module-actions">
                <div
                  className={`filter-bar ${
                    showSearch ? "filter-bar--open" : "filter-bar--closed"
                  }`}
                >
                  {showSearch ? (
                    <>
                      <label className="filter-field">
                        <span>Search</span>
                        <input
                          type="search"
                          value={filters.query}
                          onChange={(event) =>
                            updateFilter("query", event.target.value)
                          }
                          placeholder="Item or player"
                          autoFocus
                        />
                      </label>
                      <button className="btn ghost small" onClick={clearFilters}>
                        Clear
                      </button>
                    </>
                  ) : (
                    <button className="btn ghost small" onClick={openSearch}>
                      Search
                    </button>
                  )}
                </div>
                <button className="btn primary" onClick={copySheet}>
                  {copyStatus}
                </button>
              </div>
            </header>

            <div className="module-body">
              {active.status === "loading" && (
                <div className="loading-panel">
                  <div className="loading-bar" />
                  <div className="loading-bar short" />
                  <div className="loading-table">
                    <div className="loading-row" />
                    <div className="loading-row" />
                    <div className="loading-row" />
                  </div>
                </div>
              )}

              {active.status === "error" && (
                <div className="error">
                  Unable to load this sheet. Make sure the Google Sheet is
                  published to the web. ({active.error})
                </div>
              )}

              {active.status === "ready" && (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th
                            className="col-item"
                            onClick={() => toggleSort("item")}
                          >
                            Item
                            <span className="sort">
                              {sort.key === "item"
                                ? sort.dir === "asc"
                                  ? " ▲"
                                  : " ▼"
                                : ""}
                            </span>
                          </th>
                        <th
                          className="col-name"
                          onClick={() => toggleSort("name")}
                        >
                          Name
                            <span className="sort">
                              {sort.key === "name"
                                ? sort.dir === "asc"
                                  ? " ▲"
                                  : " ▼"
                                : ""}
                            </span>
                          </th>
                        <th
                          className="col-csr csr-header"
                          onClick={() => toggleSort("csr")}
                        >
                          <span className="label-full">CSR Value</span>
                          <span className="label-short">CSR</span>
                            <span className="sort">
                              {sort.key === "csr"
                                ? sort.dir === "asc"
                                  ? " ▲"
                                  : " ▼"
                                : ""}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row) => {
                          const tier = csrTier(row.csrNumber);
                          const rowKey = `${active.name}-${row.rowNumber}-${row.item}-${row.name}`;
                          return (
                            <tr key={rowKey}>
                              <td className="cell-item" title={row.item}>
                                <a
                                  className="cell-link"
                                  href={`https://database.turtlecraft.gg/?search=${encodeURIComponent(
                                    row.item
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Open item in database: ${row.item}`}
                                >
                                  <span className="cell-text">{row.item}</span>
                                </a>
                              </td>
                              <td className="cell-name">
                                <a
                                  className="cell-link"
                                  href={`https://turtlecraft.gg/armory/Tel%27Abim/${encodeURIComponent(
                                    row.name
                                  )}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Open player in armory: ${row.name}`}
                                >
                                  {row.name}
                                </a>
                              </td>
                              <td className="cell-csr">
                                <span className={`csr-badge ${tier.className}`}>
                                  <strong>{row.value || "-"}</strong>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="source">
                    Source: <a href={active.sourceUrl}>{active.sourceUrl}</a>
                  </div>
                </>
              )}
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
