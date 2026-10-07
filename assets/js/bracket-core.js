/* SPYDER BJJ SUPERSERIES — 대진표 공용 엔진
 * 공개 페이지(brackets.js)와 관리자 페이지(admin-bracket.js)가 함께 사용합니다.
 * - 참가자 명단(roster_state) → 부문 그룹핑 → 조 편성 → 토너먼트 대진 생성
 * - 경기번호 / 매트 / 예상 경기 시간 자동 배정
 * - 결과 입력 시 다음 라운드 자동 진출(렌더 시점 동적 해석이라 연쇄 초기화가 자동 처리됨)
 */
(function (global) {
  'use strict';

  var DEFAULT_SETTINGS = {
    fieldMap: { age: 'age', gender: 'gender', grade: '', weight: 'weight' },
    defaultDuration: 5,   // 부문 기본 경기시간(분)
    maxPoolSize: 16,      // 한 조 최대 인원 (초과 시 A/B/C… 분할)
    mats: 4,              // 매트 수
    startTime: '10:00',   // 1경기 시작 시각
    gapMin: 1,            // 경기 사이 여유 시간(분)
    avoidSameTeam: true,  // 같은 소속팀 1회전 회피
    thirdPlace: 'shared', // 'shared' = 공동 3위 / 'match' = 3위 결정전
    numbering: 'global',  // 'global' = 대회 전체 연번 / 'mat' = 매트별 연번
    randomSeed: 20261018
  };

  var POOL_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  /* ---------------- 유틸 ---------------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // 시드값 기반 재현 가능한 난수 (같은 조건 → 같은 대진)
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function nextPow2(n) {
    var s = 1;
    while (s < n) s *= 2;
    return s;
  }

  // 표준 시드 배치 순서: slotOrder[i] = i번째 슬롯에 들어갈 시드 번호
  function seedSlots(size) {
    var arr = [1];
    while (arr.length < size) {
      var m = arr.length * 2 + 1;
      var next = [];
      for (var i = 0; i < arr.length; i++) {
        next.push(arr[i]);
        next.push(m - arr[i]);
      }
      arr = next;
    }
    return arr;
  }

  function roundLabel(matchesInRound) {
    if (matchesInRound === 1) return '결승';
    if (matchesInRound === 2) return '4강';
    if (matchesInRound === 4) return '8강';
    if (matchesInRound === 8) return '16강';
    if (matchesInRound === 16) return '32강';
    if (matchesInRound === 32) return '64강';
    return matchesInRound * 2 + '강';
  }

  function parseTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return 10 * 60;
    return Math.min(23, parseInt(m[1], 10)) * 60 + Math.min(59, parseInt(m[2], 10));
  }

  function formatTime(mins) {
    if (mins == null || isNaN(mins)) return '';
    var m = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* ---------------- 부문(Division) 구성 ---------------- */

  function divisionTitle(d) {
    return [d.age, d.gender, d.grade, d.weight]
      .filter(function (v) { return v && String(v).trim(); })
      .join(' · ') || '미분류 부문';
  }

  function slugify(str) {
    return String(str || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^0-9A-Za-z가-힣\-+.]/g, '')
      .toLowerCase() || 'x';
  }

  // roster athletes → 부문별 참가자 그룹
  function groupAthletes(athletes, settings) {
    var fm = (settings && settings.fieldMap) || DEFAULT_SETTINGS.fieldMap;
    var map = {};
    var order = [];

    (athletes || []).forEach(function (a, idx) {
      var name = String(a.name == null ? '' : a.name).trim();
      if (!name) return;
      var entry = {
        id: 'e' + (idx + 1),
        name: name,
        team: String(a.team == null ? '' : a.team).trim(),
        seed: Number(a.seed) > 0 ? Number(a.seed) : 0,
        age: fm.age ? String(a[fm.age] == null ? '' : a[fm.age]).trim() : '',
        gender: fm.gender ? String(a[fm.gender] == null ? '' : a[fm.gender]).trim() : '',
        grade: fm.grade ? String(a[fm.grade] == null ? '' : a[fm.grade]).trim() : '',
        weight: fm.weight ? String(a[fm.weight] == null ? '' : a[fm.weight]).trim() : ''
      };
      var key = [entry.age, entry.gender, entry.grade, entry.weight].join('|');
      if (!map[key]) {
        map[key] = { age: entry.age, gender: entry.gender, grade: entry.grade, weight: entry.weight, entries: [] };
        order.push(key);
      }
      map[key].entries.push(entry);
    });

    return order.map(function (k) { return map[k]; }).sort(function (x, y) {
      return divisionTitle(x).localeCompare(divisionTitle(y), 'ko');
    });
  }

  /* ---------------- 조 편성 ---------------- */

  function splitPools(entries, maxPoolSize, rnd) {
    var n = entries.length;
    var poolCount = Math.max(1, Math.ceil(n / Math.max(2, Number(maxPoolSize) || 16)));
    if (poolCount === 1) return [entries.slice()];

    // 시드 선수 우선 정렬 후 스네이크 분배 → 조별 인원 차이 1명 이내, 시드 분산
    var seeded = entries.filter(function (e) { return e.seed > 0; })
      .sort(function (a, b) { return a.seed - b.seed; });
    var rest = shuffle(entries.filter(function (e) { return !e.seed; }), rnd);
    var ordered = seeded.concat(rest);

    var pools = [];
    for (var i = 0; i < poolCount; i++) pools.push([]);
    ordered.forEach(function (e, i) {
      var row = Math.floor(i / poolCount);
      var col = i % poolCount;
      var target = (row % 2 === 0) ? col : (poolCount - 1 - col);
      pools[target].push(e);
    });
    return pools;
  }

  /* ---------------- 브래킷 생성 ---------------- */

  // 1회전에서 같은 소속팀끼리 만나는 경우를 가능한 범위에서 교환 회피
  function avoidSameTeamPairs(placed, conflicts) {
    var size = placed.length;
    for (var i = 0; i < size; i += 2) {
      var a = placed[i], b = placed[i + 1];
      if (!a || !b || !a.team || a.team !== b.team) continue;
      var swapped = false;
      for (var j = 0; j < size && !swapped; j += 2) {
        if (j === i) continue;
        for (var off = 0; off < 2; off++) {
          var cand = placed[j + off];
          var candPartner = placed[j + (1 - off)];
          if (!cand || cand.seed > 0) continue;
          if (a.team && a.team === cand.team) continue;
          if (candPartner && candPartner.team && candPartner.team === b.team) continue;
          placed[i + 1] = cand;
          placed[j + off] = b;
          swapped = true;
          break;
        }
      }
      if (!swapped) conflicts.push(a.team);
    }
  }

  function slotFor(entry) {
    return entry ? { entryId: entry.id } : { bye: true };
  }

  function makeMatch(divId, poolName, round, order, slots, settings, label) {
    return {
      id: divId + '-' + poolName + '-r' + round + '-' + order,
      pool: poolName,
      round: round,
      order: order,
      label: label || '',
      slots: slots,
      no: null, mat: null, time: null,
      duration: settings.defaultDuration,
      winner: null, s1: '', s2: '', method: '', note: '',
      status: '예정'
    };
  }

  // 이미 정해진 슬롯 배열(길이 = 2의 거듭제곱)로 토너먼트 트리를 만든다.
  // 자동 생성과 엑셀 대진 가져오기가 이 함수를 공유한다.
  function buildBracketMatches(divId, poolName, slots, settings, finalLabel) {
    var matches = [];
    var size = slots.length;
    if (size < 2) return matches;

    var rounds = Math.round(Math.log(size) / Math.log(2));
    var prevIds = [];

    for (var r = 0; r < rounds; r++) {
      var count = size / Math.pow(2, r + 1);
      var ids = [];
      for (var i = 0; i < count; i++) {
        var pair = (r === 0)
          ? [slots[i * 2], slots[i * 2 + 1]]
          : [{ from: prevIds[i * 2] }, { from: prevIds[i * 2 + 1] }];
        var m = makeMatch(divId, poolName, r, i, pair, settings,
          (count === 1 && finalLabel) ? finalLabel : roundLabel(count));
        matches.push(m);
        ids.push(m.id);
      }
      prevIds = ids;
    }
    return matches;
  }

  /* ---------------- 엑셀 대진 시트 양식 ---------------- */

  // 5명 블록: 1·2번 / 3·4번 경기 → (3·4번 승자 vs 5번) → 블록 결승
  function buildFiveBlock(divId, poolName, s, block, settings) {
    var m1 = makeMatch(divId, poolName, 0, block * 2, [s[0], s[1]], settings);
    var m2 = makeMatch(divId, poolName, 0, block * 2 + 1, [s[2], s[3]], settings);
    var m3 = makeMatch(divId, poolName, 1, block, [{ from: m2.id }, s[4]], settings);
    var top = makeMatch(divId, poolName, 2, block, [{ from: m1.id }, { from: m3.id }], settings);
    return [m1, m2, m3, top];
  }

  // 엑셀 "대진 시트"(선수 칸을 위→아래로 그린 양식)의 칸 배열로 대진을 만든다.
  //   2·4·8·16칸: 일반 토너먼트 (빈 칸 없이 '부전승'으로 채워진 형태)
  //   5칸: 1·2번, 3·4번 경기 → 3·4번 승자 vs 5번 → 결승
  //   10칸: 5칸 블록 2개 → 블록 승자끼리 결승
  //   "N경기 패자" 칸({ loserOf: N }): N번째 경기의 패자가 그 자리로 들어온다 (3인 부문)
  // 그 밖의 칸 수는 다음 2의 거듭제곱까지 부전승으로 채운다(padded 로 개수 반환).
  function buildSheetMatches(divId, poolName, slots, settings) {
    var n = slots.length;
    var result = { matches: [], padded: 0, errors: [] };
    if (n < 2) return result;

    var hasLoser = slots.some(function (s) { return s && s.loserOf; });
    var matches;
    var template = 'standard';

    if (n === 5) {
      template = 'five';
      matches = buildFiveBlock(divId, poolName, slots, 0, settings);
    } else if (n === 10) {
      template = 'ten';
      var a = buildFiveBlock(divId, poolName, slots.slice(0, 5), 0, settings);
      var b = buildFiveBlock(divId, poolName, slots.slice(5), 1, settings);
      matches = a.concat(b);
      matches.push(makeMatch(divId, poolName, 3, 0, [{ from: a[3].id }, { from: b[3].id }], settings));
    } else {
      var size = nextPow2(n);
      var padded = slots.slice();
      while (padded.length < size) padded.push({ bye: true });
      result.padded = size - n;
      matches = buildBracketMatches(divId, poolName, padded, settings);
    }

    // 진행 순서(라운드 → 위에서 아래)대로 정렬해 "N경기" 번호를 매긴다.
    var seq = matches.slice().sort(function (x, y) {
      return x.round !== y.round ? x.round - y.round : x.order - y.order;
    });
    var final = seq[seq.length - 1];

    if (template !== 'standard' || hasLoser) {
      var no = 0;
      seq.forEach(function (m) {
        if (m === final) m.label = '결승';
        else if (template === 'ten' && m.round === 2) m.label = '준결승';
        else m.label = (++no) + '경기';
      });
    }

    // "N경기 패자" → 해당 경기 패자 연결
    seq.forEach(function (m, idx) {
      m.slots = m.slots.map(function (s) {
        if (!s || !s.loserOf) return s;
        var k = Number(s.loserOf);
        var src = seq[k - 1];
        if (!src || k - 1 >= idx) {
          result.errors.push(k + '경기 패자 칸이 가리키는 경기가 없거나 이후 경기입니다.');
          return { bye: true };
        }
        return { from: src.id, loser: true };
      });
    });

    result.matches = matches;
    return result;
  }

  function buildPoolMatches(divId, poolName, entries, settings, rnd, conflicts) {
    var n = entries.length;
    if (n < 2) return [];

    var size = nextPow2(n);
    var order = seedSlots(size);

    var seeded = entries.filter(function (e) { return e.seed > 0; })
      .sort(function (a, b) { return a.seed - b.seed; });
    var rest = shuffle(entries.filter(function (e) { return !e.seed; }), rnd);
    var ranked = seeded.concat(rest); // ranked[k] = (k+1)번 시드 자리

    // 시드 순서대로 슬롯 배치, 남는 자리는 BYE(null) → 상위 시드에 BYE 우선 배정
    var placed = order.map(function (seedNo) {
      return ranked[seedNo - 1] || null;
    });

    if (settings.avoidSameTeam) avoidSameTeamPairs(placed, conflicts);

    return buildBracketMatches(divId, poolName, placed.map(slotFor), settings);
  }

  function buildDivision(group, index, settings, rnd) {
    var divId = 'd' + (index + 1) + '-' + slugify(divisionTitle(group)).slice(0, 40);
    var conflicts = [];
    var pools = splitPools(group.entries, settings.maxPoolSize, rnd).map(function (list, i) {
      var name = POOL_NAMES[i] || String(i + 1);
      return {
        name: name,
        entries: list.map(function (e) { return { id: e.id, name: e.name, team: e.team, seed: e.seed }; }),
        matches: buildPoolMatches(divId, name, list, settings, rnd, conflicts)
      };
    });

    var finals = buildFinals(divId, pools, settings);

    var division = {
      id: divId,
      age: group.age, gender: group.gender, grade: group.grade, weight: group.weight,
      title: divisionTitle(group),
      duration: settings.defaultDuration,
      mat: null,
      pools: pools,
      finals: finals,
      thirdPlace: null,
      thirdPlaceRule: settings.thirdPlace,
      conflicts: conflicts,
      entryCount: group.entries.length
    };

    attachThirdPlace(division, settings);
    return division;
  }

  // 각 조 우승자가 만나는 최종 결승 (조가 3개 이상이면 2의 거듭제곱으로 확장 후 BYE)
  function buildFinals(divId, pools, settings) {
    if (!pools || pools.length < 2) return [];
    var poolFinals = pools.map(function (p) {
      var last = p.matches[p.matches.length - 1];
      return last ? { from: last.id } : (p.entries[0] ? { entryId: p.entries[0].id } : { bye: true });
    });
    var fsize = nextPow2(poolFinals.length);
    while (poolFinals.length < fsize) poolFinals.push({ bye: true });
    return buildBracketMatches(divId, 'F', poolFinals, settings, '최종 결승');
  }

  // 3위 결정전 (설정 시)
  function attachThirdPlace(division, settings) {
    division.thirdPlace = null;
    if (settings.thirdPlace !== 'match') return division;
    var semi = lastSemifinals(division);
    if (semi.length !== 2) return division;
    division.thirdPlace = {
      id: division.id + '-3RD', pool: 'F', round: 98, order: 0, label: '3위 결정전',
      slots: [{ from: semi[0], loser: true }, { from: semi[1], loser: true }],
      no: null, mat: null, time: null, duration: settings.defaultDuration,
      winner: null, s1: '', s2: '', method: '', note: '', status: '예정'
    };
    return division;
  }

  // 결승 직전 라운드(준결승) 매치 id 2개
  function lastSemifinals(division) {
    var list = (division.finals && division.finals.length)
      ? division.finals
      : ((division.pools[0] && division.pools[0].matches) || []);
    if (!list.length) return [];
    var maxRound = -1;
    list.forEach(function (m) { if (m.round < 90 && m.round > maxRound) maxRound = m.round; });
    var semis = list.filter(function (m) { return m.round === maxRound - 1; });
    return semis.length === 2 ? [semis[0].id, semis[1].id] : [];
  }

  /* ---------------- 경기번호 · 매트 · 예상 시각 배정 ---------------- */

  function allMatches(division) {
    var list = [];
    (division.pools || []).forEach(function (p) { list = list.concat(p.matches || []); });
    list = list.concat(division.finals || []);
    if (division.thirdPlace) list.push(division.thirdPlace);
    return list;
  }

  // BYE 로 실제 치러지지 않는 경기인지 판정
  // 한쪽이 BYE면 상대가 확정이든 미정이든 부전승(통과) 경기다.
  function isSkippedMatch(match, byId) {
    var occ = resolveSlots(match, byId);
    var byes = occ.filter(function (o) { return o.kind === 'bye'; }).length;
    return byes > 0 && (occ.length - byes) <= 1;
  }

  function scheduleAll(state) {
    var settings = state.settings;
    var byId = indexMatches(state);
    var matCount = Math.max(1, Number(settings.mats) || 1);
    var start = parseTime(settings.startTime);
    var gap = Number(settings.gapMin) || 0;

    var matCursor = [];
    var matSeq = [];
    for (var i = 0; i < matCount; i++) { matCursor.push(start); matSeq.push(0); }

    var globalNo = 0;

    (state.divisions || []).forEach(function (d, di) {
      var matIndex = (d.mat != null && d.mat >= 1 && d.mat <= matCount) ? (d.mat - 1) : (di % matCount);
      d.mat = matIndex + 1;

      var list = allMatches(d).slice().sort(function (a, b) {
        if (a.round !== b.round) return a.round - b.round;
        if (a.pool !== b.pool) return String(a.pool).localeCompare(String(b.pool));
        return a.order - b.order;
      });

      list.forEach(function (m) {
        m.mat = matIndex + 1;
        if (isSkippedMatch(m, byId)) {
          m.no = null;
          m.time = null;
          m.status = '부전승';
          return;
        }
        if (settings.numbering === 'mat') {
          matSeq[matIndex] += 1;
          m.no = (matIndex + 1) + '-' + matSeq[matIndex];
        } else {
          globalNo += 1;
          m.no = String(globalNo);
        }
        var dur = Number(m.duration) || Number(d.duration) || settings.defaultDuration;
        m.duration = dur;
        m.time = formatTime(matCursor[matIndex]);
        matCursor[matIndex] += dur + gap;
        if (m.status === '부전승') m.status = '예정';
      });
    });

    return state;
  }

  /* ---------------- 결과 해석 (자동 진출) ---------------- */

  function indexMatches(state) {
    var byId = {};
    (state.divisions || []).forEach(function (d) {
      allMatches(d).forEach(function (m) { byId[m.id] = m; });
    });
    return byId;
  }

  function entryIndex(division) {
    var map = {};
    (division.pools || []).forEach(function (p) {
      (p.entries || []).forEach(function (e) { map[e.id] = e; });
    });
    return map;
  }

  // 한 경기의 승자. BYE는 자동 진출, 미입력은 null.
  function winnerOf(match, byId, depth) {
    if (!match) return null;
    depth = depth || 0;
    if (depth > 12) return null;
    var occ = resolveSlots(match, byId, depth);
    var real = occ.filter(function (o) { return o.kind === 'entry'; });
    var byes = occ.filter(function (o) { return o.kind === 'bye'; });
    if (real.length === 1 && byes.length === 1) return real[0].entryId; // 부전승 자동 진출
    if (!match.winner) return null;
    // 이전 라운드 결과가 바뀌어 더 이상 유효하지 않은 승자는 무시 (연쇄 초기화)
    var ok = real.some(function (o) { return o.entryId === match.winner; });
    return ok ? match.winner : null;
  }

  function loserOf(match, byId, depth) {
    var w = winnerOf(match, byId, depth);
    if (!w) return null;
    var occ = resolveSlots(match, byId, depth);
    var others = occ.filter(function (o) { return o.kind === 'entry' && o.entryId !== w; });
    return others.length === 1 ? others[0].entryId : null;
  }

  // 슬롯 점유자 해석: {kind:'entry'|'bye'|'tbd', entryId, fromLabel}
  function resolveSlots(match, byId, depth) {
    depth = depth || 0;
    return (match.slots || []).map(function (s) {
      if (s.bye) return { kind: 'bye' };
      if (s.entryId) return { kind: 'entry', entryId: s.entryId };
      if (s.from) {
        var src = byId[s.from];
        if (!src || depth > 12) return { kind: 'tbd' };
        var id = s.loser ? loserOf(src, byId, depth + 1) : winnerOf(src, byId, depth + 1);
        if (id) return { kind: 'entry', entryId: id };
        var srcOcc = resolveSlots(src, byId, depth + 1);
        var allBye = srcOcc.every(function (o) { return o.kind === 'bye'; });
        if (allBye) return { kind: 'bye' };
        var fromLabel;
        if (!s.loser && src.pool !== match.pool && src.pool !== 'F') fromLabel = src.pool + '조 우승자';
        else fromLabel = (src.label || '') + (src.no ? ' #' + src.no : '') + (s.loser ? ' 패자' : ' 승자');
        return { kind: 'tbd', fromLabel: fromLabel };
      }
      return { kind: 'tbd' };
    });
  }

  // 부문 최종 순위 (우승/준우승/3위)
  function podiumOf(division, byId) {
    var pool = (division.finals && division.finals.length)
      ? division.finals
      : ((division.pools[0] && division.pools[0].matches) || []);
    var bracketMatches = pool.filter(function (m) { return m.round < 90; });

    if (!bracketMatches.length) {
      var solo = (division.pools[0] && division.pools[0].entries[0]) || null;
      return solo ? { first: solo.id, second: null, thirds: [] } : null;
    }

    var finalMatch = null;
    bracketMatches.forEach(function (m) {
      if (!finalMatch || m.round > finalMatch.round) finalMatch = m;
    });
    var first = winnerOf(finalMatch, byId);
    if (!first) return null;
    var second = loserOf(finalMatch, byId);
    var thirds = [];
    if (division.thirdPlace) {
      var t = winnerOf(division.thirdPlace, byId);
      if (t) thirds.push(t);
    } else {
      // 결승에 선수를 올려 보낸 경기의 패자 = 공동 3위.
      // 패자가 다른 경기로 이어지는 경기(예: 3인 부문의 1경기)는 제외한다.
      var consumed = {};
      allMatches(division).forEach(function (m) {
        (m.slots || []).forEach(function (s) { if (s.from && s.loser) consumed[s.from] = true; });
      });
      (finalMatch.slots || []).forEach(function (s) {
        if (!s.from || s.loser || consumed[s.from]) return;
        var l = loserOf(byId[s.from], byId);
        if (l) thirds.push(l);
      });
    }
    return { first: first, second: second, thirds: thirds };
  }

  // 체급 정렬: -49kg < -54kg … < +84kg < 앱솔루트(무제한)
  function weightRank(w) {
    var s = String(w || '').replace(/\s/g, '');
    var m = /^([+-]?)(\d+(?:\.\d+)?)kg$/i.exec(s);
    if (m) return Number(m[2]) * 2 + (m[1] === '+' ? 1 : 0);
    if (/앱솔루트|absolute|무제한/i.test(s)) return 1e6;
    return 1e5;
  }

  function compareWeight(a, b) {
    var d = weightRank(a) - weightRank(b);
    return d !== 0 ? d : String(a || '').localeCompare(String(b || ''), 'ko', { numeric: true });
  }

  /* ---------------- 상태 생성 ---------------- */

  function mergeSettings(settings) {
    var s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    s.fieldMap = Object.assign({}, DEFAULT_SETTINGS.fieldMap, (settings && settings.fieldMap) || {});
    return s;
  }

  function generate(athletes, settings) {
    var s = mergeSettings(settings);
    var rnd = mulberry32(Number(s.randomSeed) || DEFAULT_SETTINGS.randomSeed);
    var groups = groupAthletes(athletes, s);
    var state = {
      settings: s,
      divisions: groups.map(function (g, i) { return buildDivision(g, i, s, rnd); }),
      generatedAt: new Date().toISOString()
    };
    return scheduleAll(state);
  }

  function emptyState(settings) {
    return { settings: mergeSettings(settings), divisions: [], generatedAt: null };
  }

  function normalizeState(raw) {
    var s = (raw && typeof raw === 'object') ? raw : {};
    return {
      settings: mergeSettings(s.settings),
      divisions: Array.isArray(s.divisions) ? s.divisions : [],
      generatedAt: s.generatedAt || null
    };
  }

  global.SPYDER_BRACKET = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    POOL_NAMES: POOL_NAMES,
    clone: clone,
    escapeHtml: escapeHtml,
    divisionTitle: divisionTitle,
    slugify: slugify,
    groupAthletes: groupAthletes,
    generate: generate,
    nextPow2: nextPow2,
    buildBracketMatches: buildBracketMatches,
    buildSheetMatches: buildSheetMatches,
    compareWeight: compareWeight,
    buildFinals: buildFinals,
    attachThirdPlace: attachThirdPlace,
    emptyState: emptyState,
    normalizeState: normalizeState,
    mergeSettings: mergeSettings,
    scheduleAll: scheduleAll,
    indexMatches: indexMatches,
    entryIndex: entryIndex,
    allMatches: allMatches,
    resolveSlots: resolveSlots,
    winnerOf: winnerOf,
    loserOf: loserOf,
    podiumOf: podiumOf,
    isSkippedMatch: isSkippedMatch,
    formatTime: formatTime,
    parseTime: parseTime,
    roundLabel: roundLabel
  };
})(window);
