/* SPYDER BJJ SUPERSERIES — 공개 대진표 페이지
 * bracket_state.published(게시본)만 표시하며, 게시 즉시 실시간 반영됩니다.
 */
document.addEventListener('DOMContentLoaded', function () {
  var B = window.SPYDER_BRACKET;
  var R = window.SPYDER_BRACKET_RENDER;
  var esc = B.escapeHtml;

  var listEl = document.querySelector('#bracketList');
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

  var FIELDS = [
    { key: 'age', label: '연령부' },
    { key: 'gender', label: '성별' },
    { key: 'grade', label: '등급' },
    { key: 'weight', label: '체급' },
    { key: 'mat', label: '매트' }
  ];

  var state = B.emptyState();
  var byId = {};
  var filters = {};
  var query = '';
  var mineOnly = true;
  var loaded = false;

  /* ---------- URL 상태 ---------- */

  function readUrl() {
    var p = new URLSearchParams(location.search);
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
    FIELDS.forEach(function (f) { if (filters[f.key]) p.set(f.key, filters[f.key]); });
    if (query) p.set('q', query);
    if (query && !mineOnly) p.set('mine', '0');
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  /* ---------- 데이터 ---------- */

  // 대진표 공개 예정 안내. 대진표가 게시되면 이 안내는 자동으로 사라진다.
  var COMING_SOON_TITLE = '대진표는 9월 23일부터 조회하실 수 있습니다.';
  var COMING_SOON_DESC = '부문별 대진이 준비되는 대로 순차 공개되며, 공개 즉시 이 화면에 자동으로 반영됩니다. 그때까지는 참가 선수 명단에서 접수 현황을 확인해 주세요.';

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
    buildFilters();
    showPublishedAt(publishedAt);
    render();
  }

  sb.from('bracket_state').select('published, published_at, version').eq('id', 1).single()
    .then(function (res) {
      if (res.error || !res.data) {
        // 테이블 미생성 등으로 조회가 안 될 때도 이용자에게는 공개 예정 안내를 보여준다.
        console.warn('[대진표] 조회 실패:', res.error && res.error.message);
        showComingSoon();
        return;
      }
      applyState(res.data.published, res.data.published_at);
    });

  sb.channel('bracket_state_public')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bracket_state', filter: 'id=eq.1' }, function (payload) {
      applyState(payload.new.published, payload.new.published_at);
      toast('대진표가 업데이트되었습니다.');
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

  function valuesFor(key) {
    var set = {};
    state.divisions.forEach(function (d) {
      var v = (key === 'mat') ? (d.mat ? 'MAT ' + d.mat : '') : d[key];
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ko', { numeric: true }); });
  }

  function buildFilters() {
    if (!filterEl) return;
    filterEl.innerHTML = FIELDS.map(function (f) {
      var vals = valuesFor(f.key);
      if (!vals.length) return '';
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

  function passesFilters(d) {
    for (var k in filters) {
      var v = (k === 'mat') ? (d.mat ? 'MAT ' + d.mat : '') : (d[k] || '');
      if (v !== filters[k]) return false;
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

    if (!state.divisions.length) {
      showComingSoon();
      return;
    }

    var pool = state.divisions.filter(passesFilters);
    var rendered = [];
    var hitCount = 0;

    pool.forEach(function (d) {
      var res = R.renderDivision(d, { byId: byId, query: query });
      if (res.hit) hitCount++;
      if (query && mineOnly && !res.hit) return;
      rendered.push(res.html);
    });

    if (!rendered.length) {
      var why = query
        ? '"' + esc(query) + '" 에 해당하는 선수를 찾지 못했습니다.'
        : '선택한 조건에 해당하는 부문이 없습니다.';
      listEl.innerHTML = emptyBox(why,
        '이름의 일부만 입력하거나(초성 검색 가능), 필터를 초기화한 뒤 다시 찾아보세요.');
    } else {
      listEl.innerHTML = rendered.join('');
    }

    if (countEl) {
      var parts = ['전체 ' + state.divisions.length + '개 부문 중 ' + rendered.length + '개 표시'];
      if (query) parts.push('검색 일치 부문 ' + hitCount + '개');
      countEl.textContent = parts.join(' · ');
    }

    if (query) focusFirstHit();
  }

  function focusFirstHit() {
    var first = listEl.querySelector('.bkt-match.is-hit');
    if (!first) return;
    first.classList.add('is-flash');
    setTimeout(function () { first.classList.remove('is-flash'); }, 2600);
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
