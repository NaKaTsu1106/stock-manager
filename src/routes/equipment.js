const express = require('express');
const router = express.Router();
const db = require('../db');

function getEquipmentWithTags(whereClause, params) {
  const rows = db.prepare(`
    SELECT e.*, l.name as location_name
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    ${whereClause}
    ORDER BY e.updated_at DESC
  `).all(...params);

  const tagStmt = db.prepare(`
    SELECT t.id, t.name FROM equipment_tags et
    JOIN tags t ON et.tag_id = t.id
    WHERE et.equipment_id = ?
    ORDER BY t.name
  `);

  return rows.map(row => {
    const tags = tagStmt.all(row.id);
    return { ...row, tags, tag_names: tags.map(t => t.name).join(', ') };
  });
}

function getOneEquipmentWithTags(id) {
  const row = db.prepare(`
    SELECT e.*, l.name as location_name
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    WHERE e.id = ?
  `).get(id);
  if (!row) return null;

  const tags = db.prepare(`
    SELECT t.id, t.name FROM equipment_tags et
    JOIN tags t ON et.tag_id = t.id
    WHERE et.equipment_id = ?
    ORDER BY t.name
  `).all(id);

  return { ...row, tags, tag_names: tags.map(t => t.name).join(', ') };
}

function syncTags(equipmentId, tagIds) {
  db.prepare('DELETE FROM equipment_tags WHERE equipment_id = ?').run(equipmentId);
  if (tagIds && tagIds.length > 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO equipment_tags (equipment_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      stmt.run(equipmentId, tagId);
    }
  }
}

router.get('/', (req, res) => {
  const { q, tag_id, tag_ids, location_id, status } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (q) {
    where += ` AND (e.name LIKE ? OR e.barcode LIKE ? OR e.notes LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const tagIdList = tag_ids
    ? tag_ids.split(',').map(Number).filter(n => n > 0)
    : tag_id ? [Number(tag_id)] : [];
  if (tagIdList.length > 0) {
    const placeholders = tagIdList.map(() => '?').join(',');
    where += ` AND e.id IN (
      SELECT equipment_id FROM equipment_tags
      WHERE tag_id IN (${placeholders})
      GROUP BY equipment_id HAVING COUNT(DISTINCT tag_id) = ?
    )`;
    params.push(...tagIdList, tagIdList.length);
  }

  if (location_id) {
    where += ` AND e.location_id = ?`;
    params.push(location_id);
  }
  if (status) {
    where += ` AND e.status = ?`;
    params.push(status);
  }

  const items = getEquipmentWithTags(where, params);
  res.json(items);
});

router.get('/:id', (req, res) => {
  const row = getOneEquipmentWithTags(req.params.id);
  if (!row) return res.status(404).json({ error: '機材が見つかりません' });
  res.json(row);
});

router.get('/barcode/:barcode', (req, res) => {
  const base = db.prepare('SELECT id FROM equipment WHERE barcode = ?').get(req.params.barcode);
  if (!base) return res.status(404).json({ error: '機材が見つかりません' });
  const row = getOneEquipmentWithTags(base.id);
  res.json(row);
});

router.post('/', (req, res) => {
  const { barcode, name, tag_ids, location_id, purchase_date, notes } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'バーコードは必須です' });
  }
  try {
    const insert = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO equipment (barcode, name, location_id, purchase_date, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(barcode, name || '', location_id || null, purchase_date || null, notes || null);
      syncTags(result.lastInsertRowid, tag_ids);
      return result.lastInsertRowid;
    });
    const id = insert();
    res.status(201).json(getOneEquipmentWithTags(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'このバーコードは既に登録されています' });
    }
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { barcode, name, tag_ids, location_id, purchase_date, notes } = req.body;
  if (!barcode) {
    return res.status(400).json({ error: 'バーコードは必須です' });
  }
  try {
    const update = db.transaction(() => {
      const result = db.prepare(`
        UPDATE equipment
        SET barcode = ?, name = ?, location_id = ?, purchase_date = ?,
            notes = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(barcode, name || '', location_id || null, purchase_date || null, notes || null, req.params.id);
      if (result.changes === 0) return null;
      syncTags(req.params.id, tag_ids);
      return req.params.id;
    });
    const id = update();
    if (!id) return res.status(404).json({ error: '機材が見つかりません' });
    res.json(getOneEquipmentWithTags(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'このバーコードは既に登録されています' });
    }
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: '機材が見つかりません' });
  res.json({ success: true });
});

module.exports = router;
