const express = require('express');
const router = express.Router();
const db = require('../db');

function equipmentTagNames(equipmentId) {
  return db.prepare(`
    SELECT GROUP_CONCAT(t.name) as names FROM equipment_tags et
    JOIN tags t ON et.tag_id = t.id WHERE et.equipment_id = ?
`).get(equipmentId)?.names || '';
}

router.get('/', (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const rows = db.prepare(`
    SELECT t.*, e.barcode, e.name as equipment_name, l.name as location_name
    FROM transactions t
    JOIN equipment e ON t.equipment_id = e.id
    LEFT JOIN locations l ON e.location_id = l.id
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit), Number(offset));

  rows.forEach(r => { r.tag_names = equipmentTagNames(r.equipment_id); });

  const total = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
  res.json({ rows, total });
});

router.post('/scan', (req, res) => {
  const { barcode } = req.body;
  if (!barcode) return res.status(400).json({ error: 'バーコードを入力してください' });

  const equipment = db.prepare(`
    SELECT e.*, l.name as location_name
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    WHERE e.barcode = ?
  `).get(barcode);

  if (!equipment) {
    return res.json({ action: 'not_found', barcode });
  }

  equipment.tag_names = equipmentTagNames(equipment.id);

  if (equipment.status === 'checked_out') {
    const transaction = db.prepare(`
      SELECT * FROM transactions
      WHERE equipment_id = ? AND returned_at IS NULL
      ORDER BY checked_out_at DESC LIMIT 1
    `).get(equipment.id);
    return res.json({ action: 'return', equipment, transaction });
  }

  return res.json({ action: 'checkout', equipment });
});

router.post('/checkout', (req, res) => {
  const { equipment_ids, borrower, purpose } = req.body;
  const ids = equipment_ids || (req.body.equipment_id ? [req.body.equipment_id] : []);
  if (ids.length === 0 || !borrower) {
    return res.status(400).json({ error: '機材IDと借用者名は必須です' });
  }

  const checkout = db.transaction(() => {
    const results = [];
    for (const eqId of ids) {
      const equipment = db.prepare('SELECT * FROM equipment WHERE id = ?').get(eqId);
      if (!equipment) continue;
      if (equipment.status === 'checked_out') continue;

      const result = db.prepare(`
        INSERT INTO transactions (equipment_id, borrower, purpose)
        VALUES (?, ?, ?)
      `).run(eqId, borrower, purpose || null);

      db.prepare(`
        UPDATE equipment SET status = 'checked_out', updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(eqId);

      results.push(db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid));
    }
    return results;
  });

  const transactions = checkout();
  res.status(201).json({ success: true, transactions, count: transactions.length });
});

router.post('/return', (req, res) => {
  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(400).json({ error: '取引IDは必須です' });

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction_id);
  if (!transaction) return res.status(404).json({ error: '取引が見つかりません' });
  if (transaction.returned_at) return res.status(400).json({ error: '既に返却済みです' });

  const doReturn = db.transaction(() => {
    db.prepare(`
      UPDATE transactions SET returned_at = datetime('now','localtime')
      WHERE id = ?
    `).run(transaction_id);

    db.prepare(`
      UPDATE equipment SET status = 'available', updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(transaction.equipment_id);

    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction_id);
  });

  const updated = doReturn();
  res.json({ success: true, transaction: updated });
});

module.exports = router;
