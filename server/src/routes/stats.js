const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const vByStatus = (status) =>
    db.prepare('SELECT COUNT(*) AS c FROM vehicles WHERE status = ?').get(status)?.c || 0;
  const mByStatus = (status) =>
    db.prepare('SELECT COUNT(*) AS c FROM machines WHERE status = ?').get(status)?.c || 0;
  const sByStatus = (status) =>
    db.prepare('SELECT COUNT(*) AS c FROM schedules WHERE status = ?').get(status)?.c || 0;
  const iByResult = (result) =>
    db.prepare('SELECT COUNT(*) AS c FROM inspections WHERE result = ?').get(result)?.c || 0;

  const priorityVehicles = db.prepare(
    `SELECT vehicle_no, wheel_diameter_left, wheel_diameter_right, wheel_diameter_diff, status
     FROM vehicles WHERE priority_flag = 1 ORDER BY wheel_diameter_diff DESC`
  ).all();

  res.json({
    vehicles: {
      total: db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c,
      online: vByStatus('online'),
      waiting: vByStatus('waiting'),
      maintaining: vByStatus('maintaining'),
      offline: vByStatus('offline'),
      priority: db.prepare('SELECT COUNT(*) AS c FROM vehicles WHERE priority_flag = 1').get().c,
    },
    machines: {
      total: db.prepare('SELECT COUNT(*) AS c FROM machines').get().c,
      idle: mByStatus('idle'),
      busy: mByStatus('busy'),
      maintenance: db.prepare('SELECT COUNT(*) AS c FROM machines WHERE maintenance_flag = 1').get().c,
    },
    schedules: {
      total: db.prepare('SELECT COUNT(*) AS c FROM schedules').get().c,
      pending: sByStatus('pending'),
      in_progress: sByStatus('in_progress'),
      completed: sByStatus('completed'),
      cancelled: sByStatus('cancelled'),
    },
    inspections: {
      total: db.prepare('SELECT COUNT(*) AS c FROM inspections').get().c,
      pending: iByResult('pending'),
      pass: iByResult('pass'),
      fail: iByResult('fail'),
    },
    priorityVehicles,
  });
});

module.exports = router;
