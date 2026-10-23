/**
 * High-performance slice-based RFC-4180 compliant CSV parser.
 * Avoids per-character string allocations and memory thrashing.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  if (len === 0) return rows;

  let currentRow: string[] = [];
  let inQuotes = false;
  let fieldStart = 0;
  let hasQuotes = false;

  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);

    if (c === 34) {
      // Quote char '"'
      inQuotes = !inQuotes;
      hasQuotes = true;
    } else if (!inQuotes) {
      if (c === 44) {
        // Comma ','
        let field = text.slice(fieldStart, i);
        if (hasQuotes) {
          field = field.trim();
          if (field.startsWith('"') && field.endsWith('"')) {
            field = field.slice(1, -1).replace(/""/g, '"');
          }
        }
        currentRow.push(field);
        fieldStart = i + 1;
        hasQuotes = false;
      } else if (c === 10 || c === 13) {
        // Line break '\n' or '\r'
        let field = text.slice(fieldStart, i);
        if (hasQuotes) {
          field = field.trim();
          if (field.startsWith('"') && field.endsWith('"')) {
            field = field.slice(1, -1).replace(/""/g, '"');
          }
        }
        currentRow.push(field);
        fieldStart = i + 1;
        hasQuotes = false;

        // Skip \r\n sequence
        if (c === 13 && i + 1 < len && text.charCodeAt(i + 1) === 10) {
          i++;
          fieldStart = i + 1;
        }

        // Only add non-empty rows
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
      }
    }
  }

  // Handle final field if text doesn't end with newline
  if (fieldStart < len || currentRow.length > 0) {
    let field = text.slice(fieldStart);
    if (hasQuotes) {
      field = field.trim();
      if (field.startsWith('"') && field.endsWith('"')) {
        field = field.slice(1, -1).replace(/""/g, '"');
      }
    }
    currentRow.push(field);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}
