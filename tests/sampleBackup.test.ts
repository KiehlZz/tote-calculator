import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/db/backup';
import { calculate } from '../src/domain/calculation';
import { makeSampleBackup } from '../scripts/sample-backup.mjs';

describe('makeSampleBackup', () => {
  it('produces a file the app accepts, with the requested number of entries', () => {
    const parsed = parseBackup(JSON.stringify(makeSampleBackup(300)));
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].entries).toHaveLength(300);
  });

  it('is deterministic', () => {
    expect(makeSampleBackup(300)).toEqual(makeSampleBackup(300));
  });

  it('contains leading zeros and duplicates', () => {
    const entries = makeSampleBackup(300).sessions[0].entries;
    expect(entries.filter((entry) => entry.number === '007').length).toBeGreaterThanOrEqual(2);
    expect(entries.some((entry) => entry.number.startsWith('0'))).toBe(true);
  });

  it('uses all six columns', () => {
    const columns = new Set(makeSampleBackup(300).sessions[0].entries.map((entry) => entry.columnMultiplier));
    expect([...columns].sort((a, b) => a - b)).toEqual([15, 30, 60, 120, 150, 180]);
  });

  it('groups 007 and 700 together', () => {
    const result = calculate(makeSampleBackup(300).sessions[0].entries);
    const group = result.groups.find((g) => g.key === '007');
    expect(group).toBeDefined();
    expect(group!.count).toBeGreaterThanOrEqual(3);
  });

  it('keeps every entry: the grand total equals the sum of all multipliers', () => {
    const entries = makeSampleBackup(300).sessions[0].entries;
    const grand = calculate(entries).groups.reduce((sum, group) => sum + group.total, 0);
    expect(grand).toBe(entries.reduce((sum, entry) => sum + entry.columnMultiplier, 0));
  });
});