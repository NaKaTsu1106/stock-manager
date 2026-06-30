const SettingsPage = {
  render() {
    return `
      <div class="settings-section">
        <h3>バーコードスキャナー</h3>
        <div id="scanner-info" class="card">
          <p style="color:var(--text-light)">読込中...</p>
        </div>
      </div>

      <div class="settings-section">
        <h3>メンバー管理</h3>
        <div id="member-list" class="card" style="padding:0;"></div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;"
                onclick="SettingsPage.showMasterForm('members','メンバー')">+ メンバー追加</button>
      </div>

      <div class="settings-section">
        <h3>タグ管理</h3>
        <div id="tag-list" class="card" style="padding:0;"></div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;"
                onclick="SettingsPage.showMasterForm('tags','タグ')">+ タグ追加</button>
      </div>

      <div class="settings-section">
        <h3>保管場所管理</h3>
        <div id="location-list" class="card" style="padding:0;"></div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;"
                onclick="SettingsPage.showMasterForm('locations','保管場所')">+ 保管場所追加</button>
      </div>

      <div class="settings-section">
        <h3>データ管理</h3>
        <div class="card">
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn btn-outline btn-sm" onclick="SettingsPage.exportCSV('equipment')">
              機材データCSVエクスポート
            </button>
            <button class="btn btn-outline btn-sm" onclick="SettingsPage.exportCSV('transactions')">
              貸出履歴CSVエクスポート
            </button>
            <button class="btn btn-outline btn-sm" onclick="SettingsPage.showImportForm()">
              CSVインポート
            </button>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.loadScannerStatus();
    this.loadMembers();
    this.loadTags();
    this.loadLocations();
  },

  async loadScannerStatus() {
    try {
      const status = await API.get('/api/scanner/status');
      const div = document.getElementById('scanner-info');
      div.innerHTML = `
        <dl class="detail-grid">
          <dt>状態</dt>
          <dd>
            <span class="status-dot ${status.connected ? 'available' : 'checked_out'}"></span>
            ${status.connected ? '接続中' : '未接続'}
          </dd>
          <dt>デバイスパス</dt>
          <dd>${escapeHtml(status.devicePath || '未検出')}</dd>
        </dl>
        ${status.availableDevices.length > 0 ? `
          <details style="margin-top:12px;font-size:13px;">
            <summary style="cursor:pointer;color:var(--text-light);">検出されたUSBデバイス (${status.availableDevices.length})</summary>
            <ul style="margin-top:8px;padding-left:20px;">
              ${status.availableDevices.map(d =>
                `<li style="margin-bottom:4px;word-break:break-all;">${escapeHtml(d.name)}${d.isKbd ? ' (kbd)' : ''}</li>`
              ).join('')}
            </ul>
          </details>
        ` : ''}
      `;
    } catch (err) {
      document.getElementById('scanner-info').innerHTML =
        `<p style="color:var(--danger)">取得エラー: ${escapeHtml(err.message)}</p>`;
    }
  },

  async loadMembers() {
    try {
      const items = await API.get('/api/members');
      const div = document.getElementById('member-list');
      if (items.length === 0) {
        div.innerHTML = '<div class="empty-state" style="padding:24px;"><p>メンバーなし</p></div>';
        return;
      }
      div.innerHTML = items.map(m => `
        <div class="settings-item">
          <span class="settings-item-name">${escapeHtml(m.name)}</span>
          <div class="btn-group">
            <button class="btn btn-outline btn-sm"
                    onclick="SettingsPage.showMasterForm('members','メンバー',${m.id},'${escapeHtml(m.name)}')">編集</button>
            <button class="btn btn-danger btn-sm"
                    onclick="SettingsPage.deleteMaster('members','メンバー',${m.id})">削除</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async loadTags() {
    try {
      const items = await API.get('/api/tags');
      const div = document.getElementById('tag-list');
      if (items.length === 0) {
        div.innerHTML = '<div class="empty-state" style="padding:24px;"><p>タグなし</p></div>';
        return;
      }
      div.innerHTML = items.map(t => `
        <div class="settings-item">
          <span class="settings-item-name">${escapeHtml(t.name)}</span>
          <div class="btn-group">
            <button class="btn btn-outline btn-sm"
                    onclick="SettingsPage.showMasterForm('tags','タグ',${t.id},'${escapeHtml(t.name)}')">編集</button>
            <button class="btn btn-danger btn-sm"
                    onclick="SettingsPage.deleteMaster('tags','タグ',${t.id})">削除</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async loadLocations() {
    try {
      const items = await API.get('/api/locations');
      const div = document.getElementById('location-list');
      if (items.length === 0) {
        div.innerHTML = '<div class="empty-state" style="padding:24px;"><p>保管場所なし</p></div>';
        return;
      }
      div.innerHTML = items.map(l => `
        <div class="settings-item">
          <span class="settings-item-name">${escapeHtml(l.name)}</span>
          <div class="btn-group">
            <button class="btn btn-outline btn-sm"
                    onclick="SettingsPage.showMasterForm('locations','保管場所',${l.id},'${escapeHtml(l.name)}')">編集</button>
            <button class="btn btn-danger btn-sm"
                    onclick="SettingsPage.deleteMaster('locations','保管場所',${l.id})">削除</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  showMasterForm(type, label, id, currentName) {
    openModal(`
      <div class="modal-title">
        <span>${id ? label + '編集' : label + '追加'}</span>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="master-form">
        <div class="form-group">
          <label>${label}名 *</label>
          <input type="text" id="mf-name" class="form-control"
                 value="${currentName ? escapeHtml(currentName) : ''}" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">
          ${id ? '更新する' : '追加する'}
        </button>
      </form>
    `);

    document.getElementById('mf-name').focus();

    document.getElementById('master-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('mf-name').value.trim();
      if (!name) return;
      try {
        if (id) {
          await API.put(`/api/${type}/${id}`, { name });
          showToast('更新しました', 'success');
        } else {
          await API.post(`/api/${type}`, { name });
          showToast('追加しました', 'success');
        }
        closeModal();
        if (type === 'members') this.loadMembers();
        else if (type === 'tags') this.loadTags();
        else this.loadLocations();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  async deleteMaster(type, label, id) {
    if (!confirm(`この${label}を削除しますか？`)) return;
    try {
      await API.del(`/api/${type}/${id}`);
      showToast('削除しました', 'success');
      if (type === 'members') this.loadMembers();
      else if (type === 'tags') this.loadTags();
      else this.loadLocations();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  exportCSV(type) {
    if (type === 'equipment') {
      window.location.href = '/api/csv/export';
    } else {
      window.location.href = '/api/csv/export/transactions';
    }
  },

  showImportForm() {
    openModal(`
      <div class="modal-title">
        <span>CSVインポート</span>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <p style="font-size:14px;color:var(--text-light);margin-bottom:16px;">
        CSVファイルから機材データを一括登録・更新します。<br>
        バーコードが既存の場合は上書き更新されます。<br>
        必須列: バーコード
      </p>
      <form id="import-form">
        <div class="form-group">
          <input type="file" id="import-file" accept=".csv" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">インポート</button>
      </form>
      <div id="import-result" style="margin-top:16px;"></div>
    `);

    document.getElementById('import-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = document.getElementById('import-file').files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        const result = await API.upload('/api/csv/import', formData);
        document.getElementById('import-result').innerHTML = `
          <div class="card" style="background:var(--success-light);border-left:4px solid var(--success);">
            <p><strong>インポート完了</strong></p>
            <p>取込: ${result.imported}件 / スキップ: ${result.skipped}件</p>
            ${result.errors.length > 0 ? `<p style="font-size:13px;color:var(--danger);margin-top:8px;">${result.errors.join('<br>')}</p>` : ''}
          </div>
        `;
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },
};
