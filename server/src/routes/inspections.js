const express = require('express');
const { db, getParam } = require('../db');

const router = express.Router();

function mapInspectionRow(i) {
  if (!i) return i;
  return {
    ...i,
    pre_left_diameter: i.pre_diameter_left,
    pre_right_diameter: i.pre_diameter_right,
    post_left_diameter: i.post_diameter_left,
    post_right_diameter: i.post_diameter_right,
    wear_left: (i.pre_diameter_left != null && i.post_diameter_left != null)
      ? Number((i.pre_diameter_left - i.post_diameter_left).toFixed(3)) : null,
    wear_right: (i.pre_diameter_right != null && i.post_diameter_right != null)
      ? Number((i.pre_diameter_right - i.post_diameter_right).toFixed(3)) : null,
  };
}

function normalizeInspectionInput(body) {
  return {
    pre_diameter_left: body.pre_diameter_left != null ? body.pre_diameter_left : body.pre_left_diameter,
    pre_diameter_right: body.pre_diameter_right != null ? body.pre_diameter_right : body.pre_right_diameter,
    post_diameter_left: body.post_diameter_left != null ? body.post_diameter_left : body.post_left_diameter,
    post_diameter_right: body.post_diameter_right != null ? body.post_diameter_right : body.post_right_diameter,
  };
}

function listInspections() {
  const rows = db.prepare(
    `SELECT i.*, v.vehicle_no, v.priority_flag, v.emergency_flag, v.status AS vehicle_status,
            s.schedule_date, s.status AS schedule_status, s.schedule_type,
            m.machine_no, m.machine_name,
            (SELECT COUNT(*) FROM dimension_reviews dr WHERE dr.inspection_id = i.id) AS review_count,
            (SELECT ii.result FROM inspections ii
             WHERE ii.vehicle_id = v.id AND ii.result IN ('pass','fail')
             ORDER BY ii.id DESC LIMIT 1) AS last_adjudication,
            (SELECT iii.schedule_id FROM inspections iii
             WHERE iii.vehicle_id = v.id AND iii.result = 'fail'
             ORDER BY iii.id DESC LIMIT 1) AS last_fail_schedule_id,
            (SELECT rt.id FROM rework_tasks rt WHERE rt.inspection_id = i.id ORDER BY rt.id DESC LIMIT 1) AS rework_task_id,
            (SELECT rt.task_status FROM rework_tasks rt WHERE rt.inspection_id = i.id ORDER BY rt.id DESC LIMIT 1) AS rework_task_status
     FROM inspections i
     LEFT JOIN vehicles v ON i.vehicle_id = v.id
     LEFT JOIN schedules s ON i.schedule_id = s.id
     LEFT JOIN machines m ON s.machine_id = m.id
     ORDER BY (CASE WHEN i.result = 'pending' THEN 0 ELSE 1 END), i.id DESC`
  ).all();
  return rows.map(mapInspectionRow);
}

function getScheduleAdjudicatedInsp(scheduleId, vehicleId) {
  return db.prepare(
    `SELECT * FROM inspections
     WHERE schedule_id = ? AND vehicle_id = ? AND result IN ('pass','fail')
     ORDER BY id DESC LIMIT 1`
  ).get(scheduleId, vehicleId);
}

function getVehicleAnyFail(vehicleId) {
  const row = db.prepare(
    `SELECT * FROM inspections WHERE vehicle_id = ? AND result IN ('pass','fail')
     ORDER BY id DESC LIMIT 1`
  ).get(vehicleId);
  if (!row) return null;
  return row.result === 'fail' ? row : null;
}

