const ScanPage = {
  _successTimer: null,
  _batch: [],
  _members: [],

  render() {
    return `
      <div class="scan-container">
        <div class="scanner-status" id="scanner-status">
          <span class="scanner-dot disconnected" id="scanner-dot"></span>
          <span id="scanner-label">スキャナー未接続</span>
        </div>
        <div class="scan-input-wrap">
          <input type="text" id="scan-input" class="scan-input"
                 placeholder="手動入力 (Enter で送信)"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
        <p class="scan-hint" id="scan-hint">スキャナーからの読取を待機中...</p>
        <div id="scan-result" class="scan-result"></div>
        <div id="batch-section"></div>
      </div>
    `;
  },

  async init() {
    this._batch = [];
    const input = document.getElementById('scan-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        this.handleScan(input.value.trim());
        input.value = '';
      }
    });
    this._updateStatusUI();
    try { this._members = await API.get('/api/members'); } catch(e) { this._members = []; }
  },

  onScan(barcode) {
    this.handleScan(barcode);
  },

  _updateStatusUI() {
    const dot = document.getElementById('scanner-dot');
    const label = document.getElementById('scanner-label');
    const hint = document.getElementById('scan-hint');
    if (!dot) return;
    if (scannerConnected) {
      dot.className = 'scanner-dot connected';
      label.textContent = 'スキャナー接続中';
      hint.textContent = 'バーコードをスキャンしてください';
    } else {
      dot.className = 'scanner-dot disconnected';
      label.textContent = 'スキャナー未接続';
      hint.textContent = '手動入力するか、スキャナーを接続してください';
    }
  },

  async handleScan(barcode) {
    clearTimeout(this._successTimer);
    const resultDiv = document.getElementById('scan-result');
    if (!resultDiv) return;

    if (this._batch.find(b => b.barcode === barcode)) {
      showToast('この機材は既にリストに追加されています', 'error');
      return;
    }

    try {
      const data = await API.post('/api/transactions/scan', { barcode });
      if (data.action === 'not_found') {
        resultDiv.innerHTML = this.renderNotFound(barcode);
      } else if (data.action === 'checkout') {
        this._batch.push(data.equipment);
        resultDiv.innerHTML = '';
        this.renderBatch();
        showToast(`${data.equipment.name || data.equipment.barcode} をリストに追加`, 'success');
      } else if (data.action === 'return') {
        resultDiv.innerHTML = this.renderReturn(data.equipment, data.transaction);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  renderNotFound(barcode) {
    return `
      <div class="card result-card not-found">
        <div class="result-header">
          <span class="result-name">${escapeHtml(barcode)}</span>
          <span class="result-badge badge-not-found">未登録</span>
        </div>
        <p style="color:var(--text-light);font-size:14px;margin-bottom:16px;">
          このバーコードは登録されていません
        </p>
        <button class="btn btn-primary btn-block" onclick="ScanPage.quickRegister('${escapeHtml(barcode)}')">
          この機材を登録する
        </button>
      </div>
    `;
  },

  renderReturn(eq, tx) {
    const label = eq.name || eq.barcode;
    return `
      <div class="card result-card return-mode">
        <div class="result-header">
          <span class="result-name">${escapeHtml(label)}</span>
          <span class="result-badge badge-checked-out">貸出中</span>
        </div>
        <dl class="result-info">
          <dt>バーコード</dt><dd>${escapeHtml(eq.barcode)}</dd>
          <dt>借用者</dt><dd>${escapeHtml(tx.borrower)}</dd>
          ${tx.purpose ? `<dt>用途</dt><dd>${escapeHtml(tx.purpose)}</dd>` : ''}
          <dt>貸出日時</dt><dd>${formatDateTime(tx.checked_out_at)}</dd>
        </dl>
        <button class="btn btn-warning btn-block" onclick="ScanPage.doReturn(${tx.id})">
          返却する
        </button>
      </div>
    `;
  },

  renderBatch() {
    const section = document.getElementById('batch-section');
    if (!section) return;
    if (this._batch.length === 0) {
      section.innerHTML = '';
      return;
    }

    const itemsHtml = this._batch.map((eq, i) => {
      const label = eq.name || eq.barcode;
      return `
        <div class="batch-item">
          <div class="batch-item-info">
            <div class="batch-item-name">${escapeHtml(label)}</div>
            <div class="batch-item-sub">${eq.name ? escapeHtml(eq.barcode) : ''}${eq.tag_names ? (eq.name ? ' / ' : '') + escapeHtml(eq.tag_names) : ''}</div>
          </div>
          <button class="btn btn-outline btn-sm batch-remove" onclick="ScanPage.removeBatch(${i})">&times;</button>
        </div>
      `;
    }).join('');

    const memberOptions = this._members.map(m =>
      `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`
    ).join('');

    section.innerHTML = `
      <div class="card batch-card">
        <div class="batch-header">
          <h3>貸出リスト</h3>
          <span class="batch-count">${this._batch.length}件</span>
        </div>
        <div class="batch-items">${itemsHtml}</div>
        <div class="batch-form">
          <div class="form-group">
            <label>借用者 *</label>
            <select id="batch-borrower-select" class="form-control" onchange="ScanPage.onBorrowerChange()">
              <option value="">選択してください</option>
              ${memberOptions}
              <option value="__other__">その他（自由入力）</option>
            </select>
          </div>
          <div class="form-group hidden" id="batch-borrower-custom-group">
            <label>借用者名</label>
            <input type="text" id="batch-borrower-custom" class="form-control" placeholder="名前を入力">
          </div>
          <div class="form-group">
            <label>用途・行先</label>
            <input type="text" id="batch-purpose" class="form-control" placeholder="任意">
          </div>
          <button class="btn btn-primary btn-block" onclick="ScanPage.doBatchCheckout()">
            ${this._batch.length}件を貸出する
          </button>
        </div>
      </div>
    `;
  },

  onBorrowerChange() {
    const sel = document.getElementById('batch-borrower-select');
    const customGroup = document.getElementById('batch-borrower-custom-group');
    if (sel.value === '__other__') {
      customGroup.classList.remove('hidden');
      document.getElementById('batch-borrower-custom').focus();
    } else {
      customGroup.classList.add('hidden');
    }
  },

  removeBatch(index) {
    this._batch.splice(index, 1);
    this.renderBatch();
  },

  async doBatchCheckout() {
    const sel = document.getElementById('batch-borrower-select');
    let borrower;
    if (sel.value === '__other__') {
      borrower = document.getElementById('batch-borrower-custom').value.trim();
    } else {
      borrower = sel.value;
    }
    if (!borrower) {
      showToast('借用者を選択してください', 'error');
      return;
    }
    const purpose = document.getElementById('batch-purpose').value.trim();
    const ids = this._batch.map(eq => eq.id);

    try {
      const result = await API.post('/api/transactions/checkout', {
        equipment_ids: ids,
        borrower,
        purpose: purpose || null,
      });

      this._batch = [];
      const resultDiv = document.getElementById('scan-result');
      const batchSection = document.getElementById('batch-section');
      batchSection.innerHTML = '';
      resultDiv.innerHTML = `
        <div class="card scan-success">
          <div class="icon" style="color:var(--primary)">&#10003;</div>
          <div class="message">貸出完了</div>
        </div>
      `;
      this._successTimer = setTimeout(() => {
        resultDiv.innerHTML = '';
      }, 3000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async doReturn(transactionId) {
    try {
      await API.post('/api/transactions/return', { transaction_id: transactionId });
      const resultDiv = document.getElementById('scan-result');
      resultDiv.innerHTML = `
        <div class="card scan-success">
          <div class="icon" style="color:var(--success)">&#10003;</div>
          <div class="message">返却完了</div>
          <div class="sub">正常に返却されました</div>
        </div>
      `;
      this._successTimer = setTimeout(() => {
        resultDiv.innerHTML = '';
      }, 3000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  quickRegister(barcode) {
    openModal(`
      <div class="modal-title">
        <span>機材登録</span>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="quick-register-form">
        <div class="form-group">
          <label>バーコード</label>
          <input type="text" class="form-control" value="${escapeHtml(barcode)}" readonly
                 style="background:var(--bg)">
        </div>
        <div class="form-group">
          <label>名前</label>
          <input type="text" id="qr-name" class="form-control" placeholder="任意">
        </div>
        <div class="form-group">
          <label>タグ</label>
          <div id="qr-tags" class="tag-picker">
            <span style="color:var(--text-light);font-size:14px;">読込中...</span>
          </div>
        </div>
        <div class="form-group">
          <label>保管場所</label>
          <select id="qr-location" class="form-control"><option value="">選択してください</option></select>
        </div>
        <button type="submit" class="btn btn-primary btn-block">登録する</button>
      </form>
    `);

    Promise.all([
      API.get('/api/tags'),
      API.get('/api/locations'),
    ]).then(([tags, locs]) => {
      const tagsDiv = document.getElementById('qr-tags');
      if (tags.length > 0) {
        tagsDiv.innerHTML = tags.map(t =>
          `<label class="tag-checkbox"><input type="checkbox" name="qr-tag" value="${t.id}"><span class="tag-chip">${escapeHtml(t.name)}</span></label>`
        ).join('');
      } else {
        tagsDiv.innerHTML = '<span style="color:var(--text-light);font-size:14px;">設定画面でタグを追加してください</span>';
      }
      const locSel = document.getElementById('qr-location');
      locs.forEach(l => {
        locSel.insertAdjacentHTML('beforeend', `<option value="${l.id}">${escapeHtml(l.name)}</option>`);
      });
    });

    document.getElementById('quick-register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tagIds = [...document.querySelectorAll('#qr-tags input[name="qr-tag"]:checked')].map(el => Number(el.value));
      try {
        await API.post('/api/equipment', {
          barcode,
          name: document.getElementById('qr-name').value.trim(),
          tag_ids: tagIds,
          location_id: document.getElementById('qr-location').value || null,
        });
        closeModal();
        showToast('機材を登録しました。続けてスキャンすると貸出リストに追加されます', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

};
