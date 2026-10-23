/**
 * Robust RFC-4180 compliant CSV parser for Google Sheets GViz CSV export.
 * Handles multiline quoted strings, escaped quotes, commas, and carriage returns.
 */

export function parseCsv(text: string): string[][] {
  const p: string[][] = [];
  let row: string[] = [''];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        // Escaped double quote ("")
        row[row.length - 1] += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (c === ',' && !inQuotes) {
      row.push('');
      i++;
      continue;
    }

    if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i += 2;
      } else {
        i++;
      }
      // Finish row (only if not an empty trailing line)
      if (row.length > 1 || row[0] !== '') {
        p.push(row);
      }
      row = [''];
      continue;
    }

    row[row.length - 1] += c;
    i++;
  }

  // Push last row if exists
  if (row.length > 1 || row[0] !== '') {
    p.push(row);
  }

  return p;
}
