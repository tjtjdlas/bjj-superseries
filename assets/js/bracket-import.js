/* SPYDER BJJ SUPERSERIES — 엑셀 대진 가져오기
 * 엑셀에 "1회전 대진"을 그대로 적어 넣으면(한 행 = 한 경기) 그 배치대로 대진표를 만든다.
 * 8강·4강·결승 등 이후 라운드는 자동으로 이어 붙고, 승자 전파도 그대로 동작한다.
 */
(function (global) {
  'use strict';

  var B = global.SPYDER_BRACKET;

  /* ---------- 양식 정의 ---------- */

  var COLUMNS = [
    { key: 'age',      label: '연령부',       required: true,  alias: ['연령', '부별', '연령대', '부'] },
    { key: 'gender',   label: '성별',         required: true,  alias: [] },
    { key: 'grade',    label: '등급',         required: false, alias: ['벨트', '등급벨트'] },
    { key: 'weight',   label: '체급',         required: true,  alias: ['무게'] },
    { key: 'pool',     label: '조',           required: false, alias: ['조편성', '풀', 'group'] },
    { key: 'no',       label: '경기번호',     required: false, alias: ['번호', 'no', '경기no'] },
    { key: 'mat',      label: '매트',         required: false, alias: ['mat', '매트번호'] },
    { key: 'time',     label: '시작시각',     required: false, alias: ['시작시간', '예상시각', '예상시간', '경기시각', '시간'] },
    { key: 'duration', label: '경기시간(분)', required: false, alias: ['경기시간', '진행시간', '분'] },
    { key: 'nameA',    label: '선수A',        required: true,  alias: ['선수1', '선수명a', 'a선수', '청'] },
    { key: 'teamA',    label: '소속A',        required: false, alias: ['소속1', '팀a', '소속팀a'] },
    { key: 'seedA',    label: '시드A',        required: false, alias: ['시드1'] },
    { key: 'nameB',    label: '선수B',        required: false, alias: ['선수2', '선수명b', 'b선수', '홍'] },
    { key: 'teamB',    label: '소속B',        required: false, alias: ['소속2', '팀b', '소속팀b'] },
    { key: 'seedB',    label: '시드B',        required: false, alias: ['시드2'] }
  ];

  var BYE_WORDS = ['bye', '부전승', '부전', '-', '—', '없음', 'x'];

  // 엑셀 양식에 채워 넣는 예시 행 (양식 다운로드용)
  var SAMPLE_ROWS = [
    ['중등부', '남자', '일반', '-63kg', 'A', 1, 1, '10:00', 5, '김민준', '스파이더 주짓수', 1, '이서준', '서울 BJJ', ''],
    ['중등부', '남자', '일반', '-63kg', 'A', 2, 1, '10:07', 5, '박도윤', '한강 아카데미', '', '최지호', '강남 주짓수', ''],
    ['중등부', '남자', '일반', '-63kg', 'A', 3, 1, '10:14', 5, '정하람', '부산 BJJ', '', 'BYE', '', ''],
    ['중등부', '남자', '일반', '-63kg', 'A', 4, 1, '10:21', 5, '강시우', '대구 주짓수', 2, '윤재원', '인천 BJJ', ''],
    ['중등부', '남자', '일반', '-63kg', 'B', 5, 2, '10:00', 5, '임건우', '광주 주짓수', 1, '오태양', '제주 BJJ', ''],
    ['중등부', '남자', '일반', '-63kg', 'B', 6, 2, '10:07', 5, '한수호', '수원 아카데미', '', '신우진', '용인 BJJ', ''],
    ['고등부', '여자', '유색', '-53kg', '', 7, 3, '10:00', 6, '서지우', '스파이더 주짓수', 1, '문가은', '서울 BJJ', ''],
    ['고등부', '여자', '유색', '-53kg', '', 8, 3, '10:08', 6, '조하늘', '한강 아카데미', '', '배수린', '분당 주짓수', '']
  ];

  var GUIDE_ROWS = [
    ['항목', '필수', '예시', '설명'],
    ['연령부', '필수', '중등부', '부문을 나누는 기준입니다. 표기를 통일해 주세요(띄어쓰기 포함).'],
    ['성별', '필수', '남자', '남자 / 여자'],
    ['등급', '선택', '일반', '일반 / 유색 등. 사용하지 않으면 전체 비워 두세요.'],
    ['체급', '필수', '-63kg', '-63kg, +94kg 처럼 통일된 표기를 사용하세요.'],
    ['조', '선택', 'A', 'A·B조로 나눌 때만 입력. 비워 두면 단일 조로 처리하고, 조가 2개 이상이면 조 우승자끼리 최종 결승이 자동 생성됩니다.'],
    ['경기번호', '선택', '1', '비워 두면 설정값 기준으로 자동 부여됩니다.'],
    ['매트', '선택', '1', '비워 두면 부문별로 자동 배정됩니다.'],
    ['시작시각', '선택', '10:00', 'HH:MM 형식. 비워 두면 시작 시각·경기시간으로 자동 계산됩니다.'],
    ['경기시간(분)', '선택', '5', '비워 두면 대진 설정의 기본 경기시간을 사용합니다.'],
    ['선수A', '필수', '김민준', '왼쪽(위) 자리 선수 이름'],
    ['소속A', '선택', '스파이더 주짓수', '소속팀'],
    ['시드A', '선택', '1', '시드 배지로 표시됩니다.'],
    ['선수B', '선택', '이서준', '오른쪽(아래) 자리 선수. 비워 두거나 BYE 라고 적으면 부전승 처리됩니다.'],
    ['소속B', '선택', '서울 BJJ', '소속팀'],
    ['시드B', '선택', '', '시드 배지로 표시됩니다.'],
    ['', '', '', ''],
    ['작성 방법', '', '', ''],
    ['1', '', '', '한 행에 1회전 경기 한 개(선수 2명)를 적습니다. 위에서부터 적은 순서가 곧 대진도의 위→아래 순서입니다.'],
    ['2', '', '', '8강·4강·결승 등 다음 라운드는 사이트가 자동으로 이어서 그립니다. 다음 라운드 행은 적지 않아도 됩니다.'],
    ['3', '', '', '부전승은 선수B를 비우거나 BYE 라고 적습니다.'],
    ['4', '', '', '한 조의 1회전 경기 수가 2·4·8개가 아니면 남는 자리는 자동으로 부전승 처리됩니다.'],
    ['5', '', '', '작성 후 관리자 페이지 [03-B]에서 파일을 첨부하거나 셀 범위를 복사해 붙여넣고, 검증 결과를 확인한 뒤 반영하세요.']
  ];

  /* ---------- 유틸 ---------- */

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\s()·\-_/\\.]/g, '');
  }

  function cell(v) {
    return String(v == null ? '' : v).trim();
  }

  function isByeWord(v) {
    var n = norm(v);
    return n !== '' && BYE_WORDS.indexOf(n) !== -1;
  }

  // 엑셀 시간 셀(0.4166…) 또는 "10:00" → "HH:MM"
  function parseTimeCell(v) {
    var s = cell(v);
    if (!s) return { ok: true, value: null };
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      var p = s.split(':');
      var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
      if (h > 23 || m > 59) return { ok: false };
      return { ok: true, value: B.formatTime(h * 60 + m) };
    }
    var num = Number(s);
    if (!isNaN(num) && num >= 0 && num < 1) {
      return { ok: true, value: B.formatTime(Math.round(num * 24 * 60)) };
    }
    return { ok: false };
  }

  /* ---------- 헤더 인식 ---------- */

  function detectHeader(rows) {
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var map = mapHeader(rows[r]);
      if (map && map.matched >= 3) return { rowIndex: r, map: map.map };
    }
    return null;
  }

  function mapHeader(row) {
    if (!row) return null;
    var map = {};
    var matched = 0;
    row.forEach(function (c, i) {
      var n = norm(c);
      if (!n) return;
      for (var k = 0; k < COLUMNS.length; k++) {
        var col = COLUMNS[k];
        var names = [norm(col.label)].concat(col.alias.map(norm));
        if (names.indexOf(n) !== -1 && map[col.key] == null) {
          map[col.key] = i;
          matched++;
          return;
        }
      }
    });
    return { map: map, matched: matched };
  }

  function positionalMap() {
    var map = {};
    COLUMNS.forEach(function (c, i) { map[c.key] = i; });
    return map;
  }

  /* ---------- 파싱 & 검증 ---------- */

  function parse(rows, settings) {
    var s = B.mergeSettings(settings);
    var errors = [];
    var warnings = [];

    rows = (rows || [])
      .map(function (r) { return (r || []).map(cell); })
      .filter(function (r) { return r.some(function (c) { return c !== ''; }); });

    if (!rows.length) {
      return { ok: false, errors: [{ row: 0, column: '-', value: '', reason: '읽어 들인 데이터가 없습니다.', fix: '헤더 행과 1행 이상의 대진 데이터를 포함해 다시 시도하세요.' }], warnings: [], summary: null, state: null };
    }

    var header = detectHeader(rows);
    var map, dataRows, headerOffset;
    if (header) {
      map = header.map;
      dataRows = rows.slice(header.rowIndex + 1);
      headerOffset = header.rowIndex + 2; // 엑셀 실제 행 번호(1-base)
    } else {
      map = positionalMap();
      dataRows = rows;
      headerOffset = 1;
      warnings.push({ row: 0, column: '-', value: '', reason: '헤더(제목) 행을 찾지 못해 양식의 기본 열 순서로 읽었습니다.', fix: '양식 첫 행의 제목을 그대로 두고 다시 붙여넣으면 더 정확합니다.' });
    }

    COLUMNS.forEach(function (c) {
      if (c.required && map[c.key] == null) {
        errors.push({ row: headerOffset - 1, column: c.label, value: '', reason: '필수 열을 찾을 수 없습니다.', fix: '양식의 "' + c.label + '" 열을 포함해 주세요.' });
      }
    });
    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, summary: null, state: null };
    }

    function get(row, key) {
      var i = map[key];
      return i == null ? '' : cell(row[i]);
    }

    var records = [];

    dataRows.forEach(function (row, i) {
      var excelRow = headerOffset + i;
      var rec = {
        excelRow: excelRow,
        age: get(row, 'age'),
        gender: get(row, 'gender'),
        grade: get(row, 'grade'),
        weight: get(row, 'weight'),
        pool: get(row, 'pool') || 'A',
        no: get(row, 'no'),
        mat: get(row, 'mat'),
        time: get(row, 'time'),
        duration: get(row, 'duration'),
        nameA: get(row, 'nameA'),
        teamA: get(row, 'teamA'),
        seedA: get(row, 'seedA'),
        nameB: get(row, 'nameB'),
        teamB: get(row, 'teamB'),
        seedB: get(row, 'seedB'),
        valid: true
      };

      function err(column, value, reason, fix) {
        rec.valid = false;
        errors.push({ row: excelRow, column: column, value: value, reason: reason, fix: fix });
      }
      function warn(column, value, reason, fix) {
        warnings.push({ row: excelRow, column: column, value: value, reason: reason, fix: fix });
      }

      if (!rec.age) err('연령부', '', '필수값이 비어 있습니다.', '예: 중등부');
      if (!rec.gender) err('성별', '', '필수값이 비어 있습니다.', '예: 남자');
      if (!rec.weight) err('체급', '', '필수값이 비어 있습니다.', '예: -63kg');

      if (!rec.nameA || isByeWord(rec.nameA)) {
        err('선수A', rec.nameA, '선수A는 비워 둘 수 없습니다.', '부전승은 선수B를 비우고 선수A에 실제 선수를 적어 주세요.');
      }

      rec.byeB = !rec.nameB || isByeWord(rec.nameB);
      if (rec.byeB) {
        rec.nameB = '';
        rec.teamB = '';
        warn('선수B', '', '선수B가 비어 있어 부전승(BYE)으로 처리합니다.', '상대가 있다면 선수B를 채워 주세요.');
      }

      if (!rec.byeB && rec.nameA && rec.nameA === rec.nameB && rec.teamA === rec.teamB) {
        err('선수B', rec.nameB, '선수A와 선수B가 같은 선수입니다.', '한쪽을 수정하거나 부전승으로 두세요.');
      }

      var t = parseTimeCell(rec.time);
      if (!t.ok) err('시작시각', rec.time, '시각 형식이 올바르지 않습니다.', 'HH:MM 형식으로 입력하세요. 예: 10:00');
      else rec.time = t.value;

      if (rec.duration !== '' && (isNaN(Number(rec.duration)) || Number(rec.duration) <= 0)) {
        err('경기시간(분)', rec.duration, '숫자가 아니거나 0 이하입니다.', '예: 5');
      }
      if (rec.mat !== '' && (isNaN(Number(rec.mat)) || Number(rec.mat) <= 0)) {
        err('매트', rec.mat, '숫자가 아니거나 0 이하입니다.', '예: 1');
      }
      if (rec.seedA !== '' && isNaN(Number(rec.seedA))) err('시드A', rec.seedA, '숫자가 아닙니다.', '비워 두거나 1, 2… 로 입력하세요.');
      if (rec.seedB !== '' && isNaN(Number(rec.seedB))) err('시드B', rec.seedB, '숫자가 아닙니다.', '비워 두거나 1, 2… 로 입력하세요.');
      if (!rec.grade) rec.grade = '';

      records.push(rec);
    });

    // 경기번호 중복 (경고)
    var seenNo = {};
    records.forEach(function (r) {
      if (!r.no) return;
      if (seenNo[r.no]) {
        warnings.push({ row: r.excelRow, column: '경기번호', value: r.no, reason: '경기번호가 ' + seenNo[r.no] + '행과 중복됩니다.', fix: '번호를 수정하거나 비워 두면 자동 부여됩니다.' });
      } else seenNo[r.no] = r.excelRow;
    });

    // 같은 부문·조 안에서 같은 선수가 두 번 (오류)
    var seenPlayer = {};
    records.forEach(function (r) {
      if (!r.valid) return;
      var pk = [r.age, r.gender, r.grade, r.weight, r.pool].join('|');
      [['선수A', r.nameA, r.teamA], ['선수B', r.nameB, r.teamB]].forEach(function (p) {
        if (!p[1]) return;
        var key = pk + '|' + p[1] + '|' + p[2];
        if (seenPlayer[key]) {
          r.valid = false;
          errors.push({ row: r.excelRow, column: p[0], value: p[1], reason: '같은 부문·조에 이미 등록된 선수입니다(' + seenPlayer[key] + '행).', fix: '동명이인이면 소속을 다르게 적어 구분해 주세요.' });
        } else seenPlayer[key] = r.excelRow;
      });
    });

    var validRecords = records.filter(function (r) { return r.valid; });
    var state = validRecords.length ? build(validRecords, s, warnings) : null;

    var summary = {
      total: records.length,
      valid: validRecords.length,
      invalid: records.length - validRecords.length,
      errors: errors.length,
      warnings: warnings.length,
      divisions: state ? state.divisions.length : 0,
      matches: state ? countRealMatches(state) : 0,
      players: state ? countPlayers(state) : 0
    };

    return { ok: errors.length === 0, errors: errors, warnings: warnings, summary: summary, state: state };
  }

  function countRealMatches(state) {
    var byId = B.indexMatches(state);
    var n = 0;
    state.divisions.forEach(function (d) {
      B.allMatches(d).forEach(function (m) { if (!B.isSkippedMatch(m, byId)) n++; });
    });
    return n;
  }

  function countPlayers(state) {
    var n = 0;
    state.divisions.forEach(function (d) {
      (d.pools || []).forEach(function (p) { n += (p.entries || []).length; });
    });
    return n;
  }

  /* ---------- 대진 구성 ---------- */

  function build(records, settings, warnings) {
    var divMap = {};
    var divOrder = [];

    records.forEach(function (r) {
      var key = [r.age, r.gender, r.grade, r.weight].join('|');
      if (!divMap[key]) {
        divMap[key] = { age: r.age, gender: r.gender, grade: r.grade, weight: r.weight, poolMap: {}, poolOrder: [] };
        divOrder.push(key);
      }
      var d = divMap[key];
      if (!d.poolMap[r.pool]) {
        d.poolMap[r.pool] = { name: r.pool, rows: [] };
        d.poolOrder.push(r.pool);
      }
      d.poolMap[r.pool].rows.push(r);
    });

    var divisions = divOrder.map(function (key, di) {
      var g = divMap[key];
      var divId = 'x' + (di + 1) + '-' + B.slugify(B.divisionTitle(g)).slice(0, 40);
      var entrySeq = 0;
      var explicit = [];

      var pools = g.poolOrder.map(function (poolName) {
        var pool = g.poolMap[poolName];
        var entries = [];
        var byKey = {};

        function entryFor(name, team, seed) {
          if (!name) return null;
          var k = name + '|' + team;
          if (!byKey[k]) {
            entrySeq++;
            byKey[k] = { id: divId + '-e' + entrySeq, name: name, team: team, seed: Number(seed) > 0 ? Number(seed) : 0 };
            entries.push(byKey[k]);
          } else if (Number(seed) > 0 && !byKey[k].seed) {
            byKey[k].seed = Number(seed);
          }
          return byKey[k];
        }

        var slots = [];
        pool.rows.forEach(function (r) {
          var a = entryFor(r.nameA, r.teamA, r.seedA);
          var b = r.byeB ? null : entryFor(r.nameB, r.teamB, r.seedB);
          slots.push(a ? { entryId: a.id } : { bye: true });
          slots.push(b ? { entryId: b.id } : { bye: true });
        });

        // 1회전 경기 수를 2의 거듭제곱으로 맞춘다(남는 자리는 부전승)
        var pairCount = pool.rows.length;
        var target = B.nextPow2(pairCount);
        if (target > pairCount) {
          warnings.push({
            row: pool.rows[0].excelRow,
            column: '조',
            value: (g.poolOrder.length > 1 ? poolName + '조' : '단일 조'),
            reason: '1회전 경기가 ' + pairCount + '개라 토너먼트 형태(' + target + '경기)에 맞춰 빈 자리 ' + (target - pairCount) + '개를 부전승으로 채웠습니다.',
            fix: '의도와 다르면 경기 수를 2·4·8·16개로 맞추거나 선수를 추가하세요.'
          });
          for (var k = pairCount; k < target; k++) slots.push({ bye: true }, { bye: true });
        }

        var matches = B.buildBracketMatches(divId, poolName, slots, settings);

        // 엑셀에 적힌 경기번호·매트·시각·경기시간을 1회전 경기에 그대로 적용
        pool.rows.forEach(function (r, i) {
          var m = matches.filter(function (x) { return x.round === 0 && x.order === i; })[0];
          if (!m) return;
          explicit.push({ id: m.id, no: r.no, mat: r.mat, time: r.time, duration: r.duration });
        });

        return { name: poolName, entries: entries, matches: matches };
      });

      var division = {
        id: divId,
        age: g.age, gender: g.gender, grade: g.grade, weight: g.weight,
        title: B.divisionTitle(g),
        duration: settings.defaultDuration,
        mat: null,
        pools: pools,
        finals: B.buildFinals(divId, pools, settings),
        thirdPlace: null,
        thirdPlaceRule: settings.thirdPlace,
        conflicts: [],
        entryCount: pools.reduce(function (acc, p) { return acc + p.entries.length; }, 0),
        source: 'excel',
        explicit: explicit
      };
      B.attachThirdPlace(division, settings);
      return division;
    });

    var state = { settings: settings, divisions: divisions, generatedAt: new Date().toISOString() };

    // 먼저 전체를 자동 배정한 뒤, 엑셀에 명시된 값으로 덮어쓴다
    B.scheduleAll(state);
    var byId = B.indexMatches(state);
    state.divisions.forEach(function (d) {
      (d.explicit || []).forEach(function (e) {
        var m = byId[e.id];
        if (!m || B.isSkippedMatch(m, byId)) return;
        if (e.no !== '' && e.no != null) m.no = String(e.no);
        if (e.mat !== '' && e.mat != null) m.mat = Number(e.mat);
        if (e.time) m.time = e.time;
        if (e.duration !== '' && e.duration != null) m.duration = Number(e.duration);
      });
      delete d.explicit;
    });

    return state;
  }

  /* ---------- 붙여넣기(TSV/CSV) 파싱 ---------- */

  function parseText(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var useTab = lines.some(function (l) { return l.indexOf('\t') !== -1; });
    return lines.map(function (line) {
      return useTab ? line.split('\t') : splitCsv(line);
    });
  }

  function splitCsv(line) {
    var out = [];
    var cur = '';
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /* ---------- 양식 워크북 생성 ---------- */

  function buildTemplateWorkbook(XLSX) {
    var headers = COLUMNS.map(function (c) { return c.label; });
    var sheet = XLSX.utils.aoa_to_sheet([headers].concat(SAMPLE_ROWS));
    sheet['!cols'] = COLUMNS.map(function (c) {
      return { wch: /선수|소속/.test(c.label) ? 16 : (c.label.length < 4 ? 8 : 12) };
    });
    var guide = XLSX.utils.aoa_to_sheet(GUIDE_ROWS);
    guide['!cols'] = [{ wch: 14 }, { wch: 7 }, { wch: 18 }, { wch: 78 }];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, '대진');
    XLSX.utils.book_append_sheet(wb, guide, '작성방법');
    return wb;
  }

  global.SPYDER_BRACKET_IMPORT = {
    COLUMNS: COLUMNS,
    SAMPLE_ROWS: SAMPLE_ROWS,
    GUIDE_ROWS: GUIDE_ROWS,
    parse: parse,
    parseText: parseText,
    buildTemplateWorkbook: buildTemplateWorkbook,
    headerLine: function () { return COLUMNS.map(function (c) { return c.label; }).join(' | '); }
  };
})(window);
