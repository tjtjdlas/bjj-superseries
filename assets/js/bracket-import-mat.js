/* SPYDER BJJ SUPERSERIES — 매트별 대진표 엑셀 읽기 (시트 1개 = 매트 1개)
 * 예) "각 매트 별 스파이더 대진표 최종.xlsx": 1매트 … 8매트 시트에 부문 대진도가 진행 순서대로 그려져 있다.
 *  - 부문 제목·선수 칸 모양은 "대진 시트 양식"과 같다.
 *  - 같은 부문이 여러 매트 시트에 똑같이 그려져 있으면(매트를 나눠 치르는 부문) 한 부문으로 합친다.
 *  - 조(A·B·C·D조)와 결승이 서로 다른 매트 시트에 있어도 제목으로 묶는다.
 *  - "1매트 34" / "1 - 33" 칸은 가장 가까운 경기의 매트·경기번호로 읽는다.
 *  - 시트 안 위→아래(같은 줄은 왼→오른쪽) 순서를 매트 진행 순서로 보고 공개 화면 정렬에 쓴다.
 * 기존 "대진 시트 양식"·"행 양식" 읽기(bracket-import.js)는 그대로 두기 위해 별도 파일로 둔다.
 * 아래 제목·선수 칸 해석 함수는 bracket-import.js 의 것과 같은 규칙이다.
 */
