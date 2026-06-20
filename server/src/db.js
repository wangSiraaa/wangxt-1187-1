const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'wheel_lathe.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_no TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'online',
      wheel_diameter_left REAL,
      wheel_diameter_right REAL,
      wheel_diameter_diff REAL,
      priority_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_no TEXT NOT NULL UNIQUE,
      machine_name TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      current_vehicle_id INTEGER,
      maintenance_flag INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (current_vehicle_id) REFERENCES vehicles(id)
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      machine_id INTEGER,
      schedule_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority_level INTEGER DEFAULT 0,
      operator TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (machine_id) REFERENCES machines(id)
    );
    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      inspector TEXT,
      pre_diameter_left REAL,
      pre_diameter_right REAL,
      post_diameter_left REAL,
      post_diameter_right REAL,
      post_diameter_diff REAL,
      result TEXT DEFAULT 'pending',
      remark TEXT,
      inspected_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );
    CREATE TABLE IF NOT EXISTS sys_params (
      param_key TEXT PRIMARY KEY,
      param_value TEXT,
      param_desc TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const seedParam = db.prepare(
    'INSERT OR IGNORE INTO sys_params(param_key, param_value, param_desc) VALUES (?, ?, ?)'
  );
  seedParam.run('wheel_diameter_diff_threshold', '3.0', '轮径差阈值(mm)，超过则优先排程');
  seedParam.run('standard_wheel_diameter', '840.0', '标准车轮直径(mm)');
  seedParam.run('min_wheel_diameter', '770.0', '最小车轮直径(mm)');

  const machineCount = db.prepare('SELECT COUNT(*) AS c FROM machines').get();
  if (!machineCount || machineCount.c === 0) {
    const seedMachine = db.prepare(
      'INSERT OR IGNORE INTO machines(machine_no, machine_name, status, maintenance_flag) VALUES (?, ?, ?, ?)'
    );
    seedMachine.run('L01', '1号镟修机', 'idle', 0);
    seedMachine.run('L02', '2号镟修机', 'maintenance', 1);
    seedMachine.run('L03', '3号镟修机', 'idle', 0);
  }
}

function getParam(key, fallback) {
  const row = db.prepare('SELECT param_value FROM sys_params WHERE param_key = ?').get(key);
  if (!row || row.param_value == null || row.param_value === '') return fallback;
  const v = parseFloat(row.param_value);
  return Number.isNaN(v) ? fallback : v;
}

function now() {
  return db.prepare("SELECT datetime('now', 'localtime') AS t").get().t;
}

module.exports = { db, init, getParam, now };
