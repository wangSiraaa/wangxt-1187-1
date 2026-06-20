const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT m.*, v.vehicle_no AS current_vehicle_no
     FROM machines m
     LEFT JOIN vehicles v ON m.current_vehicle_id = v.id
     ORDER BY m.machine_no ASC`
  ).all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '机位不存在' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { machine_no, machine_name } = req.body;
  if (!machine_no) return res.status(400).json({ error: '机位编号不能为空' });
  try {
    const info = db.prepare(
      `INSERT INTO machines(machine_no, machine_name, status, maintenance_flag) VALUES (?, ?, 'idle', 0)`
    ).run(machine_no, machine_name || null);
    res.status(201).json(db.prepare('SELECT * FROM machines WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: '机位编号已存在或数据无效: ' + e.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '机位不存在' });

  const maintenanceFlag = req.body.maintenance_flag != null ? Number(req.body.maintenance_flag) : existing.maintenance_flag;
  const machineName = req.body.machine_name != null ? req.body.machine_name : existing.machine_name;

  if (maintenanceFlag && existing.current_vehicle_id) {
    return res.status(400).json({ error: '机位上有车辆镟修中，无法进入保养状态' });
  }

  let status = existing.status;
  if (maintenanceFlag) {
    status = 'maintenance';
  } else if (existing.maintenance_flag && !maintenanceFlag) {
    status = 'idle';
  }

  db.prepare(
    `UPDATE machines SET machine_name = ?, status = ?, maintenance_flag = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(machineName, status, maintenanceFlag ? 1 : 0, req.params.id);
  res.json(db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '机位不存在' });
  if (m.current_vehicle_id) return res.status(400).json({ error: '机位上有车辆，无法删除' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM schedules WHERE machine_id = ?').get(req.params.id);
  if (used && used.c > 0) return res.status(400).json({ error: '机位存在排程记录，无法删除' });
  db.prepare('DELETE FROM machines WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
