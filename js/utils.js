/**
 * 공통 유틸리티: CSV 파싱, 날짜 계산, 숫자/통화 포맷, 평가상태 배지
 */
window.Utils = (() => {

  // ---- CSV 파싱 (따옴표/콤마 포함 셀 대응) ----
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    // BOM 제거
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\r') { /* skip */ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else { field += c; }
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.some(v => v !== ''))
      .map(r => {
        const obj = {};
        header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
        return obj;
      });
  }

  // ---- 날짜 ----
  function parseDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function today() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function diffDays(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return null;
    const ms = d.getTime() - today().getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  function formatDate(str) {
    const d = parseDate(str);
    if (!d) return '-';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  function ddayLabel(str) {
    const diff = diffDays(str);
    if (diff === null) return '-';
    if (diff === 0) return 'D-DAY';
    return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
  }

  // 평가적용종료일 등 "기준일 + 1년" 계산용 (같은 달/일, 연도만 +1)
  function addOneYear(str) {
    const d = parseDate(str);
    if (!d) return '';
    const nd = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    const pad = n => String(n).padStart(2, '0');
    return `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}`;
  }

  // ---- 숫자/통화 ----
  // 시트에서 오는 숫자는 천단위 콤마(,)가 포함된 문자열일 수 있어 Number()가 바로 NaN이 됨 → 콤마 제거 후 변환
  function toNumber(v) {
    if (v === null || v === undefined) return NaN;
    const s = String(v).replace(/,/g, '').trim();
    if (s === '') return NaN;
    return Number(s);
  }

  function formatNumber(v) {
    const n = toNumber(v);
    if (!v || isNaN(n)) return '-';
    return n.toLocaleString('ko-KR');
  }

  function formatKRW(v) {
    const n = toNumber(v);
    if (!v || isNaN(n) || n === 0) return '-';
    const eok = n / 100000000;
    if (Math.abs(eok) >= 1) {
      return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
    }
    return `${n.toLocaleString('ko-KR')}원`;
  }

  // ---- 평가상태 배지 ----
  function statusBadge(status) {
    const meta = CONFIG.EVAL_STATUS[status] || { color: '#6b7280', bg: '#f1f2f4', label: status || '미분류' };
    return `<span class="badge" style="color:${meta.color};background:${meta.bg};border:1px solid ${meta.color}33;">${meta.label}</span>`;
  }

  // ---- 반영의무 자동 계산 (외부평가가 > 장부가×115% OR 외부평가가 < 장부가) ----
  function calcReflectRequired(appraisalAmount, bookValueAtEval) {
    const a = toNumber(appraisalAmount);
    const b = toNumber(bookValueAtEval);
    if (!appraisalAmount || !bookValueAtEval || isNaN(a) || isNaN(b) || b === 0) return '확인필요';
    return (a > b * 1.15 || a < b) ? 'Y' : 'N';
  }

  // ---- 평가이력 장부가 반영여부 배지 (Y=반영, N=미반영, 공란=확인필요) ----
  function bookReflectedBadge(val) {
    const v = (val || '').trim().toUpperCase();
    if (v === 'Y') return `<span class="reflect-flag Y">장부가 반영</span>`;
    if (v === 'N') return `<span class="reflect-flag N">장부가 미반영</span>`;
    return `<span class="reflect-flag unknown">확인필요</span>`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  return {
    parseCSV, parseDate, today, diffDays, formatDate, ddayLabel, addOneYear,
    formatNumber, formatKRW, statusBadge, calcReflectRequired, bookReflectedBadge,
    escapeHtml, debounce, toNumber
  };
})();
