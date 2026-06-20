const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT m.*, v.vehicle_no AS current_vehicle_no,
      (SELECT COUNT(*) FROM schedules s WHERE s.machine_id = m.id AND s.status IN ('pending','in_progress')) AS pending_count
     FROM machines m
     LEFT JOIN vehicles v ON m.current_vehicle_id = v.id
     ORDER BY m.machine_no ASC`
  ).all();
  res.json(rows);
});

router.get('/:id/available-slots', (req, res) => {
  const m = db.prepare('SELECT * FROM machines WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '机位不存在' });
  const schedules = db.prepare(
    `SELECT s.*, v.vehicle_no FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     WHERE s.machine_id = ? AND s.status IN ('pending','in_progress')
     ORDER BY s.queue_order ASC, s.id ASC`
  ).all(req.params.id);
  res.json({ machine: m, schedules, available_from: m.available_from, available_to: m.available_to });
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
  const availableFrom = req.body.available_from != null ? (req.body.available_from || null) : existing.available_from;
  const availableTo = req.body.available_to != null ? (req.body.available_to || null) : existing.available_to;
  const maintenanceReviewer = req.body.maintenance_reviewer != null ? (req.body.maintenance_reviewer || null) : existing.maintenance_reviewer;

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
    `UPDATE machines SET machine_name = ?, status = ?, maintenance_flag = ?,
      available_from = ?, available_to = ?, maintenance_reviewer = ?,
      updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(machineName, status, maintenanceFlag ? 1 : 0, availableFrom, availableTo, maintenanceReviewer, req.params.id);
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
