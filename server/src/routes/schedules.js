const express = require('express');
const { db, now } = require('../db');

const router = express.Router();

function mapScheduleRow(s) {
  if (!s) return s;
  return { ...s, scheduled_start: s.schedule_date };
}

function normalizeScheduleInput(body) {
  return {
    schedule_date: body.schedule_date != null ? body.schedule_date : body.scheduled_start,
  };
}

function logHistory(scheduleId, patch, opts = {}) {
  const current = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
  if (!current) return;
  const payload = {
    schedule_id: scheduleId,
    vehicle_id: current.vehicle_id,
    old_machine_id: current.machine_id,
    new_machine_id: patch.machine_id != null ? patch.machine_id : current.machine_id,
    old_status: current.status,
    new_status: patch.status != null ? patch.status : current.status,
    old_priority_level: current.priority_level,
    new_priority_level: patch.priority_level != null ? patch.priority_level : current.priority_level,
    old_queue_order: current.queue_order,
    new_queue_order: patch.queue_order != null ? patch.queue_order : current.queue_order,
    change_type: opts.change_type || 'update',
    changed_by: opts.changed_by || null,
    change_reason: opts.reason || null,
    snapshot_json: JSON.stringify(current),
  };
  db.prepare(
    `INSERT INTO schedule_history(schedule_id, vehicle_id, old_machine_id, new_machine_id,
      old_status, new_status, old_priority_level, new_priority_level,
      old_queue_order, new_queue_order, change_type, changed_by, change_reason, snapshot_json)
     VALUES (@schedule_id, @vehicle_id, @old_machine_id, @new_machine_id,
      @old_status, @new_status, @old_priority_level, @new_priority_level,
      @old_queue_order, @new_queue_order, @change_type, @changed_by, @change_reason, @snapshot_json)`
  ).run(payload);
}

function recomputeQueue() {
  const rows = db.prepare(
    `SELECT s.*, v.emergency_flag, v.priority_flag, v.wheel_diameter_diff, v.online_plan_date
     FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     WHERE s.status IN ('pending')
     ORDER BY
       (CASE WHEN s.schedule_type = 'emergency' THEN 0 ELSE 1 END),
       v.emergency_flag DESC,
       s.priority_level DESC,
       v.priority_flag DESC,
       (CASE WHEN v.online_plan_date IS NULL THEN 1 ELSE 0 END),
       v.online_plan_date ASC,
       v.wheel_diameter_diff DESC,
       s.id ASC`
  ).all();
  const tx = db.transaction(() => {
    rows.forEach((r, idx) => {
      db.prepare('UPDATE schedules SET queue_order = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
        .run(idx + 1, r.id);
    });
  });
  tx();
}

function listSchedules() {
  recomputeQueue();
  const rows = db.prepare(
    `SELECT s.*, v.vehicle_no, v.wheel_diameter_left AS cur_left, v.wheel_diameter_right AS cur_right,
            v.wheel_diameter_diff, v.priority_flag, v.emergency_flag, v.online_plan_date, v.status AS vehicle_status,
            m.machine_no, m.machine_name, m.maintenance_flag, m.available_from, m.available_to,
            (SELECT COUNT(*) FROM schedule_history h WHERE h.schedule_id = s.id) AS history_count,
            (SELECT COUNT(*) FROM rework_tasks rt WHERE rt.source_schedule_id = s.id) AS rework_count
     FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN machines m ON s.machine_id = m.id
     ORDER BY
       (CASE WHEN s.status = 'in_progress' THEN 0
             WHEN s.status = 'pending' THEN 1
             WHEN s.status = 'completed' THEN 2
             ELSE 3 END),
       (CASE WHEN s.schedule_type = 'emergency' THEN 0 ELSE 1 END),
       s.queue_order ASC, s.priority_level DESC, v.emergency_flag DESC, s.id DESC`
  ).all();
  return rows.map(mapScheduleRow);
}

router.get('/', (req, res) => {
  res.json(listSchedules());
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT s.*, v.vehicle_no, v.wheel_diameter_left AS cur_left, v.wheel_diameter_right AS cur_right,
            v.wheel_diameter_diff, v.priority_flag, v.emergency_flag, v.online_plan_date, v.status AS vehicle_status,
            m.machine_no, m.machine_name, m.maintenance_flag, m.available_from, m.available_to
     FROM schedules s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN machines m ON s.machine_id = m.id
     WHERE s.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: '排程不存在' });
  res.json(mapScheduleRow(row));
});