function isVehiclePassAllowed(inspId, vehicleId, scheduleId) {
  const lastFail = getVehicleAnyFail(vehicleId);
  if (!lastFail) return { allowed: true };

  if (!scheduleId) {
    return {
      allowed: false,
      reason: '该车辆存在历史不合格质检记录，且当前待质检记录未关联有效排程。必须为车辆重新排程、完成镟修，由新排程自动生成的质检记录方可判定合格。'
    };
  }

  if (String(scheduleId) === String(lastFail.schedule_id)) {
    return {
      allowed: false,
      reason: `该待质检记录关联的排程(#${scheduleId})正是历史最后一次不合格结论所在的排程。同一条排程不允许先判不合格再判合格，必须重新创建新排程完成镟修后方可判定合格。`
    };
  }

  const schedule = db.prepare(
    `SELECT s.*,
      (SELECT COUNT(*) FROM inspections i
       WHERE i.schedule_id = s.id AND i.vehicle_id = s.vehicle_id AND i.result IN ('pass','fail') AND i.id != ?) AS other_adj
     FROM schedules s WHERE s.id = ?`
  ).get(inspId, scheduleId);

  if (!schedule) {
    return { allowed: false, reason: '关联排程不存在' };
  }
  if (schedule.vehicle_id !== vehicleId) {
    return { allowed: false, reason: '排程与车辆关联不一致' };
  }
  if (schedule.status !== 'completed') {
    return { allowed: false, reason: `当前排程状态为"${schedule.status}"，仅已完成镟修(completed)的排程可判定质检合格` };
  }
  if (schedule.other_adj > 0) {
    return { allowed: false, reason: '该排程下已存在其他判定过的质检记录，不可重复判定' };
  }

  return { allowed: true };
}

router.get('/', (req, res) => {
  res.json(listInspections());
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT i.*, v.vehicle_no, v.status AS vehicle_status, s.status AS schedule_status,
            v.priority_flag, v.emergency_flag, s.schedule_date, s.schedule_type, m.machine_no, m.machine_name,
            (SELECT COUNT(*) FROM dimension_reviews dr WHERE dr.inspection_id = i.id) AS review_count
     FROM inspections i
     LEFT JOIN vehicles v ON i.vehicle_id = v.id
     LEFT JOIN schedules s ON i.schedule_id = s.id
     LEFT JOIN machines m ON s.machine_id = m.id
     WHERE i.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: '质检记录不存在' });
  res.json(mapInspectionRow(row));
});

router.get('/:id/reviews', (req, res) => {
  const insp = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!insp) return res.status(404).json({ error: '质检记录不存在' });
  const rows = db.prepare(
    `SELECT dr.*, v.vehicle_no FROM dimension_reviews dr
     LEFT JOIN vehicles v ON dr.vehicle_id = v.id
     WHERE dr.inspection_id = ? ORDER BY dr.id DESC`
  ).all(req.params.id);
  const mapped = rows.map((r) => ({
    ...r,
    status: r.review_result,
    remark: r.review_comment,
    pre_left_diameter: r.pre_diameter_left,
    pre_right_diameter: r.pre_diameter_right,
    post_left_diameter: r.post_diameter_left,
    post_right_diameter: r.post_diameter_right,
  }));
  res.json(mapped);
});

