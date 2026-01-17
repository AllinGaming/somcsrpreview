import { useEffect, useMemo, useState } from "react";
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

function isRowEmpty(cells) {
  const item = (cells[COL_INDEX.item] ?? "").trim();
  const name = (cells[COL_INDEX.name] ?? "").trim();
  const value = (cells[COL_INDEX.value] ?? "").trim();
  return item === "" && name === "" && value === "";
}

function filterRows(rows, query) {
  if (!query) {
    return rows;
  }
  const needle = query.toLowerCase();
  return rows.filter((row) =>
    row.cells.some((cell) => cell.toLowerCase().includes(needle))
  );
}

export default function App() {
  const [filterQuery, setFilterQuery] = useState("");
  const [activeSheet, setActiveSheet] = useState(SHEETS[0].name);
  const [sheets, setSheets] = useState(
    SHEETS.map((sheet) => ({
      ...sheet,
      status: "loading",
      rows: [],
      sourceUrl: "",
      error: null,
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
    let cancelled = false;

    async function loadSheet(sheet, index) {
      try {
        const { text, url } = await fetchCsvWithFallback(sheet);
        const rawRows = parseCSV(text).map(sanitizeRow);
        const rows = rawRows
          .map((cells, rowIndex) => ({
            cells,
            rowNumber: rowIndex + 1,
          }))
          .filter((row) => row.rowNumber > 1)
          .filter((row) => !isRowEmpty(row.cells));
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

  const statusText = useMemo(() => {
    const loaded = sheets.filter((sheet) => sheet.status === "ready").length;
    if (loaded === sheets.length) {
      return "Loaded all sheets";
    }
    return `Loading ${loaded}/${sheets.length} sheets...`;
  }, [sheets]);

  const active = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];
  const filteredRows = active ? filterRows(active.rows, filterQuery.trim()) : [];

  return (
    <div className="app">
      <nav className="sheet-nav">
        {SHEETS.map((sheet) => (
          <a
            key={sheet.name}
            href={`#/${encodeURIComponent(sheet.name)}`}
            className={sheet.name === activeSheet ? "active" : ""}
          >
            {sheet.name}
          </a>
        ))}
      </nav>

      <section className="controls">
        <label className="search">
          <span>Filter</span>
          <input
            type="search"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Type to filter rows"
          />
        </label>
        <div className="status">{statusText}</div>
      </section>

      <section className="grid">
        {active && (
          <article className={`sheet ${active.status}`} key={active.name}>
            <header>
              <div>
                <h2>{active.name}</h2>
                <div className="pill">
                  {active.status === "ready"
                    ? `${active.rows.length} rows`
                    : "Loading"}
                </div>
              </div>
              {active.status === "ready" && (
                <div className="status">
                  Updated {new Date().toLocaleTimeString()}
                </div>
              )}
            </header>

            {active.status === "loading" && (
              <div className="loading">Loading data...</div>
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
                        <th>Item</th>
                        <th>Name</th>
                        <th>CSR Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={`${active.name}-${row.rowNumber}`}>
                          <td>{row.cells[COL_INDEX.item] || ""}</td>
                          <td>{row.cells[COL_INDEX.name] || ""}</td>
                          <td>{row.cells[COL_INDEX.value] || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="source">
                  Source: <a href={active.sourceUrl}>{active.sourceUrl}</a>
                </div>
              </>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
