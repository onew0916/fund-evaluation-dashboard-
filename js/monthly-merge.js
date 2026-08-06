/**
 * 월간 데이터 반영 로직 (scripts/monthly_update.py의 JS 포팅)
 *
 * 관리자 모드에서 이번 달 펀드현황(펀드정보3)/자산현황(명세부) xlsx를 업로드하면
 * 현재 fund_master/asset_detail(state.data)과 비교해 변경/신규/제외 내역을 계산하고,
 * 검토 후 확정하면 Api.bulkUpload로 실제 시트에 반영한다.
 *
 * 자세한 규칙 설명은 '월간_데이터반영_절차.md' 참고. Python 스크립트와 로직을 반드시
 * 동일하게 유지해야 한다 (두 곳에서 각자 수정하다 결과가 달라지지 않도록 주의).
 */
window.MonthlyMerge = (() => {
  const EXCLUDE_ASSET_TYPES = new Set([
    '현금', '외화현금', '기타자산', 'REPO', '외화선도-외화매도', '외화선도-외화매수',
    '이연자산', '외화이연자산', '차입금', '외화차입금', '임대'
  ]);
  const ALWAYS_NONMARKET_STRICT = new Set(['대여금', '외화대여금', '부동산']);
  const ALWAYS_NONMARKET_IF_BLANK = new Set(['집합증권', '외화수익증권']);

  const REAL_ESTATE_SUFFIX = /\s*\((토지|건물|건설가계정)\).*$/;
  const DATE_SUFFIX = /\s+\d{6,8}$/;

  // 활성 외부평가가 진행중이라 자동 재분류에서 제외할 (펀드코드, 자산명). 매월 필요시 추가.
  const SKIP_RECLASSIFY = new Set(['341018|||이천 송온리 물류2센터']);

  function normalizeName(name) {
    let n = (name || '').trim();
    n = n.replace(REAL_ESTATE_SUFFIX, '');
    n = n.replace(DATE_SUFFIX, '');
    return n.trim();
  }

  // 소스 xlsx의 날짜 셀은 텍스트("2019-10-31")로 들어있으므로 문자열 그대로 검증만 한다.
  function parseDateStr(v) {
    if (!v) return '';
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  // 값 비교용 정규화: 숫자는 콤마/타입 표현 차이를 무시하고, 그 외는 문자열로 비교.
  function normVal(v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    const noComma = s.replace(/,/g, '');
    if (noComma !== '' && !isNaN(Number(noComma))) {
      return Number(noComma).toFixed(2);
    }
    return s;
  }

  function sheetRows(workbook, sheetName) {
    const ws = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  }

  // ---------------- 펀드정보3 파싱 ----------------
  // C=fund_code, E=fund_name(전칭), O=inception_date, R=maturity_date, Y=initial_commitment,
  // Z=NAV, AK=종류형구분(일반펀드/운용펀드만 포함, 클래스펀드 제외), BX=team, CA=사모펀드유형
  function parseFundStatusWorkbook(workbook) {
    const rows = sheetRows(workbook, '펀드정보3');
    const source = {};
    let skippedClassFunds = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row[2] || '').trim();
      if (!code) continue;

      const fundKind = String(row[36] || '').trim();
      if (fundKind !== '일반펀드' && fundKind !== '운용펀드') {
        skippedClassFunds++;
        continue;
      }

      const peType = String(row[78] || '');
      let investorType = '';
      if (peType.includes('전문투자자')) investorType = '전문투자자';
      else if (peType.includes('일반투자자')) investorType = '일반투자자';
      else if (peType.includes('기관전용')) investorType = '전문투자자';

      source[code] = {
        fund_name: String(row[4] || '').trim(),
        team: String(row[75] || '').trim(),
        inception_date: parseDateStr(row[14]),
        maturity_date: parseDateStr(row[17]),
        investor_type: investorType,
        initial_commitment: row[24],
        NAV: row[25],
      };
    }
    return { source, skippedClassFunds };
  }

  // ---------------- 명세부 파싱 ----------------
  // C=asset_type, D=fund_code, L=asset_name(원본), S=book_value, AA=acq_date(발행일)
  function parseAssetStatusWorkbook(workbook, fundCodes) {
    const rows = sheetRows(workbook, '국내해외 통합명세부');
    const agg = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const at = row[2];
      if (!at || EXCLUDE_ASSET_TYPES.has(at)) continue;
      const fc = String(row[3] || '').trim();
      if (!fc || !fundCodes.has(fc)) continue;
      const rawName = String(row[11] || '').trim();
      if (!rawName) continue;
      const normName = normalizeName(rawName);
      const bookValue = Number(row[18]) || 0;
      const acqDate = parseDateStr(row[26]);

      const key = `${fc}|||${normName}`;
      if (!agg[key]) {
        agg[key] = { fundCode: fc, name: normName, asset_type: at, book_value: bookValue, acq_date: acqDate, _maxBv: bookValue };
      } else {
        const e = agg[key];
        e.book_value = (e.book_value || 0) + bookValue;
        if (acqDate && (!e.acq_date || acqDate < e.acq_date)) e.acq_date = acqDate;
        if (bookValue > e._maxBv) { e.asset_type = at; e._maxBv = bookValue; }
      }
    }
    return agg;
  }

  // ---------------- 1단계: fund_master 병합 ----------------
  // fund_name은 DB에 축약명이 들어있고 소스는 정식 전체명이라 값이 항상 다르게 나온다.
  // 기존 펀드는 표시명을 그대로 유지하고, 신규설정 펀드에만 정식 전체명을 초기값으로 쓴다.
  const FUND_FIELDS = ['team', 'inception_date', 'maturity_date', 'investor_type', 'initial_commitment', 'NAV'];

  function mergeFundMaster(source, fundMasterRows) {
    const newRows = [];
    const matched = [];
    const changes = [];
    const removedFunds = [];
    const fundCodesInDb = new Set();

    fundMasterRows.forEach(row => {
      const code = String(row.fund_code || '').trim();
      if (!code) return;
      fundCodesInDb.add(code);

      if (!source[code]) {
        removedFunds.push([code, row.fund_name || '']);
        return;
      }

      const s = source[code];
      const newRow = Object.assign({}, row);
      FUND_FIELDS.forEach(field => {
        const oldVal = row[field], newVal = s[field];
        if (normVal(oldVal) !== normVal(newVal)) changes.push([code, field, oldVal, newVal]);
        newRow[field] = newVal;
      });
      newRows.push(newRow);
      matched.push(code);
    });

    const addedFunds = Object.keys(source).filter(code => !fundCodesInDb.has(code));
    addedFunds.forEach(code => {
      const s = source[code];
      newRows.push({
        no: '', fund_code: code, fund_name: s.fund_name, team: s.team,
        inception_date: s.inception_date, maturity_date: s.maturity_date,
        investor_type: s.investor_type, initial_commitment: s.initial_commitment, NAV: s.NAV,
      });
    });

    newRows.forEach((row, i) => { row.no = i + 1; });

    const fundCodes = new Set(newRows.map(r => r.fund_code));
    return { newRows, fundCodes, matched, changes, addedFunds, removedFunds };
  }

  // ---------------- 2단계: asset_detail 병합 ----------------
  function mergeAssetDetail(agg, assetDetailRows, fundCodes) {
    const existingKeys = {};
    assetDetailRows.forEach((row, i) => {
      const fc = String(row.fund_code || '').trim();
      const an = String(row.asset_name || '').trim();
      if (!fc || !an) return;
      existingKeys[`${fc}|||${an}`] = i;
    });

    const newRows = assetDetailRows.map(row => Object.assign({}, row));
    const updated = [], added = [], changes = [];

    Object.keys(agg).forEach(key => {
      const s = agg[key];
      const fc = s.fundCode, name = s.name;

      if (key in existingKeys) {
        const row = newRows[existingKeys[key]];

        if (normVal(row.asset_type) !== normVal(s.asset_type)) {
          changes.push([fc, name, 'asset_type', row.asset_type, s.asset_type]);
        }
        row.asset_type = s.asset_type;

        if (normVal(row.book_value) !== normVal(s.book_value)) {
          changes.push([fc, name, 'book_value', row.book_value, s.book_value]);
        }
        row.book_value = s.book_value;

        if (s.acq_date && normVal(row.acq_date) !== normVal(s.acq_date)) {
          changes.push([fc, name, 'acq_date', row.acq_date, s.acq_date]);
          row.acq_date = s.acq_date;
        }

        updated.push([fc, name]);
      } else {
        newRows.push({
          fund_code: fc, asset_type: s.asset_type, listed: '', asset_name: name,
          acq_date: s.acq_date, book_value: s.book_value, eval_status: '', eval_amount: '',
          last_eval_date: '', alt_reason: '', alt_method: '', prev_dt: '', apply_end: '',
          impair: '', remark: '신규 취득자산으로 추정 - 평가상태/평가방법 등 확인 필요',
        });
        added.push([fc, name]);
      }
    });

    const missing = Object.keys(existingKeys)
      .filter(key => !(key in agg))
      .map(key => key.split('|||'));

    return { newRows, updated, added, missing, changes };
  }

  // ---------------- 3단계: eval_status 규칙 (in-place) ----------------
  function applyEvalStatusRules(newFundMaster, newAssetDetail) {
    const investor = {};
    newFundMaster.forEach(row => { investor[row.fund_code] = row.investor_type; });

    const listedReview = [];
    let altApplied = 0, navConverted = 0;

    newAssetDetail.forEach(row => {
      const fundCode = String(row.fund_code || '').trim();
      const assetName = String(row.asset_name || '').trim();
      const at = row.asset_type;
      if (!fundCode || !assetName) return;
      let curListed = (row.listed || '').trim();

      // 2-4. 시장성 구분
      if (ALWAYS_NONMARKET_STRICT.has(at)) {
        row.listed = '비시장성';
        curListed = '비시장성';
      } else if (ALWAYS_NONMARKET_IF_BLANK.has(at)) {
        if (curListed !== '시장성' && curListed !== '비시장성') {
          row.listed = '비시장성';
          curListed = '비시장성';
        }
      } else if (curListed !== '시장성' && curListed !== '비시장성') {
        listedReview.push([fundCode, assetName, at]);
      }

      // 2-5. 평가상태 결정 (§8-16조 대체평가 면제 규칙)
      if (SKIP_RECLASSIFY.has(`${fundCode}|||${assetName}`)) return;

      const curStatus = (row.eval_status || '').trim();

      // 현지NAV반영은 대체평가의 한 방법으로 통합
      if (curStatus === '현지NAV반영') {
        row.eval_status = '대체평가';
        row.alt_method = '현지NAV반영';
        if (!row.alt_reason) row.alt_reason = '현지NAV반영';
        navConverted++;
        return;
      }

      // 평가규칙(eval_status)은 한 번 반영되면 다시 계산하지 않고 그대로 유지한다.
      if (curStatus) return;
      if (curListed !== '비시장성') return;

      const reasons = [];
      if (at === '대여금' || at === '외화대여금') reasons.push('대출채권 (§8-16조④)');
      if (at === '집합증권' || at === '외화수익증권') reasons.push('집합투자증권 (§8-16조⑤)');
      if (investor[fundCode] === '전문투자자') reasons.push('전문투자자 사모 (§8-16조①)');

      if (reasons.length) {
        row.eval_status = '대체평가';
        row.alt_reason = reasons.join(', ');
        if (!row.alt_method) row.alt_method = '직전 장부가액';
        altApplied++;
      } else {
        row.eval_status = '외부평가 대상';
      }
    });

    return { listedReview, altApplied, navConverted };
  }

  // ---------------- 전체 실행 ----------------
  function run(fundWorkbook, assetWorkbook, fundMasterRows, assetDetailRows) {
    const { source, skippedClassFunds } = parseFundStatusWorkbook(fundWorkbook);
    const fm = mergeFundMaster(source, fundMasterRows);
    const agg = parseAssetStatusWorkbook(assetWorkbook, fm.fundCodes);
    const ad = mergeAssetDetail(agg, assetDetailRows, fm.fundCodes);
    const evalResult = applyEvalStatusRules(fm.newRows, ad.newRows);

    return {
      fundMaster: { newRows: fm.newRows, matched: fm.matched, changes: fm.changes, addedFunds: fm.addedFunds, removedFunds: fm.removedFunds, skippedClassFunds },
      assetDetail: { newRows: ad.newRows, updated: ad.updated, added: ad.added, missing: ad.missing, changes: ad.changes },
      evalStatus: evalResult,
    };
  }

  return { run, normVal, normalizeName, parseDateStr };
})();
