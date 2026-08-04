/**
 * 앱 부트스트랩 및 전역 오케스트레이션
 */
window.App = (() => {
  const state = {
    data: { fundMaster: [], assetDetail: [], evalHistory: [], committeeHistory: [], config: {} },
    filterStatus: 'ALL',
    searchText: '',
    sortKey: null,
    sortDir: 'asc',
    selectedFundCode: null,
    isAdmin: false,
    currentView: 'dashboard'
  };

  let toastTimer = null;

  // 오늘 날짜(클라이언트 시각 기준) - 시트 데이터와 무관하게 항상 표시
  function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function showToast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3200);
  }

  function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(sec => {
      sec.style.display = (sec.id === `view-${view}`) ? '' : 'none';
    });
    if (view === 'history') History.render();
    if (view === 'committee') CommitteeView.render();
    if (view === 'admin' && state.isAdmin) Admin.renderAdminView();
  }

  function openPanel(fundCode) {
    Panel.open(fundCode);
  }

  async function reloadData(force = true) {
    const data = await Api.loadAll(force);
    state.data = data;
    document.getElementById('baseDateLine').textContent = `기준일 ${Utils.formatDate(data.config.base_date)}`;
    document.getElementById('lastSyncLine').textContent = `마지막 동기화 ${new Date().toLocaleTimeString('ko-KR')}`;
    const baseDateBadge = document.getElementById('baseDateBadge');
    if (baseDateBadge) baseDateBadge.textContent = `기준일 ${Utils.formatDate(data.config.base_date)}`;
    Dashboard.render();
    if (state.currentView === 'history') History.render();
    if (state.currentView === 'committee') CommitteeView.render();
    if (state.currentView === 'admin' && state.isAdmin) Admin.renderAdminView();
    return data;
  }

  async function init() {
    Dashboard.init(state);
    Panel.init(state);
    History.init(state);
    CommitteeView.init(state);
    Admin.init(state);

    const todayBadge = document.getElementById('todayBadge');
    if (todayBadge) todayBadge.textContent = `오늘 ${Utils.formatDate(todayStr())}`;

    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.getElementById('refreshBtn').addEventListener('click', () => reloadData(true));
    document.getElementById('refreshBtn2').addEventListener('click', () => reloadData(true));
    document.getElementById('refreshBtn3').addEventListener('click', () => reloadData(true));

    try {
      await reloadData(false);
    } catch (err) {
      document.getElementById('fundTableBody').innerHTML =
        `<tr><td colspan="13" class="empty-state">데이터를 불러오지 못했습니다: ${Utils.escapeHtml(err.message)}<br>js/config.js의 SPREADSHEET_ID 설정을 확인하세요.</td></tr>`;
      showToast('데이터 로드 실패: ' + err.message, 'error');
    }
  }

  return { init, switchView, openPanel, reloadData, showToast, state };
})();

document.addEventListener('DOMContentLoaded', App.init);
