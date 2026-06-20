const express = require('express');
const { db, getParam } = require('../db');

const router = express.Router();

function listInspections() {
  return db.prepare(
    `SELECT i.*, v.vehicle_no, v.priority_flag, s.schedule_date, m.machine_no, m.machine_name
     FROM inspections i
     LEFT JOIN vehicles v ON i.vehicle_id = v.id
     LEFT JOIN schedules s ON i.schedule_id = s.id
     LEFT JOIN machines m ON s.machine_id = m.id
     ORDER BY i.result ASC, i.id DESC`
  ).all();
}

router.get('/', (req, res) => {
  res.json(listInspections());
});

router.post('/', (req, res) => {
  const { schedule_id, vehicle_id, inspector, post_diameter_left, post_diameter_right, result, remark } = req.body;
  if (!schedule_id || !vehicle_id) return res.status(400).json({ error: '缺少排程或车辆信息' });
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(400).json({ error: '车辆不存在' });
  const info = db.prepare(
    `INSERT INTO inspections(schedule_id, vehicle_id, inspector, pre_diameter_left, pre_diameter_right,
       post_diameter_left, post_diameter_right, result, remark, inspected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
  ).run(schedule_id, vehicle_id, inspector || null,
    vehicle.wheel_diameter_left, vehicle.wheel_diameter_right,
    post_diameter_left ?? null, post_diameter_right ?? null, result || 'pending', remark || null);
  res.status(201).json(db.prepare('SELECT * FROM inspections WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const insp = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!insp) return res.status(404).json({ error: '质检记录不存在' });

  const postL = req.body.post_diameter_left != null ? Number(req.body.post_diameter_left) : insp.post_diameter_left;
  const postR = req.body.post_diameter_right != null ? Number(req.body.post_diameter_right) : insp.post_diameter_right;
  const result = req.body.result || insp.result;
  const inspector = req.body.inspector != null ? req.body.inspector : insp.inspector;
  const remark = req.body.remark != null ? req.body.remark : insp.remark;

  let postDiff = insp.post_diameter_diff;
  if (postL != null && postR != null && !Number.isNaN(postL) && !Number.isNaN(postR)) {
    postDiff = Math.abs(postL - postR);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE inspections SET post_diameter_left = ?, post_diameter_right = ?, post_diameter_diff = ?,
       result = ?, inspector = ?, remark = ?, inspected_at = datetime('now','localtime') WHERE id = ?`
    ).run(postL, postR, postDiff, result, inspector, remark, insp.id);

    if (result === 'pass') {
      const threshold = getParam('wheel_diameter_diff_threshold', 3.0);
      const newPriority = (postDiff != null && postDiff > threshold) ? 1 : 0;
      db.prepare(
        `UPDATE vehicles SET status = 'online', wheel_diameter_left = ?, wheel_diameter_right = ?,
         wheel_diameter_diff = ?, priority_flag = ?, updated_at = datetime('now','localtime') WHERE id = ?`
      ).run(postL, postR, postDiff, newPriority, insp.vehicle_id);
      if (insp.schedule_id) {
        db.prepare("UPDATE schedules SET status = 'completed', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(insp.schedule_id);
      }
    } else if (result === 'fail') {
      db.prepare("UPDATE vehicles SET status = 'offline', updated_at = datetime('now','localtime') WHERE id = ?")
        .run(insp.vehicle_id);
      if (insp.schedule_id) {
        db.prepare("UPDATE schedules SET status = 'completed', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(insp.schedule_id);
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json(db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id));
});

module.exports = router;
