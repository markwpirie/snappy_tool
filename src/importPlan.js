// Pure planning for multi-file imports. No DOM, no React — unit-testable.
//
// When several photos are picked/dropped on one box, the first replaces that
// box and the rest flow forward into empty boxes in document order. If the
// document runs out of boxes, the plan says how many rows to append.

// boxKeys: all box keys in document order; filledKeys: Set of keys holding an
// image; afterKey: assignments start after this key (the box that took the
// first file); cellsPerNewRow: capacity of rows the caller would append.
export function planImport(boxKeys, filledKeys, afterKey, fileCount, cellsPerNewRow) {
  const start = boxKeys.indexOf(afterKey) + 1; // afterKey missing → start at 0
  const assignments = boxKeys
    .slice(start)
    .filter((k) => !filledKeys.has(k))
    .slice(0, fileCount);
  const remainder = fileCount - assignments.length;
  return {
    assignments,
    rowsToAdd: remainder > 0 ? Math.ceil(remainder / cellsPerNewRow) : 0,
  };
}
