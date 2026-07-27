// SPYDER roster admin tool — backed by Supabase (roster_state table, realtime).
(() => {
  const DEFAULT_STATE = {
    categories: [
      { key: 'weight', label: '체급' },
      { key: 'age', label: '연령' },
      { key: 'gender', label: '성별' }
    ],
    athletes: []
  };

  let state = clone(DEFAULT_STATE);
  let sb = null;

  const catList = document.querySelector('#catList');
  const addCatBtn = document.querySelector('#addCatBtn');
  const pasteHint = document.querySelector('#pasteHint');
  const pasteArea = document.querySelector('#pasteArea');
  const parseBtn = document.querySelector('#parseBtn');
  const editTable = document.querySelector('#editTable');
  const addRowBtn = document.querySelector('#addRowBtn');
  const rosterTotal = document.querySelector('#rosterTotal');
  const exportBtn = document.querySelector('#exportBtn');
  const loadLiveBtn = document.querySelector('#loadLiveBtn');
  const resetBtn = document.querySelector('#resetBtn');
  const publishBtn = document.querySelector('#publishBtn');
  const publishStatus = document.querySelector('#publishStatus');
  const quickSaveBtns = document.querySelectorAll('.quick-save-btn');
  const allSaveBtns = [publishBtn, ...quickSaveBtns].filter(Boolean);

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  // ---------- Category manager ----------
  function newCatKey() {
    return 'cat_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  }

  function renderCategories() {
    catList.innerHTML = state.categories.map((cat, i) => `
      <div class="cat-row" data-index="${i}">
        <input type="text" value="${escapeAttr(cat.label)}" data-role="cat-label" placeholder="분류 이름 (예: 체급)">
        <button type="button" data-role="cat-del">삭제</button>
      </div>
    `).join('') || '<p class="desc">분류 항목이 없습니다. 추가해 주세요.</p>';

    catList.querySelectorAll('[data-role="cat-label"]').forEach((input, i) => {
      input.addEventListener('input', () => {
        state.categories[i].label = input.value;
        renderPasteHint();
        renderEditTable();
      });
    });
    catList.querySelectorAll('[data-role="cat-del"]').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (!confirm(`"${state.categories[i].label}" 분류를 삭제할까요? 등록된 선수의 해당 값도 함께 사라집니다.`)) return;
        state.categories.splice(i, 1);
        renderCategories();
        renderPasteHint();
        renderEditTable();
      });
    });
  }

  addCatBtn.addEventListener('click', () => {
    state.categories.push({ key: newCatKey(), label: '새 항목' });
    renderCategories();
    renderPasteHint();
    renderEditTable();
  });

  // ---------- Paste-from-Excel ----------
  function renderPasteHint() {
    const cols = ['이름', '소속', ...state.categories.map(c => c.label || '(이름없음)')];
    pasteHint.textContent = '열 순서: ' + cols.join(' | ');
  }

  parseBtn.addEventListener('click', () => {
    const text = pasteArea.value;
    if (!text.trim()) return;
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    let added = 0;
    rows.forEach(row => {
      const cols = row.split('\t');
      const athlete = { name: (cols[0] || '').trim(), team: (cols[1] || '').trim() };
      state.categories.forEach((cat, i) => {
        athlete[cat.key] = (cols[2 + i] || '').trim();
      });
      if (athlete.name) {
        state.athletes.push(athlete);
        added++;
      }
    });
    pasteArea.value = '';
    renderEditTable();
    alert(`${added}명의 선수를 추가했습니다. 반영 버튼을 눌러야 실제 사이트에 저장됩니다.`);
  });

  // ---------- Editable roster table ----------
  function renderEditTable() {
    const cols = ['이름', '소속', ...state.categories.map(c => c.label)];
    const keys = ['name', 'team', ...state.categories.map(c => c.key)];

    let html = '<thead><tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '<th></th></tr></thead><tbody>';

    if (!state.athletes.length) {
      html += `<tr><td class="empty-row" colspan="${cols.length + 1}">등록된 선수가 없습니다.</td></tr>`;
    } else {
      state.athletes.forEach((athlete, rowIndex) => {
        html += '<tr data-row="' + rowIndex + '">';
        keys.forEach(key => {
          html += `<td><input type="text" value="${escapeAttr(athlete[key] || '')}" data-key="${key}"></td>`;
        });
        html += '<td><button type="button" class="row-del" data-role="row-del">삭제</button></td>';
        html += '</tr>';
      });
    }
    html += '</tbody>';
    editTable.innerHTML = html;

    editTable.querySelectorAll('tbody tr[data-row]').forEach(tr => {
      const rowIndex = Number(tr.dataset.row);
      tr.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
          state.athletes[rowIndex][input.dataset.key] = input.value;
        });
      });
      tr.querySelector('[data-role="row-del"]').addEventListener('click', () => {
        state.athletes.splice(rowIndex, 1);
        renderEditTable();
      });
    });

    rosterTotal.textContent = `(총 ${state.athletes.length}명)`;
  }

  addRowBtn.addEventListener('click', () => {
    const blank = { name: '', team: '' };
    state.categories.forEach(cat => { blank[cat.key] = ''; });
    state.athletes.push(blank);
    renderEditTable();
  });

  // ---------- Export (manual backup) ----------
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---------- Supabase load / publish ----------
  async function fetchLiveState() {
    const { data, error } = await sb.from('roster_state').select('data').eq('id', 1).single();
    if (error) throw error;
    return { categories: (data.data && data.data.categories) || [], athletes: (data.data && data.data.athletes) || [] };
  }

  loadLiveBtn.addEventListener('click', async () => {
    if (!confirm('현재 편집 중인 내용을 게시된 명단으로 덮어씁니다. 계속할까요?')) return;
    try {
      state = await fetchLiveState();
      renderAll();
    } catch (e) {
      alert('불러오기에 실패했습니다: ' + e.message);
    }
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('모든 편집 내용을 초기화할까요? (실제 사이트에는 반영 버튼을 눌러야 반영됩니다) 되돌릴 수 없습니다.')) return;
    state = clone(DEFAULT_STATE);
    renderAll();
  });

  async function publish() {
    if (!confirm(`선수 ${state.athletes.length}명을 실제 사이트에 바로 반영할까요?`)) return;
    allSaveBtns.forEach(btn => { btn.disabled = true; });
    publishStatus.textContent = '반영 중...';
    try {
      const { error } = await sb
        .from('roster_state')
        .update({ data: state })
        .eq('id', 1);
      if (error) throw error;
      publishStatus.textContent = '반영 완료! 명단 페이지에 실시간으로 즉시 반영됩니다.';
    } catch (e) {
      publishStatus.textContent = '오류: ' + e.message;
      alert('반영 중 오류가 발생했습니다: ' + e.message);
    } finally {
      allSaveBtns.forEach(btn => { btn.disabled = false; });
    }
  }

  allSaveBtns.forEach(btn => btn.addEventListener('click', publish));

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  function renderAll() {
    renderCategories();
    renderPasteHint();
    renderEditTable();
  }

  // ---------- Boot: wait for Supabase auth gate (see admin.html inline script) ----------
  window.SPYDER_ADMIN_INIT = async (client) => {
    sb = client;
    try {
      state = await fetchLiveState();
    } catch (e) {
      console.warn('초기 명단을 불러오지 못해 빈 상태로 시작합니다.', e);
    }
    renderAll();

    // Realtime: reflect changes made from another tab/device too
    sb.channel('roster_state_admin')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roster_state', filter: 'id=eq.1' }, (payload) => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        state = { categories: payload.new.data.categories || [], athletes: payload.new.data.athletes || [] };
        renderAll();
      })
      .subscribe();
  };
})();
