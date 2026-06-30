const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'stock.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    purchase_date TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS equipment_tags (
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (equipment_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    borrower TEXT NOT NULL,
    purpose TEXT,
    checked_out_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    returned_at TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_equipment_barcode ON equipment(barcode);
  CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
  CREATE INDEX IF NOT EXISTS idx_transactions_equipment ON transactions(equipment_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_open ON transactions(equipment_id, returned_at)
    WHERE returned_at IS NULL;
`);

// Migrate from old categories schema if it exists
const hasCategoriesTable = db.prepare(
  "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='categories'"
).get().c > 0;

if (hasCategoriesTable) {
  const hasCategoryCol = db.prepare(
    "SELECT COUNT(*) as c FROM pragma_table_info('equipment') WHERE name='category_id'"
  ).get().c > 0;

  if (hasCategoryCol) {
    db.exec(`
      INSERT OR IGNORE INTO tags (name, created_at)
      SELECT name, created_at FROM categories;

      INSERT OR IGNORE INTO equipment_tags (equipment_id, tag_id)
      SELECT e.id, t.id FROM equipment e
      JOIN categories c ON e.category_id = c.id
      JOIN tags t ON t.name = c.name
      WHERE e.category_id IS NOT NULL;
    `);
    console.log('[DB] Migrated categories to tags');
  }
}

module.exports = db;
