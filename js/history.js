/**
 * 평가이력 탭: 자산별 평가이력 관리
 * eval_history 시트: fund_code, asset_name, eval_base_date, eval_amount, book_reflected, notes
 *
 * 평가기준일(eval_base_date)의 의미는 평가 유형에 따라 다르다.
 *  - 외부평가: 감정평가보고서 상 평가기준일
 *  - 대체평가: 대체평가 의결일
 *  - 부실 또는 특정 이벤트 발생으로 평가위원회를 개최한 경우: 위원회 의결일
 * 관리자 모드에서는 기존에 입력된 이력도 직접 수정할 수 있다.
 */
window.History = (() => {
  let state = null;

  function init(appState) {
    state = appState;
  }

  function pickYear(row) {
    const d = Utils.parseDate(row.eval_base_date);
    return d ? d.getFullYear() : '연도미상';
  }

  function reflectedBadge(row) {
    const val = (row.book_reflected || '').trim().toUpperCase();
    if (val === 'Y') return `<span class="reflect-flag Y">장부가 반영완료</span>`;
    return `<span class="reflect-flag unknown">반영 확인필요</span>`;
  }

  function toInputDate(str) {
    const d = Utils.parseDate(str);
    if (!d) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function render() {
    const container = document.getElementById('historyContainer');
    const { fundMaster, evalHistory } = state.data;

    // 평가이력이 있는 펀드 전체를 대상으로 묶는다.
    const relevantCodes = new Set((evalHistory || []).map(h => h.fund_code));

    if (!relevantCodes.size) {
      container.innerHTML = `<div class="empty-state">평가이력 데이터가 없습니다.</div>`;
      return;
    }

    const html = [...relevantCodes].map(code => {
      const fund = fundMaster.find(f => f.fund_code === code);
      // globalIdx: state.data.evalHistory 배열 내 실제 인덱스 (수정 시 원본 행 특정용)
      const rows = evalHistory
        .map((r, globalIdx) => ({ r, globalIdx }))
        .filter(x => x.r.fund_code === code);
      if (!rows.length) return '';

      // 연도별 그룹 (최신순)
      const byYear = {};
      rows.forEach(x => {
        const y = pickYear(x.r);
        (byYear[y] = byYear[y] || []).push(x);
      });
      const years = Object.keys(byYear).sort((a, b) => b - a);

      return `
        <div class="history-fund-group">
          <div class="hf-head">
            <span class="code">${Utils.escapeHtml(code)}</span>
            <h3>${Utils.escapeHtml(fund ? fund.fund_name : '(펀드정보 없음)')}</h3>
            ${fund ? Utils.statusBadge(fund.eval_status) : ''}
          </div>
          ${years.map(y => `
            <div class="year-block">
              <div class="year-label">${y}</div>
              ${byYear[y]
                .sort((a, b) => {
                  const da = Utils.parseDate(a.r.eval_base_date), db = Utils.parseDate(b.r.eval_base_date);
                  if (!da && !db) return 0;
                  if (!da) return 1;
                  if (!db) return -1;
                  return db - da;
                })
                .map(x => renderEntry(x.r, x.globalIdx)).join('')}
            </div>
          `).join('')}
        </div>
      `;
    }).filter(Boolean).join('');

    container.innerHTML = html || `<div class="empty-state">평가이력 데이터가 없습니다.</div>`;
    if (state.isAdmin) bindEditButtons();
  }

  function renderEntry(r, globalIdx) {
    return `
      <div class="history-entry" data-eh-idx="${globalIdx}" style="margin-bottom:14px;">
        <div class="history-entry-view">
          <div class="asset-timeline-name">
            ${Utils.escapeHtml(r.asset_name)} ${reflectedBadge(r)}
            ${state.isAdmin ? `<button class="btn btn-secondary history-edit-btn" data-eh-idx="${globalIdx}" style="padding:2px 9px;font-size:11px;margin-left:8px;">수정</button>` : ''}
          </div>
          <div class="detail-grid" style="margin-top:6px;">
            <div class="detail-item"><div class="k">평가기준일</div><div class="v mono">${Utils.formatDate(r.eval_base_date)}</div></div>
            <div class="detail-item"><div class="k">평가금액</div><div class="v">${Utils.formatKRW(r.eval_amount)}</div></div>
            ${r.notes ? `<div class="detail-item full"><div class="k">특이사항</div><div class="v" style="font-weight:400;color:var(--text-500);">${Utils.escapeHtml(r.notes)}</div></div>` : ''}
          </div>
        </div>
        ${state.isAdmin ? renderEditForm(r, globalIdx) : ''}
      </div>
    `;
  }

  function renderEditForm(r, globalIdx) {
    return `
      <form class="history-edit-form" data-eh-idx="${globalIdx}" style="display:none;margin-top:8px;border:1px dashed #93c5fd;background:#f5f9ff;border-radius:8px;padding:12px;">
        <div class="detail-grid">
          <div class="form-row"><label>평가기준일</label><input type="date" name="eval_base_date" value="${toInputDate(r.eval_base_date)}"></div>
          <div class="form-row"><label>평가금액</label><input type="number" name="eval_amount" value="${r.eval_amount || ''}"></div>
          <div class="form-row"><label>장부가 반영여부</label>
            <select name="book_reflected">
              <option value="N" ${(r.book_reflected || 'N').toUpperCase() !== 'Y' ? 'selected' : ''}>N (확인필요)</option>
              <option value="Y" ${(r.book_reflected || '').toUpperCase() === 'Y' ? 'selected' : ''}>Y (반영완료)</option>
            </select>
          </div>
          <div class="form-row full"><label>특이사항</label><textarea name="notes">${Utils.escapeHtml(r.notes || '')}</textarea></div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-secondary history-cancel-btn">취소</button>
        </div>
      </form>
    `;
  }

  function bindEditButtons() {
    document.querySelectorAll('.history-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = document.querySelector(`.history-entry[data-eh-idx="${btn.dataset.ehIdx}"]`);
        wrap.querySelector('.history-entry-view').style.display = 'none';
        wrap.querySelector('.history-edit-form').style.display = 'block';
      });
    });

    document.querySelectorAll('.history-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.history-entry');
        wrap.querySelector('.history-edit-form').style.display = 'none';
        wrap.querySelector('.history-entry-view').style.display = 'block';
      });
    });

    document.querySelectorAll('.history-edit-form').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const idx = Number(form.dataset.ehIdx);
        const original = state.data.evalHistory[idx];
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = '저장 중…';

        const fd = new FormData(form);
        const fields = Object.fromEntries(fd.entries());

        try {
          await Api.updateEvalHistory(
            { fund_code: original.fund_code, asset_name: original.asset_name, eval_base_date: original.eval_base_date },
            fields
          );
          App.showToast('평가이력이 수정되었습니다.', 'success');
          await App.reloadData();
        } catch (err) {
          App.showToast(err.message, 'error');
          btn.disabled = false; btn.textContent = '저장';
        }
      });
    });
  }

  return { init, render };
})();
