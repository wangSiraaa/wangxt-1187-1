const express = require('express');
const { db, getParam } = require('../db');

const router = express.Router();

function threshold() {
  return getParam('wheel_diameter_diff_threshold', 3.0);
}

function recompute(left, right) {
  const l = left == null ? null : Number(left);
  const r = right == null ? null : Number(right);
  if (l == null || r == null || Number.isNaN(l) || Number.isNaN(r)) {
    return { diff: null, priority: 0 };
  }
  const diff = Math.abs(l - r);
  const priority = diff > threshold() ? 1 : 0;
  return { diff, priority };
}

router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM vehicles ORDER BY emergency_flag DESC, priority_flag DESC, 
      CASE WHEN online_plan_date IS NULL THEN 1 ELSE 0 END, online_plan_date ASC, 
      wheel_diameter_diff DESC, id ASC`
  ).all();
  res.json(rows);
});

router.post('/:id/emergency', (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: '车辆不存在' });
  const next = Number(req.body.emergency_flag) ? 1 : 0;
  db.prepare(`UPDATE vehicles SET emergency_flag = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(next, req.params.id);
  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '车辆不存在' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { vehicle_no, status, operator, remark, emergency_flag, online_plan_date } = req.body;
  if (!vehicle_no) return res.status(400).json({ error: '车辆编号不能为空' });
  const left = req.body.wheel_diameter_left;
  const right = req.body.wheel_diameter_right;
  const { diff, priority } = recompute(left, right);
  let finalStatus = priority ? 'waiting' : (status || 'online');
  const emergency = Number(emergency_flag) ? 1 : 0;
  try {
    const info = db.prepare(
      `INSERT INTO vehicles(vehicle_no, status, wheel_diameter_left, wheel_diameter_right, wheel_diameter_diff, priority_flag, emergency_flag, online_plan_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(vehicle_no, finalStatus, left ?? null, right ?? null, diff, priority, emergency, online_plan_date || null);
    res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: '车辆编号已存在或数据无效: ' + e.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '车辆不存在' });

  const left = req.body.wheel_diameter_left != null ? req.body.wheel_diameter_left : existing.wheel_diameter_left;
  const right = req.body.wheel_diameter_right != null ? req.body.wheel_diameter_right : existing.wheel_diameter_right;
  const { diff, priority } = recompute(left, right);

  let status = req.body.status != null ? req.body.status : existing.status;
  const emergencyFlag = req.body.emergency_flag != null ? (Number(req.body.emergency_flag) ? 1 : 0) : existing.emergency_flag;
  const onlinePlanDate = req.body.online_plan_date != null ? (req.body.online_plan_date || null) : existing.online_plan_date;

  if (existing.status === 'offline') {
    if (status !== 'offline' && req.body.status != null) {
      return res.status(400).json({
        error: '下线锁定(offline)车辆禁止通过编辑直接变更状态。必须走完整流程：重新排程→完成镟修→质检合格，方可自动恢复上线。'
      });
    }
    if (status === 'online') {
      return res.status(400).json({ error: '质检未通过车辆处于下线锁定状态，须重新镟修并质检合格后方可上线' });
    }
  }
  if (existing.status === 'maintaining' && req.body.status == null) {
    status = 'maintaining';
  } else if (priority && existing.status === 'online' && req.body.status == null) {
    status = 'waiting';
  }

  db.prepare(
    `UPDATE vehicles SET vehicle_no = ?, status = ?, wheel_diameter_left = ?, wheel_diameter_right = ?,
     wheel_diameter_diff = ?, priority_flag = ?, emergency_flag = ?, online_plan_date = ?,
     updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).run(
    req.body.vehicle_no != null ? req.body.vehicle_no : existing.vehicle_no,
    status,
    left, right, diff, priority, emergencyFlag, onlinePlanDate,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const linked = db.prepare(
    `SELECT (SELECT COUNT(*) FROM schedules WHERE vehicle_id = ?) AS sc,
            (SELECT COUNT(*) FROM inspections WHERE vehicle_id = ?) AS ic`
  ).get(req.params.id, req.params.id);
  if ((linked && (linked.sc || linked.ic))) {
    return res.status(400).json({ error: '该车辆存在排程或质检记录，无法删除' });
  }
  const info = db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: '车辆不存在' });
  res.json({ success: true });
});

module.exports = router;
