export interface Column {
  cid: number;
  name: string;
  type: "INTEGER" | "REAL" | "TEXT" | "BLOB" | "TIMESTAMP";
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export function columnType(sqliteType: Column["type"]): string {
  switch (sqliteType) {
    case "INTEGER":
      return "number";
    case "REAL":
      return "number";
    case "TEXT":
      return "string";
    case "BLOB":
      return "Buffer";
    case "TIMESTAMP":
      return "Date";
    default:
      return "any";
  }
}

export function renderValue(value: unknown, tsType: string): string {
  if (value === null) {
    return "NULL";
  }

  switch (tsType) {
    case "number":
      return String(value);
    case "string":
      return value as string;
    case "Buffer":
      return (value as Buffer).toString("hex");
    case "Date":
      return new Date(value as string).toISOString();
    default:
      return (value as string).toString();
  }
}
