/* SPYDER BJJ SUPERSERIES — 대진도 렌더러 (공개 화면 / 관리자 미리보기 공용) */
(function (global) {
  'use strict';

  var B = global.SPYDER_BRACKET;
  var esc = B.escapeHtml;

  // 예상 시작시각(10:00 등)을 공개 화면에 표시할지 여부.
  // 데이터·관리자 입력칸·엑셀 열은 그대로 유지되며, 여기만 true 로 바꾸면 즉시 다시 노출된다.
  var SHOW_TIME = false;

  /* ---------- 검색 유틸 (부분 문자열 + 한글 초성) ---------- */

  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function chosungOf(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7A3) out += CHO[Math.floor((code - 0xAC00) / 588)];
      else out += str[i];
    }
    return out;
  }

  function isChosungQuery(q) {
    return /^[ㄱ-ㅎ]+$/.test(q);
  }

  function matchesQuery(text, q) {
    if (!q) return false;
    var t = String(text || '');
    if (!t) return false;
    if (t.toLowerCase().indexOf(q.toLowerCase()) !== -1) return true;
    if (isChosungQuery(q)) return chosungOf(t).indexOf(q) !== -1;
    return false;
  }

  function highlight(text, q) {
    var t = String(text == null ? '' : text);
    if (!q) return esc(t);
    var idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return esc(t);
    return esc(t.slice(0, idx)) + '<mark>' + esc(t.slice(idx, idx + q.length)) + '</mark>' + esc(t.slice(idx + q.length));
  }

  /* ---------- 매치 카드 ---------- */

  function statusClass(status) {
    if (status === '진행') return 's-live';
    if (status === '종료') return 's-done';
    if (status === '부전승') return 's-bye';
    return '';
  }

  function renderMatch(match, ctx) {
    var byId = ctx.byId;
    var entries = ctx.entries;
    var occ = B.resolveSlots(match, byId);
    var winner = B.winnerOf(match, byId);
    var skipped = B.isSkippedMatch(match, byId);
    var hit = false;

    var slotsHtml = occ.map(function (o, i) {
      var cls = ['bkt-slot'];
      var inner = '';
      if (o.kind === 'bye') {
        cls.push('is-bye');
        inner = '<span class="bkt-name">BYE · 부전승</span>';
      } else if (o.kind === 'tbd') {
        cls.push('is-tbd');
        inner = '<span class="bkt-name">' + esc(o.fromLabel || '진출자 미정') + '</span>';
      } else {
        var e = entries[o.entryId] || { name: '(알 수 없음)', team: '' };
        var isW = winner && o.entryId === winner;
        if (isW) cls.push('is-winner');
        else if (winner) cls.push('is-loser');
        var nameHit = ctx.query && matchesQuery(e.name, ctx.query);
        var teamHit = ctx.query && matchesQuery(e.team, ctx.query);
        if (nameHit || teamHit) hit = true;
        var score = (i === 0 ? match.s1 : match.s2);
        inner =
          (e.seed ? '<span class="bkt-seed" title="시드 ' + e.seed + '번">' + e.seed + '</span>' : '') +
          '<span class="bkt-name">' + highlight(e.name, nameHit ? ctx.query : '') + '</span>' +
          '<span class="bkt-team">' + highlight(e.team || '-', teamHit ? ctx.query : '') + '</span>' +
          (score !== '' && score != null ? '<span class="bkt-score">' + esc(score) + '</span>' : '');
      }
      return '<div class="' + cls.join(' ') + '">' + inner + '</div>';
    }).join('');

    var status = skipped ? '부전승' : (match.status || '예정');
    var head =
      '<div class="bkt-match-head">' +
        (match.no ? '<span class="bkt-no">#' + esc(match.no) + '</span>' : '<span class="bkt-no">—</span>') +
        (match.mat ? '<span class="bkt-mat">MAT ' + esc(match.mat) + '</span>' : '') +
        '<span class="bkt-status ' + statusClass(status) + '">' + esc(status) + '</span>' +
        (SHOW_TIME && match.time ? '<span class="bkt-time" title="예상 경기 시간">' + esc(match.time) + '</span>' : '') +
        (match.duration && !skipped ? '<span class="bkt-dur">' + esc(match.duration) + '분</span>' : '') +
      '</div>';

    var aria = match.label + (match.no ? ' 경기번호 ' + match.no : '') +
      (match.mat ? ', 매트 ' + match.mat : '') +
      (SHOW_TIME && match.time ? ', 예상 시작 ' + match.time : '') + (skipped ? ', 부전승 경기' : '');

    return {
      html: '<div class="bkt-match' + (skipped ? ' is-bye' : '') + (hit ? ' is-hit' : '') + '"' +
        ' id="m-' + esc(match.id) + '" data-mid="' + esc(match.id) + '"' +
        ' role="group" aria-label="' + esc(aria) + '">' + head + slotsHtml + '</div>',
      hit: hit
    };
  }

  /* ---------- 라운드 그리드 ---------- */

  function renderRounds(matches, ctx, standalone) {
    if (!matches.length) return { html: '', hit: false };
    var rounds = {};
    matches.forEach(function (m) {
      (rounds[m.round] = rounds[m.round] || []).push(m);
    });
    var keys = Object.keys(rounds).map(Number).sort(function (a, b) { return a - b; });
    var anyHit = false;

    var cols = keys.map(function (r) {
      var list = rounds[r].slice().sort(function (a, b) { return a.order - b.order; });
      var cells = list.map(function (m) {
        var res = renderMatch(m, ctx);
        if (res.hit) anyHit = true;
        return '<div class="bkt-cell">' + res.html + '</div>';
      }).join('');
      return '<div class="bkt-round' + (standalone ? ' is-standalone' : '') + '">' +
        '<div class="bkt-round-label">' + esc(list[0].label || B.roundLabel(list.length)) + '</div>' +
        '<div class="bkt-round-body">' + cells + '</div>' +
      '</div>';
    }).join('');

    return {
      html: '<div class="bkt-scroll"><div class="bkt-rounds">' + cols + '</div></div>',
      hit: anyHit
    };
  }

  /* ---------- 포디움 ---------- */

  function renderPodium(division, ctx) {
    var p = B.podiumOf(division, ctx.byId);
    if (!p) return '';
    var items = [];
    function item(rank, cls, id) {
      var e = ctx.entries[id];
      if (!e) return;
      items.push('<div class="bkt-podium-item ' + cls + '">' +
        '<span class="bkt-podium-rank">' + rank + '</span>' +
        '<span class="bkt-podium-name">' + esc(e.name) + '</span>' +
        '<span class="bkt-podium-team">' + esc(e.team || '-') + '</span></div>');
    }
    item('1위', 'is-1', p.first);
    if (p.second) item('2위', 'is-2', p.second);
    (p.thirds || []).forEach(function (t) { item('3위', 'is-3', t); });
    return items.length ? '<div class="bkt-podium">' + items.join('') + '</div>' : '';
  }

  /* ---------- 부문 ---------- */

  function renderDivision(division, opts) {
    opts = opts || {};
    var ctx = {
      byId: opts.byId,
      entries: B.entryIndex(division),
      query: opts.query || ''
    };

    var anyHit = false;
    var body = '';

    (division.pools || []).forEach(function (pool) {
      var multi = (division.pools || []).length > 1;
      if (!pool.matches || !pool.matches.length) {
        if (pool.entries && pool.entries.length === 1) {
          var solo = pool.entries[0];
          if (ctx.query && (matchesQuery(solo.name, ctx.query) || matchesQuery(solo.team, ctx.query))) anyHit = true;
          body += (multi ? '<div class="bkt-round-label" style="text-align:left;border:none;">' + esc(pool.name) + '조</div>' : '') +
            '<p class="bkt-note">단독 참가: <b style="color:var(--white)">' + esc(solo.name) + '</b> (' + esc(solo.team || '-') + ') — 경기 없이 우승 처리</p>';
        }
        return;
      }
      var res = renderRounds(pool.matches, ctx, false);
      if (res.hit) anyHit = true;
      body += (multi ? '<div class="bkt-pool-tabs"><span class="bkt-pool-tab is-on">' + esc(pool.name) + '조</span></div>' : '') + res.html;
    });

    if (division.finals && division.finals.length) {
      var fr = renderRounds(division.finals, ctx, false);
      if (fr.hit) anyHit = true;
      body += '<div class="bkt-pool-tabs" style="margin-top:20px;"><span class="bkt-pool-tab is-on">조별 승자 결승</span></div>' + fr.html;
    }

    if (division.thirdPlace) {
      var tr = renderRounds([division.thirdPlace], ctx, true);
      if (tr.hit) anyHit = true;
      body += '<div class="bkt-pool-tabs" style="margin-top:20px;"><span class="bkt-pool-tab is-on">3위 결정전</span></div>' + tr.html;
    }

    var poolCount = (division.pools || []).length;
    var tags = [
      '<span class="bkt-tag">참가 ' + (division.entryCount || 0) + '명</span>',
      poolCount > 1 ? '<span class="bkt-tag">' + poolCount + '개 조</span>' : '',
      division.mat ? '<span class="bkt-tag is-accent">MAT ' + esc(division.mat) + '</span>' : '',
      (SHOW_TIME && firstTimeOf(division)) ? '<span class="bkt-tag is-accent">시작 ' + esc(firstTimeOf(division)) + '</span>' : '',
      (division.conflicts && division.conflicts.length) ? '<span class="bkt-tag is-red" title="같은 소속팀 1회전 회피 불가">동일팀 대결 ' + division.conflicts.length + '건</span>' : ''
    ].filter(Boolean).join('');

    var html =
      '<article class="bkt-division" id="div-' + esc(division.id) + '" data-div="' + esc(division.id) + '">' +
        '<header class="bkt-division-head">' +
          '<h3 class="bkt-division-title">' + esc(division.title || B.divisionTitle(division)) + '</h3>' +
          '<div class="bkt-meta">' + tags + '</div>' +
        '</header>' +
        renderPodium(division, ctx) +
        body +
      '</article>';

    return { html: html, hit: anyHit };
  }

  function firstTimeOf(division) {
    var t = null;
    B.allMatches(division).forEach(function (m) {
      if (!m.time) return;
      if (!t || B.parseTime(m.time) < B.parseTime(t)) t = m.time;
    });
    return t;
  }

  global.SPYDER_BRACKET_RENDER = {
    SHOW_TIME: SHOW_TIME,
    renderDivision: renderDivision,
    renderRounds: renderRounds,
    renderMatch: renderMatch,
    matchesQuery: matchesQuery,
    chosungOf: chosungOf,
    firstTimeOf: firstTimeOf
  };
})(window);
