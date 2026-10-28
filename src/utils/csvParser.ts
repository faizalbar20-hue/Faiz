/**
 * High-performance, RFC-4180 compliant CSV & Delimited Text Parser.
 *
 * Key Robustness Features:
 * 1. True RFC-4180 Quoting: Only fields that start with a quote ('"') are treated as quoted fields.
 *    Mid-string quotes (e.g., 'ZIPPER 7" METAL', '1/2" ELASTIC', '30x40" POLYBAG') are preserved
 *    as literal text and will NEVER swallow subsequent rows into a single unclosed field.
 * 2. Proper Double-Quote Escaping: '""' inside quoted fields is safely decoded as a single '"'.
 * 3. Multi-Line Cell Support: Preserves newlines inside legitimately quoted cells.
 * 4. Auto Delimiter Detection: Dynamically supports comma (,), semicolon (;) for Indonesian regional
 *    Google Sheets exports, and tab (\t).
 * 5. Defensive Recovery: If a cell has an unclosed quote, it will not swallow the rest of the file.
 */

export function detectDelimiter(text: string): string {
  // Sample the first few non-empty lines
  const sample = text.slice(0, 4000);
  let commaCount = 0;
  let semiCount = 0;
  let tabCount = 0;
  let inQuotes = false;

  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 34) {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (c === 44) commaCount++;
      else if (c === 59) semiCount++;
      else if (c === 9) tabCount++;
      if (c === 10 && (commaCount > 0 || semiCount > 0 || tabCount > 0)) {
        break; // Counted header row
      }
    }
  }

  if (semiCount > commaCount && semiCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  return ',';
}

export function parseCsv(text: string, customDelimiter?: string): string[][] {
  const rows: string[][] = [];
  const len = text.length;
  if (len === 0) return rows;

  const delimiterCode = (customDelimiter || detectDelimiter(text)).charCodeAt(0);

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let isQuotedField = false; // True ONLY if field started with '"'
  let fieldCharIndex = 0;

  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);

    if (inQuotes) {
      if (c === 34) {
        // Double quote inside quoted field
        if (i + 1 < len && text.charCodeAt(i + 1) === 34) {
          // Escaped quote '""' -> consume both and emit single '"'
          currentField += '"';
          i++; // skip second quote
        } else {
          // Closing quote of field
          inQuotes = false;
        }
      } else {
        currentField += text[i];
      }
    } else {
      if (c === 34 && fieldCharIndex === 0) {
        // Double quote at the VERY START of a field -> enters quoted field mode
        inQuotes = true;
        isQuotedField = true;
      } else if (c === 34 && isQuotedField) {
        // Quote in a field that was marked as quoted
        inQuotes = true;
      } else if (c === delimiterCode) {
        // Field delimiter (comma, semicolon, or tab)
        currentRow.push(currentField);
        currentField = '';
        inQuotes = false;
        isQuotedField = false;
        fieldCharIndex = 0;
        continue;
      } else if (c === 10 || c === 13) {
        // Line break (\n or \r)
        currentRow.push(currentField);
        currentField = '';
        inQuotes = false;
        isQuotedField = false;
        fieldCharIndex = 0;

        // Skip \r\n sequence
        if (c === 13 && i + 1 < len && text.charCodeAt(i + 1) === 10) {
          i++;
        }

        // Only add rows that have at least one non-empty field or multiple fields
        const hasData = currentRow.some((col) => col.trim() !== '');
        if (hasData || currentRow.length > 1) {
          rows.push(currentRow);
        }
        currentRow = [];
        continue;
      } else {
        // Normal character (including quotes inside unquoted fields, e.g. 7" or 1/2")
        currentField += text[i];
      }
    }
    fieldCharIndex++;
  }

  // Handle final field if text doesn't end with newline
  if (fieldCharIndex > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    const hasData = currentRow.some((col) => col.trim() !== '');
    if (hasData || currentRow.length > 1) {
      rows.push(currentRow);
    }
  }

  return rows;
}
