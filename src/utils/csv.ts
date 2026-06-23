/**
 * Strip a leading UTF-8 byte-order mark (U+FEFF). Excel and Elvanto CSV exports
 * routinely prepend a BOM; without removing it the first header parses as
 * "﻿firstName" and silently fails to match any expected column.
 */
export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Parse a CSV string into an array of objects keyed by the header row.
 * Handles basic quoting (double-quoted fields with embedded commas/newlines)
 * and strips a leading UTF-8 BOM.
 */
export function parseCsv(input: string): Record<string, string>[] {
  const lines = splitCsvLines(stripBom(input).trim());
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0] ?? '');
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const values = parseCsvRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header.trim()] = (values[idx] ?? '').trim();
    });
    result.push(obj);
  }

  return result;
}

function splitCsvLines(input: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        current += '"';
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (ch === '\r' && input[i + 1] === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
      i++;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function toCsvRow(values: string[]): string {
  return values
    .map((v) => {
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    })
    .join(',');
}

export function toCsvString(headers: string[], rows: string[][]): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  return '﻿' + lines.join('\n');
}
