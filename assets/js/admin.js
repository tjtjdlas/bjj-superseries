// SPYDER roster admin tool -- client-side only.
// Draft state is kept in localStorage; publishing means downloading
// roster.json and replacing assets/data/roster.json in the repo.
(() => {
  const STORAGE_KEY = 'spyderRosterDraft';
  const DEFAULT_STATE = {
    categories: [
      { key: 'weight', label: '체급' },
      { key: 'age', label: '연령' },
      { key: 'gender', label: '성별' }
    ],
    athletes: []
  };

  let state = loadDraft() || clone(DEFAULT_STATE);

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

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function newCatKey() {
    return 'cat_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  }

  // ---------- Category manager ----------
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
        saveDraft();
        renderPasteHint();
        renderEditTable();
      });
    });
    catList.querySelectorAll('[data-role="cat-del"]').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (!confirm(`"${state.categories[i].label}" 분류를 삭제할까요? 등록된 선수의 해당 값도 함께 사라집니다.`)) return;
        state.categories.splice(i, 1);
        saveDraft();
        renderCategories();
        renderPasteHint();
        renderEditTable();
      });
    });
  }

  addCatBtn.addEventListener('click', () => {
    state.categories.push({ key: newCatKey(), label: '새 항목' });
    saveDraft();
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
    saveDraft();
    renderEditTable();
    alert(`${added}명의 선수를 추가했습니다.`);
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
          saveDraft();
        });
      });
      tr.querySelector('[data-role="row-del"]').addEventListener('click', () => {
        state.athletes.splice(rowIndex, 1);
        saveDraft();
        renderEditTable();
      });
    });

    rosterTotal.textContent = `(총 ${state.athletes.length}명)`;
  }

  addRowBtn.addEventListener('click', () => {
    const blank = { name: '', team: '' };
    state.categories.forEach(cat => { blank[cat.key] = ''; });
    state.athletes.push(blank);
    saveDraft();
    renderEditTable();
  });

  // ---------- Publish / load ----------
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

  loadLiveBtn.addEventListener('click', () => {
    if (!confirm('현재 편집 중인 내용을 게시된 명단으로 덮어씁니다. 계속할까요?')) return;
    fetch('assets/data/roster.json', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        state = { categories: data.categories || [], athletes: data.athletes || [] };
        saveDraft();
        renderAll();
      })
      .catch(() => alert('불러오기에 실패했습니다.'));
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('모든 편집 내용을 초기화할까요? 되돌릴 수 없습니다.')) return;
    state = clone(DEFAULT_STATE);
    saveDraft();
    renderAll();
  });

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

  renderAll();
})();