router.get('/:id/history', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  const rows = db.prepare(
    `SELECT h.*, v.vehicle_no, m1.machine_no AS old_machine_no, m2.machine_no AS new_machine_no
     FROM schedule_history h
     LEFT JOIN vehicles v ON h.vehicle_id = v.id
     LEFT JOIN machines m1 ON h.old_machine_id = m1.id
     LEFT JOIN machines m2 ON h.new_machine_id = m2.id
     WHERE h.schedule_id = ? ORDER BY h.id DESC`
  ).all(req.params.id);
  const mapped = rows.map((h) => {
    const old_values = {};
    const new_values = {};
    if (h.old_machine_id !== h.new_machine_id) {
      old_values.machine_id = h.old_machine_id; old_values.machine_no = h.old_machine_no;
      new_values.machine_id = h.new_machine_id; new_values.machine_no = h.new_machine_no;
    }
    if (h.old_status !== h.new_status) { old_values.status = h.old_status; new_values.status = h.new_status; }
    if (h.old_priority_level !== h.new_priority_level) {
      old_values.priority_level = h.old_priority_level; new_values.priority_level = h.new_priority_level;
    }
    if (h.old_queue_order !== h.new_queue_order) {
      old_values.queue_order = h.old_queue_order; new_values.queue_order = h.new_queue_order;
    }
    return {
      ...h,
      action_type: h.change_type,
      old_values: Object.keys(old_values).length > 0 ? old_values : null,
      new_values: Object.keys(new_values).length > 0 ? new_values : null,
    };
  });
  res.json(mapped);
});

router.post('/:id/jump-queue', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  if (sched.status !== 'pending') return res.status(400).json({ error: '仅待执行排程可插队' });
  const targetOrder = req.body.target_order != null ? Number(req.body.target_order)
    : req.body.target_position != null ? Number(req.body.target_position) : 1;
  const reason = req.body.reason || null;
  const changedBy = req.body.changed_by || null;
  const tx = db.transaction(() => {
    logHistory(sched.id, { queue_order: targetOrder }, { change_type: 'jump_queue', reason, changed_by: changedBy || null });
    db.prepare('UPDATE schedules SET queue_order = ?, schedule_type = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(targetOrder, 'emergency', sched.id);
  });
  tx();
  recomputeQueue();
  res.json(mapScheduleRow(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id)));
});

