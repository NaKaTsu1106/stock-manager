const express = require('express');
const db = require('../db');

function createMasterRouter(table, label) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY name`).all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: `${label}名は必須です` });
    try {
      const result = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(name.trim());
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: `この${label}は既に登録されています` });
      }
      throw e;
    }
  });

  router.put('/:id', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: `${label}名は必須です` });
    try {
      const result = db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name.trim(), req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: `${label}が見つかりません` });
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      res.json(row);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: `この${label}は既に登録されています` });
      }
      throw e;
    }
  });

  router.delete('/:id', (req, res) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: `${label}が見つかりません` });
    res.json({ success: true });
  });

  return router;
}

module.exports = {
  tags: createMasterRouter('tags', 'タグ'),
  locations: createMasterRouter('locations', '保管場所'),
  members: createMasterRouter('members', 'メンバー'),
};
