const HistoryPage = {
  _offset: 0,
  _total: 0,
  _limit: 30,

  render() {
    return `
      <div id="history-list" class="card" style="padding:0;"></div>
      <div id="history-more" class="load-more"></div>
    `;
  },

  init() {
    this._offset = 0;
    this.loadList(false);
  },

  async loadList(append = false) {
    try {
      const data = await API.get(`/api/transactions?limit=${this._limit}&offset=${this._offset}`);
      this._total = data.total;

      const listDiv = document.getElementById('history-list');
      if (!append && data.rows.length === 0) {
        listDiv.innerHTML = `
          <div class="empty-state">
            <div class="icon">&#128196;</div>
            <p>履歴はまだありません</p>
          </div>
        `;
        document.getElementById('history-more').innerHTML = '';
        return;
      }

      const html = data.rows.map(tx => {
        const isReturn = tx.returned_at !== null;
        return `
          <div class="history-item">
            <div class="history-header">
              <span class="history-name">${escapeHtml(tx.equipment_name || tx.barcode)}</span>
              ${isReturn
                ? `<span class="history-type type-return">返却</span>`
                : `<span class="history-type type-checkout">貸出中</span>`
              }
            </div>
            <div class="history-detail">
              ${escapeHtml(tx.barcode)} / ${escapeHtml(tx.borrower)}
              ${tx.purpose ? ' / ' + escapeHtml(tx.purpose) : ''}
            </div>
            <div class="history-detail">
              貸出: ${formatDateTime(tx.checked_out_at)}
              ${isReturn ? ' → 返却: ' + formatDateTime(tx.returned_at) : ''}
            </div>
          </div>
        `;
      }).join('');

      if (append) {
        listDiv.insertAdjacentHTML('beforeend', html);
      } else {
        listDiv.innerHTML = html;
      }

      const moreDiv = document.getElementById('history-more');
      if (this._offset + this._limit < this._total) {
        moreDiv.innerHTML = `<button class="btn btn-outline btn-sm" onclick="HistoryPage.loadMore()">もっと見る</button>`;
      } else {
        moreDiv.innerHTML = '';
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  loadMore() {
    this._offset += this._limit;
    this.loadList(true);
  },
};
