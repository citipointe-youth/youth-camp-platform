import { describe, it, expect } from 'vitest';
import { parseCsv, stripBom, toCsvRow, toCsvString } from './csv';

// ---------------------------------------------------------------------------
// CSV utility tests, with focus on the BOM-strip fix (Excel/Elvanto exports
// prepend a UTF-8 BOM that broke first-header matching).
// ---------------------------------------------------------------------------

describe('stripBom', () => {
  it('removes a leading U+FEFF', () => {
    expect(stripBom('﻿firstName')).toBe('firstName');
  });
  it('leaves BOM-free input unchanged', () => {
    expect(stripBom('firstName')).toBe('firstName');
  });
  it('only strips a LEADING bom, not interior ones', () => {
    expect(stripBom('a﻿b')).toBe('a﻿b');
  });
  it('handles empty string', () => {
    expect(stripBom('')).toBe('');
  });
});

describe('parseCsv', () => {
  it('parses headers + rows into keyed objects', () => {
    const rows = parseCsv('firstName,lastName\nAda,Lovelace\nGrace,Hopper');
    expect(rows).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
    ]);
  });

  it('strips a leading BOM so the first header matches (the fix)', () => {
    const rows = parseCsv('﻿firstName,lastName\nAda,Lovelace');
    // Without the fix the key would be "﻿firstName" and rows[0].firstName undefined.
    expect(rows[0]!['firstName']).toBe('Ada');
    expect(Object.keys(rows[0]!)).toEqual(['firstName', 'lastName']);
  });

  it('handles quoted fields with embedded commas', () => {
    const rows = parseCsv('name,note\n"Smith, John","hello, world"');
    expect(rows[0]).toEqual({ name: 'Smith, John', note: 'hello, world' });
  });

  it('returns empty array when there are no data rows', () => {
    expect(parseCsv('firstName,lastName')).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });

  it('skips blank lines', () => {
    const rows = parseCsv('a,b\n1,2\n\n3,4');
    expect(rows).toHaveLength(2);
  });
});

describe('toCsvRow / toCsvString', () => {
  it('quotes fields containing commas, quotes, or newlines', () => {
    expect(toCsvRow(['a', 'b,c', 'd"e'])).toBe('a,"b,c","d""e"');
  });
  it('builds a full CSV string from headers + rows', () => {
    expect(toCsvString(['x', 'y'], [['1', '2'], ['3', '4']])).toBe('x,y\n1,2\n3,4');
  });
});
