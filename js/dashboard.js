/**
 * 대시보드 뷰: KPI, D-Day 배너, 펀드 테이블, 검색/필터
 */
window.Dashboard = (() => {
  let state = null; // { data, filterStatus, searchText }
  let hscrollSync = null;

  function init(appState) {
    state = appState;
    document.getElementById('searchInput').addEventListener('input', Utils.debounce(e => {
      state.searchText = e.target.value.trim();
      render();
    }, 150));

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filterStatus = chip.dataset.filter;
        render();
      });
    });

    document.getElementById('fundTableBody').addEventListener('click', e => {
      const tr = e.target.closest('tr[data-fund-code]');
      if (!tr) return;
      App.openPanel(tr.dataset.fundCode);
    });

    document.querySelectorAll('.fund-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        render();
      });
    });

    bindHScroll();

    document.getElementById('exportBtn').addEventListener('click', exportCsv);
  }

  // 현재 화면(검색/필터/정렬 적용된 상태)에 보이는 자산 목록을 CSV로 내려받는다.
  // Excel에서 바로 열 수 있도록 UTF-8 BOM을 붙이고, 금액은 콤마 없는 순수 숫자로 내보낸다.
  function exportCsv() {
    const list = getFilteredAssetRows();
    const headers = [
      '펀드코드', '펀드명', '자산명', '자산종류', '시장성/비시장성', '평가규칙', '평가근거',
      '평가상태', '장부가', '평가액', '직전평가시행일', '평가적용종료일', '부실분류'
    ];

    const rows = list.map(({ asset: a, fund }) => {
      const diff = Utils.diffDays(a.last_eval_date);
      const evalRecency = (diff !== null && diff >= -365) ? 'Y' : 'N';
      const bookValue = Utils.toNumber(a.book_value);
      const evalAmount = Utils.toNumber(a.eval_amount);
      return [
        a.fund_code || '',
        fund ? fund.fund_name : '',
        a.asset_name || '',
        a.asset_type || '',
        a.listed || '',
        a.eval_status || '',
        a.alt_reason || '',
        evalRecency,
        isNaN(bookValue) ? '' : bookValue,
        isNaN(evalAmount) ? '' : evalAmount,
        a.prev_dt || '',
        a.apply_end || '',
        a.impair || ''
      ];
    });

    const csvEscape = v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const filename = `자산평가현황_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.csv`;

    const BOM = '﻿'; // Excel에서 한글이 깨지지 않도록 UTF-8 BOM 추가
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- 항상 보이는 커스텀 가로 스크롤바 (테이블 아래 별도 바) ----
  // 일부 OS/브라우저(맥 트랙패드 등)는 overflow-x:auto의 네이티브 스크롤바를
  // 스크롤 중에만 잠깐 보여주므로, 클릭/드래그 가능한 자체 스크롤바를 항상 표시한다.
  function bindHScroll() {
    const card = document.getElementById('tableCard');
    const track = document.getElementById('hscrollTrack');
    const thumb = document.getElementById('hscrollThumb');
    if (!card || !track || !thumb) return;

    let dragging = false;
    let dragStartX = 0;
    let dragStartLeft = 0;

    function syncFromScroll() {
      const scrollW = card.scrollWidth;
      const clientW = card.clientWidth;
      const trackW = track.clientWidth;
      if (scrollW <= clientW || trackW <= 0) {
        thumb.style.width = '100%';
        thumb.style.left = '0';
        return;
      }
      const thumbW = Math.max(36, (clientW / scrollW) * trackW);
      const maxThumbLeft = trackW - thumbW;
      const maxScrollLeft = scrollW - clientW;
      const ratio = maxScrollLeft > 0 ? (card.scrollLeft / maxScrollLeft) : 0;
      thumb.style.width = `${thumbW}px`;
      thumb.style.left = `${ratio * maxThumbLeft}px`;
    }

    function scrollToRatioFromThumbLeft(thumbLeft) {
      const trackW = track.clientWidth;
      const thumbW = thumb.offsetWidth;
      const maxThumbLeft = Math.max(0, trackW - thumbW);
      const clamped = Math.max(0, Math.min(maxThumbLeft, thumbLeft));
      const ratio = maxThumbLeft > 0 ? (clamped / maxThumbLeft) : 0;
      card.scrollLeft = ratio * (card.scrollWidth - card.clientWidth);
    }

    card.addEventListener('scroll', syncFromScroll);
    window.addEventListener('resize', syncFromScroll);

    thumb.addEventListener('mousedown', e => {
      dragging = true;
      dragStartX = e.clientX;
      dragStartLeft = thumb.offsetLeft;
      thumb.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      scrollToRatioFromThumbLeft(dragStartLeft + (e.clientX - dragStartX));
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('dragging');
    });

    track.addEventListener('click', e => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      scrollToRatioFromThumbLeft((e.clientX - rect.left) - thumb.offsetWidth / 2);
    });

    syncFromScroll();
    hscrollSync = syncFromScroll;
  }

  // 컬럼 정렬용 값 추출기 (컬럼별로 비교 가능한 값을 반환)
  const SORT_ACCESSORS = {
    fund_code: ({ asset }) => asset.fund_code || '',
    fund_name: ({ fund }) => (fund ? fund.fund_name : ''),
    asset_name: ({ asset }) => asset.asset_name || '',
    asset_type: ({ asset }) => asset.asset_type || '',
    listed: ({ asset }) => asset.listed || '',
    eval_status: ({ asset }) => asset.eval_status || '',
    alt_reason: ({ asset }) => asset.alt_reason || '',
    eval_recency: ({ asset }) => {
      const d = Utils.diffDays(asset.last_eval_date);
      return d === null ? -Infinity : d;
    },
    book_value: ({ asset }) => {
      const n = Utils.toNumber(asset.book_value);
      return isNaN(n) ? -Infinity : n;
    },
    eval_amount: ({ asset }) => {
      const n = Utils.toNumber(asset.eval_amount);
      return isNaN(n) ? -Infinity : n;
    },
    prev_dt: ({ asset }) => {
      const d = Utils.parseDate(asset.prev_dt);
      return d ? d.getTime() : -Infinity;
    },
    apply_end: ({ asset }) => {
      const d = Utils.parseDate(asset.apply_end);
      return d ? d.getTime() : -Infinity;
    },
    impair: ({ asset }) => asset.impair || ''
  };

  function compareValues(v1, v2) {
    if (typeof v1 === 'number' && typeof v2 === 'number') return v1 - v2;
    return String(v1).localeCompare(String(v2), 'ko');
  }

  function sortRows(rows) {
    const { sortKey, sortDir } = state;
    const accessor = SORT_ACCESSORS[sortKey];
    if (!sortKey || !accessor) return rows;
    const sorted = [...rows].sort((r1, r2) => compareValues(accessor(r1), accessor(r2)));
    if (sortDir === 'desc') sorted.reverse();
    return sorted;
  }

  function updateSortIndicators() {
    document.querySelectorAll('.fund-table thead th[data-sort]').forEach(th => {
      const arrow = th.querySelector('.sort-arrow');
      if (!arrow) return;
      arrow.textContent = (th.dataset.sort === state.sortKey)
        ? (state.sortDir === 'asc' ? '▲' : '▼')
        : '';
    });
  }

  // 펀드 x 보유자산을 평평하게 펼친 목록 (자산 단위로 평가규칙/상태/금액/종료일/부실분류를 한눈에 보기 위함)
  function getAssetRows() {
    const { fundMaster, assetDetail } = state.data;
    return (assetDetail || []).map(a => {
      const fund = fundMaster.find(f => f.fund_code === a.fund_code);
      return { asset: a, fund };
    });
  }

  function getFilteredAssetRows() {
    const rows = getAssetRows();
    const status = state.filterStatus || 'ALL';
    const q = (state.searchText || '').toLowerCase();

    const filtered = rows.filter(({ asset, fund }) => {
      if (status !== 'ALL' && asset.eval_status !== status) return false;
      if (q) {
        const hay = `${asset.fund_code} ${fund ? fund.fund_name : ''} ${fund ? fund.team : ''} ${asset.asset_name} ${asset.asset_type || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return sortRows(filtered);
  }

  function renderKPIs() {
    const { fundMaster, assetDetail } = state.data;
    const total = fundMaster.length;
    const assets = assetDetail || [];
    const unlistedCount = assets.filter(a => a.listed === '비시장성').length;
    const extCount = assets.filter(a => a.eval_status === '외부평가 대상').length;

    const warnDays = CONFIG.DDAY_WARNING_DAYS;
    const nearDeadline = assets.filter(a => {
      const d = Utils.diffDays(a.apply_end);
      return d !== null && d <= warnDays;
    }).length;

    const cards = [
      { label: '전체 펀드', value: total, unit: '개', accent: 'var(--blue)', foot: '관리 대상 전체 펀드 수' },
      { label: '비시장성 자산개수', value: unlistedCount, unit: '개', accent: 'var(--green)', foot: '시장성 없는 보유자산 수' },
      { label: '외부평가 대상 자산', value: extCount, unit: '개', accent: 'var(--orange)', foot: '외부 전문기관 평가 필요' },
      { label: '기한임박 자산', value: nearDeadline, unit: '개', accent: nearDeadline > 0 ? 'var(--red)' : 'var(--gray)', foot: `적용종료 D-${warnDays} 이내` }
    ];

    document.getElementById('kpiRow').innerHTML = cards.map(c => `
      <div class="kpi-card" style="--kpi-accent:${c.accent}">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.value}<span class="unit">${c.unit}</span></div>
        <div class="kpi-foot">${c.foot}</div>
      </div>
    `).join('');
  }

  // 평가상태(Y/N): last_eval_date가 1년 전을 초과하지 않았으면 Y, 초과했거나 값이 없으면 N (N은 강조 표시)
  function recentEvalBadge(lastEvalDate) {
    const diff = Utils.diffDays(lastEvalDate); // (날짜 - 오늘), 과거면 음수
    const isRecent = diff !== null && diff >= -365;
    return isRecent
      ? `<span class="reflect-flag Y">Y</span>`
      : `<span class="reflect-flag N">N</span>`;
  }

  function renderTable() {
    const list = getFilteredAssetRows();
    document.getElementById('resultCount').textContent = `${list.length}개 자산`;

    if (!list.length) {
      document.getElementById('fundTableBody').innerHTML =
        `<tr><td colspan="13" class="empty-state">조건에 맞는 자산이 없습니다.</td></tr>`;
      return;
    }

    document.getElementById('fundTableBody').innerHTML = list.map(({ asset: a, fund }) => {
      return `
        <tr data-fund-code="${Utils.escapeHtml(a.fund_code)}">
          <td class="mono">${Utils.escapeHtml(a.fund_code)}</td>
          <td class="fund-name">${Utils.escapeHtml(fund ? fund.fund_name : '(펀드정보 없음)')}</td>
          <td>${Utils.escapeHtml(a.asset_name)}</td>
          <td>${Utils.escapeHtml(a.asset_type || '-')}</td>
          <td>${Utils.escapeHtml(a.listed || '-')}</td>
          <td>${Utils.statusBadge(a.eval_status)}</td>
          <td>${Utils.escapeHtml(a.alt_reason || '-')}</td>
          <td>${recentEvalBadge(a.last_eval_date)}</td>
          <td class="mono">${Utils.formatKRW(a.book_value)}</td>
          <td class="mono">${Utils.formatKRW(a.eval_amount)}</td>
          <td class="mono">${Utils.formatDate(a.prev_dt)}</td>
          <td class="mono">${Utils.formatDate(a.apply_end)}</td>
          <td>${Utils.escapeHtml(a.impair || '-')}</td>
        </tr>
      `;
    }).join('');

    // 선택된 펀드 하이라이트
    if (state.selectedFundCode) {
      document.querySelectorAll(`tr[data-fund-code="${CSS.escape(state.selectedFundCode)}"]`)
        .forEach(row => row.classList.add('selected'));
    }
  }

  function render() {
    renderKPIs();
    renderTable();
    updateSortIndicators();
    if (hscrollSync) hscrollSync();
  }

  return { init, render };
})();
