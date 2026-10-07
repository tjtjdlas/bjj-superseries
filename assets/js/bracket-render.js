/* SPYDER BJJ SUPERSERIES — 대진도 렌더러 (공개 화면 / 관리자 미리보기 공용)
 * 경기 사이의 연결(승자 진출)을 따라 트리로 배치한다.
 * 8강·4강·결승 같은 일반 토너먼트뿐 아니라 5인·10인 블록, 3인(1경기 패자) 형식도 엑셀과 같은 모양으로 그린다.
 */
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

  function renderMatch(match, ctx, style) {
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
        inner = '<span class="bkt-who"><span class="bkt-name">부전승</span></span>';
      } else if (o.kind === 'tbd') {
        cls.push('is-tbd');
        inner = '<span class="bkt-who"><span class="bkt-name">' + esc(o.fromLabel || '진출자 미정') + '</span></span>';
      } else {
        var e = entries[o.entryId] || { name: '(알 수 없음)', team: '' };
        // 부전승 경기는 치르지 않았으므로 승/패 표시를 하지 않는다
        if (!skipped && winner) cls.push(o.entryId === winner ? 'is-winner' : 'is-loser');
        var nameHit = ctx.query && matchesQuery(e.name, ctx.query);
        var teamHit = ctx.query && matchesQuery(e.team, ctx.query);
        if (nameHit || teamHit) { hit = true; cls.push('is-hit'); }
        var score = (i === 0 ? match.s1 : match.s2);
        inner =
          (e.seed ? '<span class="bkt-seed" title="시드 ' + e.seed + '번">' + e.seed + '</span>' : '') +
          '<span class="bkt-who">' +
            '<span class="bkt-name">' + highlight(e.name, nameHit ? ctx.query : '') + '</span>' +
            '<span class="bkt-team">' + highlight(e.team || '-', teamHit ? ctx.query : '') + '</span>' +
          '</span>' +
          (score !== '' && score != null ? '<span class="bkt-score">' + esc(score) + '</span>' : '');
      }
      return '<div class="' + cls.join(' ') + '">' + inner + '</div>';
    }).join('');

    var status = skipped ? '부전승' : (match.status || '예정');
    var head =
      '<div class="bkt-match-head">' +
        '<span class="bkt-label">' + esc(match.label || '') + '</span>' +
        (match.no ? '<span class="bkt-no">#' + esc(match.no) + '</span>' : '') +
        (match.mat ? '<span class="bkt-mat">MAT ' + esc(match.mat) + '</span>' : '') +
        (status !== '예정' ? '<span class="bkt-status ' + statusClass(status) + '">' + esc(status) + '</span>' : '') +
        (SHOW_TIME && match.time ? '<span class="bkt-time" title="예상 경기 시간">' + esc(match.time) + '</span>' : '') +
        (match.duration && !skipped ? '<span class="bkt-dur">' + esc(match.duration) + '분</span>' : '') +
      '</div>';

    var aria = (match.label || '경기') + (match.no ? ' 경기번호 ' + match.no : '') +
      (match.mat ? ', 매트 ' + match.mat : '') +
      (SHOW_TIME && match.time ? ', 예상 시작 ' + match.time : '') + (skipped ? ', 부전승 경기' : '');

    return {
      html: '<div class="bkt-match' + (skipped ? ' is-bye' : '') + (hit ? ' is-hit' : '') + '"' +
        (style ? ' style="' + style + '"' : '') +
        ' id="m-' + esc(match.id) + '" data-mid="' + esc(match.id) + '"' +
        ' role="group" aria-label="' + esc(aria) + '">' + head + slotsHtml + '</div>',
      hit: hit
    };
  }

  /* ---------- 트리 배치 ---------- */

  // 경기마다 열(c)과 세로 위치(y, 칸 단위)를 정한다.
  //  - 승자가 올라오는 경기가 없으면 첫 열에 위→아래 순서대로
  //  - 두 경기의 승자가 만나면 두 경기 가운데
  //  - 한쪽만 경기 승자이고 다른 쪽이 바로 들어오는 선수면(5인 블록) 그 경기에서 반 칸 비켜서
  function layoutTree(matches) {
    var byId = {};
    matches.forEach(function (m) { byId[m.id] = m; });

    var feeders = {};
    var fed = {};
    matches.forEach(function (m) {
      feeders[m.id] = [];
      (m.slots || []).forEach(function (s, i) {
        if (s.from && !s.loser && byId[s.from]) {
          feeders[m.id].push({ id: s.from, slot: i });
          fed[s.from] = true;
        }
      });
    });

    var order = function (a, b) { return (a.round - b.round) || (a.order - b.order); };
    var pos = {};
    var leaf = 0;

    function visit(m) {
      if (pos[m.id]) return pos[m.id];
      pos[m.id] = { c: 0, y: 0 }; // 순환 방지
      var f = feeders[m.id];
      var p;
      if (!f.length) {
        p = { c: 0, y: leaf++ };
      } else {
        var kids = f.map(function (x) { return { p: visit(byId[x.id]), slot: x.slot }; });
        var c = 1 + Math.max.apply(null, kids.map(function (k) { return k.p.c; }));
        var y;
        if (kids.length >= 2) {
          y = kids.reduce(function (acc, k) { return acc + k.p.y; }, 0) / kids.length;
        } else {
          y = kids[0].p.y + (kids[0].slot === 0 ? 0.5 : -0.5);
        }
        p = { c: c, y: y };
      }
      pos[m.id] = p;
      return p;
    }

    matches.filter(function (m) { return !fed[m.id]; }).sort(order).forEach(visit);
    matches.slice().sort(order).forEach(visit);

    var minY = Infinity, maxY = -Infinity, maxC = 0;
    matches.forEach(function (m) {
      var p = pos[m.id];
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.c > maxC) maxC = p.c;
    });
    matches.forEach(function (m) { pos[m.id].y -= minY; });

    return { pos: pos, feeders: feeders, cols: maxC + 1, rows: maxY - minY + 1 };
  }

  // calc() 식 만들기: [[계수, 'var(--uh)'], …]
  function calcExpr(terms) {
    var out = '';
    terms.forEach(function (t) {
      var k = Math.round(t[0] * 1000) / 1000;
      if (!k) return;
      var abs = Math.abs(k);
      var term = (abs === 1 ? '' : abs + ' * ') + t[1];
      if (!out) out = (k < 0 ? '-1 * ' : '') + term;
      else out += (k < 0 ? ' - ' : ' + ') + term;
    });
    return out ? 'calc(' + out + ')' : '0px';
  }

  var UH = 'var(--uh)', HH = 'var(--hh)', SH = 'var(--sh)', CW = 'var(--cw)', GX = 'var(--gx)';

  // 아래 경기(child) 오른쪽 가운데 → 위 경기(parent)의 해당 선수 칸 왼쪽으로 꺾은선
  function connectorHtml(cp, pp, slot) {
    var dy = pp.y - cp.y;
    // 세로 거리(부모 선수 칸 - 자식 가운데) = dy*uh + hh/2 + (slot-0.5)*sh
    var down = dy > 0 || (dy === 0 && slot === 1);
    var hTerms = down
      ? [[dy, UH], [0.5, HH], [slot - 0.5, SH]]
      : [[-dy, UH], [-0.5, HH], [0.5 - slot, SH]];
    var span = pp.c - cp.c;
    var elbowLeft = calcExpr([[cp.c + 1, CW], [cp.c, GX]]);
    var elbowWidth = calcExpr([[span - 1, CW], [span - 0.5, GX]]);
    var childY = calcExpr([[cp.y + 0.5, UH]]);
    var slotY = calcExpr([[pp.y + 0.5, UH], [0.5, HH], [slot - 0.5, SH]]);
    return '<span class="bkt-link ' + (down ? 'is-down' : 'is-up') + '" style="left:' + elbowLeft +
        ';width:' + elbowWidth + ';top:' + (down ? childY : slotY) + ';height:' + calcExpr(hTerms) + ';"></span>' +
      '<span class="bkt-link is-in" style="left:' + calcExpr([[pp.c, CW], [pp.c - 0.5, GX]]) +
        ';top:' + slotY + ';"></span>';
  }

  function renderTree(matches, ctx) {
    if (!matches || !matches.length) return { html: '', hit: false };
    var lay = layoutTree(matches);
    var anyHit = false;
    var cards = '';
    var links = '';

    matches.forEach(function (m) {
      var p = lay.pos[m.id];
      var res = renderMatch(m, ctx, '--c:' + p.c + ';--y:' + p.y);
      if (res.hit) anyHit = true;
      cards += res.html;
      lay.feeders[m.id].forEach(function (f) {
        links += connectorHtml(lay.pos[f.id], p, f.slot);
      });
    });

    return {
      html: '<div class="bkt-scroll"><div class="bkt-tree" style="--cols:' + lay.cols + ';--rows:' + lay.rows + ';">' +
        links + cards + '</div></div>',
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

  function sectionLabel(text) {
    return '<div class="bkt-section-label">' + esc(text) + '</div>';
  }

  function renderDivision(division, opts) {
    opts = opts || {};
    var ctx = {
      byId: opts.byId,
      entries: B.entryIndex(division),
      query: opts.query || ''
    };

    var anyHit = false;
    var body = '';
    var pools = division.pools || [];
    var multi = pools.length > 1;

    if (division.pending) {
      body += '<p class="bkt-pending">출전 선수는 추후 공개됩니다.' +
        (division.pendingSlots ? ' (' + esc(division.pendingSlots) + '인 토너먼트)' : '') + '</p>';
    }

    pools.forEach(function (pool) {
      if (!pool.matches || !pool.matches.length) {
        if (pool.entries && pool.entries.length === 1) {
          var solo = pool.entries[0];
          if (ctx.query && (matchesQuery(solo.name, ctx.query) || matchesQuery(solo.team, ctx.query))) anyHit = true;
          body += (multi ? sectionLabel(pool.name + '조') : '') +
            '<p class="bkt-note">단독 참가: <b style="color:var(--white)">' + esc(solo.name) + '</b> (' + esc(solo.team || '-') + ') — 경기 없이 우승 처리</p>';
        }
        return;
      }
      var res = renderTree(pool.matches, ctx);
      if (res.hit) anyHit = true;
      body += (multi ? sectionLabel(pool.name + '조') : '') + res.html;
    });

    if (division.finals && division.finals.length) {
      var fr = renderTree(division.finals, ctx);
      if (fr.hit) anyHit = true;
      body += sectionLabel(pools.length > 2 ? '조 우승자 결선' : 'A·B조 우승자 결승') + fr.html;
    }

    if (division.thirdPlace) {
      var tr = renderTree([division.thirdPlace], ctx);
      if (tr.hit) anyHit = true;
      body += sectionLabel('3위 결정전') + tr.html;
    }

    var tags = [
      division.pending
        ? '<span class="bkt-tag">선수 추후 공개</span>'
        : '<span class="bkt-tag">참가 ' + (division.entryCount || 0) + '명</span>',
      multi ? '<span class="bkt-tag">' + pools.length + '개 조</span>' : '',
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
    renderTree: renderTree,
    renderRounds: renderTree,
    renderMatch: renderMatch,
    layoutTree: layoutTree,
    matchesQuery: matchesQuery,
    chosungOf: chosungOf,
    firstTimeOf: firstTimeOf
  };
})(window);
