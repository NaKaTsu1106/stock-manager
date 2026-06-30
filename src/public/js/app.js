const pages = {
  scan:      { title: 'スキャン',   module: ScanPage },
  equipment: { title: '機材一覧',   module: EquipmentPage },
  history:   { title: '貸出履歴',   module: HistoryPage },
  settings:  { title: '設定',       module: SettingsPage },
};

let currentPage = null;
let scannerConnected = false;
let pendingBarcode = null;
let _ws = null;
let _wsReconnect = null;

function connectWs() {
  if (_ws && _ws.readyState <= 1) return;
  clearTimeout(_wsReconnect);

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${proto}//${location.host}/ws`);

  _ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'scan') {
      onBarcodeScan(data.barcode);
    } else if (data.type === 'scanner_status') {
      scannerConnected = data.connected;
      updateScannerIndicator();
    }
  };

  _ws.onclose = () => {
    _wsReconnect = setTimeout(connectWs, 3000);
  };

  _ws.onerror = () => {};
}

function updateScannerIndicator() {
  const dot = document.getElementById('scanner-indicator');
  if (!dot) return;
  dot.className = 'scanner-indicator ' + (scannerConnected ? 'connected' : 'disconnected');
  dot.title = scannerConnected ? 'スキャナー接続中' : 'スキャナー未接続';
}

function onBarcodeScan(barcode) {
  const page = pages[currentPage];
  if (page && page.module.onScan) {
    page.module.onScan(barcode);
  } else {
    pendingBarcode = barcode;
    location.hash = '#scan';
  }
}

function navigate(page) {
  if (!pages[page]) page = 'scan';
  currentPage = page;

  document.getElementById('page-title').textContent = pages[page].title;
  document.getElementById('main').innerHTML = pages[page].module.render();

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  pages[page].module.init();

  if (pendingBarcode && page === 'scan') {
    const bc = pendingBarcode;
    pendingBarcode = null;
    ScanPage.onScan(bc);
  }
}

window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#', '') || 'scan';
  navigate(page);
});

document.addEventListener('DOMContentLoaded', () => {
  connectWs();
  const page = location.hash.replace('#', '') || 'scan';
  navigate(page);
});
