import { TABLE_LAYOUT_ENGINE_VERSION, type TableLayoutResult } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTableLayoutResult(value: unknown): value is TableLayoutResult {
  if (!isRecord(value) || value.version !== TABLE_LAYOUT_ENGINE_VERSION || !Array.isArray(value.tables) || !Array.isArray(value.diagnostics)) {
    return false;
  }
  return value.tables.every((table) => {
    if (!isRecord(table)) return false;
    if (
      table.version !== TABLE_LAYOUT_ENGINE_VERSION ||
      typeof table.sourceNodeId !== "string" ||
      !Number.isInteger(table.rowCount) ||
      !Number.isInteger(table.columnCount) ||
      !Array.isArray(table.rowGroups) ||
      !Array.isArray(table.rows) ||
      !Array.isArray(table.cells) ||
      !Array.isArray(table.occupancy) ||
      !Array.isArray(table.rowTracks) ||
      !Array.isArray(table.columnTracks) ||
      typeof table.borderCollapse !== "string" ||
      typeof table.tableLayout !== "string" ||
      typeof table.strategyHint !== "string" ||
      !isRecord(table.borderSpacing) ||
      typeof table.borderSpacing.horizontal !== "number" ||
      typeof table.borderSpacing.vertical !== "number" ||
      !isRecord(table.decision) ||
      typeof table.decision.confidence !== "number" ||
      !Array.isArray(table.diagnostics)
    ) {
      return false;
    }
    return table.cells.every(
      (cell) =>
        isRecord(cell) &&
        typeof cell.sourceNodeId === "string" &&
        Number.isInteger(cell.rowIndex) &&
        Number.isInteger(cell.columnIndex) &&
        Number.isInteger(cell.rowSpan) &&
        Number.isInteger(cell.columnSpan) &&
        Number.isInteger(cell.rowEnd) &&
        Number.isInteger(cell.columnEnd),
    );
  });
}
