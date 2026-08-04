/**
 * 집합투자재산평가위원회 개최이력 뷰
 * committee_history 시트: no, session_no, meeting_date, agenda, target_funds, target_assets,
 *   resolution, attendees, remark, reflected(Y=장부가반영/N=장부가미반영/공란=확인필요, 장부가 반영여부),
 *   eval_conducted(Y/N, 평가시행 여부), eval_amount(평가시행여부=Y일 때만 의미있음),
 *   impair_yn(Y/N, 부실분류 여부), impair_level(부실우려/발생/개선/악화 - impair_yn=Y일 때만 의미있음)
 *
 * 부실분류는 반드시 평가위원회 의결을 통해서만 이루어진다는 원칙에 따라, 부실분류 여부/단계는
 * 이 시트에서만 입력한다. 다만 실제 펀드/자산의 부실분류(impair) 필드 반영은 (다른 필드들과 동일하게)
 * 항상 자산 대시보드의 관리자 입력을 통해서만 이루어진다 - 위원회 이력에서 자동으로 값을 밀어넣지 않는다.
 *
 * 평가시행여부=Y인 건은 이 위원회 개최일이 대상 자산(들)의 평가기준일이 되며, admin.js에서
 * 위원회 이력 저장 시 대상 펀드×자산 조합 전체에 동일한 평가금액으로 eval_history에도 함께 반영한다.
 */
