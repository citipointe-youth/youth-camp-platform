import { describe, it, expect } from 'vitest';
import {
  ELVANTO_HEADERS, cleanCareText, normalizeDate, formatDateAU,
  parseGradeOrLeader, yesToConsent, field,
} from './elvanto-mapping';

describe('elvanto-mapping', () => {
  it('has 29 canonical headers starting with Date Submitted and ending with Today\'s Date', () => {
    expect(ELVANTO_HEADERS).toHaveLength(29);
    expect(ELVANTO_HEADERS[0]).toBe('Date Submitted');
    expect(ELVANTO_HEADERS[28]).toBe("Today's Date");
    expect(ELVANTO_HEADERS).toContain('Medical Conditions');
  });

  it('strips whole-value junk but keeps real care text', () => {
    expect(cleanCareText('NA')).toBe('');
    expect(cleanCareText('  no ')).toBe('');
    expect(cleanCareText('-')).toBe('');
    expect(cleanCareText('No dairy no eggs no nuts')).toBe('No dairy no eggs no nuts');
    expect(cleanCareText('Ritalin\nFluexotine')).toBe('Ritalin\nFluexotine');
  });

  it('normalizes DD/MM/YYYY to ISO and round-trips back to AU', () => {
    expect(normalizeDate('30/09/2009')).toBe('2009-09-30');
    expect(normalizeDate('2009-09-30')).toBe('2009-09-30');
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('rubbish')).toBeNull();
    expect(formatDateAU('2009-09-30')).toBe('30/09/2009');
    expect(formatDateAU('')).toBe('');
  });

  it('detects leaders and youth grades', () => {
    expect(parseGradeOrLeader('18+ Leader')).toEqual({ kind: 'leader', grade: null });
    expect(parseGradeOrLeader('Leader')).toEqual({ kind: 'leader', grade: null });
    expect(parseGradeOrLeader('11')).toEqual({ kind: 'youth', grade: 11 });
    expect(parseGradeOrLeader('')).toEqual({ kind: 'youth', grade: null });
    expect(parseGradeOrLeader('Kindy')).toEqual({ kind: 'youth', grade: null });
  });

  it('parses consent + resolves aliases', () => {
    expect(yesToConsent('Yes')).toBe(true);
    expect(yesToConsent('no')).toBe(false);
    const row = { 'First Name': 'Ada', firstName: '' };
    expect(field(row, 'First Name', 'firstName')).toBe('Ada');
    expect(field(row, 'firstName', 'First Name')).toBe('Ada');
    expect(field(row, 'Missing')).toBe('');
  });
});
