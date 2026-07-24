// SPYDER roster admin tool -- client-side only.
// Draft state is kept in localStorage; publishing means downloading
// roster.json and replacing assets/data/roster.json in the repo.
(() => {
  const STORAGE_KEY = 'spyderRosterDraft';
  const TOKEN_KEY = 'spyderGithubToken';
  const REPO = 'tjtjdlas/bjj-superseries';
  const FILE_PATH = 'assets/data/roster.json';
  const BRANCH = 'main';
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
  const ghTokenInput = document.querySelector('#ghTokenInput');
  const ghTokenSaveBtn = document.querySelector('#ghTokenSaveBtn');
  const ghTokenClearBtn = document.querySelector('#ghTokenClearBtn');
  const ghTokenStatus = document.querySelector('#ghTokenStatus');
  const publishBtn = document.querySelector('#publishBtn');
  const publishStatus = document.querySelector('#publishStatus');

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

  // ---------- GitHub token (stored only in this browser) ----------
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function renderTokenStatus() {
    ghTokenStatus.textContent = getToken()
      ? '토큰이 이 브라우저에 저장되어 있습니다. "지금 사이트에 반영하기"를 바로 쓸 수 있습니다.'
      : '아직 저장된 토큰이 없습니다. 저장 전까지는 [05]의 반영 버튼을 쓸 수 없습니다.';
  }

  ghTokenSaveBtn.addEventListener('click', () => {
    const val = ghTokenInput.value.trim();
    if (!val) { alert('토큰을 입력해 주세요.'); return; }
    localStorage.setItem(TOKEN_KEY, val);
    ghTokenInput.value = '';
    renderTokenStatus();
    alert('토큰을 저장했습니다.');
  });

  ghTokenClearBtn.addEventListener('click', () => {
    if (!confirm('저장된 토큰을 삭제할까요?')) return;
    localStorage.removeItem(TOKEN_KEY);
    renderTokenStatus();
  });

  // ---------- Publish directly to GitHub via Contents API ----------
  function base64EncodeUtf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  publishBtn.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      alert('먼저 [04]에서 GitHub 토큰을 저장해 주세요.');
      return;
    }
    if (!confirm(`선수 ${state.athletes.length}명을 실제 사이트에 바로 반영할까요?`)) return;

    const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    };

    publishBtn.disabled = true;
    publishStatus.textContent = '반영 중...';

    try {
      const getRes = await fetch(apiUrl, { headers, cache: 'no-store' });
      if (!getRes.ok) {
        throw new Error(getRes.status === 401 || getRes.status === 403
          ? '토큰이 유효하지 않거나 권한이 부족합니다. [04]에서 토큰을 다시 확인해 주세요.'
          : `현재 파일 정보를 가져오지 못했습니다 (상태 ${getRes.status})`);
      }
      const fileInfo = await getRes.json();

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `관리자 페이지에서 명단 업데이트 (${state.athletes.length}명)`,
          content: base64EncodeUtf8(JSON.stringify(state, null, 2)),
          sha: fileInfo.sha,
          branch: BRANCH
        })
      });

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || `반영에 실패했습니다 (상태 ${putRes.status})`);
      }

      publishStatus.textContent = '반영 완료! 1분 정도 후 실제 사이트에 업데이트됩니다.';
    } catch (e) {
      publishStatus.textContent = '오류: ' + e.message;
      alert('반영 중 오류가 발생했습니다: ' + e.message);
    } finally {
      publishBtn.disabled = false;
    }
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
    renderTokenStatus();
  }

  renderAll();
})();
