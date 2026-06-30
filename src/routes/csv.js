const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/export', (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.barcode, e.name, l.name as location,
           e.purchase_date, e.status, e.notes
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    ORDER BY e.id
  `).all();

  const tagStmt = db.prepare(`
    SELECT GROUP_CONCAT(t.name) as names FROM equipment_tags et
    JOIN tags t ON et.tag_id = t.id WHERE et.equipment_id = ?
  `);
  rows.forEach(r => {
    r.tags = tagStmt.get(r.id)?.names || '';
    delete r.id;
  });

  const csv = stringify(rows, {
    header: true,
    columns: [
      { key: 'barcode', header: 'バーコード' },
      { key: 'name', header: '名前' },
      { key: 'tags', header: 'タグ' },
      { key: 'location', header: '保管場所' },
      { key: 'purchase_date', header: '購入日' },
      { key: 'status', header: '状態' },
      { key: 'notes', header: '備考' },
    ],
    bom: true,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="equipment.csv"');
  res.send(csv);
});

router.get('/export/transactions', (req, res) => {
  const rows = db.prepare(`
    SELECT e.barcode, e.name as equipment_name, t.borrower, t.purpose,
           t.checked_out_at, t.returned_at
    FROM transactions t
    JOIN equipment e ON t.equipment_id = e.id
    ORDER BY t.checked_out_at DESC
  `).all();

  const csv = stringify(rows, {
    header: true,
    columns: [
      { key: 'barcode', header: 'バーコード' },
      { key: 'equipment_name', header: '機材名' },
      { key: 'borrower', header: '借用者' },
      { key: 'purpose', header: '用途' },
      { key: 'checked_out_at', header: '貸出日時' },
      { key: 'returned_at', header: '返却日時' },
    ],
    bom: true,
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(csv);
});

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません' });

  let records;
  try {
    records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'CSVの解析に失敗しました: ' + e.message });
  }

  const headerMap = {
    'バーコード': 'barcode', 'barcode': 'barcode',
    '名前': 'name', 'name': 'name',
    'タグ': 'tags', 'tags': 'tags',
    '保管場所': 'location', 'location': 'location',
    '購入日': 'purchase_date', 'purchase_date': 'purchase_date',
    '備考': 'notes', 'notes': 'notes',
  };

  let imported = 0;
  let skipped = 0;
  const errors = [];

  const importAll = db.transaction(() => {
    for (const [i, raw] of records.entries()) {
      const row = {};
      for (const [key, val] of Object.entries(raw)) {
        const mapped = headerMap[key.trim()];
        if (mapped) row[mapped] = val;
      }

      if (!row.barcode) {
        errors.push(`行 ${i + 2}: バーコードが空です`);
        skipped++;
        continue;
      }

      const tagIds = [];
      if (row.tags) {
        for (const tagName of row.tags.split(',').map(s => s.trim()).filter(Boolean)) {
          const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
          if (existing) {
            tagIds.push(existing.id);
          } else {
            const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(tagName);
            tagIds.push(result.lastInsertRowid);
          }
        }
      }

      let locationId = null;
      if (row.location) {
        const existing = db.prepare('SELECT id FROM locations WHERE name = ?').get(row.location);
        if (existing) {
          locationId = existing.id;
        } else {
          const result = db.prepare('INSERT INTO locations (name) VALUES (?)').run(row.location);
          locationId = result.lastInsertRowid;
        }
      }

      try {
        const existingEquipment = db.prepare('SELECT id FROM equipment WHERE barcode = ?').get(row.barcode);
        let eqId;
        if (existingEquipment) {
          eqId = existingEquipment.id;
          db.prepare(`
            UPDATE equipment SET name = ?, location_id = ?,
              purchase_date = ?, notes = ?,
              updated_at = datetime('now','localtime')
            WHERE id = ?
          `).run(
            row.name || '', locationId,
            row.purchase_date || null,
            row.notes || null, eqId
          );
        } else {
          const result = db.prepare(`
            INSERT INTO equipment (barcode, name, location_id, purchase_date, notes)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            row.barcode, row.name || '', locationId,
            row.purchase_date || null,
            row.notes || null
          );
          eqId = result.lastInsertRowid;
        }

        db.prepare('DELETE FROM equipment_tags WHERE equipment_id = ?').run(eqId);
        const tagStmt = db.prepare('INSERT OR IGNORE INTO equipment_tags (equipment_id, tag_id) VALUES (?, ?)');
        for (const tid of tagIds) tagStmt.run(eqId, tid);

        imported++;
      } catch (e) {
        errors.push(`行 ${i + 2}: ${e.message}`);
        skipped++;
      }
    }
  });

  importAll();
  res.json({ imported, skipped, errors: errors.slice(0, 20) });
});

module.exports = router;