router.post('/:id/review', (req, res) => {
  const insp = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!insp) return res.status(404).json({ error: '质检记录不存在' });
  const reviewer = req.body.reviewer;
  const review_result = req.body.review_result != null ? req.body.review_result : req.body.status;
  const review_comment = req.body.review_comment != null ? req.body.review_comment : req.body.remark;
  if (!reviewer) return res.status(400).json({ error: '复核人必填' });
  if (!['pass', 'fail', 'pending'].includes(review_result || '')) {
    return res.status(400).json({ error: '复核结果必须为 pass/fail/pending' });
  }
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO dimension_reviews(inspection_id, vehicle_id, reviewer, review_result, review_comment,
        pre_diameter_left, pre_diameter_right, post_diameter_left, post_diameter_right, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    ).run(insp.id, insp.vehicle_id, reviewer, review_result, review_comment || null,
      insp.pre_diameter_left, insp.pre_diameter_right, insp.post_diameter_left, insp.post_diameter_right);
    db.prepare(`UPDATE inspections SET dimension_review_status = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(review_result, insp.id);
  });
  tx();
  res.json({ success: true });
});

router.post('/', (req, res) => {
  const { schedule_id, vehicle_id, inspector, result, remark, is_recheck } = req.body;
  const norm = normalizeInspectionInput(req.body);
  if (!schedule_id || !vehicle_id) return res.status(400).json({ error: '缺少排程或车辆信息' });

  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule_id);
  if (!schedule) return res.status(400).json({ error: '排程不存在' });
  if (schedule.status !== 'completed') {
    return res.status(400).json({ error: '仅已完成镟修的排程可创建质检记录' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(400).json({ error: '车辆不存在' });
  if (schedule.vehicle_id !== vehicle.id) {
    return res.status(400).json({ error: '车辆与排程不匹配' });
  }
  if (!['waiting', 'offline'].includes(vehicle.status || '')) {
    return res.status(400).json({ error: `当前车辆状态为"${vehicle.status}"，仅待质检(waiting)或锁定(offline)状态车辆可创建质检记录` });
  }

  const adjudicated = getScheduleAdjudicatedInsp(schedule_id, vehicle_id);
  if (adjudicated) {
    return res.status(400).json({
      error: `该排程已存在${adjudicated.result === 'pass' ? '合格' : '不合格'}质检结论，不可重复创建。需重新排程镟修后方可再次质检。`
    });
  }

  const pending = db.prepare(
    `SELECT COUNT(*) AS c FROM inspections WHERE schedule_id = ? AND vehicle_id = ? AND result = 'pending'`
  ).get(schedule_id, vehicle_id);
  if (pending && pending.c > 0) {
    return res.status(400).json({ error: '该排程已存在待质检记录，请先处理已有记录' });
  }

  const preL = norm.pre_diameter_left != null ? norm.pre_diameter_left : vehicle.wheel_diameter_left;
  const preR = norm.pre_diameter_right != null ? norm.pre_diameter_right : vehicle.wheel_diameter_right;
  const postL = norm.post_diameter_left;
  const postR = norm.post_diameter_right;
  const postDiff = (postL != null && postR != null && !Number.isNaN(postL) && !Number.isNaN(postR))
    ? Math.abs(postL - postR) : null;

  try {
    const info = db.prepare(
      `INSERT INTO inspections(schedule_id, vehicle_id, inspector, pre_diameter_left, pre_diameter_right,
         post_diameter_left, post_diameter_right, post_diameter_diff, result, remark, inspected_at, is_recheck)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)`
    ).run(schedule_id, vehicle_id, inspector || null,
      preL ?? null, preR ?? null,
      postL ?? null, postR ?? null, postDiff, result || 'pending', remark || null,
      Number(is_recheck) ? 1 : 0);
    res.status(201).json(mapInspectionRow(db.prepare('SELECT * FROM inspections WHERE id = ?').get(info.lastInsertRowid)));
  } catch (e) {
    res.status(400).json({ error: '创建质检记录失败: ' + e.message });
  }
});

router.put('/:id', (req, res) => {
  const insp = db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id);
  if (!insp) return res.status(404).json({ error: '质检记录不存在' });

  if (insp.result !== 'pending') {
    return res.status(400).json({
      error: `该质检记录已判定为"${insp.result === 'pass' ? '合格' : '不合格'}"，不可修改结论。如需重新质检请重新排程镟修。`
    });
  }

  const norm = normalizeInspectionInput(req.body);
  const postL = norm.post_diameter_left != null ? Number(norm.post_diameter_left) : insp.post_diameter_left;
  const postR = norm.post_diameter_right != null ? Number(norm.post_diameter_right) : insp.post_diameter_right;
  const result = req.body.result || insp.result;
  const inspector = req.body.inspector != null ? req.body.inspector : insp.inspector;
  const remark = req.body.remark != null ? req.body.remark : insp.remark;
  const isRecheck = req.body.is_recheck != null ? (Number(req.body.is_recheck) ? 1 : 0) : insp.is_recheck;

  if (!['pass', 'fail'].includes(result)) {
    return res.status(400).json({ error: '质检结论必须为 pass(合格) 或 fail(不合格)' });
  }

  if ((result === 'pass') && (postL == null || postR == null || Number.isNaN(postL) || Number.isNaN(postR))) {
    return res.status(400).json({ error: '判定合格时修后左右轮径必须填写' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(insp.vehicle_id);
  if (!vehicle) return res.status(400).json({ error: '关联车辆不存在' });

  if (!['waiting', 'offline'].includes(vehicle.status || '')) {
    return res.status(400).json({
      error: `当前车辆状态为"${vehicle.status}"，仅待质检(waiting)或锁定(offline)状态车辆可进行质检判定。`
    });
  }

  if (insp.schedule_id) {
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(insp.schedule_id);
    if (!schedule) return res.status(400).json({ error: '关联排程不存在' });
    if (schedule.status !== 'completed') {
      return res.status(400).json({ error: `仅已完成(completed)的排程可进行质检判定，当前排程状态：${schedule.status}` });
    }
    if (schedule.vehicle_id !== insp.vehicle_id) {
      return res.status(400).json({ error: '排程与车辆关联不一致' });
    }
    const adjudicated = getScheduleAdjudicatedInsp(insp.schedule_id, insp.vehicle_id);
    if (adjudicated) {
      return res.status(400).json({
        error: `该排程已存在${adjudicated.result === 'pass' ? '合格' : '不合格'}质检结论，不可重复判定。需重新排程镟修。`
      });
    }
  }

  if (result === 'pass') {
    const passCheck = isVehiclePassAllowed(insp.id, insp.vehicle_id, insp.schedule_id);
    if (!passCheck.allowed) {
      return res.status(400).json({ error: passCheck.reason });
    }
  }

  let postDiff = insp.post_diameter_diff;
  if (postL != null && postR != null && !Number.isNaN(postL) && !Number.isNaN(postR)) {
    postDiff = Math.abs(postL - postR);
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE inspections SET post_diameter_left = ?, post_diameter_right = ?, post_diameter_diff = ?,
       result = ?, inspector = ?, remark = ?, inspected_at = datetime('now','localtime'), is_recheck = ? WHERE id = ?`
    ).run(postL, postR, postDiff, result, inspector, remark, isRecheck, insp.id);

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
      const pendingRework = db.prepare(
        `SELECT id FROM rework_tasks WHERE inspection_id = ? AND task_status IN ('pending','scheduled') ORDER BY id DESC LIMIT 1`
      ).get(insp.id);
      if (pendingRework) {
        db.prepare(`UPDATE rework_tasks SET task_status = 'resolved', updated_at = datetime('now','localtime') WHERE id = ?`)
          .run(pendingRework.id);
      }
    } else if (result === 'fail') {
      db.prepare("UPDATE vehicles SET status = 'offline', updated_at = datetime('now','localtime') WHERE id = ?")
        .run(insp.vehicle_id);
      if (insp.schedule_id) {
        db.prepare("UPDATE schedules SET status = 'completed', updated_at = datetime('now','localtime') WHERE id = ?")
          .run(insp.schedule_id);
      }
      const existingRework = db.prepare(
        `SELECT id FROM rework_tasks WHERE inspection_id = ? AND (task_status = 'pending' OR task_status IS NULL) ORDER BY id DESC LIMIT 1`
      ).get(insp.id);
      if (!existingRework) {
        db.prepare(
          `INSERT INTO rework_tasks(vehicle_id, inspection_id, source_schedule_id, task_status, rework_reason, assigned_by)
           VALUES (?, ?, ?, 'pending', ?, ?)`
        ).run(insp.vehicle_id, insp.id, insp.schedule_id || null,
          remark || '尺寸复核不合格，需返修镟修', inspector || null);
      }
    }
  });

  try {
    tx();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json(mapInspectionRow(db.prepare('SELECT * FROM inspections WHERE id = ?').get(req.params.id)));
});

module.exports = router;
