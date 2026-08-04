/**
 * 관리자 모드: 비밀번호 잠금, CSV 업로드, 평가방법 관리, 외부평가 이력 입력
 */
window.Admin = (() => {
  let state = null;
  let pendingUpload = null; // { sheetName, rows }

  function init(appState) {
    state = appState;

    document.getElementById('adminToggleBtn').addEventListener('click', () => {
      if (state.isAdmin) {
        logout();
      } else {
        openLoginModal();
      }
    });

    document.getElementById('adminSubmitBtn').addEventListener('click', tryLogin);
    document.getElementById('adminCancelBtn').addEventListener('click', closeLoginModal);
    document.getElementById('adminPasswordInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') tryLogin();
    });
  }

  function openLoginModal() {
    document.getElementById('adminModal').style.display = 'flex';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminErrorMsg').textContent = '';
    document.getElementById('adminPasswordInput').focus();
  }
  function closeLoginModal() {
    document.getElementById('adminModal').style.display = 'none';
  }

  function tryLogin() {
    const val = document.getElementById('adminPasswordInput').value;
    if (val === CONFIG.ADMIN_PASSWORD) {
      state.isAdmin = true;
      closeLoginModal();
      applyAdminUI();
      App.showToast('관리자 모드가 활성화되었습니다.', 'success');
    } else {
      document.getElementById('adminErrorMsg').textContent = '비밀번호가 올바르지 않습니다.';
    }
  }

  function logout() {
    state.isAdmin = false;
    applyAdminUI();
    App.showToast('관리자 모드를 종료했습니다.');
    if (document.getElementById('view-admin').style.display !== 'none') {
      App.switchView('dashboard');
    }
  }

  function applyAdminUI() {
    document.getElementById('adminToggleState').textContent = state.isAdmin ? 'ON' : 'OFF';
    document.getElementById('adminToggleBtn').classList.toggle('on', state.isAdmin);
    document.getElementById('navAdminBtn').style.display = state.isAdmin ? 'flex' : 'none';
    Panel.refreshIfOpen();
    if (state.isAdmin) renderAdminView();
  }

  // ---------------- 관리자 도구 뷰 ----------------
  function renderAdminView() {
    const container = document.getElementById('adminContainer');
    container.innerHTML = `
      ${renderUploadSection()}
      ${renderMethodSection()}
      ${renderEvalHistoryForm()}
      ${renderCommitteeForm()}
    `;
    bindUploadSection();
    bindMethodSection();
    bindEvalHistoryForm();
    bindCommitteeForm();
  }

  // ---- CSV 업로드 ----
  function renderUploadSection() {
    return `
      <div class="table-card" style="padding:18px;margin-bottom:18px;">
        <div class="section-title">CSV 일괄 업로드</div>
        <div class="form-row" style="max-width:260px;">
          <label>대상 시트</label>
          <select id="uploadTargetSheet">
            <option value="${CONFIG.SHEETS.fundMaster}">fund_master</option>
            <option value="${CONFIG.SHEETS.assetDetail}">asset_detail</option>
            <option value="${CONFIG.SHEETS.evalHistory}">eval_history</option>
            <option value="${CONFIG.SHEETS.committeeHistory}">committee_history</option>
          </select>
        </div>
        <div class="dropzone" id="dropzone">CSV 파일을 여기에 드래그하거나 클릭하여 선택하세요.<br>
          <span style="font-size:11px;">※ 선택한 시트의 헤더와 동일한 컬럼명을 사용해야 합니다. 업로드 시 기존 데이터는 전체 대체됩니다.</span>
        </div>
        <input type="file" id="uploadFileInput" accept=".csv" style="display:none;">
        <div id="uploadPreview" style="margin-top:10px;font-size:12px;color:var(--text-500);"></div>
        <div class="btn-row">
          <button class="btn btn-primary" id="uploadConfirmBtn" disabled>업로드 실행</button>
        </div>
      </div>
    `;
  }

  function bindUploadSection() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('uploadFileInput');
    const confirmBtn = document.getElementById('uploadConfirmBtn');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const rows = Utils.parseCSV(reader.result);
        pendingUpload = { sheetName: document.getElementById('uploadTargetSheet').value, rows };
        document.getElementById('uploadPreview').textContent =
          `${file.name} · ${rows.length}개 행 확인됨. "업로드 실행"을 누르면 기존 데이터가 대체됩니다.`;
        confirmBtn.disabled = false;
      };
      reader.readAsText(file, 'UTF-8');
    }

    confirmBtn.addEventListener('click', async () => {
      if (!pendingUpload) return;
      confirmBtn.disabled = true; confirmBtn.textContent = '업로드 중…';
      try {
        const res = await Api.bulkUpload(pendingUpload.sheetName, pendingUpload.rows);
        App.showToast(`${res.sheetName} 시트에 ${res.rowsWritten}개 행이 반영되었습니다.`, 'success');
        pendingUpload = null;
        document.getElementById('uploadPreview').textContent = '';
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        confirmBtn.disabled = false; confirmBtn.textContent = '업로드 실행';
      }
    });
  }

  // ---- 평가방법 관리 ----
  function renderMethodSection() {
    const funds = state.data.fundMaster.filter(f => f.eval_status === '대체평가');
    return `
      <div class="table-card" style="padding:18px;margin-bottom:18px;">
        <div class="section-title">대체평가 방법 관리 (${funds.length}개 펀드)</div>
        <table class="fund-table">
          <thead><tr><th>펀드코드</th><th>펀드명</th><th>대체평가근거</th><th>대체평가방법</th><th></th></tr></thead>
          <tbody>
            ${funds.map(f => `
              <tr>
                <td class="mono">${Utils.escapeHtml(f.fund_code)}</td>
                <td class="fund-name">${Utils.escapeHtml(f.fund_name)}</td>
                <td><input class="method-reason-input" data-code="${Utils.escapeHtml(f.fund_code)}" value="${Utils.escapeHtml(f.alt_reason || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;"></td>
                <td><input class="method-input" data-code="${Utils.escapeHtml(f.fund_code)}" value="${Utils.escapeHtml(f.alt_method || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:5px 7px;"></td>
                <td><button class="btn btn-secondary method-save-btn" data-code="${Utils.escapeHtml(f.fund_code)}" style="padding:5px 10px;">저장</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function bindMethodSection() {
    document.querySelectorAll('.method-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.dataset.code;
        const reason = document.querySelector(`.method-reason-input[data-code="${CSS.escape(code)}"]`).value;
        const method = document.querySelector(`.method-input[data-code="${CSS.escape(code)}"]`).value;
        btn.disabled = true; btn.textContent = '저장 중…';
        try {
          await Api.updateFund(code, { alt_reason: reason, alt_method: method });
          App.showToast(`${code} 평가방법이 저장되었습니다.`, 'success');
          await App.reloadData();
        } catch (err) {
          App.showToast(err.message, 'error');
        } finally {
          btn.disabled = false; btn.textContent = '저장';
        }
      });
    });
  }

  // ---- 평가이력 입력 ----
  // 평가기준일(eval_base_date)의 의미: 외부평가=감평보고서 상 평가기준일, 대체평가=대체평가 의결일,
  // 부실/특정이벤트로 인한 위원회 개최=위원회 의결일
  function renderEvalHistoryForm() {
    const funds = state.data.fundMaster;
    const options = funds.map(f => `<option value="${Utils.escapeHtml(f.fund_code)}">${Utils.escapeHtml(f.fund_code)} · ${Utils.escapeHtml(f.fund_name)}</option>`).join('');
    return `
      <div class="table-card" style="padding:18px;">
        <div class="section-title">평가이력 입력</div>
        <form id="evalHistoryForm">
          <div class="detail-grid">
            <div class="form-row full"><label>펀드</label><select name="fund_code">${options}</select></div>
            <div class="form-row full"><label>자산명</label><input name="asset_name" required></div>
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
          <div class="btn-row"><button type="submit" class="btn btn-primary">이력 추가</button></div>
        </form>
      </div>
    `;
  }

  function bindEvalHistoryForm() {
    const form = document.getElementById('evalHistoryForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '저장 중…';
      const fd = new FormData(form);
      const row = Object.fromEntries(fd.entries());
      try {
        await Api.addEvalHistory(row);
        App.showToast('평가이력이 추가되었습니다.', 'success');
        form.reset();
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '이력 추가';
      }
    });
  }

  // ---- 위원회 개최 이력 입력 ----
  // 부실분류는 반드시 평가위원회 의결을 통해서만 이루어지므로, 부실분류 여부/단계는 이 폼에서만 입력한다.
  // (단, 실제 펀드/자산의 부실분류 필드 반영은 다른 항목과 동일하게 항상 자산 대시보드에서 수행한다.)
  function renderCommitteeForm() {
    const funds = state.data.fundMaster;
    const datalistOptions = funds.map(f => `<option value="${Utils.escapeHtml(f.fund_code)}">${Utils.escapeHtml(f.fund_name)}</option>`).join('');
    const impairOptions = (CONFIG.IMPAIR_LEVELS || []).filter(l => l !== '정상')
      .map(l => `<option value="${l}">${l}</option>`).join('');
    return `
      <div class="table-card" style="padding:18px;margin-top:18px;">
        <div class="section-title">집합투자재산평가위원회 개최이력 입력</div>
        <form id="committeeForm">
          <div class="detail-grid">
            <div class="form-row"><label>회차</label><input name="session_no" placeholder="예: 2026년 제3차"></div>
            <div class="form-row"><label>개최일</label><input type="date" name="meeting_date" required></div>
            <div class="form-row full"><label>안건</label><textarea name="agenda" placeholder="예: 대체평가 대상 펀드 적용기간 연장 건"></textarea></div>
            <div class="form-row full">
              <label>대상 펀드 (펀드코드, 콤마로 여러 개 구분)</label>
              <input name="target_funds" list="fundCodeDatalist" placeholder="예: 100150, 100181">
              <datalist id="fundCodeDatalist">${datalistOptions}</datalist>
            </div>
            <div class="form-row full"><label>대상 자산 (선택, 콤마로 여러 개 구분)</label><input name="target_assets" placeholder="자산명 또는 - "></div>
            <div class="form-row full"><label>의결내용</label><textarea name="resolution" placeholder="예: 원안 가결"></textarea></div>
            <div class="form-row"><label>부실분류 여부</label>
              <select name="impair_yn" id="committeeImpairYn">
                <option value="N">N (해당없음)</option>
                <option value="Y">Y (부실분류 의결)</option>
              </select>
            </div>
            <div class="form-row" id="committeeImpairLevelRow" style="display:none;">
              <label>부실단계</label>
              <select name="impair_level">${impairOptions}</select>
            </div>
            <div class="form-row"><label>대시보드 반영여부</label>
              <select name="reflected">
                <option value="N">N (반영 확인필요)</option>
                <option value="Y">Y (반영완료)</option>
              </select>
            </div>
            <div class="form-row full"><label>참석위원</label><input name="attendees"></div>
            <div class="form-row full"><label>비고</label><textarea name="remark"></textarea></div>
          </div>
          <div class="btn-row"><button type="submit" class="btn btn-primary">위원회 이력 추가</button></div>
        </form>
      </div>
    `;
  }

  function bindCommitteeForm() {
    const form = document.getElementById('committeeForm');
    if (!form) return;

    const impairYnSelect = document.getElementById('committeeImpairYn');
    const impairLevelRow = document.getElementById('committeeImpairLevelRow');
    if (impairYnSelect) {
      impairYnSelect.addEventListener('change', () => {
        impairLevelRow.style.display = impairYnSelect.value === 'Y' ? '' : 'none';
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '저장 중…';
      const fd = new FormData(form);
      const row = Object.fromEntries(fd.entries());
      if (row.impair_yn !== 'Y') row.impair_level = '';
      try {
        await Api.addCommitteeHistory(row);
        App.showToast('위원회 개최이력이 추가되었습니다.', 'success');
        form.reset();
        await App.reloadData();
      } catch (err) {
        App.showToast(err.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '위원회 이력 추가';
      }
    });
  }

  return { init, applyAdminUI, renderAdminView };
})();
