import { describe, it, expect } from 'vitest';
import { planImport } from './importPlan.js';

const keys = ['1-0', '1-1', '2-0', '2-1', '2-2', '3-0'];

describe('planImport', () => {
  it('fills empty boxes after the origin, in document order', () => {
    const plan = planImport(keys, new Set(), '1-0', 3, 2);
    expect(plan.assignments).toEqual(['1-1', '2-0', '2-1']);
    expect(plan.rowsToAdd).toBe(0);
  });

  it('skips filled boxes', () => {
    const plan = planImport(keys, new Set(['2-0', '2-2']), '1-1', 3, 2);
    expect(plan.assignments).toEqual(['2-1', '3-0']);
    expect(plan.rowsToAdd).toBe(1); // one file left over, one 2-cell row covers it
  });

  it('never assigns boxes at or before the origin', () => {
    const plan = planImport(keys, new Set(), '2-2', 5, 2);
    expect(plan.assignments).toEqual(['3-0']);
    expect(plan.rowsToAdd).toBe(2); // 4 remaining ÷ 2 per row
  });

  it('asks for enough new rows when nothing fits', () => {
    const plan = planImport(keys, new Set(keys), '3-0', 7, 3);
    expect(plan.assignments).toEqual([]);
    expect(plan.rowsToAdd).toBe(3); // ceil(7 / 3)
  });

  it('handles a missing origin key by starting from the top', () => {
    const plan = planImport(keys, new Set(['1-0']), 'gone', 2, 2);
    expect(plan.assignments).toEqual(['1-1', '2-0']);
  });

  it('zero files → empty plan', () => {
    expect(planImport(keys, new Set(), '1-0', 0, 2)).toEqual({ assignments: [], rowsToAdd: 0 });
  });
});
