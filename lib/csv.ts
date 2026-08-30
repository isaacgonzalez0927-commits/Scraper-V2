/** RFC 4180 cells, quoted when they contain a comma, quote, or newline. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvTable(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvFileName(kind: string, day: string): string {
  return `sere-${kind}-${day}.csv`;
}

export function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Split one RFC 4180 CSV into rows of cells. */
export function parseCsvRows(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records = parseCsvRows(text);
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map(normalizeCsvHeader);
  const rows = records.slice(1).map((cols) => {
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      mapped[header] = (cols[index] || "").trim();
    });
    return mapped;
  });
  return { headers, rows };
}
