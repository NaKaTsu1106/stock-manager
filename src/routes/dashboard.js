const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM equipment').get().count;
  const available = db.prepare("SELECT COUNT(*) as count FROM equipment WHERE status = 'available'").get().count;
  const checkedOut = db.prepare("SELECT COUNT(*) as count FROM equipment WHERE status = 'checked_out'").get().count;

  const recentTransactions = db.prepare(`
    SELECT t.*, e.barcode, e.name as equipment_name
    FROM transactions t
    JOIN equipment e ON t.equipment_id = e.id
    ORDER BY t.created_at DESC
    LIMIT 10
  `).all();

  const checkedOutItems = db.prepare(`
    SELECT t.*, e.barcode, e.name as equipment_name, l.name as location_name
    FROM transactions t
    JOIN equipment e ON t.equipment_id = e.id
    LEFT JOIN locations l ON e.location_id = l.id
    WHERE t.returned_at IS NULL
    ORDER BY t.checked_out_at ASC
  `).all();

  const byTag = db.prepare(`
    SELECT t.name, COUNT(DISTINCT et.equipment_id) as count,
           SUM(CASE WHEN e.status = 'available' THEN 1 ELSE 0 END) as available,
           SUM(CASE WHEN e.status = 'checked_out' THEN 1 ELSE 0 END) as checked_out
    FROM equipment_tags et
    JOIN tags t ON et.tag_id = t.id
    JOIN equipment e ON et.equipment_id = e.id
    GROUP BY t.name
    ORDER BY count DESC
  `).all();

  res.json({ total, available, checkedOut, recentTransactions, checkedOutItems, byTag });
});

module.exports = router;
