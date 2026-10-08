/* SPYDER BJJ SUPERSERIES — 공개 대진표 페이지
 * 게시본(roster_state.data.bracket)만 표시하며, 게시 즉시 실시간 반영됩니다.
 */
document.addEventListener('DOMContentLoaded', function () {
  var B = window.SPYDER_BRACKET;
  var R = window.SPYDER_BRACKET_RENDER;
  var esc = B.escapeHtml;

  var listEl = document.querySelector('#bracketList');
  var tabsEl = document.querySelector('#bracketTabs');
  var filterEl = document.querySelector('#bracketFilters');
  var searchEl = document.querySelector('#bracketSearch');
  var chipsEl = document.querySelector('#bracketChips');
  var countEl = document.querySelector('#bracketCount');
  var updatedEl = document.querySelector('#bracketUpdated');
  var mineBtn = document.querySelector('#bracketMineBtn');
  var resetBtn = document.querySelector('#bracketResetBtn');
  var printBtn = document.querySelector('#bracketPrintBtn');
  var shareBtn = document.querySelector('#bracketShareBtn');
  if (!listEl) return;

  // 탭(엑셀 시트: 1매트 / 2매트 … 또는 중등부 / 고등부 …) 안에서 쓰는 세부 필터.
  // 탭 안에 값이 2개 이상인 항목만 보여 준다.
  var FIELDS = [
    { key: 'age', label: '연령부' },
    { key: 'grade', label: '등급' },
    { key: 'gender', label: '성별' },
    { key: 'weight', label: '체급' },
    { key: 'mat', label: '매트' }
  ];

  var state = B.emptyState();
  var byId = {};
  var group = '';
  var filters = {};
  var query = '';
  var mineOnly = true;
  var loaded = false;

  /* ---------- URL 상태 ---------- */

  function readUrl() {
    var p = new URLSearchParams(location.search);
    group = p.get('g') || '';
    FIELDS.forEach(function (f) {
      var v = p.get(f.key);
      if (v) filters[f.key] = v;
    });
    query = p.get('q') || '';
    if (p.get('mine') === '0') mineOnly = false;
    if (searchEl) searchEl.value = query;
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (group) p.set('g', group);
    FIELDS.forEach(function (f) { if (filters[f.key]) p.set(f.key, filters[f.key]); });
    if (query) p.set('q', query);
    if (query && !mineOnly) p.set('mine', '0');
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  /* ---------- 그룹 ---------- */

  // 엑셀 시트로 들어온 부문은 group(시트 이름), 그 밖에는 연령부로 묶는다.
  function groupOf(d) {
    return d.group || d.age || '기타';
  }

  // 매트별 엑셀(1매트 … 8매트 시트)로 들어온 부문은 경기가 있는 매트 탭마다 보인다.
  function groupsOf(d) {
    return (d.sheets && d.sheets.length) ? d.sheets : [groupOf(d)];
  }

  function inGroup(d, g) {
    return groupsOf(d).indexOf(g) !== -1;
  }

  function matMode() {
    return state.divisions.some(function (d) { return d.sheets && d.sheets.length; });
  }

  // "3매트" 탭 → 3 (매트 탭이 아니면 null)
  function matOfGroup(g) {
    var m = /^\s*(\d+)\s*매트\s*$/.exec(g || '');
    return m ? Number(m[1]) : null;
  }

  function groupList() {
    var list = [];
    var idx = {};
    state.divisions.forEach(function (d) {
      groupsOf(d).forEach(function (g) {
        if (idx[g] == null) { idx[g] = list.length; list.push({ name: g, count: 0 }); }
        list[idx[g]].count++;
      });
    });
    if (matMode()) {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); });
    }
    return list;
  }

  // 매트 탭 안에서는 엑셀 매트 시트에 그려진 순서대로
  function sortForGroup(list) {
    if (!list.some(function (d) { return d.sheetPos; })) return list;
    function pos(d) {
      return (d.sheetPos && d.sheetPos[group] != null) ? d.sheetPos[group] : 9999;
    }
    return list.map(function (d, i) { return { d: d, i: i }; })
      .sort(function (a, b) { return (pos(a.d) - pos(b.d)) || (a.i - b.i); })
      .map(function (x) { return x.d; });
  }

  function ensureGroup() {
    var list = groupList();
    if (!list.some(function (g) { return g.name === group; })) {
      group = list.length ? list[0].name : '';
      filters = {};
    }
  }

  // 검색어가 있고 "내 대진만 보기"가 켜져 있으면 모든 탭에서 찾는다.
  function searchingAll() {
    return !!query && mineOnly;
  }

  function buildTabs() {
    if (!tabsEl) return;
    var list = groupList();
    if (list.length < 2) {
      tabsEl.innerHTML = '';
      tabsEl.hidden = true;
      return;
    }
    tabsEl.hidden = false;
    tabsEl.classList.toggle('is-muted', searchingAll());
    tabsEl.innerHTML = list.map(function (g) {
      var on = g.name === group;
      return '<button type="button" class="bkt-tab' + (on ? ' is-on' : '') + '" role="tab" aria-selected="' + on + '"' +
        ' data-group="' + esc(g.name) + '">' + esc(g.name) + '<span class="bkt-tab-count">' + g.count + '</span></button>';
    }).join('');

    tabsEl.querySelectorAll('[data-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        group = btn.dataset.group;
        filters = {};
        if (query) {
          // 탭을 고르면 그 탭 안에서 보도록 검색 범위를 좁힌다
          mineOnly = false;
        }
        buildTabs();
        buildFilters();
        writeUrl();
        render();
      });
    });

    // 선택된 탭이 가로 스크롤 안에서 보이도록 (페이지 세로 위치는 건드리지 않음)
    var on = tabsEl.querySelector('.bkt-tab.is-on');
    if (on) tabsEl.scrollLeft = Math.max(0, on.offsetLeft - (tabsEl.clientWidth - on.offsetWidth) / 2);
  }

  /* ---------- 데이터 ---------- */

  // 대진표 공개 예정 안내. 대진표가 게시되면 이 안내는 자동으로 사라진다.
  var COMING_SOON_TITLE = '대진표는 10월 7일 이후 조회가 가능합니다.';
  var COMING_SOON_DESC = '부문별 대진이 준비되는 대로 순차 공개되며, 대진표 공개 전까지는 참가 선수 명단에서 접수 현황을 확인해주시기 바랍니다.';

  function showComingSoon() {
    listEl.innerHTML = emptyBox(COMING_SOON_TITLE, COMING_SOON_DESC);
    if (countEl) countEl.textContent = '';
    if (updatedEl) updatedEl.textContent = '';
    if (mineBtn) { mineBtn.classList.remove('is-on'); mineBtn.setAttribute('aria-pressed', 'false'); mineBtn.disabled = true; }
  }

  var SUPABASE_URL = window.SPYDER_SUPABASE_URL;
  var SUPABASE_ANON_KEY = window.SPYDER_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof supabase === 'undefined') {
    console.warn('[대진표] Supabase 설정이 없어 공개 예정 안내만 표시합니다.');
    showComingSoon();
    return;
  }

  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  listEl.innerHTML = '<div class="bkt-skeleton"></div><div class="bkt-skeleton"></div>';

  function applyState(published, publishedAt) {
    state = B.normalizeState(published);
    byId = B.indexMatches(state);
    loaded = true;
    ensureGroup();
    buildTabs();
    buildFilters();
    showPublishedAt(publishedAt);
    render();
  }

  // 대진표는 기존 명단 테이블(roster_state)의 data.bracket 안에 저장된다.
  // 공개 화면은 그중 게시본만 골라 읽으므로 전송량이 작다.
  function fetchPublished() {
    return sb.from('roster_state').select('bracket:data->bracket').eq('id', 1).single();
  }

  fetchPublished().then(function (res) {
    if (res.error) {
      console.warn('[대진표] 조회 실패:', res.error.message);
      showComingSoon();
      return;
    }
    var bk = res.data && res.data.bracket;
    applyState(bk, bk && bk.publishedAt);
  });

  // 게시되면 즉시 반영. 변경 알림만 받고 내용은 다시 조회한다(큰 데이터도 안전).
  sb.channel('bracket_public')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roster_state', filter: 'id=eq.1' }, function () {
      fetchPublished().then(function (res) {
        if (res.error) return;
        var bk = res.data && res.data.bracket;
        var before = state.divisions.length;
        applyState(bk, bk && bk.publishedAt);
        if (state.divisions.length || before) toast('대진표가 업데이트되었습니다.');
      });
    })
    .subscribe();

  function showPublishedAt(iso) {
    if (!updatedEl) return;
    if (!iso) { updatedEl.textContent = ''; return; }
    var d = new Date(iso);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    updatedEl.textContent = '게시 시각: ' + d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------- 필터 UI ---------- */

  function fieldValue(d, key) {
    return (key === 'mat') ? (d.mat ? 'MAT ' + d.mat : '') : (d[key] || '');
  }

  function sortValues(key, vals) {
    if (key === 'weight') return vals.sort(B.compareWeight);
    if (key === 'gender') {
      var rank = { '남성': 0, '남자': 0, '여성': 1, '여자': 1 };
      return vals.sort(function (a, b) { return (rank[a] == null ? 2 : rank[a]) - (rank[b] == null ? 2 : rank[b]); });
    }
    return vals.sort(function (a, b) { return a.localeCompare(b, 'ko', { numeric: true }); });
  }

  // 현재 탭 안의 값만 (다른 항목 필터는 무시해 선택지가 사라지지 않게)
  function valuesFor(key) {
    var set = {};
    state.divisions.forEach(function (d) {
      if (!inGroup(d, group)) return;
      var v = fieldValue(d, key);
      if (v) set[v] = true;
    });
    return sortValues(key, Object.keys(set));
  }

  function buildFilters() {
    if (!filterEl) return;
    filterEl.innerHTML = FIELDS.map(function (f) {
      var vals = valuesFor(f.key);
      if (vals.length < 2 && !filters[f.key]) return '';
      var opts = vals.map(function (v) {
        return '<option value="' + esc(v) + '"' + (filters[f.key] === v ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
      return '<select data-key="' + f.key + '" aria-label="' + esc(f.label) + ' 필터">' +
        '<option value="">' + esc(f.label) + ' 전체</option>' + opts + '</select>';
    }).join('');

    filterEl.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (sel.value) filters[sel.dataset.key] = sel.value;
        else delete filters[sel.dataset.key];
        writeUrl();
        render();
      });
    });
  }

  function renderChips() {
    if (!chipsEl) return;
    var chips = [];
    FIELDS.forEach(function (f) {
      if (filters[f.key]) {
        chips.push('<span class="bkt-chip">' + esc(f.label) + ': ' + esc(filters[f.key]) +
          '<button type="button" data-clear="' + f.key + '" aria-label="' + esc(f.label) + ' 필터 해제">&times;</button></span>');
      }
    });
    if (query) {
      chips.push('<span class="bkt-chip">검색: ' + esc(query) +
        '<button type="button" data-clear="__q" aria-label="검색어 지우기">&times;</button></span>');
    }
    chipsEl.innerHTML = chips.join('');
    chipsEl.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.dataset.clear;
        if (k === '__q') { query = ''; if (searchEl) searchEl.value = ''; }
        else delete filters[k];
        buildFilters();
        writeUrl();
        render();
      });
    });
  }

  /* ---------- 렌더 ---------- */

  function passesFilters(d, ignoreGroup) {
    if (!ignoreGroup && !inGroup(d, group)) return false;
    for (var k in filters) {
      if (fieldValue(d, k) !== filters[k]) return false;
    }
    return true;
  }

  function render() {
    if (!loaded) return;
    renderChips();
    if (mineBtn) {
      mineBtn.classList.toggle('is-on', mineOnly && !!query);
      mineBtn.setAttribute('aria-pressed', String(mineOnly && !!query));
      mineBtn.disabled = !query;
    }
    if (tabsEl) tabsEl.classList.toggle('is-muted', searchingAll());

    if (!state.divisions.length) {
      showComingSoon();
      return;
    }

    var all = searchingAll();
    var pool = state.divisions.filter(function (d) { return passesFilters(d, all); });
    if (!all) pool = sortForGroup(pool);
    var tabMat = all ? null : matOfGroup(group);
    var rendered = [];
    var hitCount = 0;
    var matMatches = 0;

    pool.forEach(function (d) {
      var res = R.renderDivision(d, { byId: byId, query: query, mat: tabMat });
      if (tabMat) {
        B.allMatches(d).forEach(function (m) {
          if (m.mat === tabMat && !B.isSkippedMatch(m, byId)) matMatches++;
        });
      }
      if (res.hit) hitCount++;
      if (all && !res.hit) return;
      rendered.push(res.html);
    });

    if (!rendered.length) {
      var why = query
        ? '"' + query + '" 에 해당하는 선수를 찾지 못했습니다.'
        : '선택한 조건에 해당하는 부문이 없습니다.';
      listEl.innerHTML = emptyBox(why,
        '이름의 일부만 입력하거나(초성 검색 가능), 필터를 초기화한 뒤 다시 찾아보세요.');
    } else {
      listEl.innerHTML = rendered.join('');
    }

    if (countEl) {
      var parts;
      if (all) {
        parts = ['전체 ' + state.divisions.length + '개 부문에서 검색 · 일치 부문 ' + hitCount + '개'];
      } else {
        parts = [group + ' ' + rendered.length + '개 부문'];
        if (tabMat && !query && !Object.keys(filters).length) parts.push('이 매트 ' + matMatches + '경기');
        if (query) parts.push('검색 일치 부문 ' + hitCount + '개');
        parts.push('전체 ' + state.divisions.length + '개 부문');
      }
      countEl.textContent = parts.join(' · ');
    }

    if (query) focusFirstHit();
  }

  function focusFirstHit() {
    var first = listEl.querySelector('.bkt-match.is-hit');
    if (!first) return;
    first.classList.add('is-flash');
    setTimeout(function () { first.classList.remove('is-flash'); }, 2600);
    // 대진도 안에서 가로로도 보이도록 스크롤 영역을 먼저 맞춘다
    var box = first.closest('.bkt-scroll');
    if (box) box.scrollLeft = Math.max(0, first.offsetLeft - (box.clientWidth - first.offsetWidth) / 2);
    var top = first.getBoundingClientRect().top + window.pageYOffset - (window.innerHeight / 2) + 80;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function emptyBox(title, desc) {
    return '<div class="bkt-empty"><b>' + esc(title) + '</b>' + esc(desc) + '</div>';
  }

  /* ---------- 조작 ---------- */

  var searchTimer = null;
  if (searchEl) {
    searchEl.removeAttribute('disabled');
    searchEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        query = searchEl.value.trim();
        writeUrl();
        render();
      }, 220);
    });
  }

  if (mineBtn) {
    mineBtn.addEventListener('click', function () {
      mineOnly = !mineOnly;
      writeUrl();
      render();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      filters = {};
      query = '';
      mineOnly = true;
      if (searchEl) searchEl.value = '';
      buildFilters();
      writeUrl();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('현재 화면 링크를 복사했습니다.'); },
          function () { toast('링크 복사에 실패했습니다.'); });
      } else {
        toast('링크: ' + url);
      }
    });
  }

  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'bkt-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  readUrl();
});