router.post('/maintenance-review', (req, res) => {
  const { schedule_id, machine_id, reviewer, approved, remark } = req.body;
  if (!schedule_id || !reviewer) {
    return res.status(400).json({ error: '缺少排程或复核人信息' });
  }
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  const mid = machine_id || sched.machine_id;
  const machine = mid ? db.prepare('SELECT * FROM machines WHERE id = ?').get(mid) : null;
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(sched.vehicle_id);
  if (!machine) return res.status(404).json({ error: '排程未分配机位或机位不存在' });
  if (!vehicle.emergency_flag && sched.schedule_type !== 'emergency') {
    return res.status(400).json({ error: '仅紧急车辆或抢修排程可走主管复核' });
  }
  const isApproved = approved !== false;
  db.prepare('UPDATE machines SET maintenance_reviewer = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(reviewer, machine.id);
  logHistory(sched.id, { machine_id: machine.id }, { change_type: 'maintenance_review', changed_by: reviewer, reason: remark || null });
  res.json({ success: isApproved, machine_id: machine.id, reviewer, approved: isApproved });
});

router.post('/', (req, res) => {
  const { vehicle_id, machine_id, operator, remark, schedule_type, priority_level, rework_from_inspection_id } = req.body;
  const norm = normalizeScheduleInput(req.body);
  if (!vehicle_id) return res.status(400).json({ error: '请选择车辆' });

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(400).json({ error: '车辆不存在' });
  if (vehicle.status === 'maintaining') return res.status(400).json({ error: '该车辆正在镟修中，不可重复排程' });
  if (!['online', 'waiting', 'offline'].includes(vehicle.status)) {
    return res.status(400).json({ error: `车辆当前状态(${vehicle.status})不可排程` });
  }

  let machine = null;
  const isEmergency = schedule_type === 'emergency' || vehicle.emergency_flag;
  if (machine_id) {
    machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machine_id);
    if (!machine) return res.status(400).json({ error: '机位不存在' });
    if (machine.maintenance_flag && !isEmergency) {
      return res.status(400).json({ error: `${machine.machine_name} 正在保养，无法排车（紧急车辆需主管复核）` });
    }
    if (machine.status === 'busy') return res.status(400).json({ error: `${machine.machine_name} 正在作业，无法排车` });
  }

  const pending = db.prepare(
    `SELECT COUNT(*) AS c FROM schedules WHERE vehicle_id = ? AND status IN ('pending','in_progress')`
  ).get(vehicle_id);
  if (pending && pending.c > 0) return res.status(400).json({ error: '该车辆已有进行中的排程' });

  const info = db.prepare(
    `INSERT INTO schedules(vehicle_id, machine_id, schedule_date, status, priority_level, schedule_type,
      rework_from_inspection_id, operator, remark)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).run(
    vehicle_id, machine_id || null, norm.schedule_date || null,
    priority_level != null ? Number(priority_level) : (vehicle.priority_flag || 0),
    isEmergency ? 'emergency' : (schedule_type || 'normal'),
    rework_from_inspection_id || null,
    operator || null, remark || null
  );

  if (rework_from_inspection_id) {
    db.prepare(`UPDATE rework_tasks SET rework_schedule_id = ?, task_status = 'scheduled', updated_at = datetime('now','localtime')
                WHERE inspection_id = ? AND (task_status = 'pending' OR task_status IS NULL)`)
      .run(info.lastInsertRowid, rework_from_inspection_id);
  }

  if (['online', 'offline'].includes(vehicle.status)) {
    db.prepare("UPDATE vehicles SET status = 'waiting', updated_at = datetime('now','localtime') WHERE id = ?").run(vehicle_id);
  }

  const created = db.prepare('SELECT * FROM schedules WHERE id = ?').get(info.lastInsertRowid);
  logHistory(created.id, created, { change_type: 'create', changed_by: operator, reason: remark });
  recomputeQueue();

  res.status(201).json(mapScheduleRow(db.prepare(
    `SELECT s.*, v.vehicle_no, v.emergency_flag, v.priority_flag
     FROM schedules s LEFT JOIN vehicles v ON s.vehicle_id = v.id WHERE s.id = ?`
  ).get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  const norm = normalizeScheduleInput(req.body);

  const next = req.body.status;
  if (next && next !== sched.status) {
    const tx = db.transaction(() => {
      logHistory(sched.id, { status: next }, { change_type: 'status', changed_by: req.body.operator, reason: req.body.remark });
      if (next === 'in_progress') {
        if (sched.status !== 'pending') throw new Error('仅待执行排程可开始镟修');
        if (!sched.machine_id && !req.body.machine_id) throw new Error('未分配机位，无法开始镟修');
        const machineId = req.body.machine_id || sched.machine_id;
        const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machineId);
        if (!machine) throw new Error('机位不存在');
        if (machine.maintenance_flag && sched.schedule_type !== 'emergency') {
          throw new Error(`${machine.machine_name} 正在保养，无法开始镟修`);
        }
        if (machine.status === 'busy') throw new Error(`${machine.machine_name} 正在作业`);
        db.prepare("UPDATE machines SET status = 'busy', current_vehicle_id = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(sched.vehicle_id, machineId);
        db.prepare("UPDATE vehicles SET status = 'maintaining', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(sched.vehicle_id);
        if (!sched.machine_id) {
          db.prepare("UPDATE schedules SET machine_id = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(machineId, sched.id);
        }
      } else if (next === 'completed') {
        if (sched.status !== 'in_progress') throw new Error('仅镟修中排程可完成');
        const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(sched.vehicle_id);
        if (sched.machine_id) {
          db.prepare("UPDATE machines SET status = 'idle', current_vehicle_id = NULL, maintenance_reviewer = NULL, updated_at = datetime('now','localtime') WHERE id = ?")
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
            db.prepare("UPDATE machines SET status = 'idle', current_vehicle_id = NULL, maintenance_reviewer = NULL, updated_at = datetime('now','localtime') WHERE id = ?").run(sched.machine_id);
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
    const machineChanged = req.body.machine_id != null && req.body.machine_id !== sched.machine_id;
    const priorityChanged = req.body.priority_level != null && Number(req.body.priority_level) !== sched.priority_level;
    const queueChanged = req.body.queue_order != null && Number(req.body.queue_order) !== sched.queue_order;
    if (machineChanged || priorityChanged || queueChanged || req.body.schedule_type) {
      logHistory(sched.id, {
        machine_id: req.body.machine_id != null ? req.body.machine_id : sched.machine_id,
        priority_level: req.body.priority_level != null ? Number(req.body.priority_level) : sched.priority_level,
        queue_order: req.body.queue_order != null ? Number(req.body.queue_order) : sched.queue_order,
      }, { change_type: 'adjust', changed_by: req.body.operator, reason: req.body.remark });
    }
    db.prepare(
      `UPDATE schedules SET schedule_date = ?, operator = ?, remark = ?, machine_id = ?,
        priority_level = ?, queue_order = ?, schedule_type = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(
      norm.schedule_date != null ? norm.schedule_date : sched.schedule_date,
      req.body.operator != null ? req.body.operator : sched.operator,
      req.body.remark != null ? req.body.remark : sched.remark,
      req.body.machine_id != null ? req.body.machine_id : sched.machine_id,
      req.body.priority_level != null ? Number(req.body.priority_level) : sched.priority_level,
      req.body.queue_order != null ? Number(req.body.queue_order) : sched.queue_order,
      req.body.schedule_type != null ? req.body.schedule_type : sched.schedule_type,
      sched.id
    );
    recomputeQueue();
  }
  res.json(mapScheduleRow(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!sched) return res.status(404).json({ error: '排程不存在' });
  if (!['pending', 'cancelled'].includes(sched.status)) {
    return res.status(400).json({ error: '仅待执行或已取消排程可删除' });
  }
  logHistory(sched.id, { status: 'deleted' }, { change_type: 'delete' });
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  recomputeQueue();
  res.json({ success: true });
});

router.get('/rework/tasks', (req, res) => {
  const rows = db.prepare(
    `SELECT rt.*, v.vehicle_no, s.schedule_date AS source_schedule_date,
            s.status AS source_schedule_status, rt_s.schedule_date AS rework_schedule_date,
            i.post_diameter_left, i.post_diameter_right, i.post_diameter_diff, i.result AS insp_result,
            i.remark AS insp_remark
     FROM rework_tasks rt
     LEFT JOIN vehicles v ON rt.vehicle_id = v.id
     LEFT JOIN schedules s ON rt.source_schedule_id = s.id
     LEFT JOIN schedules rt_s ON rt.rework_schedule_id = rt_s.id
     LEFT JOIN inspections i ON rt.inspection_id = i.id
     ORDER BY rt.id DESC`
  ).all();
  res.json(rows);
});

router.post('/rework/tasks/:id/resolve', (req, res) => {
  const task = db.prepare('SELECT * FROM rework_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '返修任务不存在' });
  db.prepare(`UPDATE rework_tasks SET task_status = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(req.body.task_status || 'resolved', req.params.id);
  res.json(db.prepare('SELECT * FROM rework_tasks WHERE id = ?').get(req.params.id));
});

module.exports = router;
