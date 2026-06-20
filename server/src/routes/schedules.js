const express = require('express');
const { db } = require('../db');

const router = express.Router();

function listSchedules() {
  return db.prepare(
    `SELECT s.*, v.vehicle_no, v.wheel_diameter_left AS cur_left, v.wheel_diameter_right AS cur_right,
            v.priority_flag, m.machine_no, m.machine_name
     FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN machines m ON s.machine_id = m.id
     ORDER BY s.priority_level DESC, s.status ASC, s.id DESC`
  ).all();
}

router.get('/', (req, res) => {
  res.json(listSchedules());
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT s.*, v.vehicle_no, v.wheel_diameter_left AS cur_left, v.wheel_diameter_right AS cur_right,
            v.priority_flag, m.machine_no, m.machine_name
     FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN machines m ON s.machine_id = m.id
     WHERE s.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: '排程不存在' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { vehicle_id, machine_id, schedule_date, operator, remark } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: '请选择车辆' });

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(400).json({ error: '车辆不存在' });
  if (vehicle.status === 'maintaining') return res.status(400).json({ error: '该车辆正在镟修中，不可重复排程' });
  if (!['online', 'waiting', 'offline'].includes(vehicle.status)) {
    return res.status(400).json({ error: `车辆当前状态(${vehicle.status})不可排程` });
  }

  let machine = null;
  if (machine_id) {
    machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machine_id);
    if (!machine) return res.status(400).json({ error: '机位不存在' });
    if (machine.maintenance_flag) return res.status(400).json({ error: `${machine.machine_name} 正在保养，无法排车` });
    if (machine.status === 'busy') return res.status(400).json({ error: `${machine.machine_name} 正在作业，无法排车` });
  }

  const pending = db.prepare(
    `SELECT COUNT(*) AS c FROM schedules WHERE vehicle_id = ? AND status IN ('pending','in_progress')`
  ).get(vehicle_id);
  if (pending && pending.c > 0) return res.status(400).json({ error: '该车辆已有进行中的排程' });

  const info = db.prepare(
    `INSERT INTO schedules(vehicle_id, machine_id, schedule_date, status, priority_level, operator, remark)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)`
  ).run(vehicle_id, machine_id || null, schedule_date || null, vehicle.priority_flag || 0, operator || null, remark || null);

  if (vehicle.status === 'online' || vehicle.status === 'offline') {
    db.prepare("UPDATE vehicles SET status = 'waiting', updated_at = datetime('now','localtime') WHERE id = ?").run(vehicle_id);
  }

  res.status(201).json(db.prepare('SELECT * FROM schedules WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });

  const next = req.body.status;
  if (next && next !== sched.status) {
    const tx = db.transaction(() => {
      if (next === 'in_progress') {
        if (sched.status !== 'pending') throw new Error('仅待执行排程可开始镟修');
        if (!sched.machine_id) throw new Error('未分配机位，无法开始镟修');
        const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(sched.machine_id);
        if (!machine) throw new Error('机位不存在');
        if (machine.maintenance_flag) throw new Error(`${machine.machine_name} 正在保养，无法开始镟修`);
        if (machine.status === 'busy') throw new Error(`${machine.machine_name} 正在作业`);
        db.prepare("UPDATE machines SET status = 'busy', current_vehicle_id = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(sched.vehicle_id, sched.machine_id);
        db.prepare("UPDATE vehicles SET status = 'maintaining', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(sched.vehicle_id);
      } else if (next === 'completed') {
        if (sched.status !== 'in_progress') throw new Error('仅镟修中排程可完成');
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(sched.vehicle_id);
        if (sched.machine_id) {
          db.prepare("UPDATE machines SET status = 'idle', current_vehicle_id = NULL, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(sched.machine_id);
        }
        db.prepare("UPDATE vehicles SET status = 'waiting', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(sched.vehicle_id);
        const hasInsp = db.prepare('SELECT COUNT(*) AS c FROM inspections WHERE schedule_id = ?').get(sched.id);
        if (!hasInsp || hasInsp.c === 0) {
          db.prepare(
            `INSERT INTO inspections(schedule_id, vehicle_id, pre_diameter_left, pre_diameter_right, result)
             VALUES (?, ?, ?, ?, 'pending')`
          ).run(sched.id, sched.vehicle_id, vehicle?.wheel_diameter_left ?? null, vehicle?.wheel_diameter_right ?? null);
        }
      } else if (next === 'cancelled') {
        if (sched.status === 'in_progress') {
          if (sched.machine_id) {
            db.prepare("UPDATE machines SET status = 'idle', current_vehicle_id = NULL, updated_at = datetime('now','localtime') WHERE id = ?").run(sched.machine_id);
          }
          db.prepare("UPDATE vehicles SET status = 'waiting', updated_at = datetime('now','localtime') WHERE id = ?").run(sched.vehicle_id);
        }
      }
      db.prepare("UPDATE schedules SET status = ?, operator = ?, remark = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(next, req.body.operator != null ? req.body.operator : sched.operator, req.body.remark != null ? req.body.remark : sched.remark, sched.id);
    });
    try {
      tx();
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  } else {
    db.prepare("UPDATE schedules SET schedule_date = ?, operator = ?, remark = ?, machine_id = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(req.body.schedule_date != null ? req.body.schedule_date : sched.schedule_date,
           req.body.operator != null ? req.body.operator : sched.operator,
           req.body.remark != null ? req.body.remark : sched.remark,
           req.body.machine_id != null ? req.body.machine_id : sched.machine_id,
           sched.id);
  }
  res.json(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  if (!['pending', 'cancelled'].includes(sched.status)) {
    return res.status(400).json({ error: '仅待执行或已取消排程可删除' });
  }
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
