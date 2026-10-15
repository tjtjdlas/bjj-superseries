/* SPYDER BJJ SUPERSERIES — 대진표 관리자
 * 참가자 명단과 같은 행(roster_state.data)에 저장: bracketAdmin.draft(초안) → bracket(게시본)
 */
(function () {
  'use strict';

  var B = window.SPYDER_BRACKET;
  var R = window.SPYDER_BRACKET_RENDER;
  var esc = B.escapeHtml;

  var sb = null;
  var draft = B.emptyState();
  var byId = {};
  var record = { version: 0, published_at: null, history: [], published: null };
  var roster = { categories: [], athletes: [] };
  var undoStack = [];
  var dirty = false;
  var currentDivId = null;

  /* ---------- DOM ---------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var mapSelects = document.querySelectorAll('[data-map]');
  var setInputs = document.querySelectorAll('[data-set]');
  var rosterStatus = $('#rosterStatus');
  var divPreview = $('#divPreview');
  var divSelect = $('#divSelect');
  var divSearch = $('#divSearch');
  var divMatFilter = $('#divMatFilter');
  var divCount = $('#divCount');
  var divTitle = $('#divTitle');
  var divMat = $('#divMat');
  var divDuration = $('#divDuration');
  var matchTable = $('#matchTable');
  var resultTable = $('#resultTable');
  var placeTable = $('#placeTable');
  var resultHidden = $('#resultHidden');
  var entryTable = $('#entryTable');
  var entryAddPool = $('#entryAddPool');
  var divWarn = $('#divWarn');
  var previewBox = $('#previewBox');
  var publishStatus = $('#publishStatus');
  var publishStatus2 = $('#publishStatus2'); // 결과 입력 구역 아래 게시 버튼 옆 (③과 같은 내용)
  var generateStatus = $('#generateStatus');
  var historyList = $('#historyList');
  var undoBtn = $('#undoBtn');

  /* ---------- 상태 표시 ---------- */

  function setStatus(el, msg, kind) {
    if (!el) return;
    var els = (el === publishStatus && publishStatus2) ? [el, publishStatus2] : [el];
    els.forEach(function (x) {
      x.textContent = msg;
      x.classList.remove('is-dirty', 'is-ok', 'is-err');
      if (kind) x.classList.add('is-' + kind);
    });
  }

  function markDirty() {
    dirty = true;
    setStatus(publishStatus, '저장되지 않은 변경사항이 있습니다.', 'dirty');
  }

  window.addEventListener('beforeunload', function (e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- 명단 연동 ---------- */

  function renderFieldMap() {
    var fm = draft.settings.fieldMap || {};
    mapSelects.forEach(function (sel) {
      var key = sel.dataset.map;
      var opts = ['<option value="">(사용 안 함)</option>'].concat(
        roster.categories.map(function (c) {
          return '<option value="' + esc(c.key) + '"' + (fm[key] === c.key ? ' selected' : '') + '>' +
            esc(c.label) + ' (' + esc(c.key) + ')</option>';
        })
      );
      sel.innerHTML = opts.join('');
      sel.onchange = function () {
        draft.settings.fieldMap[key] = sel.value;
        markDirty();
        renderDivisionPreview();
      };
    });
  }

  function renderDivisionPreview() {
    if (!divPreview) return;
    var groups = B.groupAthletes(roster.athletes, draft.settings);
    if (!groups.length) {
      divPreview.innerHTML = '<p class="desc" style="margin:0;">등록된 참가자가 없거나 분류 항목이 지정되지 않았습니다.</p>';
      return;
    }
    var max = Number(draft.settings.maxPoolSize) || 16;
    divPreview.innerHTML = groups.map(function (g) {
      var n = g.entries.length;
      var pools = Math.max(1, Math.ceil(n / Math.max(2, max)));
      return '<div class="div-card"><b>' + esc(B.divisionTitle(g)) + '</b>' +
        '<span>참가 ' + n + '명 · ' + pools + '개 조' + (n < 2 ? ' · <span class="warn">단독 참가</span>' : '') + '</span></div>';
    }).join('');
  }

  async function loadRoster() {
    setStatus(rosterStatus, '명단을 불러오는 중…');
    try {
      var res = await sb.from('roster_state').select('data').eq('id', 1).single();
      if (res.error) throw res.error;
      roster.categories = (res.data.data && res.data.data.categories) || [];
      roster.athletes = (res.data.data && res.data.data.athletes) || [];
      setStatus(rosterStatus, '참가자 ' + roster.athletes.length + '명 · 분류 항목 ' + roster.categories.length + '개 연동됨', 'ok');
      renderFieldMap();
      renderDivisionPreview();
    } catch (e) {
      setStatus(rosterStatus, '명단 불러오기 실패: ' + e.message, 'err');
    }
  }

  /* ---------- 설정 ---------- */

  function renderSettings() {
    setInputs.forEach(function (el) {
      var key = el.dataset.set;
      var v = draft.settings[key];
      if (key === 'avoidSameTeam') el.value = v ? '1' : '0';
      else el.value = v == null ? '' : v;
      el.onchange = function () {
        if (key === 'avoidSameTeam') draft.settings[key] = el.value === '1';
        else if (el.type === 'number') draft.settings[key] = Number(el.value) || 0;
        else draft.settings[key] = el.value;
        markDirty();
        renderDivisionPreview();
      };
    });
  }

  /* ---------- 대진 생성 ---------- */

  function pushUndo(label) {
    undoStack.push({ label: label, state: B.clone(draft), at: new Date().toISOString() });
    if (undoStack.length > 10) undoStack.shift();
    if (undoBtn) undoBtn.disabled = false;
  }

  function hasResults() {
    var found = false;
    draft.divisions.forEach(function (d) {
      B.allMatches(d).forEach(function (m) { if (m.winner) found = true; });
    });
    return found;
  }

  function generate() {
    if (!roster.athletes.length) {
      alert('연동된 참가자 명단이 비어 있습니다. 먼저 [선수 명단 관리]에서 참가자를 등록하세요.');
      return;
    }
    if (draft.divisions.length) {
      var warn = '현재 초안의 모든 부문 대진을 새로 만듭니다.';
      if (hasResults()) warn += '\n\n⚠ 이미 입력된 경기 결과가 모두 사라집니다.';
      warn += '\n\n직전 초안은 자동 백업되어 [직전 초안 복원]으로 되돌릴 수 있습니다.\n계속할까요?';
      if (!confirm(warn)) return;
      pushUndo('전체 재생성 직전');
    }
    markStructural();
    draft = B.generate(roster.athletes, draft.settings);
    byId = B.indexMatches(draft);
    currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
    markDirty();
    renderAll();
    var total = draft.divisions.reduce(function (acc, d) {
      return acc + B.allMatches(d).filter(function (m) { return !B.isSkippedMatch(m, byId); }).length;
    }, 0);
    var conflicts = draft.divisions.filter(function (d) { return d.conflicts && d.conflicts.length; });
    setStatus(generateStatus,
      '부문 ' + draft.divisions.length + '개 · 실제 경기 ' + total + '경기 생성 완료.' +
      (conflicts.length ? ' ⚠ 같은 소속팀 1회전 회피 실패 부문 ' + conflicts.length + '개 (부문 태그에 표시)' : ''),
      conflicts.length ? 'dirty' : 'ok');
  }

  function reschedule() {
    if (!draft.divisions.length) return;
    pushUndo('번호·시간 재계산 직전');
    B.scheduleAll(draft);
    byId = B.indexMatches(draft);
    markDirty();
    renderMatchTable();
    setStatus(generateStatus, '경기번호·매트·예상 시간을 다시 계산했습니다.', 'ok');
  }

  function undo() {
    if (!undoStack.length) return;
    var last = undoStack.pop();
    markStructural();
    draft = last.state;
    byId = B.indexMatches(draft);
    if (!undoStack.length && undoBtn) undoBtn.disabled = true;
    markDirty();
    renderAll();
    setStatus(generateStatus, '"' + last.label + '" 상태로 복원했습니다.', 'ok');
  }

  /* ---------- 엑셀 대진 가져오기 ----------
   * 대진표 엑셀 첨부(대진 시트 양식)와 셀 범위 붙여넣기(행 양식)는 운영에 꼭 필요한 기능이다.
   * 화면 배치를 바꾸더라도 이 기능을 없애거나 읽는 방식을 바꾸지 말 것.
   */

  var IMP = window.SPYDER_BRACKET_IMPORT;
  var IMPM = window.SPYDER_BRACKET_IMPORT_MAT; // 매트별 대진표 엑셀(1매트 … 시트)
  var lastImport = null;

  // 검증 결과를 그리고 결과 위치로 화면을 옮긴다(결과 아래에 [초안에 반영] 버튼이 있음)
  function showImportResult(res) {
    renderImportResult(res);
    var box = $('#importResult');
    if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderImportHint() {
    var el = $('#importHint');
    if (el && IMP) el.textContent = '열 순서: ' + IMP.headerLine();
  }

  function downloadTemplate() {
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
    XLSX.writeFile(IMP.buildTemplateWorkbook(XLSX), '대진표_업로드_양식.xlsx');
  }

  // 행 양식은 "N행", 대진 시트 양식은 "시트 셀" 위치를 보여 준다
  function issuePlace(e) {
    if (e.where) return e.where;
    return e.row ? e.row + '행' : '-';
  }

  function issueTable(list, kind) {
    if (!list.length) return '';
    var shown = list.slice(0, 200);
    var bySheet = list.some(function (e) { return e.where; });
    var rows = shown.map(function (e) {
      return '<tr>' +
        '<td class="c-row">' + esc(issuePlace(e)) + '</td>' +
        '<td class="c-col">' + esc(e.column) + '</td>' +
        '<td>' + esc(e.value || '(비어 있음)') + '</td>' +
        '<td>' + esc(e.reason) + '</td>' +
        '<td>' + esc(e.fix || '') + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="issue-title is-' + kind + '">' +
        (kind === 'err' ? '오류 ' : '경고 ') + list.length + '건' +
        (list.length > shown.length ? ' (상위 ' + shown.length + '건 표시)' : '') +
      '</div>' +
      '<div class="issue-wrap"><table class="issue-table">' +
        '<thead><tr><th>' + (bySheet ? '위치' : '행') + '</th><th>' + (bySheet ? '항목' : '열') + '</th><th>입력값</th><th>사유</th><th>해결 방법</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
  }

  function statBoxes(list) {
    return '<div class="import-summary">' + list.map(function (x) {
      return '<div class="import-stat ' + (x.c || '') + '"><b>' + x.n + '</b><span>' + x.l + '</span></div>';
    }).join('') + '</div>';
  }

  // 대진 시트 양식(시트별 대진도 엑셀) 검증 결과
  function renderSheetImportResult(res, box, applyBtn, errBtn) {
    var s = res.summary;
    if (!s) {
      box.innerHTML = issueTable(res.errors, 'err');
      if (applyBtn) applyBtn.disabled = true;
      if (errBtn) errBtn.disabled = !res.errors.length;
      return;
    }
    var sheetRows = (res.sheets || []).map(function (x) {
      var same = x.declared == null || x.declared === x.matches;
      return '<tr>' +
        '<td class="c-col">' + esc(x.name) + '</td>' +
        '<td>' + x.divisions + '</td>' +
        '<td>' + x.players + '</td>' +
        '<td>' + x.matches + '</td>' +
        '<td>' + (x.declared == null ? '-' : x.declared) + '</td>' +
        '<td>' + (same ? '<span style="color:#6ee7a8;">일치</span>' : '<span style="color:var(--gold);">확인 필요</span>') + '</td>' +
      '</tr>';
    }).join('');

    box.innerHTML =
      '<p class="admin-note" style="margin-top:18px;"><b>대진 시트 양식</b>으로 인식했습니다. 시트마다 그려진 대진을 그대로 읽어, 사이트에서 같은 모양의 대진표로 만듭니다.</p>' +
      statBoxes([
        { n: s.sheets, l: '시트' },
        { n: s.divisions, l: '부문', c: s.divisions ? 'is-ok' : '' },
        { n: s.players, l: '선수(연인원)' },
        { n: s.matches, l: '실제 경기' },
        { n: s.pending, l: '선수 공개 전 부문' },
        { n: s.warnings, l: '경고', c: s.warnings ? 'is-warn' : '' },
        { n: s.errors, l: '오류', c: s.errors ? 'is-err' : '' }
      ]) +
      '<div class="issue-wrap"><table class="issue-table">' +
        '<thead><tr><th>시트</th><th>부문</th><th>선수</th><th>실제 경기</th><th>엑셀 게임수</th><th>경기 수</th></tr></thead>' +
        '<tbody>' + sheetRows + '</tbody></table></div>' +
      issueTable(res.errors, 'err') +
      issueTable(res.warnings, 'warn') +
      (s.divisions
        ? '<p class="admin-note">아래 <b>[검증 결과 초안에 반영]</b>을 누르면 부문 ' + s.divisions + '개가 초안에 반영됩니다. ' +
          '경기번호·매트·시각은 엑셀에 없으므로 비워 둡니다(필요하면 "대회 당일 결과 입력"에서 입력하거나 "고급 기능"의 "경기번호·시간만 다시 계산"을 사용). ' +
          '게시 전까지 공개 화면에는 영향이 없습니다.</p>'
        : '<p class="admin-note">반영할 수 있는 부문이 없습니다.</p>');

    if (applyBtn) applyBtn.disabled = !s.divisions;
    if (errBtn) errBtn.disabled = !res.errors.length;
  }

  // 매트별 대진표(시트 1개 = 매트 1개) 검증 결과
  function renderMatImportResult(res, box, applyBtn, errBtn) {
    var s = res.summary;
    if (!s) {
      box.innerHTML = issueTable(res.errors, 'err');
      if (applyBtn) applyBtn.disabled = true;
      if (errBtn) errBtn.disabled = !res.errors.length;
      return;
    }
    var sheetRows = (res.sheets || []).map(function (x) {
      return '<tr>' +
        '<td class="c-col">' + esc(x.name) + '</td>' +
        '<td>' + x.divisions + '</td>' +
        '<td>' + (x.shared || '-') + '</td>' +
        '<td>' + x.matches + '</td>' +
        '<td>' + (x.numbered || '-') + '</td>' +
      '</tr>';
    }).join('');

    box.innerHTML =
      '<p class="admin-note" style="margin-top:18px;"><b>매트별 대진표</b>로 인식했습니다. 시트 1개가 공개 화면의 매트 탭 1개가 되고, 시트에 그려진 순서대로 보입니다.</p>' +
      statBoxes([
        { n: s.sheets, l: '매트' },
        { n: s.divisions, l: '부문', c: s.divisions ? 'is-ok' : '' },
        { n: s.shared, l: '여러 매트 부문' },
        { n: s.players, l: '선수(연인원)' },
        { n: s.matches, l: '실제 경기' },
        { n: s.numbered, l: '경기번호 반영' },
        { n: s.pending, l: '선수 공개 전 부문' },
        { n: s.warnings, l: '경고', c: s.warnings ? 'is-warn' : '' },
        { n: s.errors, l: '오류', c: s.errors ? 'is-err' : '' }
      ]) +
      '<div class="issue-wrap"><table class="issue-table">' +
        '<thead><tr><th>매트 시트</th><th>부문</th><th>여러 매트 부문</th><th>이 매트 경기</th><th>경기번호 표기</th></tr></thead>' +
        '<tbody>' + sheetRows + '</tbody></table></div>' +
      (s.noMat ? '<p class="admin-note" style="color:var(--gold);">매트를 알 수 없는 경기 ' + s.noMat + '개가 있습니다. 공개 화면에는 매트 표시 없이 나옵니다.</p>' : '') +
      issueTable(res.errors, 'err') +
      issueTable(res.warnings, 'warn') +
      (s.divisions
        ? '<p class="admin-note">아래 <b>[검증 결과 초안에 반영]</b>을 누르면 부문 ' + s.divisions + '개가 초안에 반영됩니다. ' +
          '경기번호는 엑셀에 적힌 경기("1매트 34" 등)에만 들어가고, 나머지는 비워 둡니다. 게시 전까지 공개 화면에는 영향이 없습니다.</p>'
        : '<p class="admin-note">반영할 수 있는 부문이 없습니다.</p>');

    if (applyBtn) applyBtn.disabled = !s.divisions;
    if (errBtn) errBtn.disabled = !res.errors.length;
  }

  function renderImportResult(res) {
    var box = $('#importResult');
    if (!box) return;
    var s = res.summary;
    var applyBtn = $('#importApplyBtn');
    var errBtn = $('#importErrorXlsxBtn');

    if (res.kind === 'sheet') {
      renderSheetImportResult(res, box, applyBtn, errBtn);
      return;
    }
    if (res.kind === 'mat') {
      renderMatImportResult(res, box, applyBtn, errBtn);
      return;
    }

    if (!s) {
      box.innerHTML = issueTable(res.errors, 'err');
      if (applyBtn) applyBtn.disabled = true;
      if (errBtn) errBtn.disabled = !res.errors.length;
      return;
    }

    var stats = statBoxes([
      { n: s.total, l: '전체 행' },
      { n: s.valid, l: '유효 행', c: s.valid ? 'is-ok' : '' },
      { n: s.invalid, l: '오류 행', c: s.invalid ? 'is-err' : '' },
      { n: s.warnings, l: '경고', c: s.warnings ? 'is-warn' : '' },
      { n: s.divisions, l: '부문' },
      { n: s.players, l: '선수' },
      { n: s.matches, l: '실제 경기' }
    ]);

    box.innerHTML = stats +
      issueTable(res.errors, 'err') +
      issueTable(res.warnings, 'warn') +
      (s.valid
        ? '<p class="admin-note">아래 <b>[검증 결과 초안에 반영]</b>을 누르면 유효한 ' + s.valid + '개 행으로 부문 ' + s.divisions + '개가 초안에 반영됩니다. (게시 전까지 공개 화면에는 영향 없음)</p>'
        : '<p class="admin-note">반영할 수 있는 유효한 행이 없습니다. 오류를 수정한 뒤 다시 검증해 주세요.</p>');

    if (applyBtn) applyBtn.disabled = !s.valid;
    if (errBtn) errBtn.disabled = !res.errors.length;
  }

  function runImport(rows) {
    if (!IMP) { alert('가져오기 모듈을 불러오지 못했습니다.'); return; }
    lastImport = IMP.parse(rows, draft.settings);
    showImportResult(lastImport);
  }

  function importFromPaste() {
    var ta = $('#importPaste');
    if (!ta || !ta.value.trim()) { alert('붙여넣은 데이터가 없습니다.'); return; }
    runImport(IMP.parseText(ta.value));
  }

  function importFromFile(file) {
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
        // "대진" 시트가 있으면 행 양식, 없고 시트마다 대진도가 그려져 있으면 대진 시트 양식
        var rowSheet = wb.SheetNames.filter(function (n) { return n.replace(/\s/g, '') === '대진'; })[0];
        // 시트 이름이 "1매트", "2매트" … 이면 매트별 대진표
        if (!rowSheet && IMPM && IMPM.looksLikeMatWorkbook(XLSX, wb)) {
          lastImport = IMPM.parseMatWorkbook(XLSX, wb, draft.settings);
          showImportResult(lastImport);
          return;
        }
        if (!rowSheet && IMP.looksLikeSheetWorkbook(XLSX, wb)) {
          lastImport = IMP.parseSheetWorkbook(XLSX, wb, draft.settings);
          showImportResult(lastImport);
          return;
        }
        var sheetName = rowSheet || wb.SheetNames[0];
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
        runImport(rows);
      } catch (err) {
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function applyImport() {
    if (!lastImport || !lastImport.state || !lastImport.state.divisions.length) return;
    var mode = ($('#importMode') || {}).value || 'replace';
    var incoming = B.clone(lastImport.state.divisions);

    var msg = mode === 'replace'
      ? '현재 초안의 모든 부문을 엑셀 내용(부문 ' + incoming.length + '개)으로 교체합니다.'
      : '엑셀에 있는 부문 ' + incoming.length + '개만 교체하고 나머지 부문은 그대로 둡니다.';
    if (hasResults()) msg += '\n\n⚠ 교체되는 부문에 입력된 경기 결과는 사라집니다.';
    msg += '\n\n직전 초안은 자동 백업됩니다. 계속할까요?';
    if (!confirm(msg)) return;

    pushUndo('엑셀 가져오기 직전');
    markStructural();

    if (mode === 'replace') {
      draft.divisions = incoming;
    } else {
      var titles = {};
      incoming.forEach(function (d) { titles[d.title] = true; });
      draft.divisions = draft.divisions.filter(function (d) { return !titles[d.title]; }).concat(incoming);
    }

    var byIdNew;
    if (lastImport.kind === 'sheet' || lastImport.kind === 'mat') {
      // 대진 시트 양식에는 경기번호·매트·시각이 없다. 임의 번호가 공개되지 않도록 자동 배정하지 않는다.
      // 매트별 대진표는 엑셀에서 읽은 매트·경기번호를 그대로 쓴다(자동 배정으로 덮어쓰지 않음).
      byIdNew = B.indexMatches(draft);
    } else {
      B.scheduleAll(draft);
      // 엑셀에 적힌 경기번호·매트·시각은 가져오기 시점 값이 우선
      byIdNew = B.indexMatches(draft);
      incoming.forEach(function (src) {
        B.allMatches(src).forEach(function (sm) {
          var m = byIdNew[sm.id];
          if (!m || B.isSkippedMatch(m, byIdNew)) return;
          if (sm.no) m.no = sm.no;
          if (sm.mat) m.mat = sm.mat;
          if (sm.time) m.time = sm.time;
          if (sm.duration) m.duration = sm.duration;
        });
      });
    }

    byId = byIdNew;
    currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
    markDirty();
    renderAll();
    setStatus(generateStatus,
      '엑셀 대진을 초안에 반영했습니다. 부문 ' + incoming.length + '개 · 선수 ' + lastImport.summary.players + '명. 아래 [전체 미리보기]로 확인한 뒤 ③에서 게시하세요.', 'ok');
    var step2 = $('#step2');
    if (step2) step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exportErrorRows() {
    if (!lastImport || !lastImport.errors.length) return;
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    var rows = [['위치', '항목', '입력값', '사유', '해결 방법']].concat(
      lastImport.errors.map(function (e) {
        return [issuePlace(e), e.column, e.value, e.reason, e.fix].map(safeCell);
      })
    );
    var wb = XLSX.utils.book_new();
    var sh = XLSX.utils.aoa_to_sheet(rows);
    sh['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 18 }, { wch: 42 }, { wch: 46 }];
    XLSX.utils.book_append_sheet(wb, sh, '오류');
    XLSX.writeFile(wb, '대진표_업로드_오류.xlsx');
  }

  /* ---------- 부문 편집 ---------- */

  // 찾기 조건에 맞는 부문이 없으면 null (보이지 않는 부문을 실수로 지우거나 고치지 않도록)
  function currentDivision() {
    return draft.divisions.filter(function (d) { return d.id === currentDivId; })[0] || null;
  }

  // 부문 찾기: 매트(시트) + 부문·선수·소속 검색으로 부문 선택 목록을 좁힌다
  function compact(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }

  function divGroups(d) {
    if (d.sheets && d.sheets.length) return d.sheets;
    return d.mat ? [d.mat + '매트'] : [];
  }

  function divHit(d, mat, q) {
    if (mat && divGroups(d).indexOf(mat) === -1) return false;
    if (!q) return true;
    if (compact(d.title).indexOf(q) !== -1) return true;
    return (d.pools || []).some(function (p) {
      return (p.entries || []).some(function (e) {
        return compact(e.name).indexOf(q) !== -1 || compact(e.team).indexOf(q) !== -1;
      });
    });
  }

  function renderMatFilter() {
    if (!divMatFilter) return;
    var seen = {};
    var list = [];
    draft.divisions.forEach(function (d) {
      divGroups(d).forEach(function (g) {
        if (!seen[g]) { seen[g] = true; list.push(g); }
      });
    });
    list.sort(function (a, b) { return String(a).localeCompare(String(b), 'ko', { numeric: true }); });
    var cur = seen[divMatFilter.value] ? divMatFilter.value : '';
    divMatFilter.innerHTML = '<option value="">전체 매트</option>' + list.map(function (g) {
      return '<option value="' + esc(g) + '"' + (g === cur ? ' selected' : '') + '>' + esc(g) + '</option>';
    }).join('');
  }

  // 매트를 고르면 그 매트 엑셀에 그려진 순서대로 보여 준다
  function filteredDivisions() {
    var mat = divMatFilter ? divMatFilter.value : '';
    var q = compact(divSearch ? divSearch.value : '');
    var list = draft.divisions.filter(function (d) { return divHit(d, mat, q); });
    if (!mat) return list;
    function pos(d) { return (d.sheetPos && d.sheetPos[mat] != null) ? d.sheetPos[mat] : 9999; }
    return list.map(function (d, i) { return { d: d, i: i }; })
      .sort(function (a, b) { return (pos(a.d) - pos(b.d)) || (a.i - b.i); })
      .map(function (x) { return x.d; });
  }

  function renderDivSelect() {
    if (!divSelect) return [];
    renderMatFilter();
    if (!draft.divisions.length) {
      divSelect.innerHTML = '<option value="">(생성된 부문 없음)</option>';
      currentDivId = null;
      if (divCount) divCount.textContent = '';
      return [];
    }
    var list = filteredDivisions();
    if (divCount) {
      divCount.textContent = list.length === draft.divisions.length
        ? '(' + list.length + '개)'
        : '(' + draft.divisions.length + '개 중 ' + list.length + '개)';
    }
    if (!list.length) {
      divSelect.innerHTML = '<option value="">(찾는 부문 없음)</option>';
      currentDivId = null;
      return list;
    }
    if (!list.some(function (d) { return d.id === currentDivId; })) currentDivId = list[0].id;
    divSelect.innerHTML = list.map(function (d) {
      var where = (d.sheets && d.sheets.length) ? '[' + d.sheets.join('·') + '] ' : '';
      return '<option value="' + esc(d.id) + '"' + (d.id === currentDivId ? ' selected' : '') + '>' +
        esc(where + d.title) + ' (' + (d.entryCount || 0) + '명)</option>';
    }).join('');
    divSelect.onchange = function () {
      currentDivId = divSelect.value;
      renderMatchTable();
    };
    return list;
  }

  function roundName(d, m) {
    var pools = (d.pools || []).length;
    var prefix = '';
    if (m.pool === 'F') prefix = '결승T ';
    else if (pools > 1) prefix = m.pool + '조 ';
    return prefix + (m.label || '');
  }

  function poolOf(d, m) {
    if (m.pool === 'F') return null;
    return (d.pools || []).filter(function (p) { return p.name === m.pool; })[0] || null;
  }

  /* 편집 탭: 결과 입력 / 선수 정보·배치 / 경기 세부 설정 */
  var TAB_KEY = 'spyderBracketAdmin.editTab';
  var editTab = 'result';
  try { editTab = localStorage.getItem(TAB_KEY) || 'result'; } catch (e) { /* 기본 탭 */ }

  function showTab(tab) {
    if (!document.querySelector('.edit-pane[data-pane="' + tab + '"]')) tab = 'result';
    editTab = tab;
    document.querySelectorAll('.edit-tab').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.edit-pane').forEach(function (p) { p.hidden = p.dataset.pane !== tab; });
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* 무시 */ }
  }

  // 대진 순서 (조 → 라운드 → 위에서부터)
  function bracketOrder(a, b) {
    if (a.pool !== b.pool) return String(a.pool).localeCompare(String(b.pool));
    if (a.round !== b.round) return a.round - b.round;
    return a.order - b.order;
  }

  // 경기 순서 (경기번호 순, 번호 없는 경기는 뒤에 대진 순서로)
  function playOrder(a, b) {
    if (a.no && b.no) {
      var c = String(a.no).localeCompare(String(b.no), 'ko', { numeric: true });
      if (c) return c;
    } else if (a.no || b.no) {
      return a.no ? -1 : 1;
    }
    return bracketOrder(a, b);
  }

  function emptyRows(msg, cols) {
    return '<tbody><tr><td colspan="' + cols + '" style="padding:40px;text-align:center;color:var(--mute-2);">' + esc(msg) + '</td></tr></tbody>';
  }

  // 경기 칸: "#5" + "A조 4강"
  function matchCell(d, m, extra) {
    return '<td class="cell-match">' + (m.no ? '<b>#' + esc(m.no) + '</b>' : '') +
      '<span>' + esc(roundName(d, m)) + (extra ? ' · ' + esc(extra) : '') + '</span></td>';
  }

  // keepEntries: 선수 정보 표에서 입력 중일 때는 그 표를 다시 그리지 않는다(입력 칸 포커스 유지)
  function renderMatchTable(keepEntries) {
    var d = renderDivSelect().length ? currentDivision() : null;
    showTab(editTab);
    // 다시 그려도 표 안의 스크롤 위치는 유지
    var wraps = Array.prototype.map.call(document.querySelectorAll('.admin-fold .edit-table-wrap'), function (w) {
      return [w, w.scrollTop, w.scrollLeft];
    });
    if (!d) {
      var emptyMsg = draft.divisions.length
        ? '찾는 부문이 없습니다. 매트나 검색어를 바꿔 보세요.'
        : '초안에 대진이 없습니다. ①에서 대진표 엑셀을 첨부하고 [검증 결과 초안에 반영]을 눌러 주세요.';
      if (resultTable) resultTable.innerHTML = emptyRows(emptyMsg, 6);
      if (placeTable) placeTable.innerHTML = emptyRows(emptyMsg, 3);
      matchTable.innerHTML = emptyRows(emptyMsg, 6);
      if (resultHidden) resultHidden.textContent = '';
      if (divWarn) divWarn.textContent = '';
      if (divTitle) divTitle.value = '';
      renderEntryTable(null);
      return;
    }
    byId = B.indexMatches(draft);
    if (divTitle) {
      divTitle.value = d.title || '';
      divTitle.onchange = function () {
        var t = divTitle.value.replace(/\s+/g, ' ').trim();
        if (!t) { divTitle.value = d.title || ''; return; }
        d.title = t;
        markDirty();
        renderMatchTable();
      };
    }
    if (divMat) { divMat.value = d.mat || ''; divMat.onchange = function () { d.mat = Number(divMat.value) || null; markDirty(); }; }
    if (divDuration) {
      divDuration.value = d.duration || '';
      divDuration.onchange = function () {
        d.duration = Number(divDuration.value) || draft.settings.defaultDuration;
        B.allMatches(d).forEach(function (m) { m.duration = d.duration; });
        markDirty();
        renderMatchTable();
      };
    }

    renderResultTable(d);
    renderPlaceTable(d);
    renderDetailTable(d);
    if (!keepEntries) renderEntryTable(d);
    wraps.forEach(function (x) { x[0].scrollTop = x[1]; x[0].scrollLeft = x[2]; });
  }

  // ① 결과 입력: 실제로 치르는 경기만, 경기번호 순. 이긴 선수 이름을 눌러 승자를 고른다.
  function renderResultTable(d) {
    if (!resultTable) return;
    var entries = B.entryIndex(d);
    var all = B.allMatches(d);
    var list = all.filter(function (m) { return !B.isSkippedMatch(m, byId); }).sort(playOrder);
    var hidden = all.length - list.length;
    if (resultHidden) resultHidden.textContent = hidden ? '부전승 자리(' + hidden + '곳)는 치르지 않는 경기라 목록에서 뺐습니다.' : '';
    if (!list.length) {
      resultTable.innerHTML = emptyRows('입력할 경기가 없습니다.', 6);
      return;
    }
    var head = '<thead><tr><th>경기</th><th>선수 A</th><th class="th-center">점수</th><th>선수 B</th><th>승리 방식</th><th>상태</th></tr></thead>';
    var statuses = ['예정', '진행', '종료'];
    var rows = list.map(function (m) {
      var occ = B.resolveSlots(m, byId);
      var winner = B.winnerOf(m, byId);
      function pick(i) {
        var o = occ[i] || { kind: 'tbd' };
        if (o.kind !== 'entry') {
          var label = o.kind === 'bye' ? '부전승' : (o.fromLabel || '미정');
          return '<td class="cell-pick"><span class="pick-empty">' + esc(label) + '</span></td>';
        }
        var e = entries[o.entryId] || {};
        var won = winner === o.entryId;
        var cls = 'pick' + (winner ? (won ? ' is-win' : ' is-lose') : '');
        return '<td class="cell-pick"><button type="button" class="' + cls + '" data-act="pick" data-mid="' + esc(m.id) +
          '" data-eid="' + esc(o.entryId) + '" aria-pressed="' + won + '" title="' + (won ? '다시 누르면 승자 취소' : '눌러서 승자로 표시') + '">' +
          '<span><b>' + esc(e.name || '?') + '</b>' + (e.team ? '<small>' + esc(e.team) + '</small>' : '') + '</span>' +
          (won ? '<em>승</em>' : '') + '</button></td>';
      }
      return '<tr>' + matchCell(d, m) + pick(0) +
        '<td class="cell-score">' +
          '<input type="text" inputmode="numeric" data-act="s1" data-mid="' + esc(m.id) + '" value="' + esc(m.s1 || '') + '" aria-label="선수 A 점수">' +
          '<i>:</i>' +
          '<input type="text" inputmode="numeric" data-act="s2" data-mid="' + esc(m.id) + '" value="' + esc(m.s2 || '') + '" aria-label="선수 B 점수">' +
        '</td>' +
        pick(1) +
        '<td class="cell-method"><input type="text" list="methodList" data-act="method" data-mid="' + esc(m.id) + '" value="' + esc(m.method || '') + '" placeholder="선택·입력" aria-label="승리 방식"></td>' +
        '<td class="cell-status"><select data-act="status" data-mid="' + esc(m.id) + '" aria-label="진행 상태">' +
          statuses.map(function (s) {
            return '<option value="' + s + '"' + ((m.status || '예정') === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') + '</select></td>' +
      '</tr>';
    }).join('');
    resultTable.innerHTML = head + '<tbody>' + rows + '</tbody>';
    bindEditInputs(resultTable, d);
  }

  // ② 선수 배치: 선수가 직접 들어가는 자리(선수·BYE·미정)는 라운드와 관계없이 바꿀 수 있다.
  // 매트별 대진표는 2회전부터 시작하는 선수가 있다. 앞 경기 승자/패자 자리는 결과로 정해진다.
  function renderPlaceTable(d) {
    if (!placeTable) return;
    var entries = B.entryIndex(d);
    var list = B.allMatches(d).filter(function (m) {
      return poolOf(d, m) && (m.slots || []).some(function (s) { return s && !s.from; });
    }).sort(bracketOrder);
    if (!list.length) {
      placeTable.innerHTML = emptyRows('직접 배치하는 자리가 없습니다.', 3);
      return;
    }
    var head = '<thead><tr><th>경기</th><th>선수 A</th><th>선수 B</th></tr></thead>';
    var rows = list.map(function (m) {
      var occ = B.resolveSlots(m, byId);
      var pool = poolOf(d, m);
      function slotCell(i) {
        var s = m.slots[i];
        var o = occ[i] || { kind: 'tbd' };
        if (s && !s.from) {
          var tbd = !s.entryId && !s.bye;
          var opts = [
            '<option value="__tbd"' + (tbd ? ' selected' : '') + '>— 미정 (추후 공개) —</option>',
            '<option value="__bye"' + (s.bye ? ' selected' : '') + '>— 부전승 (BYE) —</option>'
          ];
          pool.entries.forEach(function (e) {
            opts.push('<option value="' + esc(e.id) + '"' + (s.entryId === e.id ? ' selected' : '') + '>' +
              esc(e.name) + (e.team ? ' · ' + esc(e.team) : '') + (e.seed ? ' [시드' + e.seed + ']' : '') + '</option>');
          });
          return '<td><select data-act="slot" data-mid="' + esc(m.id) + '" data-idx="' + i + '" aria-label="' + (i ? '선수 B' : '선수 A') + '">' + opts.join('') + '</select></td>';
        }
        var label = o.kind === 'entry'
          ? ((entries[o.entryId] || {}).name || '?')
          : (o.kind === 'bye' ? '부전승' : (o.fromLabel || '미정'));
        return '<td class="cell-muted">' + esc(label) + '</td>';
      }
      return '<tr>' + matchCell(d, m, B.isSkippedMatch(m, byId) ? '부전승' : '') + slotCell(0) + slotCell(1) + '</tr>';
    }).join('');
    placeTable.innerHTML = head + '<tbody>' + rows + '</tbody>';
    bindEditInputs(placeTable, d);
  }

  // ③ 경기 세부 설정: 경기번호·매트·예상 시각·경기시간·메모
  function renderDetailTable(d) {
    var list = B.allMatches(d).slice().sort(bracketOrder);
    var head = '<thead><tr><th>경기</th><th>경기번호</th><th>매트</th><th>예상 시각</th><th>경기시간(분)</th><th>메모</th></tr></thead>';
    var rows = list.map(function (m) {
      var skipped = B.isSkippedMatch(m, byId);
      return '<tr' + (skipped ? ' class="is-skipped"' : '') + '>' + matchCell(d, m, skipped ? '부전승' : '') +
        '<td class="col-tight"><input type="text" data-act="no" data-mid="' + esc(m.id) + '" value="' + esc(m.no || '') + '"' + (skipped ? ' disabled' : '') + ' aria-label="경기번호"></td>' +
        '<td class="col-tight"><input type="number" min="1" data-act="mat" data-mid="' + esc(m.id) + '" value="' + esc(m.mat || '') + '" aria-label="매트"></td>' +
        '<td class="col-tight"><input type="text" data-act="time" data-mid="' + esc(m.id) + '" value="' + esc(m.time || '') + '"' + (skipped ? ' disabled' : '') + ' aria-label="예상 시각"></td>' +
        '<td class="col-tight"><input type="number" min="1" data-act="duration" data-mid="' + esc(m.id) + '" value="' + esc(m.duration || '') + '" aria-label="경기시간(분)"></td>' +
        '<td><input type="text" data-act="note" data-mid="' + esc(m.id) + '" value="' + esc(m.note || '') + '" aria-label="메모"></td>' +
      '</tr>';
    }).join('');
    matchTable.innerHTML = head + '<tbody>' + rows + '</tbody>';
    bindEditInputs(matchTable, d);

    if (divWarn) {
      var msgs = [];
      if (d.conflicts && d.conflicts.length) msgs.push('⚠ 같은 소속팀 1회전 회피 실패: ' + d.conflicts.length + '건 (' + d.conflicts.join(', ') + ')');
      var nos = {};
      var dup = [];
      B.allMatches(d).forEach(function (m) {
        if (!m.no) return;
        if (nos[m.no]) dup.push(m.no); else nos[m.no] = true;
      });
      if (dup.length) msgs.push('⚠ 중복 경기번호: ' + dup.join(', '));
      divWarn.innerHTML = msgs.length ? msgs.map(esc).join('<br>') : '';
    }
  }

  function setWinner(d, m, next) {
    if (m.winner && next !== m.winner && downstreamHasResults(d, m)) {
      if (!confirm('이 경기의 결과를 바꾸면 이후 라운드에 입력된 결과가 무효화됩니다.\n계속할까요?')) {
        renderMatchTable();
        return;
      }
    }
    m.winner = next;
    if (next && m.status !== '종료') m.status = '종료';
    if (!next && m.status === '종료') m.status = '예정';
    markDirty();
    renderMatchTable();
  }

  function bindEditInputs(root, d) {
    root.querySelectorAll('[data-act]').forEach(function (el) {
      var act = el.dataset.act;
      var m = byId[el.dataset.mid];
      if (!m) return;

      if (act === 'pick') {
        el.addEventListener('click', function () {
          var eid = el.dataset.eid;
          setWinner(d, m, B.winnerOf(m, byId) === eid ? null : eid);
        });
        return;
      }

      if (act === 'slot') {
        el.addEventListener('change', function () {
          var idx = Number(el.dataset.idx);
          var pool = poolOf(d, m);
          var val = el.value;
          if (val === '__bye') {
            m.slots[idx] = { bye: true };
          } else if (val === '__tbd') {
            m.slots[idx] = { tbd: true };
          } else {
            // 같은 조의 다른 자리에 이미 배치돼 있으면 서로 교환 (그 자리가 BYE/미정이었으면 그대로 넘김)
            var prev = m.slots[idx];
            var back = prev && prev.entryId ? { entryId: prev.entryId } : (prev && prev.bye ? { bye: true } : { tbd: true });
            if (pool) {
              pool.matches.forEach(function (om) {
                (om.slots || []).forEach(function (s, si) {
                  if (s.entryId === val && !(om.id === m.id && si === idx)) om.slots[si] = B.clone(back);
                });
              });
            }
            m.slots[idx] = { entryId: val };
          }
          markDirty();
          renderMatchTable();
        });
        return;
      }

      var evt = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var v = el.value;
        if (act === 'mat' || act === 'duration') m[act] = Number(v) || null;
        else m[act] = v;
        markDirty();
      });
    });
  }

  // 이 경기 이후 라운드에 입력된 결과가 있는지
  function downstreamHasResults(d, match) {
    var all = B.allMatches(d);
    var targets = [match.id];
    var found = false;
    for (var pass = 0; pass < 8; pass++) {
      var next = [];
      all.forEach(function (m) {
        (m.slots || []).forEach(function (s) {
          if (s.from && targets.indexOf(s.from) !== -1) {
            if (m.winner) found = true;
            next.push(m.id);
          }
        });
      });
      if (!next.length) break;
      targets = next;
    }
    return found;
  }

  /* ---------- 선수 정보 (이름·소속 수정, 추가·빼기) ---------- */

  function syncEntryCount(d) {
    d.entryCount = (d.pools || []).reduce(function (n, p) { return n + (p.entries || []).length; }, 0);
  }

  // 선수가 들어가 있는 경기 자리 (예: "A조 8강 #3")
  function placesOf(d, entryId) {
    var out = [];
    (d.pools || []).forEach(function (p) {
      (p.matches || []).forEach(function (m) {
        (m.slots || []).forEach(function (s) {
          if (s.entryId === entryId) out.push(roundName(d, m) + (m.no ? ' #' + m.no : ''));
        });
      });
    });
    return out;
  }

  function renderEntryTable(d) {
    if (!entryTable) return;
    var addBtn = $('#entryAddBtn');
    if (!d || !(d.pools || []).length) {
      entryTable.innerHTML = '<tbody><tr><td style="padding:28px;text-align:center;color:var(--mute-2);">선택한 부문이 없습니다.</td></tr></tbody>';
      if (entryAddPool) entryAddPool.innerHTML = '';
      if (addBtn) addBtn.disabled = true;
      return;
    }
    if (addBtn) addBtn.disabled = false;
    var multi = d.pools.length > 1;
    var head = '<thead><tr>' + (multi ? '<th>조</th>' : '') +
      '<th>이름</th><th>소속팀</th><th>배치된 경기</th><th></th></tr></thead>';
    var rows = [];
    d.pools.forEach(function (p) {
      (p.entries || []).forEach(function (e) {
        var places = placesOf(d, e.id);
        rows.push('<tr>' +
          (multi ? '<td class="cell-round">' + esc(p.name) + '조</td>' : '') +
          '<td class="col-wide"><input type="text" data-ent="name" data-eid="' + esc(e.id) + '" value="' + esc(e.name || '') + '" aria-label="이름"></td>' +
          '<td class="col-wide"><input type="text" data-ent="team" data-eid="' + esc(e.id) + '" value="' + esc(e.team || '') + '" aria-label="소속팀"></td>' +
          '<td class="cell-place' + (places.length ? '' : ' is-free') + '">' +
            esc(places.length ? places.join(', ') : '배치 안 됨 — 아래 선수 배치에서 자리를 정해 주세요') + '</td>' +
          '<td class="col-tight"><button class="row-btn" type="button" data-ent="remove" data-eid="' + esc(e.id) + '">빼기</button></td>' +
        '</tr>');
      });
    });
    entryTable.innerHTML = head + '<tbody>' + (rows.join('') ||
      '<tr><td colspan="5" style="padding:28px;text-align:center;color:var(--mute-2);">선수가 없습니다.</td></tr>') + '</tbody>';

    if (entryAddPool) {
      var keep = entryAddPool.value;
      entryAddPool.innerHTML = d.pools.map(function (p) {
        return '<option value="' + esc(p.name) + '"' + (p.name === keep ? ' selected' : '') + '>' +
          esc(multi ? p.name + '조에 추가' : '이 부문에 추가') + '</option>';
      }).join('');
      entryAddPool.hidden = !multi;
    }

    var entries = B.entryIndex(d);
    entryTable.querySelectorAll('[data-ent]').forEach(function (el) {
      var e = entries[el.dataset.eid];
      if (!e) return;
      var field = el.dataset.ent;
      if (field === 'remove') {
        el.addEventListener('click', function () { removeEntry(d, e); });
        return;
      }
      el.addEventListener('input', function () {
        e[field] = el.value;
        markDirty();
      });
      el.addEventListener('change', function () {
        var v = el.value.replace(/\s+/g, ' ').trim();
        if (field === 'name' && !v) {
          alert('이름은 비워 둘 수 없습니다. 선수를 빼려면 [빼기]를 눌러 주세요.');
          v = el.defaultValue;
        }
        e[field] = v;
        el.value = v;
        el.defaultValue = v;
        markDirty();
        renderMatchTable(true);
      });
    });
  }

  function removeEntry(d, e) {
    var places = placesOf(d, e.id);
    var msg = '"' + e.name + '" 선수를 이 부문에서 뺄까요?';
    if (places.length) msg += '\n\n배치된 자리(' + places.join(', ') + ')는 부전승(BYE)이 되어 상대 선수가 자동으로 올라갑니다.';
    msg += '\n\n[직전 초안 복원]으로 되돌릴 수 있습니다.';
    if (!confirm(msg)) return;
    pushUndo('선수 빼기 직전');
    d.pools.forEach(function (p) {
      p.entries = (p.entries || []).filter(function (x) { return x.id !== e.id; });
      (p.matches || []).forEach(function (m) {
        m.slots = (m.slots || []).map(function (s) { return s.entryId === e.id ? { bye: true } : s; });
      });
    });
    B.allMatches(d).forEach(function (m) { if (m.winner === e.id) m.winner = null; });
    syncEntryCount(d);
    markDirty();
    renderMatchTable();
  }

  function addEntry() {
    var d = currentDivision();
    if (!d || !(d.pools || []).length) return;
    var nameEl = $('#entryAddName');
    var teamEl = $('#entryAddTeam');
    var name = (nameEl ? nameEl.value : '').replace(/\s+/g, ' ').trim();
    var team = (teamEl ? teamEl.value : '').replace(/\s+/g, ' ').trim();
    if (!name) {
      alert('추가할 선수 이름을 입력해 주세요.');
      if (nameEl) nameEl.focus();
      return;
    }
    var poolName = entryAddPool ? entryAddPool.value : '';
    var pool = d.pools.filter(function (p) { return p.name === poolName; })[0] || d.pools[0];
    var ids = B.entryIndex(d);
    var id;
    do { id = d.id + '-add-' + Math.random().toString(36).slice(2, 8); } while (ids[id]);
    pool.entries = pool.entries || [];
    pool.entries.push({ id: id, name: name, team: team, seed: 0 });
    syncEntryCount(d);
    if (nameEl) nameEl.value = '';
    if (teamEl) teamEl.value = '';
    markDirty();
    renderMatchTable();
    setStatus(publishStatus, '"' + name + '" 선수를 추가했습니다. 아래 선수 배치에서 부전승이나 미정 자리에 넣은 뒤 게시해 주세요.', 'dirty');
  }

  /* ---------- 미리보기 ---------- */

  function renderPreview(all) {
    byId = B.indexMatches(draft);
    var divs = all ? draft.divisions : [currentDivision()].filter(Boolean);
    if (!divs.length) {
      previewBox.innerHTML = '<p class="desc" style="margin-top:14px;">미리볼 대진이 없습니다.</p>';
      return;
    }
    previewBox.innerHTML = divs.map(function (d) {
      return R.renderDivision(d, { byId: byId, query: '' }).html;
    }).join('');
    // 결과 입력 구역에서 누른 경우 ②의 미리보기 위치로 이동
    if (!all && previewBox.scrollIntoView) previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 초안 요약 (②) ---------- */

  function renderDraftSummary() {
    var n = draft.divisions.length;
    var box = $('#draftSummary');
    if (box) {
      if (!n) {
        box.innerHTML = '<p class="admin-note" style="margin:0;">초안이 비어 있습니다. ①에서 대진표 엑셀을 첨부하고 <b>[검증 결과 초안에 반영]</b>을 눌러 주세요.</p>';
      } else {
        byId = B.indexMatches(draft);
        var players = 0;
        var matches = 0;
        var groups = {};
        var byMat = false;
        draft.divisions.forEach(function (d) {
          players += d.entryCount || 0;
          if (d.sheets && d.sheets.length) {
            byMat = true;
            d.sheets.forEach(function (g) { groups[g] = true; });
          } else {
            groups[d.group || d.age || '기타'] = true;
          }
          matches += B.allMatches(d).filter(function (m) { return !B.isSkippedMatch(m, byId); }).length;
        });
        box.innerHTML = statBoxes([
          { n: Object.keys(groups).length, l: byMat ? '매트 탭' : '부문 그룹' },
          { n: n, l: '부문', c: 'is-ok' },
          { n: players, l: '선수(연인원)' },
          { n: matches, l: '실제 경기' },
          { n: record.version ? 'v' + record.version : '-', l: record.version ? '공개 중인 게시본' : '아직 게시 전' }
        ]);
      }
    }
    // 빈 초안이 게시되지 않도록 (공개 화면을 비우려면 [게시 취소(비우기)] 사용)
    ['#publishBtn', '#publishBtn2'].forEach(function (sel) {
      var pub = $(sel);
      if (pub) pub.disabled = !n;
    });
    var hint = $('#publishHint');
    if (hint) hint.textContent = n ? '' : '초안에 부문이 없어 게시할 수 없습니다. ①에서 엑셀을 첨부하고 [검증 결과 초안에 반영]을 먼저 눌러 주세요.';
  }

  /* ---------- 저장 / 게시 ---------- */

  // 대진표는 기존 명단 테이블(roster_state)의 data 안에 함께 저장된다. 별도 테이블/SQL 불필요.
  //   data.bracket       = 게시본 (+ publishedAt, version)
  //   data.bracketAdmin  = { draft, history }
  var HISTORY_MAX = 3;

  /* 여러 기기에서 동시에 결과를 입력해도 서로 지우지 않도록:
   *  - baseDraft: 이 기기가 마지막으로 서버에서 받았거나 서버에 쓴 초안
   *  - 저장·게시할 때 서버 초안이 baseDraft와 다르면(다른 기기가 그 사이에 저장),
   *    이 기기에서 바꾼 칸만 서버 최신 초안 위에 얹어 합친다. 같은 칸을 양쪽에서 고쳤으면 이 기기 값.
   *  - 엑셀 반영·자동 생성·되돌리기·부문 삭제처럼 초안 전체가 바뀐 경우(structural)는 합치지 않고 물어본다.
   *  - 쓰기는 읽은 뒤 그 사이 행이 바뀌지 않았을 때만 성공한다(updated_at 비교). 바뀌었으면 다시 읽어 합친다.
   */
  var baseDraft = null;
  var structural = false;
  var saving = false;

  function markStructural() { structural = true; }

  function rememberBase(d) {
    baseDraft = B.clone(d);
    structural = false;
  }

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  // 값 비교 (키 순서 무시, null·undefined·없는 키는 같은 것으로 본다)
  function sameJson(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var i;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (!sameJson(a[i], b[i])) return false;
      return true;
    }
    var keys = Object.keys(a).concat(Object.keys(b));
    for (i = 0; i < keys.length; i++) if (!sameJson(a[keys[i]], b[keys[i]])) return false;
    return true;
  }

  // 원소마다 고유한 id(조는 name)가 있는 배열이면 그 키 이름. 아니면 null(통째로 비교).
  function arrayKey(lists) {
    var names = ['id', 'name'];
    for (var n = 0; n < names.length; n++) {
      var k = names[n];
      var ok = true;
      var any = false;
      lists.forEach(function (arr) {
        var seen = Object.create(null);
        (arr || []).forEach(function (x) {
          any = true;
          if (!isObj(x) || typeof x[k] !== 'string' || seen[x[k]]) ok = false;
          else seen[x[k]] = true;
        });
      });
      if (ok && any) return k;
    }
    return null;
  }

  function merge3(base, local, remote, ctx) {
    if (sameJson(local, base)) return remote;           // 이 기기에서 안 바꿈 → 서버 값
    if (sameJson(remote, base) || sameJson(local, remote)) return local;  // 서버에서 안 바꿈 → 이 기기 값
    if (isObj(local) && isObj(remote)) {
      var b = isObj(base) ? base : {};
      var out = {};
      Object.keys(remote).concat(Object.keys(local)).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(out, k)) return;
        var v = merge3(b[k], local[k], remote[k], ctx);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if (Array.isArray(local) && Array.isArray(remote)) {
      var key = arrayKey([Array.isArray(base) ? base : [], local, remote]);
      if (key) return mergeKeyed(Array.isArray(base) ? base : [], local, remote, key, ctx);
    }
    ctx.conflicts++;
    return local;                                        // 같은 칸을 양쪽에서 고침 → 이 기기 값
  }

  function mergeKeyed(base, local, remote, key, ctx) {
    function index(arr) {
      var m = Object.create(null);
      arr.forEach(function (x) { m[x[key]] = x; });
      return m;
    }
    var B0 = index(base);
    var L = index(local);
    var out = [];
    var seen = Object.create(null);
    remote.forEach(function (r) {
      var k = r[key];
      seen[k] = true;
      if (k in L) { out.push(merge3(B0[k], L[k], r, ctx)); return; }
      if (k in B0) {                                     // 이 기기에서 지움
        if (!sameJson(r, B0[k])) ctx.conflicts++;        // 서버에서는 고쳤어도 지운 쪽을 따른다
        return;
      }
      out.push(r);                                       // 다른 기기에서 새로 생김
    });
    local.forEach(function (l) {
      var k = l[key];
      if (seen[k]) return;
      if (k in B0) {                                     // 다른 기기에서 지움
        if (sameJson(l, B0[k])) return;
        ctx.conflicts++;                                 // 이 기기에서 고친 것은 살린다
      }
      out.push(l);                                       // 이 기기에서 새로 생김
    });
    return out;
  }

  // 합친 결과가 대진으로 성립하는지 (없는 선수·경기를 가리키거나 한 선수가 두 자리에 있으면 안 됨)
  function draftLooksValid(st) {
    var ok = true;
    var matchIds = B.indexMatches(st);
    (st.divisions || []).forEach(function (d) {
      var entries = B.entryIndex(d);
      var placed = Object.create(null);
      B.allMatches(d).forEach(function (m) {
        (m.slots || []).forEach(function (s) {
          if (!s) return;
          if (s.entryId) {
            if (!entries[s.entryId] || placed[s.entryId]) ok = false;
            placed[s.entryId] = true;
          }
          if (s.from && !matchIds[s.from]) ok = false;
        });
      });
    });
    return ok;
  }

  // 서버에 쓸 초안을 정한다. null이면 쓰지 않는다(사용자가 취소).
  function planDraft(data, info) {
    var remoteRaw = data.bracketAdmin && data.bracketAdmin.draft;
    if (!remoteRaw || !baseDraft) return draft;
    var remote = B.normalizeState(B.clone(remoteRaw));
    if (sameJson(remote, baseDraft)) return draft;          // 그 사이 다른 기기에서 바꾼 것 없음
    if (!structural) {
      var ctx = { conflicts: 0 };
      var merged = merge3(baseDraft, draft, remote, ctx);
      if (draftLooksValid(merged)) {
        info.merged = true;
        info.conflicts = ctx.conflicts;
        return merged;
      }
    }
    if (info.overwrite === undefined) {
      info.overwrite = confirm('다른 기기에서 그 사이에 저장·게시한 내용이 있습니다.\n' +
        (structural
          ? '지금 초안은 엑셀 반영·되돌리기처럼 전체가 바뀐 상태라 자동으로 합칠 수 없습니다.\n\n'
          : '같은 부문의 선수 배치를 양쪽에서 바꿔 자동으로 합칠 수 없습니다.\n\n') +
        '[확인] 이 기기 내용으로 덮어쓰기 (다른 기기에서 입력한 내용은 사라짐)\n' +
        '[취소] 저장하지 않기 → [서버 초안 다시 불러오기] 후 다시 입력');
    }
    return info.overwrite ? draft : null;
  }

  async function fetchRow() {
    var res = await sb.from('roster_state').select('data, updated_at').eq('id', 1).single();
    if (res.error) throw res.error;
    return { data: (res.data && res.data.data) || {}, stamp: (res.data && res.data.updated_at) || null };
  }

  async function fetchData() {
    return (await fetchRow()).data;
  }

  function recordFrom(data) {
    var pub = data.bracket || null;
    var adm = data.bracketAdmin || {};
    return {
      _data: data,
      draft: adm.draft || null,
      published: pub,
      history: adm.history || [],
      version: (pub && pub.version) || 0,
      published_at: (pub && pub.publishedAt) || null
    };
  }

  async function fetchRecord() {
    return recordFrom(await fetchData());
  }

  function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // 명단(categories/athletes)은 건드리지 않고 대진표 부분만 바꿔 저장한다.
  // mutate(data)는 서버 최신 데이터를 받아 고친다. false를 돌려주면 저장하지 않는다.
  // 읽은 뒤 다른 기기가 먼저 저장했으면(updated_at 변경) 아무것도 쓰지 않고 다시 읽어 mutate부터 반복한다.
  async function writeBracket(mutate) {
    if (sb.auth && sb.auth.getSession) {
      var ses = await sb.auth.getSession();
      if (!ses || !ses.data || !ses.data.session) throw new Error('로그인이 만료되었습니다. 페이지를 새로고침해 다시 로그인한 뒤 눌러 주세요.');
    }
    for (var attempt = 0; attempt < 6; attempt++) {
      var row = await fetchRow();
      var data = row.data;
      if (mutate(data) === false) return null;
      var q = sb.from('roster_state').update({ data: data }).eq('id', 1);
      if (row.stamp) q = q.eq('updated_at', row.stamp);
      var res = await q.select('updated_at');
      if (res.error) throw res.error;
      if (res.data && res.data.length) return data;
      // 한 줄도 안 바뀜: 다른 기기가 먼저 저장했거나(재시도), 저장 권한이 없음(로그인 만료)
      var now = await fetchRow();
      if (now.stamp === row.stamp) throw new Error('저장 권한이 없습니다. 로그인이 만료되었을 수 있으니 페이지를 새로고침해 다시 로그인해 주세요.');
      await sleep(200 + Math.random() * 400);
    }
    throw new Error('다른 기기에서 동시에 저장하고 있어 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.');
  }

  function setSaving(on) {
    saving = on;
    ['#publishBtn', '#publishBtn2', '#saveDraftBtn', '#saveDraftBtn2'].forEach(function (sel) {
      var b = $(sel);
      if (b) b.disabled = on || ((sel === '#publishBtn' || sel === '#publishBtn2') && !draft.divisions.length);
    });
  }

  // 합쳐진 초안을 화면에 반영 (보던 부문·탭은 그대로)
  function adoptDraft(next) {
    if (next !== draft) {
      draft = next;
      byId = B.indexMatches(draft);
      if (!draft.divisions.some(function (d) { return d.id === currentDivId; })) {
        currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
      }
      renderAll();
    }
    rememberBase(draft);
  }

  function mergeNote(info) {
    if (!info.merged) return '';
    return ' 다른 기기에서 입력한 내용과 합쳤습니다.' +
      (info.conflicts ? ' (같은 칸을 동시에 고친 ' + info.conflicts + '곳은 이 기기 내용으로 저장)' : '');
  }

  async function loadFromServer(silent) {
    try {
      var row = await fetchRecord();
      record = {
        version: row.version || 0,
        published_at: row.published_at,
        history: row.history || [],
        published: row.published
      };
      draft = B.normalizeState(row.draft);
      rememberBase(draft);
      byId = B.indexMatches(draft);
      currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
      dirty = false;
      renderAll();
      if (!silent) {
        setStatus(publishStatus, '서버 초안을 불러왔습니다. (게시 버전 v' + record.version + ')', 'ok');
      } else {
        setStatus(publishStatus, '현재 게시 버전 v' + record.version +
          (record.published_at ? ' · ' + new Date(record.published_at).toLocaleString('ko-KR') : ' (미게시)'));
      }
    } catch (e) {
      setStatus(publishStatus, '불러오기 실패: ' + e.message, 'err');
    }
  }

  async function saveDraft(silent) {
    if (saving) return false;
    setSaving(true);
    setStatus(publishStatus, '초안 저장 중…');
    try {
      var info = {};
      var finalDraft = null;
      var written = await writeBracket(function (data) {
        var plan = planDraft(data, info);
        if (!plan) return false;
        finalDraft = plan;
        data.bracketAdmin = data.bracketAdmin || {};
        data.bracketAdmin.draft = plan;
      });
      if (!written) {
        setStatus(publishStatus, '저장하지 않았습니다.', 'dirty');
        return false;
      }
      dirty = false;
      adoptDraft(finalDraft);
      if (!silent) setStatus(publishStatus, '초안을 저장했습니다. (공개 화면에는 아직 반영되지 않음)' + mergeNote(info), 'ok');
      return true;
    } catch (e) {
      setStatus(publishStatus, '초안 저장 실패: ' + e.message, 'err');
      alert('초안 저장 실패: ' + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (saving) return;
    if (!draft.divisions.length && !confirm('부문이 없는 빈 대진표를 게시합니다. 계속할까요?')) return;
    var total = draft.divisions.length;
    if (!confirm('부문 ' + total + '개의 현재 초안을 공개 대진표에 게시합니다.\n공개 페이지에 즉시 반영됩니다. 계속할까요?')) return;

    setSaving(true);
    setStatus(publishStatus, '게시 중…');
    try {
      var info = {};
      var finalDraft = null;
      var meta = null;
      var written = await writeBracket(function (data) {
        var plan = planDraft(data, info);
        if (!plan) return false;
        var row = recordFrom(data);
        var history = (row.history || []).slice(0, HISTORY_MAX - 1);
        if (row.published && row.version) {
          history.unshift({
            version: row.version,
            published_at: row.published_at,
            snapshot: row.published
          });
        }
        var nextVersion = (row.version || 0) + 1;
        var publishedAt = new Date().toISOString();
        var payload = B.clone(plan);
        payload.version = nextVersion;
        payload.publishedAt = publishedAt;
        payload.publishedBy = window.SPYDER_ADMIN_EMAIL || '';
        data.bracket = payload;
        data.bracketAdmin = { draft: plan, history: history };
        finalDraft = plan;
        meta = { version: nextVersion, publishedAt: publishedAt, history: history };
      });
      if (!written) {
        setStatus(publishStatus, '게시를 취소했습니다.', 'dirty');
        return;
      }

      record.version = meta.version;
      record.published_at = meta.publishedAt;
      record.history = meta.history;
      record.published = B.clone(finalDraft);
      dirty = false;
      adoptDraft(finalDraft);
      renderHistory();
      renderDraftSummary();
      setStatus(publishStatus, '게시 완료! (v' + meta.version + ') 공개 대진표에 실시간 반영되었습니다.' + mergeNote(info), 'ok');
    } catch (e) {
      setStatus(publishStatus, '게시 실패: ' + e.message, 'err');
      alert('게시 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function unpublish() {
    if (saving) return;
    if (!confirm('공개 대진표를 비웁니다(초안은 그대로 유지). 계속할까요?')) return;
    setSaving(true);
    try {
      var info = {};
      var finalDraft = null;
      var meta = null;
      var written = await writeBracket(function (data) {
        var plan = planDraft(data, info);
        if (!plan) return false;
        var row = recordFrom(data);
        var history = (row.history || []).slice(0, HISTORY_MAX - 1);
        if (row.published && row.version) {
          history.unshift({ version: row.version, published_at: row.published_at, snapshot: row.published });
        }
        var cleared = B.emptyState(plan.settings);
        cleared.version = (row.version || 0) + 1;
        cleared.publishedAt = null;
        data.bracket = cleared;
        data.bracketAdmin = { draft: plan, history: history };
        finalDraft = plan;
        meta = { version: cleared.version, history: history };
      });
      if (!written) {
        setStatus(publishStatus, '게시 취소를 하지 않았습니다.', 'dirty');
        return;
      }
      record.version = meta.version;
      record.history = meta.history;
      record.published_at = null;
      dirty = false;
      adoptDraft(finalDraft);
      renderHistory();
      renderDraftSummary();
      setStatus(publishStatus, '게시를 취소했습니다. 공개 화면은 빈 상태로 표시됩니다.', 'ok');
    } catch (e) {
      setStatus(publishStatus, '게시 취소 실패: ' + e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  function renderHistory() {
    if (!historyList) return;
    if (!record.history || !record.history.length) {
      historyList.innerHTML = '<p class="admin-note" style="margin:0;">이전 게시 이력이 없습니다.</p>';
      return;
    }
    historyList.innerHTML = record.history.map(function (h, i) {
      var when = h.published_at ? new Date(h.published_at).toLocaleString('ko-KR') : '-';
      var count = (h.snapshot && h.snapshot.divisions) ? h.snapshot.divisions.length : 0;
      return '<div class="history-row"><b>v' + esc(h.version) + '</b><span>' + esc(when) + '</span>' +
        '<span>부문 ' + count + '개</span>' +
        '<button type="button" data-rollback="' + i + '">이 버전으로 되돌리기</button></div>';
    }).join('');
    historyList.querySelectorAll('[data-rollback]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var h = record.history[Number(btn.dataset.rollback)];
        if (!h) return;
        if (!confirm('v' + h.version + ' 게시본을 초안으로 불러옵니다.\n현재 편집 중인 초안은 사라집니다. 계속할까요?')) return;
        pushUndo('롤백 직전');
        markStructural();
        draft = B.normalizeState(h.snapshot);
        byId = B.indexMatches(draft);
        currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
        markDirty();
        renderAll();
        setStatus(publishStatus, 'v' + h.version + ' 내용을 초안으로 불러왔습니다. 게시하려면 [게시하기]를 누르세요.', 'ok');
      });
    });
  }

  /* ---------- 내보내기 ---------- */

  // CSV 수식 주입 방지
  function safeCell(v) {
    var s = v == null ? '' : String(v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }

  function exportXlsx() {
    if (typeof XLSX === 'undefined') { alert('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    byId = B.indexMatches(draft);
    var rows = [['부문', '연령부', '성별', '등급', '체급', '조', '라운드', '경기번호', '매트', '예상시각', '경기시간(분)', '상태',
      '선수A', '소속A', '선수B', '소속B', '승자', '점수A', '점수B', '승리방식', '메모']];

    draft.divisions.forEach(function (d) {
      var entries = B.entryIndex(d);
      B.allMatches(d).slice().sort(function (a, b) {
        if (a.pool !== b.pool) return String(a.pool).localeCompare(String(b.pool));
        if (a.round !== b.round) return a.round - b.round;
        return a.order - b.order;
      }).forEach(function (m) {
        var occ = B.resolveSlots(m, byId);
        var w = B.winnerOf(m, byId);
        function nameOf(o) {
          if (o.kind === 'bye') return 'BYE';
          if (o.kind === 'tbd') return '미정';
          return (entries[o.entryId] || {}).name || '';
        }
        function teamOf(o) {
          return o.kind === 'entry' ? ((entries[o.entryId] || {}).team || '') : '';
        }
        rows.push([
          d.title, d.age, d.gender, d.grade, d.weight,
          m.pool === 'F' ? '결승T' : m.pool,
          m.label, m.no || '', m.mat || '', m.time || '', m.duration || '',
          B.isSkippedMatch(m, byId) ? '부전승' : (m.status || '예정'),
          nameOf(occ[0]), teamOf(occ[0]), nameOf(occ[1]), teamOf(occ[1]),
          w ? ((entries[w] || {}).name || '') : '',
          m.s1 || '', m.s2 || '', m.method || '', m.note || ''
        ].map(safeCell));
      });
    });

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '대진표');

    var pods = [['부문', '1위', '소속', '2위', '소속', '3위', '3위']];
    draft.divisions.forEach(function (d) {
      var p = B.podiumOf(d, byId);
      if (!p) return;
      var entries = B.entryIndex(d);
      var n = function (id) { return id && entries[id] ? entries[id].name : ''; };
      var t = function (id) { return id && entries[id] ? entries[id].team : ''; };
      pods.push([d.title, n(p.first), t(p.first), n(p.second), t(p.second),
        n(p.thirds[0]), n(p.thirds[1])].map(safeCell));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pods), '순위');

    XLSX.writeFile(wb, 'spyder-bracket-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'spyder-bracket-draft.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- 렌더 전체 ---------- */

  function renderAll() {
    renderFieldMap();
    renderSettings();
    renderDivisionPreview();
    renderImportHint();
    renderMatchTable();
    renderHistory();
    renderDraftSummary();
  }

  /* ---------- 버튼 바인딩 ---------- */

  function bind(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  bind('reloadRosterBtn', loadRoster);
  bind('downloadTemplateBtn', downloadTemplate);
  bind('importCheckBtn', importFromPaste);
  bind('importApplyBtn', applyImport);
  bind('importErrorXlsxBtn', exportErrorRows);
  bind('generateBtn', generate);

  (function () {
    var fileInput = document.getElementById('importFile');
    if (!fileInput) return;
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var label = document.getElementById('importFileName');
      if (label) label.textContent = file.name;
      importFromFile(file);
      fileInput.value = '';
    });
  })();
  bind('rescheduleBtn', reschedule);
  bind('undoBtn', undo);
  bind('previewBtn', function () { renderPreview(false); });
  bind('previewAllBtn', function () { renderPreview(true); });
  bind('saveDraftBtn', function () { saveDraft(false); });
  bind('publishBtn', publish);
  bind('saveDraftBtn2', function () { saveDraft(false); });
  bind('publishBtn2', publish);
  bind('entryAddBtn', addEntry);
  ['#entryAddName', '#entryAddTeam'].forEach(function (sel) {
    var el = $(sel);
    if (el) el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addEntry(); }
    });
  });
  if (divSearch) divSearch.addEventListener('input', function () { renderMatchTable(); });
  document.querySelectorAll('.edit-tab').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });
  if (divMatFilter) divMatFilter.addEventListener('change', function () { renderMatchTable(); });
  bind('unpublishBtn', unpublish);
  bind('exportXlsxBtn', exportXlsx);
  bind('exportJsonBtn', exportJson);
  bind('loadDraftBtn', function () {
    if (dirty && !confirm('저장되지 않은 변경사항이 사라집니다. 계속할까요?')) return;
    loadFromServer(false);
  });

  bind('divDeleteBtn', function () {
    var d = currentDivision();
    if (!d) return;
    if (!confirm('"' + d.title + '" 부문의 대진을 초안에서 삭제할까요?\n(참가자 명단은 그대로 유지되며, 다시 생성할 수 있습니다)')) return;
    pushUndo('부문 삭제 직전');
    markStructural();
    draft.divisions = draft.divisions.filter(function (x) { return x.id !== d.id; });
    currentDivId = draft.divisions.length ? draft.divisions[0].id : null;
    byId = B.indexMatches(draft);
    markDirty();
    renderAll();
  });

  // 접어 둔 구역(결과 입력 / 고급 기능)은 마지막으로 펼친 상태를 이 브라우저에 기억한다
  document.querySelectorAll('details[data-remember]').forEach(function (el) {
    var key = 'spyderBracketAdmin.' + el.dataset.remember;
    try { if (localStorage.getItem(key) === '1') el.open = true; } catch (e) { /* 저장소 사용 불가 시 기본(접힘) */ }
    el.addEventListener('toggle', function () {
      try { localStorage.setItem(key, el.open ? '1' : '0'); } catch (e) { /* 무시 */ }
    });
  });

  /* ---------- 부팅 ---------- */

  window.SPYDER_BRACKET_ADMIN_INIT = async function (client) {
    sb = client;
    await loadRoster();
    await loadFromServer(true);
    renderAll();
  };
})();
