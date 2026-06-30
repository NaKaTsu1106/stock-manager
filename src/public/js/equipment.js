const EquipmentPage = {
  _tags: [],
  _locations: [],

  render() {
    return `
      <div class="search-bar">
        <input type="text" id="eq-search" class="form-control" placeholder="検索...">
      </div>
      <div id="eq-filter-tags" class="filter-tags"></div>
      <div class="filter-row">
        <select id="eq-filter-location" class="form-control">
          <option value="">全保管場所</option>
        </select>
        <select id="eq-filter-status" class="form-control">
          <option value="">全状態</option>
          <option value="available">貸出可能</option>
          <option value="checked_out">貸出中</option>
        </select>
      </div>
      <div id="eq-count" class="eq-count-bar"></div>
      <div id="eq-list" class="card" style="padding:0;"></div>
      <button class="fab" onclick="EquipmentPage.showForm()">+</button>
    `;
  },

  async init() {
    await this.loadMasters();
    this.bindSearch();
    this.loadList();
  },

  onScan(barcode) {
    const modal = document.getElementById('modal-overlay');
    if (!modal.classList.contains('hidden')) {
      const barcodeField = document.getElementById('ef-barcode');
      if (barcodeField && !barcodeField.readOnly) {
        barcodeField.value = barcode;
        showToast('バーコードを入力しました', 'success');
        return;
      }
    }
    const searchField = document.getElementById('eq-search');
    if (searchField) {
      searchField.value = barcode;
      this.loadList();
      showToast(`検索: ${barcode}`, 'success');
    }
  },

  async loadMasters() {
    [this._tags, this._locations] = await Promise.all([
      API.get('/api/tags'),
      API.get('/api/locations'),
    ]);
    const tagContainer = document.getElementById('eq-filter-tags');
    if (this._tags.length > 0) {
      tagContainer.innerHTML = this._tags.map(t =>
        `<label class="tag-checkbox"><input type="checkbox" name="eq-tag-filter" value="${t.id}"><span class="tag-chip">${escapeHtml(t.name)}</span></label>`
      ).join('');
    }
    const locSel = document.getElementById('eq-filter-location');
    this._locations.forEach(l => {
      locSel.insertAdjacentHTML('beforeend', `<option value="${l.id}">${escapeHtml(l.name)}</option>`);
    });
  },

  bindSearch() {
    let timer;
    const doSearch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.loadList(), 300);
    };
    document.getElementById('eq-search').addEventListener('input', doSearch);
    document.getElementById('eq-filter-tags').addEventListener('change', doSearch);
    document.getElementById('eq-filter-location').addEventListener('change', doSearch);
    document.getElementById('eq-filter-status').addEventListener('change', doSearch);
  },

  async loadList() {
    const params = new URLSearchParams();
    const q = document.getElementById('eq-search').value.trim();
    const checkedTags = [...document.querySelectorAll('#eq-filter-tags input[name="eq-tag-filter"]:checked')]
      .map(el => el.value);
    const loc = document.getElementById('eq-filter-location').value;
    const status = document.getElementById('eq-filter-status').value;
    if (q) params.set('q', q);
    if (checkedTags.length > 0) params.set('tag_ids', checkedTags.join(','));
    if (loc) params.set('location_id', loc);
    if (status) params.set('status', status);

    try {
      const items = await API.get('/api/equipment?' + params.toString());
      const listDiv = document.getElementById('eq-list');
      const countDiv = document.getElementById('eq-count');
      const available = items.filter(e => e.status === 'available').length;
      const checkedOut = items.filter(e => e.status === 'checked_out').length;
      countDiv.innerHTML = `
        <span class="eq-count-total">${items.length}件</span>
        <span class="eq-count-detail">
          <span class="eq-count-label available">貸出可能 ${available}</span>
          <span class="eq-count-label checked_out">貸出中 ${checkedOut}</span>
        </span>
      `;
      if (items.length === 0) {
        listDiv.innerHTML = `
          <div class="empty-state">
            <div class="icon">&#128230;</div>
            <p>機材が登録されていません</p>
          </div>
        `;
        return;
      }
      listDiv.innerHTML = items.map(eq => {
        const label = eq.name || eq.barcode;
        const sub = eq.name ? eq.barcode : '';
        return `
          <div class="equipment-item" onclick="EquipmentPage.showDetail(${eq.id})">
            <div class="eq-main">
              <div class="eq-name">${escapeHtml(label)}</div>
              <div class="eq-sub">${escapeHtml(sub)}${eq.tag_names ? (sub ? ' / ' : '') + escapeHtml(eq.tag_names) : ''}</div>
            </div>
            <div class="eq-status">
              <span class="status-dot ${eq.status}"></span>
              <span class="status-label">${eq.status === 'available' ? '可能' : '貸出中'}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async showDetail(id) {
    try {
      const eq = await API.get(`/api/equipment/${id}`);
      const displayName = eq.name || eq.barcode;
      openModal(`
        <div class="modal-title">
          <span>${escapeHtml(displayName)}</span>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <dl class="detail-grid">
          <dt>バーコード</dt><dd>${escapeHtml(eq.barcode)}</dd>
          ${eq.name ? `<dt>名前</dt><dd>${escapeHtml(eq.name)}</dd>` : ''}
          <dt>タグ</dt><dd>${eq.tag_names ? eq.tags.map(t => '<span class="tag-chip-sm">' + escapeHtml(t.name) + '</span>').join(' ') : '未設定'}</dd>
          <dt>保管場所</dt><dd>${escapeHtml(eq.location_name || '未設定')}</dd>
          <dt>状態</dt><dd><span class="status-dot ${eq.status}"></span>${eq.status === 'available' ? '貸出可能' : '貸出中'}</dd>
          <dt>購入日</dt><dd>${formatDate(eq.purchase_date)}</dd>
          <dt>備考</dt><dd>${escapeHtml(eq.notes || '-')}</dd>
          <dt>登録日</dt><dd>${formatDateTime(eq.created_at)}</dd>
          <dt>更新日</dt><dd>${formatDateTime(eq.updated_at)}</dd>
        </dl>
        <div class="btn-group" style="margin-top:20px;">
          <button class="btn btn-outline" onclick="closeModal();EquipmentPage.showForm(${eq.id})">編集</button>
          <button class="btn btn-danger" onclick="EquipmentPage.confirmDelete(${eq.id},'${escapeHtml(displayName)}')">削除</button>
        </div>
      `);
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  async showForm(id) {
    let eq = { barcode: '', name: '', tags: [], location_id: '', purchase_date: '', notes: '' };
    if (id) {
      try { eq = await API.get(`/api/equipment/${id}`); } catch (err) { showToast(err.message, 'error'); return; }
    }

    const selectedTagIds = new Set((eq.tags || []).map(t => t.id));
    const tagCheckboxes = this._tags.map(t =>
      `<label class="tag-checkbox">
        <input type="checkbox" name="tag" value="${t.id}" ${selectedTagIds.has(t.id) ? 'checked' : ''}>
        <span class="tag-chip">${escapeHtml(t.name)}</span>
      </label>`
    ).join('');

    const locOptions = this._locations.map(l =>
      `<option value="${l.id}" ${eq.location_id == l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
    ).join('');

    openModal(`
      <div class="modal-title">
        <span>${id ? '機材編集' : '機材登録'}</span>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="eq-form">
        <div class="form-group">
          <label>バーコード / 管理番号 *</label>
          <input type="text" id="ef-barcode" class="form-control" value="${escapeHtml(eq.barcode)}" required>
        </div>
        <div class="form-group">
          <label>名前</label>
          <input type="text" id="ef-name" class="form-control" value="${escapeHtml(eq.name)}" placeholder="任意">
        </div>
        <div class="form-group">
          <label>タグ</label>
          <div class="tag-picker" id="ef-tags">
            ${tagCheckboxes || '<span style="color:var(--text-light);font-size:14px;">設定画面でタグを追加してください</span>'}
          </div>
        </div>
        <div class="form-group">
          <label>保管場所</label>
          <select id="ef-location" class="form-control">
            <option value="">選択してください</option>${locOptions}
          </select>
        </div>
        <div class="form-group">
          <label>購入日</label>
          <input type="date" id="ef-purchase-date" class="form-control" value="${eq.purchase_date || ''}">
        </div>
        <div class="form-group">
          <label>備考</label>
          <textarea id="ef-notes" class="form-control">${escapeHtml(eq.notes || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">${id ? '更新する' : '登録する'}</button>
      </form>
    `);

    document.getElementById('eq-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const checkedTags = [...document.querySelectorAll('#ef-tags input[name="tag"]:checked')].map(el => Number(el.value));
      const data = {
        barcode: document.getElementById('ef-barcode').value.trim(),
        name: document.getElementById('ef-name').value.trim(),
        tag_ids: checkedTags,
        location_id: document.getElementById('ef-location').value || null,
        purchase_date: document.getElementById('ef-purchase-date').value || null,
        notes: document.getElementById('ef-notes').value.trim() || null,
      };
      if (!data.barcode) {
        showToast('バーコードは必須です', 'error');
        return;
      }
      try {
        if (id) {
          await API.put(`/api/equipment/${id}`, data);
          showToast('更新しました', 'success');
        } else {
          await API.post('/api/equipment', data);
          showToast('登録しました', 'success');
        }
        closeModal();
        this.loadList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },

  confirmDelete(id, name) {
    openModal(`
      <div class="modal-title">
        <span>削除確認</span>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <p style="margin-bottom:20px;">「${escapeHtml(name)}」を削除しますか？<br>
      <small style="color:var(--text-light)">関連する貸出履歴も削除されます。</small></p>
      <div class="btn-group">
        <button class="btn btn-outline" onclick="closeModal()">キャンセル</button>
        <button class="btn btn-danger" onclick="EquipmentPage.doDelete(${id})">削除する</button>
      </div>
    `);
  },

  async doDelete(id) {
    try {
      await API.del(`/api/equipment/${id}`);
      closeModal();
      showToast('削除しました', 'success');
      this.loadList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  },
};
