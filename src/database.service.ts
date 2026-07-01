import { Injectable, OnModuleDestroy } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

const BetterSqlite3 = require("better-sqlite3");

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
};

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: SqliteDatabase;

  constructor() {
    const dataDir = process.env.MINICAL_DATA_DIR ?? path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "minical.sqlite3");
    this.db = new BetterSqlite3(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        admin_password TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reminded_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS availability_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(store_id, date, time)
      );
    `);
    this.migrateTenantColumns();
    this.seedDefaultStore();
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  onModuleDestroy() {
    this.db.close();
  }

  private migrateTenantColumns() {
    const bookingColumns = this.tableColumns("bookings");
    if (!bookingColumns.has("store_id")) {
      this.db.exec("ALTER TABLE bookings ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1");
    }

    const slotColumns = this.tableColumns("availability_slots");
    if (!slotColumns.has("store_id")) {
      this.db.exec("ALTER TABLE availability_slots ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1");
      this.rebuildAvailabilitySlotsTable();
    }
  }

  private rebuildAvailabilitySlotsTable() {
    this.db.exec(`
      CREATE TABLE availability_slots_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL DEFAULT 1,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(store_id, date, time)
      );

      INSERT INTO availability_slots_next (id, store_id, date, time, is_active, created_at, updated_at)
      SELECT id, store_id, date, time, is_active, created_at, updated_at
      FROM availability_slots;

      DROP TABLE availability_slots;
      ALTER TABLE availability_slots_next RENAME TO availability_slots;
    `);
  }

  private seedDefaultStore() {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO stores (id, slug, name, admin_password, created_at, updated_at)
         VALUES (1, 'main', 'MiniCal', 'minical-admin', ?, ?)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(now, now);
  }

  private tableColumns(table: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  }
}
