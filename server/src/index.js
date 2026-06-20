const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { init } = require('./db');

const vehiclesRouter = require('./routes/vehicles');
const machinesRouter = require('./routes/machines');
const schedulesRouter = require('./routes/schedules');
const inspectionsRouter = require('./routes/inspections');
const sysparamsRouter = require('./routes/sysparams');
const statsRouter = require('./routes/stats');

init();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '轮对镟修排程系统 API 服务正常' });
});

app.use('/api/vehicles', vehiclesRouter);
app.use('/api/machines', machinesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/inspections', inspectionsRouter);
app.use('/api/sysparams', sysparamsRouter);
app.use('/api/stats', statsRouter);

app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

const distPath = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const idx = path.join(distPath, 'index.html');
      if (fs.existsSync(idx)) return res.sendFile(idx);
    }
    next();
  });
}

const PORT = process.env.API_PORT || 19487;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 轮对镟修排程系统 API 服务已启动');
  console.log(`📍 服务地址: http://0.0.0.0:${PORT}`);
  console.log(`🔍 健康检查: http://0.0.0.0:${PORT}/api/health`);
});
