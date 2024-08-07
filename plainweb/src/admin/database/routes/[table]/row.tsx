import type { Column } from "admin/column";
import { config } from "admin/config";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Handler } from "handler";
import { TableRow } from "./components/table-row";

export const GET: Handler = async ({ req, res }) => {
  const tableName = req.params.table as string;
  const db = res.locals.database as BetterSQLite3Database<
    Record<string, unknown>
  >;
  const row = JSON.parse(decodeURIComponent(req.query.row as string));

  const columns = db.all<Column>(
    sql`SELECT * from pragma_table_info(${tableName}) LIMIT 100`,
  );

  config.verbose > 1 && console.log("[admin] [database]", "fetching row", row);

  const whereClause = Object.entries(row)
    .map(([column, value]) => sql`${column} = ${value}`)
    .join(" AND ");

  const query = sql`SELECT * FROM ${sql.identifier(tableName)} WHERE`;

  let i = 0;
  for (const [column, value] of Object.entries(row)) {
    query.append(sql`${sql.identifier(column)} = ${value}`);
    if (i === Object.keys(row).length - 1) continue;
    query.append(sql` AND `);
    i++;
  }

  const found = db.all<Record<string, unknown>>(query);

  if (found.length === 0) {
    throw new Error(`Row not found for ${whereClause}`);
  }

  return <TableRow tableName={tableName} columns={columns} row={row} />;
};
