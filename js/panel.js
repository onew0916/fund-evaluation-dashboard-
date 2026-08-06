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

    // 평가이력/위원회 이력 탭의 인라인 입력폼은 매 렌더마다 새로 그려지므로,
    // 부모(assetModalBody)에 위임해서 한 번만 바인딩한다.
    document.getElementById('assetModalBody').addEventListener('submit', e => {
      if (e.target.classList.contains('asset-modal-detail-form')) {
        e.preventDefault();
        submitAssetModalDetailForm(e.target);
      } else if (e.target.classList.contains('asset-modal-evalhistory-form')) {
        e.preventDefault();
        submitAssetModalEvalHistoryForm(e.target);
      } else if (e.target.classList.contains('asset-modal-committee-form')) {
        e.preventDefault();
        submitAssetModalCommitteeForm(e.target);
      }
    });
    document.getElementById('assetModalBody').addEventListener('change', e => {
      if (e.target.classList.contains('amc-eval-conducted')) {
        const row = document.querySelector('.amc-eval-amount-row');
        if (row) row.style.display = e.target.value === 'Y' ? '' : 'none';
      } else if (e.target.classList.contains('amc-impair-yn')) {
        const row = document.querySelector('.amc-impair-level-row');
        if (row) row.style.display = e.target.value === 'Y' ? '' : 'none';
      }
    });
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
  // 자산상세내역 탭(관리자 모드): 자산종류/시장성구분/평가규칙/최초취득일/대체평가근거/방법만
  // 직접 수정 가능하다. 부실분류/최근평가일/평가금액/평가적용종료일은 평가이력·위원회이력
  // 입력을 통해서만 반영되므로 여기서는 읽기 전용으로 보여준다.
  function renderAssetModalDetailForm(a) {
    const statusOptions = Object.keys(CONFIG.EVAL_STATUS)
      .map(s => `<option value="${s}" ${s === a.eval_status ? 'selected' : ''}>${s}</option>`).join('');
    const listedOptions = ['', '시장성', '비시장성']
      .map(v => `<option value="${v}" ${v === (a.listed || '') ? 'selected' : ''}>${v || '(미정)'}</option>`).join('');
    return `
      <form class="asset-modal-detail-form">
        <div class="detail-grid">
          <div class="form-row"><label>자산종류</label><input name="asset_type" value="${Utils.escapeHtml(a.asset_type || '')}"></div>
          <div class="form-row"><label>시장성/비시장성</label><select name="listed">${listedOptions}</select></div>
          <div class="form-row"><label>평가규칙</label><select name="eval_status">${statusOptions}</select></div>
          <div class="form-row"><label>최초취득일</label><input type="date" name="acq_date" value="${toInputDate(a.acq_date)}"></div>
          <div class="form-row full"><label>대체평가근거</label><input name="alt_reason" value="${Utils.escapeHtml(a.alt_reason || '')}"></div>
          <div class="form-row full"><label>대체평가방법</label><input name="alt_method" value="${Utils.escapeHtml(a.alt_method || '')}"></div>
          <div class="form-row full"><label>비고</label><textarea name="remark">${Utils.escapeHtml(a.remark || '')}</textarea></div>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button type="submit" class="btn btn-primary">자산상세내역 저장</button>
        </div>
      </form>
      <div class="detail-grid" style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-strong);">
        <div class="detail-item"><div class="k">부실분류 <span style="font-weight:400;">(위원회 이력에서 반영)</span></div><div class="v">${Utils.escapeHtml(a.impair || '-')}</div></div>
        <div class="detail-item"><div class="k">최근평가일 <span style="font-weight:400;">(평가이력에서 반영)</span></div><div class="v mono">${Utils.formatDate(a.last_eval_date)}</div></div>
        <div class="detail-item"><div class="k">평가금액 <span style="font-weight:400;">(평가이력에서 반영)</span></div><div class="v mono">${Utils.formatKRW(a.eval_amount)}</div></div>
        <div class="detail-item"><div class="k">평가적용종료일 <span style="font-weight:400;">(최근평가일+1년, 자동계산)</span></div><div class="v mono">${Utils.formatDate(a.apply_end)}</div></div>
        <div class="detail-item"><div class="k">장부가</div><div class="v mono">${Utils.formatKRW(a.book_value)}</div></div>
        <div class="detail-item"><div class="k">직전평가시행일</div><div class="v mono">${Utils.formatDate(a.prev_dt)}</div></div>
      </div>
    `;
  }

  // 저장 후 모달을 최신 데이터로 다시 그린다 (모달은 열어둔 채로 유지).
  async function refreshAssetModal(fundCode, assetName) {
    await App.reloadData();
    const freshFund = state.data.fundMaster.find(f => f.fund_code === fundCode);
    const freshAsset = state.data.assetDetail.find(a => a.fund_code === fundCode && a.asset_name === assetName);
    if (freshFund && freshAsset) {
      modalFund = freshFund;
      modalAsset = freshAsset;
      renderAssetModalBody();
    } else {
      closeAssetModal();
    }
    refreshIfOpen();
  }

  async function submitAssetModalDetailForm(form) {
    if (!modalFund || !modalAsset) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '저장 중…';
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    const fundCode = modalFund.fund_code, assetName = modalAsset.asset_name;
    try {
      await Api.updateAsset(fundCode, assetName, fields);
      App.showToast('자산상세내역이 저장되었습니다.', 'success');
      await refreshAssetModal(fundCode, assetName);
    } catch (err) {
      App.showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '자산상세내역 저장';
    }
  }

  function historyReflectedFlag(r) {
    return Utils.bookReflectedBadge(r.book_reflected);
  }

  function renderAssetModalHistory(fund, asset) {
    const form = state.isAdmin ? renderAssetModalEvalHistoryForm() : '';
    const rows = (state.data.evalHistory || [])
      .filter(h => h.fund_code === fund.fund_code && h.asset_name === asset.asset_name)
      .sort((r1, r2) => {
        const d1 = Utils.parseDate(r1.eval_base_date), d2 = Utils.parseDate(r2.eval_base_date);
        if (!d1 && !d2) return 0;
        if (!d1) return 1;
        if (!d2) return -1;
        return d2 - d1;
      });
    if (!rows.length) return form + `<div class="empty-state">이 자산에 대한 평가이력이 없습니다.</div>`;
    return form + rows.map(r => `
      <div class="history-entry" style="margin-bottom:14px;">
        <div class="asset-timeline-name">${Utils.formatDate(r.eval_base_date)} ${historyReflectedFlag(r)}</div>
        <div class="detail-grid" style="margin-top:6px;">
          <div class="detail-item"><div class="k">평가금액</div><div class="v">${Utils.formatKRW(r.eval_amount)}</div></div>
          ${r.notes ? `<div class="detail-item full"><div class="k">특이사항</div><div class="v" style="font-weight:400;color:var(--text-500);">${Utils.escapeHtml(r.notes)}</div></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // 이 자산에 바로 평가이력을 추가하는 인라인 폼 (fund_code/asset_name은 모달 컨텍스트로 고정).
  function renderAssetModalEvalHistoryForm() {
    return `
      <form class="asset-modal-evalhistory-form" style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px dashed var(--border-strong);">
        <div class="detail-grid">
          <div class="form-row"><label>평가기준일</label><input type="date" name="eval_base_date" required></div>
          <div class="form-row"><label>평가금액</label><input type="number" name="eval_amount"></div>
          <div class="form-row"><label>장부가 반영여부</label>
            <select name="book_reflected">
              <option value="" selected>공란 (확인필요)</option>
              <option value="Y">Y (반영)</option>
              <option value="N">N (미반영)</option>
            </select>
          </div>
          <div class="form-row full"><label>특이사항</label><textarea name="notes"></textarea></div>
        </div>
        <div class="btn-row" style="margin-top:8px;"><button type="submit" class="btn btn-primary">평가이력 추가</button></div>
      </form>
    `;
  }

  async function submitAssetModalEvalHistoryForm(form) {
    if (!modalFund || !modalAsset) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '저장 중…';
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    const fundCode = modalFund.fund_code, assetName = modalAsset.asset_name;
    try {
      await Api.addEvalHistory(Object.assign({ fund_code: fundCode, asset_name: assetName }, fields));
      await Admin.syncAssetFromEvalHistory(fundCode, assetName, fields.eval_base_date, fields.eval_amount);
      App.showToast('평가이력이 추가되었습니다.', 'success');
      await refreshAssetModal(fundCode, assetName);
    } catch (err) {
      App.showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '평가이력 추가';
    }
  }

  function renderAssetModalCommittee(fund, asset) {
    const form = state.isAdmin ? renderAssetModalCommitteeForm() : '';
    const matches = CommitteeView.findForAsset(fund.fund_code, asset.asset_name);
    if (!matches.length) return form + `<div class="empty-state">관련된 위원회 개최이력이 없습니다.</div>`;
    return form + matches.map(({ r }) => CommitteeView.renderEntrySummary(r)).join('');
  }

  // 이 자산을 대상으로 위원회 이력을 바로 추가하는 인라인 폼
  // (target_funds/target_assets는 모달 컨텍스트의 펀드코드/자산명 1건으로 고정).
  function renderAssetModalCommitteeForm() {
    const impairOptions = (CONFIG.IMPAIR_LEVELS || []).filter(l => l !== '정상')
      .map(l => `<option value="${l}">${l}</option>`).join('');
    return `
      <form class="asset-modal-committee-form" style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px dashed var(--border-strong);">
        <div class="detail-grid">
          <div class="form-row"><label>회차</label><input name="session_no" placeholder="예: 2026년 제3차"></div>
          <div class="form-row"><label>개최일</label><input type="date" name="meeting_date" required></div>
          <div class="form-row full"><label>안건</label><textarea name="agenda"></textarea></div>
          <div class="form-row full"><label>의결내용</label><textarea name="resolution"></textarea></div>
          <div class="form-row"><label>평가시행 여부</label>
            <select name="eval_conducted" class="amc-eval-conducted">
              <option value="N" selected>N (평가미시행)</option>
              <option value="Y">Y (평가시행)</option>
            </select>
          </div>
          <div class="form-row amc-eval-amount-row" style="display:none;">
            <label>평가금액</label><input type="number" name="eval_amount">
          </div>
          <div class="form-row"><label>부실분류 여부</label>
            <select name="impair_yn" class="amc-impair-yn">
              <option value="N" selected>N (해당없음)</option>
              <option value="Y">Y (부실분류 의결)</option>
            </select>
          </div>
          <div class="form-row amc-impair-level-row" style="display:none;">
            <label>부실단계</label><select name="impair_level">${impairOptions}</select>
          </div>
          <div class="form-row"><label>장부가 반영여부</label>
            <select name="reflected">
              <option value="" selected>공란 (확인필요)</option>
              <option value="Y">Y (반영)</option>
              <option value="N">N (미반영)</option>
            </select>
          </div>
          <div class="form-row full"><label>참석위원</label><input name="attendees"></div>
          <div class="form-row full"><label>비고</label><textarea name="remark"></textarea></div>
        </div>
        <div class="btn-row" style="margin-top:8px;"><button type="submit" class="btn btn-primary">위원회 이력 추가</button></div>
      </form>
    `;
  }

  async function submitAssetModalCommitteeForm(form) {
    if (!modalFund || !modalAsset) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '저장 중…';
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd.entries());
    const fundCode = modalFund.fund_code, assetName = modalAsset.asset_name;
    if (fields.impair_yn !== 'Y') fields.impair_level = '';
    if (fields.eval_conducted !== 'Y') fields.eval_amount = '';
    const row = Object.assign({}, fields, { target_funds: fundCode, target_assets: assetName });
    try {
      await Api.addCommitteeHistory(row);
      if (row.eval_conducted === 'Y' && row.eval_amount) {
        await Admin.syncEvalHistoryFromCommittee(row);
      }
      if (row.impair_yn === 'Y' && row.impair_level) {
        await Admin.syncImpairFromCommittee(row);
      }
      App.showToast('위원회 이력이 추가되었습니다.', 'success');
      await refreshAssetModal(fundCode, assetName);
    } catch (err) {
      App.showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = '위원회 이력 추가';
    }
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

  function refreshIfOpen() {
    if (state.selectedFundCode) renderBody();
  }

  return { init, open, close, refreshIfOpen };
})();
