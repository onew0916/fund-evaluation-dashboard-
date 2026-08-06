/**
 * 우측 사이드 패널: 펀드 상세 / 보유자산 / 관리자 입력
 */
window.Panel = (() => {
  let state = null;
  let activeTab = 'detail';

  // 보유자산 카드 클릭 시 뜨는 상세 모달(자산상세내역/평가이력/위원회 개최이력) 상태
  let modalFund = null;
  let modalAsset = null;
  let modalTab = 'detail';

  function init(appState) {
    state = appState;

    document.getElementById('panelCloseBtn').addEventListener('click', close);
    document.getElementById('panelOverlay').addEventListener('click', close);

    // side-panel-tab 클래스는 사이드패널과 자산 상세 모달에서 공용으로 쓰이므로
    // 사이드패널 쪽 탭(#panelBody 상단, data-ptab)만 선택해 바인딩한다.
    document.querySelectorAll('.side-panel-tabs > .side-panel-tab[data-ptab]').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.ptab;
        document.querySelectorAll('.side-panel-tabs > .side-panel-tab[data-ptab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderBody();
      });
    });

    document.getElementById('assetModalCloseBtn').addEventListener('click', closeAssetModal);
    document.getElementById('assetDetailModal').addEventListener('click', e => {
      if (e.target.id === 'assetDetailModal') closeAssetModal();
    });
    document.querySelectorAll('#assetModalTabs .side-panel-tab[data-amtab]').forEach(tab => {
      tab.addEventListener('click', () => {
        modalTab = tab.dataset.amtab;
        document.querySelectorAll('#assetModalTabs .side-panel-tab[data-amtab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderAssetModalBody();
      });
    });

    // 평가이력/위원회 이력 탭에서 "입력하러 가기" 버튼은 매 렌더마다 새로 그려지므로,
    // 부모(assetModalBody)에 위임해서 한 번만 바인딩한다.
    document.getElementById('assetModalBody').addEventListener('click', e => {
      if (e.target.closest('.jump-eval-input-btn')) jumpToEvalHistoryInput(modalFund, modalAsset);
      else if (e.target.closest('.jump-committee-input-btn')) jumpToCommitteeInput(modalFund, modalAsset);
    });
    document.getElementById('assetModalBody').addEventListener('submit', e => {
      if (e.target.classList.contains('asset-modal-detail-form')) {
        e.preventDefault();
        submitAssetModalDetailForm(e.target);
      }
    });
  }

  // 자산상세 모달에서 관리자 도구의 입력폼으로 이동하며 펀드/자산을 미리 채워준다.
  function jumpToEvalHistoryInput(fund, asset) {
    closeAssetModal();
    App.switchView('admin');
    const fundSelect = document.getElementById('evalHistoryFundSelect');
    const assetSelect = document.getElementById('evalHistoryAssetSelect');
    if (fundSelect) {
      fundSelect.value = fund.fund_code;
      fundSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (assetSelect) assetSelect.value = asset.asset_name;
    const form = document.getElementById('evalHistoryForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToCommitteeInput(fund, asset) {
    closeAssetModal();
    App.switchView('admin');
    const fundsInput = document.getElementById('committeeFundsInput');
    const assetsInput = document.getElementById('committeeAssetsInput');
    if (fundsInput) {
      fundsInput.value = fund.fund_code;
      fundsInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (assetsInput) assetsInput.value = asset.asset_name;
    const form = document.getElementById('committeeForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function open(fundCode) {
    state.selectedFundCode = fundCode;
    activeTab = 'detail';
    document.querySelectorAll('.side-panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.side-panel-tab[data-ptab="detail"]').classList.add('active');

    const fund = state.data.fundMaster.find(f => f.fund_code === fundCode);
    if (!fund) return;

    document.getElementById('panelFundCode').textContent = fund.fund_code;
    document.getElementById('panelFundName').textContent = fund.fund_name;
    document.getElementById('panelFundTeam').textContent = fund.team;

    document.getElementById('sidePanel').classList.add('open');
    document.getElementById('panelOverlay').classList.add('open');

    renderBody();
    Dashboard.render(); // 선택 행 하이라이트 갱신
  }

  function close() {
    document.getElementById('sidePanel').classList.remove('open');
    document.getElementById('panelOverlay').classList.remove('open');
    state.selectedFundCode = null;
    Dashboard.render();
  }

  function getFund() {
    return state.data.fundMaster.find(f => f.fund_code === state.selectedFundCode);
  }
  function getAssets() {
    return state.data.assetDetail.filter(a => a.fund_code === state.selectedFundCode);
  }

  function renderBody() {
    const fund = getFund();
    if (!fund) return;
    const body = document.getElementById('panelBody');

    if (activeTab === 'detail') {
      body.innerHTML = renderDetailTab(fund) + (state.isAdmin ? renderAdminFundForm(fund) : '');
      if (state.isAdmin) bindAdminFundForm(fund);
    } else {
      body.innerHTML = renderAssetsTab(fund);
      bindAssetCardClicks(fund);
      if (state.isAdmin) bindAdminAssetForms(fund);
    }
  }

  // 보유자산 카드를 클릭하면 상세 모달(자산상세내역/평가이력/위원회 개최이력)을 연다.
  // 카드 안의 관리자 수정 폼(버튼/입력창)을 클릭한 경우는 모달을 열지 않는다.
  function bindAssetCardClicks(fund) {
    const assets = getAssets();
    document.querySelectorAll('.asset-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('form, button, input, select, textarea, a')) return;
        const idx = Number(card.dataset.assetIdx);
        const asset = assets[idx];
        if (asset) openAssetModal(fund, asset);
      });
    });
  }

  // fund_master 시트 컬럼 그대로 표시: fund_code, fund_name, team, inception_date, maturity_date, investor_type, initial_commitment, NAV
  function renderDetailTab(fund) {
    return `
      <div class="detail-grid">
        <div class="detail-item"><div class="k">투자자구분</div><div class="v">${Utils.escapeHtml(fund.investor_type || '-')}</div></div>
        <div class="detail-item"><div class="k">설정일</div><div class="v mono">${Utils.formatDate(fund.inception_date)}</div></div>
        <div class="detail-item"><div class="k">만기일</div><div class="v mono">${Utils.formatDate(fund.maturity_date)} (${Utils.ddayLabel(fund.maturity_date)})</div></div>
        <div class="detail-item"><div class="k">기준일 원본액</div><div class="v mono">${Utils.formatKRW(fund.initial_commitment)}</div></div>
        <div class="detail-item"><div class="k">순자산가치(NAV)</div><div class="v mono">${Utils.formatKRW(fund.NAV)}</div></div>
      </div>
    `;
  }

  function renderAssetsTab(fund) {
    const assets = getAssets();
    if (!assets.length) {
      return `<div class="empty-state">등록된 보유자산이 없습니다.</div>`;
    }
    return `
      <div class="section-title">보유자산 (${assets.length}) <span class="asset-card-hint">카드 클릭 시 상세내역 보기</span></div>
      ${assets.map((a, idx) => `
        <div class="asset-card" data-asset-idx="${idx}">
          <div class="name">${Utils.escapeHtml(a.asset_name)} ${Utils.statusBadge(a.eval_status)}</div>
          <div class="row"><span>자산유형</span><b>${Utils.escapeHtml(a.asset_type || '-')} / ${Utils.escapeHtml(a.listed || '-')}</b></div>
          <div class="row"><span>최초취득일</span><b>${Utils.formatDate(a.acq_date)}</b></div>
          <div class="row"><span>장부평가액</span><b>${Utils.formatKRW(a.book_value)}</b></div>
          <div class="row"><span>평가금액</span><b>${Utils.formatKRW(a.eval_amount)}</b></div>
          <div class="row"><span>최근평가일</span><b>${Utils.formatDate(a.last_eval_date)}</b></div>
          ${state.isAdmin ? renderAdminAssetForm(a, idx) : ''}
        </div>
      `).join('')}
    `;
  }

  // ---- 보유자산 상세 모달: 자산상세내역 / 평가이력 / 위원회 개최이력 ----
  function openAssetModal(fund, asset) {
    modalFund = fund;
    modalAsset = asset;
    modalTab = 'detail';
    document.getElementById('assetModalTitle').textContent = asset.asset_name;
    document.querySelectorAll('#assetModalTabs .side-panel-tab[data-amtab]')
      .forEach(t => t.classList.toggle('active', t.dataset.amtab === 'detail'));
    renderAssetModalBody();
    document.getElementById('assetDetailModal').style.display = 'flex';
  }

  function closeAssetModal() {
    document.getElementById('assetDetailModal').style.display = 'none';
    modalFund = null;
    modalAsset = null;
  }

  function renderAssetModalBody() {
    if (!modalAsset) return;
    const body = document.getElementById('assetModalBody');
    if (modalTab === 'detail') {
      body.innerHTML = state.isAdmin ? renderAssetModalDetailForm(modalAsset) : renderAssetModalDetail(modalAsset);
    } else if (modalTab === 'history') {
      body.innerHTML = renderAssetModalHistory(modalFund, modalAsset);
    } else {
      body.innerHTML = renderAssetModalCommittee(modalFund, modalAsset);
    }
  }

  function renderAssetModalDetail(a) {
    return `
      <div class="detail-grid">
        <div class="detail-item"><div class="k">자산종류</div><div class="v">${Utils.escapeHtml(a.asset_type || '-')}</div></div>
        <div class="detail-item"><div class="k">시장성/비시장성</div><div class="v">${Utils.escapeHtml(a.listed || '-')}</div></div>
        <div class="detail-item"><div class="k">평가규칙</div><div class="v">${Utils.statusBadge(a.eval_status)}</div></div>
        <div class="detail-item"><div class="k">부실분류</div><div class="v">${Utils.escapeHtml(a.impair || '-')}</div></div>
        <div class="detail-item"><div class="k">최초취득일</div><div class="v mono">${Utils.formatDate(a.acq_date)}</div></div>
        <div class="detail-item"><div class="k">최근평가일</div><div class="v mono">${Utils.formatDate(a.last_eval_date)}</div></div>
        <div class="detail-item"><div class="k">장부가</div><div class="v mono">${Utils.formatKRW(a.book_value)}</div></div>
        <div class="detail-item"><div class="k">평가금액</div><div class="v mono">${Utils.formatKRW(a.eval_amount)}</div></div>
        <div class="detail-item"><div class="k">직전평가시행일</div><div class="v mono">${Utils.formatDate(a.prev_dt)}</div></div>
        <div class="detail-item"><div class="k">평가적용종료일</div><div class="v mono">${Utils.formatDate(a.apply_end)}</div></div>
        <div class="detail-item full"><div class="k">대체평가근거</div><div class="v">${Utils.escapeHtml(a.alt_reason || '-')}</div></div>
        <div class="detail-item full"><div class="k">대체평가방법</div><div class="v">${Utils.escapeHtml(a.alt_method || '-')}</div></div>
        <div class="detail-item full"><div class="k">비고</div><div class="v">${Utils.escapeHtml(a.remark || '-')}</div></div>
      </div>
    `;
  }

  // 관리자 모드에서 자산상세내역 탭 자체를 전체 필드 수정 폼으로 렌더링한다.
  function renderAssetModalDetailForm(a) {
    const statusOptions = Object.keys(CONFIG.EVAL_STATUS)
      .map(s => `<option value="${s}" ${s === a.eval_status ? 'selected' : ''}>${s}</option>`).join('');
    const listedOptions = ['', '시장성', '비시장성']
      .map(v => `<option value="${v}" ${v === (a.listed || '') ? 'selected' : ''}>${v || '(미정)'}</option>`).join('');
    const impairOptions = (CONFIG.IMPAIR_LEVELS || [])
      .map(v => `<option value="${v}" ${v === (a.impair || '') ? 'selected' : ''}>${v}</option>`).join('');
    return `
      <form class="asset-modal-detail-form">
        <div class="detail-grid">
          <div class="form-row"><label>자산종류</label><input name="asset_type" value="${Utils.escapeHtml(a.asset_type || '')}"></div>
          <div class="form-row"><label>시장성/비시장성</label><select name="listed">${listedOptions}</select></div>
          <div class="form-row"><label>평가규칙</label><select name="eval_status">${statusOptions}</select></div>
          <div class="form-row"><label>부실분류</label><select name="impair">${impairOptions}</select></div>
          <div class="form-row"><label>최초취득일</label><input type="date" name="acq_date" value="${toInputDate(a.acq_date)}"></div>
          <div class="form-row"><label>최근평가일</label><input type="date" name="last_eval_date" value="${toInputDate(a.last_eval_date)}"></div>
          <div class="form-row"><label>장부가</label><input type="number" name="book_value" value="${Utils.toNumber(a.book_value) || ''}"></div>
          <div class="form-row"><label>평가금액</label><input type="number" name="eval_amount" value="${Utils.toNumber(a.eval_amount) || ''}"></div>
          <div class="form-row"><label>직전평가시행일</label><input type="date" name="prev_dt" value="${toInputDate(a.prev_dt)}"></div>
          <div class="form-row"><label>평가적용종료일</label><input type="date" name="apply_end" value="${toInputDate(a.apply_end)}"></div>
          <div class="form-row full"><label>대체평가근거</label><input name="alt_reason" value="${Utils.escapeHtml(a.alt_reason || '')}"></div>
          <div class="form-row full"><label>대체평가방법</label><input name="alt_method" value="${Utils.escapeHtml(a.alt_method || '')}"></div>
          <div class="form-row full"><label>비고</label><textarea name="remark">${Utils.escapeHtml(a.remark || '')}</textarea></div>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="submit" class="btn btn-primary">자산상세내역 저장</button>
        </div>
      </form>
    `;
  }

  async function submitAssetModalDetailForm(form) {
    if (!modalFund || !modalAsset) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '저장 중…';
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    try {
      await Api.updateAsset(modalFund.fund_code, modalAsset.asset_name, fields);
      await syncEvalHistorySnapshot(modalFund, modalAsset, fields);
      App.showToast('자산상세내역이 저장되었습니다.', 'success');
      await App.reloadData();
      const freshFund = state.data.fundMaster.find(f => f.fund_code === modalFund.fund_code);
      const freshAsset = state.data.assetDetail.find(a => a.fund_code === modalFund.fund_code && a.asset_name === modalAsset.asset_name);
      if (freshFund && freshAsset) {
        modalFund = freshFund;
        modalAsset = freshAsset;
        renderAssetModalBody();
      } else {
        closeAssetModal();
      }
      refreshIfOpen();
    } catch (err) {
      App.showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '자산상세내역 저장';
    }
  }

  function historyReflectedFlag(r) {
    return Utils.bookReflectedBadge(r.book_reflected);
  }

  function renderAssetModalHistory(fund, asset) {
    const jumpBtn = state.isAdmin
      ? `<div class="btn-row" style="margin-bottom:12px;"><button class="btn btn-secondary jump-eval-input-btn">관리자 도구에서 평가이력 입력하기</button></div>`
      : '';
    const rows = (state.data.evalHistory || [])
      .filter(h => h.fund_code === fund.fund_code && h.asset_name === asset.asset_name)
      .sort((r1, r2) => {
        const d1 = Utils.parseDate(r1.eval_base_date), d2 = Utils.parseDate(r2.eval_base_date);
        if (!d1 && !d2) return 0;
        if (!d1) return 1;
        if (!d2) return -1;
        return d2 - d1;
      });
    if (!rows.length) return jumpBtn + `<div class="empty-state">이 자산에 대한 평가이력이 없습니다.</div>`;
    return jumpBtn + rows.map(r => `
      <div class="history-entry" style="margin-bottom:14px;">
        <div class="asset-timeline-name">${Utils.formatDate(r.eval_base_date)} ${historyReflectedFlag(r)}</div>
        <div class="detail-grid" style="margin-top:6px;">
          <div class="detail-item"><div class="k">평가금액</div><div class="v">${Utils.formatKRW(r.eval_amount)}</div></div>
          ${r.notes ? `<div class="detail-item full"><div class="k">특이사항</div><div class="v" style="font-weight:400;color:var(--text-500);">${Utils.escapeHtml(r.notes)}</div></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderAssetModalCommittee(fund, asset) {
    const jumpBtn = state.isAdmin
      ? `<div class="btn-row" style="margin-bottom:12px;"><button class="btn btn-secondary jump-committee-input-btn">관리자 도구에서 위원회 이력 입력하기</button></div>`
      : '';
    const matches = CommitteeView.findForAsset(fund.fund_code, asset.asset_name);
    if (!matches.length) return jumpBtn + `<div class="empty-state">관련된 위원회 개최이력이 없습니다.</div>`;
    return jumpBtn + matches.map(({ r }) => CommitteeView.renderEntrySummary(r)).join('');
  }

  function renderAdminFundForm(fund) {
    const investorOptions = (CONFIG.INVESTOR_TYPES || [])
      .map(t => `<option value="${t}" ${t === fund.investor_type ? 'selected' : ''}>${t}</option>`).join('');
    return `
      <div class="admin-block">
        <div class="section-title">관리자 입력 · 펀드 정보 수정</div>
        <form id="fundEditForm">
          <div class="form-row"><label>펀드명</label><input name="fund_name" value="${Utils.escapeHtml(fund.fund_name || '')}"></div>
          <div class="form-row"><label>담당팀</label><input name="team" value="${Utils.escapeHtml(fund.team || '')}"></div>
          <div class="form-row"><label>투자자구분</label>
            <select name="investor_type">${investorOptions}</select>
          </div>
          <div class="form-row"><label>설정일</label><input type="date" name="inception_date" value="${toInputDate(fund.inception_date)}"></div>
          <div class="form-row"><label>만기일</label><input type="date" name="maturity_date" value="${toInputDate(fund.maturity_date)}"></div>
          <div class="form-row"><label>기준일 원본액</label><input type="number" name="initial_commitment" value="${Utils.toNumber(fund.initial_commitment) || ''}"></div>
          <div class="form-row"><label>순자산가치(NAV)</label><input type="number" name="NAV" value="${Utils.toNumber(fund.NAV) || ''}"></div>
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">저장</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderAdminAssetForm(a, idx) {
    const statusOptions = Object.keys(CONFIG.EVAL_STATUS)
      .map(s => `<option value="${s}" ${s === a.eval_status ? 'selected' : ''}>${s}</option>`).join('');
    return `
      <form class="admin-asset-form" data-asset-idx="${idx}" style="margin-top:8px;border-top:1px dashed var(--border-strong);padding-top:8px;">
        <div class="form-row"><label>평가상태</label><select name="eval_status">${statusOptions}</select></div>
        <div class="form-row"><label>평가금액</label><input type="number" name="eval_amount" value="${a.eval_amount || ''}"></div>
        <div class="form-row"><label>최근평가일</label><input type="date" name="last_eval_date" value="${toInputDate(a.last_eval_date)}"></div>
        <div class="btn-row"><button type="submit" class="btn btn-primary">자산 정보 저장</button></div>
      </form>
    `;
  }

  function toInputDate(str) {
    const d = Utils.parseDate(str);
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function bindAdminFundForm(fund) {
    const form = document.getElementById('fundEditForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '저장 중…';
      const fd = new FormData(form);
      const fields = Object.fromEntries(fd.entries());
      try {
        await Api.updateFund(fund.fund_code, fields);
        App.showToast('펀드 정보가 저장되었습니다.', 'success');
        await App.reloadData();
        open(fund.fund_code);
      } catch (err) {
        App.showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = '저장';
      }
    });
  }

  function bindAdminAssetForms(fund) {
    const assets = getAssets();
    document.querySelectorAll('.admin-asset-form').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const idx = Number(form.dataset.assetIdx);
        const asset = assets[idx];
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '저장 중…';
        const fd = new FormData(form);
        const fields = Object.fromEntries(fd.entries());
        try {
          await Api.updateAsset(fund.fund_code, asset.asset_name, fields);
          await syncEvalHistorySnapshot(fund, asset, fields);
          App.showToast('자산 정보가 저장되었습니다. (평가이력에도 반영됨)', 'success');
          await App.reloadData();
          open(fund.fund_code);
        } catch (err) {
          App.showToast(err.message, 'error');
          btn.disabled = false; btn.textContent = '자산 정보 저장';
        }
      });
    });
  }

  // 보유자산의 평가금액/최근평가일(=평가기준일)이 입력되면 평가이력(eval_history)에도 자동으로 반영한다.
  // - 같은 펀드/자산에 대해 동일한 평가기준일의 이력이 이미 있으면 그 행을 갱신
  // - 없으면 새 이력 행을 추가 (장부가 반영여부는 일단 공란(확인필요)으로 생성 - 실제 반영 여부는 평가이력 탭에서 관리자가 확인 후 Y/N으로 전환)
  async function syncEvalHistorySnapshot(fund, asset, fields) {
    if (!fields.eval_amount) return; // 평가금액이 입력된 경우에만 이력에 반영
    const baseDate = fields.last_eval_date || '';
    const existing = (state.data.evalHistory || []).find(h =>
      h.fund_code === fund.fund_code &&
      h.asset_name === asset.asset_name &&
      h.eval_base_date === baseDate
    );

    if (existing) {
      await Api.updateEvalHistory(
        { fund_code: existing.fund_code, asset_name: existing.asset_name, eval_base_date: existing.eval_base_date },
        { eval_amount: fields.eval_amount }
      );
    } else {
      await Api.addEvalHistory({
        fund_code: fund.fund_code,
        asset_name: asset.asset_name,
        eval_base_date: baseDate,
        eval_amount: fields.eval_amount,
        book_reflected: '',
        notes: '대시보드 보유자산 정보 갱신 시 자동 생성'
      });
    }
  }

  function refreshIfOpen() {
    if (state.selectedFundCode) renderBody();
  }

  return { init, open, close, refreshIfOpen };
})();
