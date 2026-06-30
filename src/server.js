const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const BarcodeScanner = require('./scanner');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/equipment', require('./routes/equipment'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/tags', require('./routes/masters').tags);
app.use('/api/locations', require('./routes/masters').locations);
app.use('/api/members', require('./routes/masters').members);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/csv', require('./routes/csv'));

const scanner = new BarcodeScanner();

app.get('/api/scanner/status', (req, res) => {
  res.json(scanner.getStatus());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'サーバーエラーが発生しました' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

scanner.on('scan', (barcode) => {
  broadcast({ type: 'scan', barcode });
});

scanner.on('status', (status) => {
  broadcast({ type: 'scanner_status', ...status });
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'scanner_status',
    connected: scanner.connected,
    devicePath: scanner.devicePath,
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Stock Manager running on http://0.0.0.0:${PORT}`);
  scanner.start();
});
