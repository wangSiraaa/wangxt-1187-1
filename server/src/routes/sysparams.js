const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sys_params ORDER BY param_key ASC').all();
  res.json(rows);
});

router.put('/', (req, res) => {
  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE sys_params SET param_value = ?, updated_at = datetime('now','localtime') WHERE param_key = ?`
    );
    for (const [key, value] of Object.entries(req.body)) {
      if (key === 'param_key') continue;
      const exists = db.prepare('SELECT 1 FROM sys_params WHERE param_key = ?').get(key);
      if (exists) {
        stmt.run(value, key);
      } else {
        db.prepare(
          `INSERT INTO sys_params(param_key, param_value, param_desc) VALUES (?, ?, ?)`
        ).run(key, value, null);
      }
    }
  });
  try {
    tx();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json(db.prepare('SELECT * FROM sys_params ORDER BY param_key ASC').all());
});

module.exports = router;