window.CommitteeView = (() => {
  let state = null;

  function init(appState) {
    state = appState;
  }

  function fundLabel(code) {
    const fund = state.data.fundMaster.find(f => f.fund_code === code);
    return fund ? `${Utils.escapeHtml(code)} · ${Utils.escapeHtml(fund.fund_name)}` : Utils.escapeHtml(code);
  }

  function codeChips(codesStr) {
    const codes = (codesStr || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!codes.length) return '<span style="color:var(--text-500);font-size:12px;">-</span>';
    return codes.map(c => `<span class="chip" style="cursor:default;">${fundLabel(c)}</span>`).join(' ');
  }

  function reflectedBadge(r) {
    return Utils.bookReflectedBadge(r.reflected);
  }

  function evalConductedBadge(r) {
    if ((r.eval_conducted || '').trim().toUpperCase() !== 'Y') return '';
    return `<span class="badge" style="color:#2563eb;background:#eaf1fd;border:1px solid #2563eb33;">평가시행</span>`;
  }

  function impairBadge(r) {
    const yn = (r.impair_yn || '').trim().toUpperCase();
    if (yn !== 'Y') return '';
    const level = r.impair_level || '(단계 미입력)';
    return `<span class="badge" style="color:#dc2626;background:#fee2e2;border:1px solid #dc262633;">부실분류: ${Utils.escapeHtml(level)}</span>`;
  }

  // 특정 펀드/자산과 관련된 위원회 이력을 찾는다 (Panel.js의 "위원회 개최내역 보기"에서 사용)
  // 매칭 기준: target_funds에 fund_code가 포함되고, target_assets에 asset_name이 포함되거나
  //           (target_assets가 비어있으면) agenda 텍스트에 asset_name이 포함되는 경우
  function findForAsset(fundCode, assetName) {
    const list = state.data.committeeHistory || [];
    const name = (assetName || '').trim();
    if (!name) return [];
    return list
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => {
        const funds = (r.target_funds || '').split(',').map(s => s.trim()).filter(Boolean);
        if (funds.length && !funds.includes(fundCode)) return false;
        const assets = (r.target_assets || '').split(',').map(s => s.trim()).filter(Boolean);
        if (assets.length) return assets.some(a => a === name || a.includes(name) || name.includes(a));
        return (r.agenda || '').includes(name);
      })
      .sort((a, b) => {
        const da = Utils.parseDate(a.r.meeting_date), db = Utils.parseDate(b.r.meeting_date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });
  }

  // Panel.js에서 매칭된 이력을 카드 형태로 렌더링할 때 재사용
  function renderEntrySummary(r) {
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center;">
          <b style="font-size:12px;">${Utils.escapeHtml(r.session_no || '(회차 미상)')} · ${Utils.formatDate(r.meeting_date)}</b>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">${reflectedBadge(r)}${impairBadge(r)}</span>
        </div>
        <div style="font-size:12px;font-weight:500;margin-top:4px;">${Utils.escapeHtml(r.agenda || '-')}</div>
        <div style="font-size:12px;color:var(--text-500);margin-top:4px;">${Utils.escapeHtml(r.resolution || '-')}</div>
      </div>
    `;
  }

  function render() {
    const container = document.getElementById('committeeContainer');
    const rows = [...state.data.committeeHistory]
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => {
        const da = Utils.parseDate(a.r.meeting_date), db = Utils.parseDate(b.r.meeting_date);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });

    if (!rows.length) {
      container.innerHTML = `<div class="empty-state">등록된 위원회 개최이력이 없습니다. 관리자 모드에서 추가할 수 있습니다.</div>`;
      return;
    }

    container.innerHTML = rows.map(({ r, idx }) => `
      <div class="history-fund-group" data-ch-idx="${idx}">
        <div class="hf-head">
          <span class="code">${Utils.formatDate(r.meeting_date)}</span>
          <h3>${Utils.escapeHtml(r.session_no || '(회차 미상)')}</h3>
          <span style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;">${evalConductedBadge(r)}${reflectedBadge(r)}${impairBadge(r)}</span>
        </div>
        <div class="detail-grid" style="margin-bottom:10px;">
          <div class="detail-item full">
            <div class="k">안건</div>
            <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.agenda || '-')}</div>
          </div>
          <div class="detail-item full">
            <div class="k">대상 펀드</div>
            <div class="v" style="font-weight:500;display:flex;gap:6px;flex-wrap:wrap;">${codeChips(r.target_funds)}</div>
          </div>
          ${r.target_assets ? `
          <div class="detail-item full">
            <div class="k">대상 자산</div>
            <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.target_assets)}</div>
          </div>` : ''}
          <div class="detail-item full">
            <div class="k">의결내용</div>
            <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.resolution || '-')}</div>
          </div>
          ${(r.eval_conducted || '').trim().toUpperCase() === 'Y' ? `
          <div class="detail-item">
            <div class="k">평가금액 (평가기준일 = 개최일)</div>
            <div class="v" style="font-weight:500;">${Utils.formatKRW(r.eval_amount)}</div>
          </div>` : ''}
          <div class="detail-item">
            <div class="k">참석위원</div>
            <div class="v" style="font-weight:500;">${Utils.escapeHtml(r.attendees || '-')}</div>
          </div>
          ${r.remark ? `
          <div class="detail-item full">
            <div class="k">비고</div>
            <div class="v" style="font-weight:400;color:var(--text-500);">${Utils.escapeHtml(r.remark)}</div>
          </div>` : ''}
        </div>
        ${state.isAdmin ? renderReflectSelect(r, idx) : ''}
      </div>
    `).join('');

    if (state.isAdmin) bindReflectSelects();
  }

  function renderReflectSelect(r, idx) {
    const val = (r.reflected || '').trim().toUpperCase();
    return `
      <div class="form-row" style="max-width:220px;margin-top:2px;">
        <label style="font-size:11px;">장부가 반영여부</label>
        <select class="reflect-select" data-ch-idx="${idx}">
          <option value="" ${!val ? 'selected' : ''}>공란 (확인필요)</option>
          <option value="Y" ${val === 'Y' ? 'selected' : ''}>Y (반영)</option>
          <option value="N" ${val === 'N' ? 'selected' : ''}>N (미반영)</option>
        </select>
      </div>
    `;
  }

  function bindReflectSelects() {
    document.querySelectorAll('.reflect-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const idx = Number(sel.dataset.chIdx);
        const original = state.data.committeeHistory[idx];
        sel.disabled = true;
        try {
          await Api.updateCommitteeHistory(
            { session_no: original.session_no, meeting_date: original.meeting_date, agenda: original.agenda },
            { reflected: sel.value }
          );
          App.showToast('장부가 반영여부가 저장되었습니다.', 'success');
          await App.reloadData();
        } catch (err) {
          App.showToast(err.message, 'error');
          sel.disabled = false;
        }
      });
    });
  }

  return { init, render, findForAsset, renderEntrySummary };
})();