(function (global) {
  'use strict';

  var B = global.SPYDER_BRACKET;

  var MAT_SHEET_RE = /^\s*(\d+)\s*매트\s*$/;
  var TITLE_RE = /kg|앱솔루트|결승/i;
  var POOL_WINNER_RE = /^([A-Z])조우승자$/i;
  var LOSER_RE = /^(\d+)경기패자$/;
  // 경기번호 칸: "1매트 34" 또는 "1 - 33"(매트 - 번호)
  var MATCH_NO_RES = [/^(\d+)\s*매트\s*(\d+)$/, /^(\d+)\s*-\s*(\d+)$/];
  var BYE_WORDS = ['bye', '부전승', '부전', '-', '—', '없음', 'x'];
  var AGE_WORDS = ['키즈', '유소년', '초등부', '중등부', '고등부', '어덜트', '노기', '마스터'];
  var LABEL_MAX_GAP = 2.5; // 경기번호 칸과 경기 연결 지점 사이 허용 거리(행)

  /* ---------- 칸 해석 ---------- */

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\s()·\-_/\\.]/g, '');
  }

  function isByeWord(v) {
    var n = norm(v);
    return n !== '' && BYE_WORDS.indexOf(n) !== -1;
  }

  function cleanText(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function compact(v) {
    return cleanText(v).replace(/\s/g, '');
  }

  function cellText(ws, addr) {
    var c = ws[addr];
    if (!c) return '';
    return String(c.v != null ? c.v : (c.w || ''));
  }

  function matOfSheet(name) {
    var m = MAT_SHEET_RE.exec(name || '');
    return m ? Number(m[1]) : null;
  }

  function parseMatchNo(text) {
    var t = cleanText(text);
    for (var i = 0; i < MATCH_NO_RES.length; i++) {
      var m = MATCH_NO_RES[i].exec(t);
      if (m) return { mat: Number(m[1]), no: String(Number(m[2])) };
    }
    return null;
  }

  function splitTitle(raw) {
    var title = cleanText(raw).replace(/남자/g, '남성').replace(/여자/g, '여성');
    var isFinal = /결승전?$/.test(title);
    var base = title.replace(/\s*결승전?$/, '');
    var pool = '';
    var pm = /\s([A-Z])\s*조$/i.exec(base);
    if (pm) {
      pool = pm[1].toUpperCase();
      base = base.slice(0, pm.index);
    }
    return { title: title, base: cleanText(base), pool: pool, isFinal: isFinal };
  }

  // "마스터 1 블루벨트 남성 -70kg" → 연령부 / 등급 / 성별 / 체급
  function divisionFields(base) {
    var tokens = base.split(' ').filter(Boolean);
    var f = { age: '', gender: '', grade: '', weight: '' };
    var last = tokens[tokens.length - 1] || '';
    if (/^[+-]?\d+(\.\d+)?kg$/i.test(last) || /앱솔루트/.test(last)) {
      f.weight = last;
      tokens.pop();
    }
    if (AGE_WORDS.indexOf(tokens[0]) !== -1) {
      f.age = tokens.shift();
      if (f.age === '마스터' && /^\d+$/.test(tokens[0] || '')) f.age += ' ' + tokens.shift();
    }
    var rest = tokens.filter(function (t) {
      if (t === '남성' || t === '여성') { f.gender = t; return false; }
      return true;
    });
    if (f.age) f.grade = rest.join(' ');
    else f.age = rest.join(' ') || '기타'; // 예) SPYDER BJJ SUPERSERIES
    return f;
  }

  function parseSlotText(raw) {
    var text = String(raw == null ? '' : raw).replace(/\r/g, '');
    var flat = cleanText(text);
    if (!flat) return { kind: 'empty' };
    var cp = flat.replace(/\s/g, '');
    if (isByeWord(flat)) return { kind: 'bye' };
    var lm = LOSER_RE.exec(cp);
    if (lm) return { kind: 'loser', k: Number(lm[1]) };
    var pw = POOL_WINNER_RE.exec(cp);
    if (pw) return { kind: 'poolWinner', pool: pw[1].toUpperCase() };
    var lines = text.split('\n').map(cleanText).filter(Boolean);
    return { kind: 'player', name: lines[0], team: lines.slice(1).join(' ') };
  }

  function slotKey(p) {
    if (p.kind === 'player') return 'p:' + compact(p.name) + '|' + compact(p.team);
    if (p.kind === 'loser') return 'l:' + p.k;
    return p.kind;
  }

  /* ---------- 워크북 판별 ---------- */

  // "1매트", "2매트" … 이름의 시트에 부문 제목(가로 병합 칸)이 있으면 매트별 양식
  function looksLikeMatWorkbook(XLSX, wb) {
    return wb.SheetNames.some(function (name) {
      if (matOfSheet(name) == null) return false;
      var ws = wb.Sheets[name];
      return ((ws && ws['!merges']) || []).some(function (m) {
        return m.e.c - m.s.c >= 2 && TITLE_RE.test(cellText(ws, XLSX.utils.encode_cell(m.s)));
      });
    });
  }

  /* ---------- 경기번호 칸 위치 계산 ---------- */

  // 선수 칸 행 위치로 각 경기의 연결 지점(두 칸 사이) 행을 구한다.
  // buildSheetMatches 의 칸 배치(일반 2^n칸 / 5칸 블록 / 10칸)를 그대로 따른다.
  function junctionRows(matches, rows) {
    var n = rows.length;
    var byId = {};
    matches.forEach(function (m) { byId[m.id] = m; });
    function find(round, order) {
      return matches.filter(function (m) { return m.round === round && m.order === order; })[0];
    }
    var leaf = {};
    if (n === 5 || n === 10) {
      for (var b = 0; b < n / 5; b++) {
        var o = b * 5;
        var m1 = find(0, b * 2), m2 = find(0, b * 2 + 1), m3 = find(1, b);
        if (m1) leaf[m1.id] = [rows[o], rows[o + 1]];
        if (m2) leaf[m2.id] = [rows[o + 2], rows[o + 3]];
        if (m3) leaf[m3.id] = [null, rows[o + 4]];
      }
    } else {
      matches.forEach(function (m) {
        if (m.round === 0) leaf[m.id] = [rows[m.order * 2], rows[m.order * 2 + 1]];
      });
    }
    var memo = {};
    function rowOf(m, depth) {
      if (memo[m.id] !== undefined) return memo[m.id];
      if (depth > 12) return null;
      var vals = (m.slots || []).map(function (sl, i) {
        if (sl.from && !sl.loser && byId[sl.from]) return rowOf(byId[sl.from], depth + 1);
        var l = leaf[m.id];
        return l ? l[i] : null;
      }).filter(function (v) { return v != null; });
      memo[m.id] = vals.length ? vals.reduce(function (a, v) { return a + v; }, 0) / vals.length : null;
      return memo[m.id];
    }
    var out = {};
    matches.forEach(function (m) { out[m.id] = rowOf(m, 0); });
    return out;
  }

  /* ---------- 본문 ---------- */

  function parseMatWorkbook(XLSX, wb, settings) {
    var s = B.mergeSettings(settings);
    s.defaultDuration = null; // 양식의 "경기시간" 표기는 규정과 달라 읽지 않는다
    var errors = [];
    var warnings = [];
    var sheets = [];

    function warn(where, column, value, reason, fix) {
      warnings.push({ where: where, column: column, value: value, reason: reason, fix: fix });
    }
    function fail(where, column, value, reason, fix) {
      errors.push({ where: where, column: column, value: value, reason: reason, fix: fix });
    }

    /* 1) 시트별로 제목·선수 칸·경기번호 칸 수집 */
    wb.SheetNames.forEach(function (sheetName, sheetIdx) {
      var ws = wb.Sheets[sheetName];
      if (!ws) return;
      var anchors = {};
      var titles = [];
      var boxes = [];
      var labels = [];

      (ws['!merges'] || []).forEach(function (m) {
        var addr = XLSX.utils.encode_cell(m.s);
        anchors[addr] = true;
        var text = cellText(ws, addr);
        if (m.e.c - m.s.c >= 2 && TITLE_RE.test(text) && !/^\s*게임수/.test(text)) {
          titles.push({ r: m.s.r, r2: m.e.r, c: m.s.c, c2: m.e.c, addr: addr, text: text, boxes: [] });
          return;
        }
        var no = parseMatchNo(text);
        if (no) {
          labels.push({ r: (m.s.r + m.e.r) / 2, c: m.s.c, addr: addr, text: cleanText(text), mat: no.mat, no: no.no });
        } else if (m.e.c === m.s.c && m.e.r - m.s.r === 2) {
          boxes.push({ r: m.s.r, row: m.s.r + 1, c: m.s.c, addr: addr, text: text });
        }
      });

      Object.keys(ws).forEach(function (k) {
        if (k.charAt(0) === '!' || anchors[k]) return;
        var v = ws[k] && ws[k].v;
        if (typeof v !== 'string' || !v.trim()) return;
        var rc = XLSX.utils.decode_cell(k);
        var no = parseMatchNo(v);
        if (no) labels.push({ r: rc.r, c: rc.c, addr: k, text: cleanText(v), mat: no.mat, no: no.no });
        // 병합되지 않은 "이름\n소속" 칸도 선수 칸으로 인정
        else if (v.indexOf('\n') !== -1) boxes.push({ r: rc.r, row: rc.r, c: rc.c, addr: k, text: v });
      });
      if (!titles.length) return; // 작업용 시트 등은 건너뜀

      // 선수 칸 → 같은 열에서 바로 위의 제목. 그 사이에 이 열을 덮는 다른 제목이 있으면 다른 대진의 칸이다.
      boxes.forEach(function (b) {
        var owner = null;
        titles.forEach(function (t) {
          if (t.c === b.c && t.r2 < b.r && (!owner || t.r > owner.r)) owner = t;
        });
        var blocked = owner && titles.some(function (t) {
          return t !== owner && t.r > owner.r && t.r < b.r && t.c <= b.c && b.c <= t.c2;
        });
        if (!owner || blocked) {
          var p = parseSlotText(b.text);
          if (p.kind === 'player') {
            warn(sheetName + ' ' + b.addr, '선수 칸', p.name, '이 칸이 속한 부문 제목을 찾지 못해 읽지 않았습니다.', '선수 칸이 부문 제목과 같은 열에 있는지 확인하세요.');
          }
          return;
        }
        owner.boxes.push(b);
      });

      titles.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
      var sheet = { name: sheetName, idx: sheetIdx, mat: matOfSheet(sheetName), titles: titles, labels: labels };
      titles.forEach(function (t, pos) {
        t.pos = pos;
        t.sheet = sheet;
        t.info = splitTitle(t.text);
        t.boxes.sort(function (a, b) { return a.r - b.r; });
        t.slots = t.boxes.map(function (b) {
          var p = parseSlotText(b.text);
          p.row = b.row;
          p.addr = b.addr;
          return p;
        });
        t.maxRow = t.boxes.length ? t.boxes[t.boxes.length - 1].r + 2 : t.r2;
      });
      sheets.push(sheet);
    });

    var matSheets = {};
    sheets.forEach(function (sh) { if (sh.mat != null && !matSheets[sh.mat]) matSheets[sh.mat] = sh.name; });

    /* 2) 제목 → 부문/조 묶기 (시트가 달라도 같은 제목이면 같은 부문) */
    var groups = {};
    var groupOrder = [];
    var finalDrawings = [];

    function groupOf(info, t) {
      var key = compact(info.base);
      if (!groups[key]) {
        groups[key] = { key: key, base: info.base, first: t, pools: {}, poolOrder: [], finals: [], drawings: [] };
        groupOrder.push(key);
      }
      return groups[key];
    }

    sheets.forEach(function (sh) {
      sh.titles.forEach(function (t) {
        var where = sh.name + ' ' + t.addr;
        var info = t.info;
        var real = t.slots.filter(function (x) { return x.kind === 'player' || x.kind === 'bye' || x.kind === 'loser'; });
        var winners = t.slots.filter(function (x) { return x.kind === 'poolWinner'; });
        var empties = t.slots.filter(function (x) { return x.kind === 'empty'; });

        // 조 결승: "…결승(전)" 제목, 또는 "A조 우승자" 칸만 있는 대진
        if (info.isFinal || (winners.length && !real.length)) {
          if (real.length) warn(where, '부문 제목', info.title, '결승 제목 아래의 선수 칸은 읽지 않았습니다.', '조 결승은 각 조 우승자로 자동 구성됩니다.');
          t.kind = 'final';
          t.finalSlots = t.slots.filter(function (x) { return x.kind === 'poolWinner' || x.kind === 'empty'; });
          finalDrawings.push(t);
          return;
        }

        var slots;
        var tbd = false;
        if (real.length) {
          slots = t.slots.filter(function (x) { return x.kind !== 'empty'; });
          if (empties.length) {
            warn(where, '선수 칸', empties.length + '칸', '빈 선수 칸 ' + empties.length + '개는 읽지 않았습니다.', '빈 자리는 "부전승"으로 적어 주세요.');
          }
        } else if (empties.length >= 2) {
          // 선수 칸이 모두 비어 있는 대진(예: 슈퍼시리즈) → 선수 미정 대진
          slots = empties;
          tbd = true;
        } else {
          warn(where, '부문 제목', info.title, '제목 아래에서 선수 칸을 찾지 못했습니다.', '선수 칸이 제목과 같은 열에 세로 3칸 병합으로 들어 있는지 확인하세요.');
          return;
        }

        var g = groupOf(info, t);
        var poolName = info.pool || 'A';
        var sig = slots.map(slotKey).join('/');
        var p = g.pools[poolName];
        if (!p) {
          p = g.pools[poolName] = { name: poolName, slots: slots, sig: sig, tbd: tbd, drawings: [] };
          g.poolOrder.push(poolName);
        } else if (p.sig !== sig) {
          var firstWhere = p.drawings[0].sheet.name + ' ' + p.drawings[0].addr;
          fail(where, '부문 제목', info.title, '같은 부문·조가 ' + firstWhere + '에도 있는데 선수 칸이 다릅니다. 먼저 나온 대진만 반영했습니다.',
            '두 곳의 선수 칸을 똑같이 맞추거나, 조 이름(A조·B조)을 확인하세요.');
          return;
        }
        t.kind = 'pool';
        t.poolName = poolName;
        t.group = g;
        p.drawings.push(t);
        g.drawings.push(t);
      });
    });

    // 결승 대진 → 조가 2개 이상인 부문에 연결. 제목이 조금 달라도(예: "마스터 통합 남성 앱솔루트 결승전")
    // 같은 시트에서 단어가 모두 들어 있는 부문을 찾는다.
    finalDrawings.forEach(function (t) {
      var info = t.info;
      var where = t.sheet.name + ' ' + t.addr;
      var g = groups[compact(info.base)];
      if (!g || g.poolOrder.length < 2) {
        var words = info.base.split(' ').filter(Boolean);
        var cands = groupOrder.map(function (k) { return groups[k]; }).filter(function (x) {
          if (x.poolOrder.length < 2 || x.finals.length) return false;
          var have = x.base.split(' ');
          return words.every(function (w) { return have.indexOf(w) !== -1; });
        });
        var same = cands.filter(function (x) {
          return x.drawings.some(function (d) { return d.sheet === t.sheet; });
        });
        g = (same.length === 1) ? same[0] : (cands.length === 1 ? cands[0] : null);
        if (!g) {
          warn(where, '부문 제목', info.title, '이 결승에 해당하는 조(A조·B조) 부문을 찾지 못해 읽지 않았습니다.', '결승 제목을 조 제목과 같은 이름으로 맞춰 주세요.');
          return;
        }
      }
      t.group = g;
      g.finals.push(t);
      g.drawings.push(t);
    });

    if (!groupOrder.length) {
      return {
        kind: 'mat', ok: false, warnings: [], summary: null, state: null, sheets: [],
        errors: [{ where: '-', column: '-', value: '', reason: '매트 시트에서 부문 제목을 찾지 못했습니다.', fix: '부문 제목(예: "중등부 일반 남성 -70kg")이 가로로 병합된 칸에 있는지 확인하세요.' }]
      };
    }

    /* 3) 부문 만들기 */
    var labelOf = {}; // match id → 경기번호 칸
    var candidates = []; // 경기번호 칸을 붙일 수 있는 경기 위치

    function addCandidates(t, matches, rows) {
      var jr = junctionRows(matches, rows);
      matches.forEach(function (m) {
        if (jr[m.id] == null) return;
        candidates.push({ t: t, sheet: t.sheet, id: m.id, row: jr[m.id], round: m.round });
      });
    }

    var divisions = groupOrder.map(function (key, gi) {
      var g = groups[key];
      var divId = 'm' + (gi + 1) + '-' + B.slugify(g.base).slice(0, 40);
      var entrySeq = 0;
      var poolInfo = {};

      var pools = g.poolOrder.slice().sort().map(function (poolName) {
        var p = g.pools[poolName];
        var entries = [];
        var byKey = {};
        var slots = p.slots.map(function (x) {
          var where = p.drawings[0].sheet.name + ' ' + x.addr;
          if (p.tbd) return { tbd: true };
          if (x.kind === 'bye') return { bye: true };
          if (x.kind === 'loser') return { loserOf: x.k };
          if (x.kind === 'poolWinner') {
            warn(where, '선수 칸', x.pool + '조 우승자', '조 결승 안내 칸이 일반 대진에 섞여 있어 부전승으로 처리했습니다.', '조 결승은 자동 구성되므로 칸을 지워 주세요.');
            return { bye: true };
          }
          var k = x.name + '|' + x.team;
          if (byKey[k]) {
            warn(where, '선수 칸', x.name, '같은 조에 이미 있는 선수입니다(' + byKey[k].addr + ').', '중복 칸이면 한쪽을 부전승으로 바꿔 주세요.');
          } else {
            entrySeq++;
            byKey[k] = { id: divId + '-e' + entrySeq, name: x.name, team: x.team, seed: 0, addr: x.addr };
            entries.push(byKey[k]);
          }
          return { entryId: byKey[k].id };
        });

        var built = B.buildSheetMatches(divId, poolName, slots, s);
        var first = p.drawings[0];
        built.errors.forEach(function (msg) {
          fail(first.sheet.name + ' ' + first.addr, '선수 칸', '', msg, '"N경기 패자" 칸의 번호를 확인하세요.');
        });
        if (built.padded) {
          warn(first.sheet.name + ' ' + first.addr, '선수 칸', slots.length + '칸',
            '양식에 없는 칸 수라 빈 자리 ' + built.padded + '개를 부전승으로 채웠습니다.',
            '2·4·5·8·10·16칸 중 하나로 맞추면 엑셀과 같은 모양이 됩니다.');
        }
        var matches = (entries.length > 1 || p.tbd) ? built.matches : [];
        p.drawings.forEach(function (t) {
          addCandidates(t, matches, t.slots.filter(function (x) { return x.kind !== 'empty' || p.tbd; }).map(function (x) { return x.row; }));
        });
        poolInfo[poolName] = { drawings: p.drawings, matches: matches };
        return {
          name: poolName,
          entries: entries.map(function (e) { return { id: e.id, name: e.name, team: e.team, seed: 0 }; }),
          matches: matches
        };
      });

      // 조가 여러 개면 각 조의 마지막 경기는 "조 결승"(우승자가 최종 결승 진출)
      if (pools.length > 1) {
        pools.forEach(function (p) {
          if (p.matches.length) p.matches[p.matches.length - 1].label = '조 결승';
        });
      }

      // 최종 결승: 결승 대진에 "A조 우승자" 칸이 있으면 그 순서대로, 아니면 조 순서대로
      var finals = [];
      if (pools.length > 1) {
        var fd = g.finals[0];
        var order = pools.map(function (p) { return p.name; });
        if (fd) {
          var named = fd.finalSlots.filter(function (x) { return x.kind === 'poolWinner'; }).map(function (x) { return x.pool; });
          var known = named.filter(function (n, i) { return order.indexOf(n) !== -1 && named.indexOf(n) === i; });
          if (known.length === order.length) order = known;
          else if (named.length) warn(fd.sheet.name + ' ' + fd.addr, '부문 제목', fd.info.title, '결승 대진의 "N조 우승자" 칸이 조 목록과 맞지 않아 조 순서대로 구성했습니다.', '조 이름(A조·B조)을 확인하세요.');
        }
        var sorted = order.map(function (n) { return pools.filter(function (p) { return p.name === n; })[0]; });
        finals = B.buildFinals(divId, sorted, s);
        g.finals.forEach(function (t) {
          var rows = t.finalSlots.map(function (x) { return x.row; });
          if (rows.length === B.nextPow2(sorted.length)) addCandidates(t, finals, rows);
        });
        if (g.finals.length > 1) {
          warn(g.finals[1].sheet.name + ' ' + g.finals[1].addr, '부문 제목', g.finals[1].info.title, '같은 부문의 결승 대진이 여러 번 그려져 있어 첫 번째 것을 기준으로 했습니다.', '');
        }
      } else if (g.finals.length) {
        g.finals.forEach(function (t) {
          warn(t.sheet.name + ' ' + t.addr, '부문 제목', t.info.title, '조가 하나뿐인 부문이라 결승 대진을 따로 만들지 않았습니다.', '');
        });
      }

      var f = divisionFields(g.base);
      var pendingSlots = 0;
      g.poolOrder.forEach(function (n) { if (g.pools[n].tbd) pendingSlots += g.pools[n].slots.length; });
      var division = {
        id: divId,
        group: g.first.sheet.name,
        age: f.age, gender: f.gender, grade: f.grade, weight: f.weight,
        title: g.base,
        duration: null,
        mat: null,
        pools: pools,
        finals: finals,
        thirdPlace: null,
        thirdPlaceRule: 'shared',
        conflicts: [],
        entryCount: pools.reduce(function (acc, p) { return acc + p.entries.length; }, 0),
        source: 'mat',
        sheet: g.first.sheet.name,
        cell: g.first.addr
      };
      if (pendingSlots && !division.entryCount) {
        division.pending = true;
        division.pendingSlots = pendingSlots;
      }
      division._g = g;
      division._poolInfo = poolInfo;
      return division;
    });

    /* 4) 경기번호 칸 → 경기 (가장 가까운 연결 지점부터 하나씩) */
    var pairs = [];
    sheets.forEach(function (sh) {
      sh.labels.forEach(function (lb) {
        candidates.forEach(function (cd) {
          if (cd.sheet !== sh) return;
          var t = cd.t;
          if (lb.c <= t.c || lb.c > t.c2 + 2) return;
          if (lb.r <= t.r2 || lb.r > t.maxRow + 2) return;
          var gap = Math.abs(lb.r - cd.row);
          if (gap > LABEL_MAX_GAP) return;
          pairs.push({ lb: lb, cd: cd, cost: gap + cd.round * 0.001 + (lb.c > t.c2 ? 0.5 : 0) });
        });
      });
    });
    pairs.sort(function (a, b) { return a.cost - b.cost; });
    var usedLabel = [];
    var usedSpot = [];
    pairs.forEach(function (x) {
      if (usedLabel.indexOf(x.lb) !== -1) return;
      var spot = x.cd.t.addr + '|' + x.cd.sheet.name + '|' + x.cd.id;
      if (usedSpot.indexOf(spot) !== -1) return;
      usedLabel.push(x.lb);
      usedSpot.push(spot);
      x.lb.used = true;
      var prev = labelOf[x.cd.id];
      if (!prev) {
        labelOf[x.cd.id] = { mat: x.lb.mat, no: x.lb.no, where: x.cd.sheet.name + ' ' + x.lb.addr, text: x.lb.text };
      } else if (prev.mat !== x.lb.mat || prev.no !== x.lb.no) {
        warn(x.cd.sheet.name + ' ' + x.lb.addr, '경기번호', x.lb.text,
          '같은 경기에 다른 시트(' + prev.where + ')에서는 "' + prev.text + '"로 적혀 있습니다. 먼저 나온 번호를 썼습니다.',
          '여러 매트 시트에 그린 같은 대진의 경기번호를 똑같이 맞춰 주세요.');
      }
    });

    // 연결되지 않은 경기번호 칸 (같은 대진을 여러 시트에 그린 경우 한 번만 알림)
    var looseSeen = {};
    sheets.forEach(function (sh) {
      sh.labels.forEach(function (lb) {
        if (lb.used) return;
        var near = null;
        sh.titles.forEach(function (t) {
          if (lb.c > t.c && lb.c <= t.c2 + 2 && lb.r > t.r2 && lb.r <= t.maxRow + 2) near = t;
        });
        var name = near ? near.info.title : '';
        var k = name + '|' + lb.text;
        if (looseSeen[k]) { looseSeen[k].n++; return; }
        looseSeen[k] = { n: 1, where: sh.name + ' ' + lb.addr, text: lb.text, name: name };
      });
    });
    Object.keys(looseSeen).forEach(function (k) {
      var x = looseSeen[k];
      warn(x.where, '경기번호', x.text,
        (x.name ? '"' + x.name + '" 대진 옆에 있지만 ' : '') + '어느 경기 자리인지 알 수 없어 반영하지 않았습니다' + (x.n > 1 ? ' (시트 ' + x.n + '곳 동일)' : '') + '.',
        '경기번호 칸을 해당 경기의 두 선수 칸 사이(연결선 옆)에 두세요. 3위 결정전 등 따로 치르는 경기라면 알려 주세요.');
    });

    /* 5) 경기별 매트·번호, 부문별 매트 목록·진행 순서 */
    var sheetIdx = {};
    sheets.forEach(function (sh) { sheetIdx[sh.name] = sh.idx; });
    var numberSeen = {};

    divisions.forEach(function (d) {
      var g = d._g;
      var byIdLocal = B.indexMatches({ divisions: [d] });

      function onlyMat(drawings) {
        var mats = [];
        drawings.forEach(function (t) { if (mats.indexOf(t.sheet.mat) === -1) mats.push(t.sheet.mat); });
        return mats.length === 1 ? mats[0] : null;
      }
      function apply(matches, partMat) {
        matches.forEach(function (m) {
          var lb = labelOf[m.id];
          if (lb) {
            m.mat = lb.mat;
            m.no = lb.no;
            var nk = lb.mat + '|' + lb.no;
            if (numberSeen[nk] && numberSeen[nk].id !== m.id) {
              warn(lb.where, '경기번호', lb.text, lb.mat + '매트 ' + lb.no + '번이 다른 경기(' + numberSeen[nk].title + ')에도 있습니다.', '경기번호가 겹치지 않는지 확인하세요.');
            } else {
              numberSeen[nk] = { id: m.id, title: d.title };
            }
          } else if (partMat != null && !B.isSkippedMatch(m, byIdLocal)) {
            m.mat = partMat;
          }
        });
      }

      Object.keys(d._poolInfo).forEach(function (n) {
        var pi = d._poolInfo[n];
        apply(pi.matches, onlyMat(pi.drawings));
      });
      if (d.finals.length) {
        var fMat = g.finals.length ? onlyMat(g.finals) : onlyMat(g.drawings);
        apply(d.finals, fMat);
      }

      // 이 부문이 보일 매트 시트: 그려진 시트 + 경기번호에 적힌 매트
      var names = [];
      var pos = {};
      g.drawings.forEach(function (t) {
        if (names.indexOf(t.sheet.name) === -1) names.push(t.sheet.name);
        if (pos[t.sheet.name] == null || t.pos < pos[t.sheet.name]) pos[t.sheet.name] = t.pos;
      });
      var mats = [];
      B.allMatches(d).forEach(function (m) {
        if (m.mat != null && mats.indexOf(m.mat) === -1) mats.push(m.mat);
      });
      mats.forEach(function (mt) {
        var nm = matSheets[mt];
        if (nm && names.indexOf(nm) === -1) { names.push(nm); pos[nm] = 9999; }
      });
      names.sort(function (a, b) { return sheetIdx[a] - sheetIdx[b]; });
      mats.sort(function (a, b) { return a - b; });

      d.sheets = names;
      d.sheetPos = pos;
      d.mats = mats;
      d.mat = mats.length === 1 ? mats[0] : null;
      d._order = [sheetIdx[names[0]], pos[names[0]]];
    });

    // 정렬: 처음 나오는 매트 시트 → 그 시트에서의 위치
    divisions.sort(function (a, b) { return (a._order[0] - b._order[0]) || (a._order[1] - b._order[1]); });
    divisions.forEach(function (d) { delete d._order; delete d._g; delete d._poolInfo; });

    var state = { settings: B.mergeSettings(settings), divisions: divisions, generatedAt: new Date().toISOString() };
    var byId = B.indexMatches(state);

    // 같은 선수가 같은 종목(기 / 노기)에서 서로 다른 체급 2곳 이상에 들어 있으면 경고(앱솔루트 제외).
    // 기·노기 동시 출전이나 어덜트·마스터 같은 체급 동시 출전은 정상 배정으로 본다.
    var seen = {};
    divisions.forEach(function (d) {
      if (/앱솔루트/.test(d.weight)) return;
      var kind = d.age === '노기' ? '노기' : '기';
      d.pools.forEach(function (p) {
        p.entries.forEach(function (e) {
          var k = kind + '|' + e.name + '|' + compact(e.team);
          (seen[k] = seen[k] || []).push(d);
        });
      });
    });
    Object.keys(seen).forEach(function (k) {
      var list = seen[k].filter(function (d, i, arr) { return arr.indexOf(d) === i; });
      var weights = list.map(function (d) { return d.weight; }).filter(function (w, i, arr) { return arr.indexOf(w) === i; });
      if (weights.length < 2) return;
      var parts = k.split('|');
      warn(list[0].sheets.join('·'), '선수', parts[1], parts[0] + ' 체급 부문 ' + list.length + '곳에 배정되어 있습니다: ' +
        list.map(function (d) { return d.title + '(' + d.sheets.join('·') + ')'; }).join(' / '), '의도한 배정인지 확인하세요.');
    });

    /* 6) 매트별 집계 */
    var sheetInfo = sheets.map(function (sh) {
      return { name: sh.name, mat: sh.mat, order: sh.idx, divisions: 0, shared: 0, matches: 0, numbered: 0, declared: null, players: 0 };
    });
    var players = 0;
    var realMatches = 0;
    var noMat = 0;
    divisions.forEach(function (d) {
      players += d.entryCount;
      d.sheets.forEach(function (nm) {
        var info = sheetInfo.filter(function (x) { return x.name === nm; })[0];
        if (!info) return;
        info.divisions++;
        info.players += d.entryCount;
        if (d.sheets.length > 1) info.shared++;
      });
      B.allMatches(d).forEach(function (m) {
        if (B.isSkippedMatch(m, byId)) return;
        realMatches++;
        if (m.mat == null) { noMat++; return; }
        var info = sheetInfo.filter(function (x) { return x.mat === m.mat; })[0];
        if (!info) return;
        info.matches++;
        if (m.no) info.numbered++;
      });
    });

    var summary = {
      kind: 'mat',
      sheets: sheetInfo.length,
      divisions: divisions.length,
      shared: divisions.filter(function (d) { return d.sheets.length > 1; }).length,
      pending: divisions.filter(function (d) { return d.pending; }).length,
      players: players,
      matches: realMatches,
      numbered: Object.keys(labelOf).length,
      noMat: noMat,
      errors: errors.length,
      warnings: warnings.length
    };

    return { kind: 'mat', ok: errors.length === 0, errors: errors, warnings: warnings, summary: summary, state: state, sheets: sheetInfo };
  }

  global.SPYDER_BRACKET_IMPORT_MAT = {
    looksLikeMatWorkbook: looksLikeMatWorkbook,
    parseMatWorkbook: parseMatWorkbook,
    parseMatchNo: parseMatchNo
  };
})(window);
