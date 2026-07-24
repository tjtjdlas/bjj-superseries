// Public athlete roster renderer (reads assets/data/roster.json)
document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.querySelector('#rosterTbody');
  const tableHead = document.querySelector('#rosterThead');
  const filterRow = document.querySelector('#categoryFilters');
  const searchInput = document.querySelector('#rosterSearch');
  const countEl = document.querySelector('#rosterCount');
  if (!tableBody || !tableHead) return;

  let categories = [];
  let athletes = [];
  const activeFilters = {};

  fetch('assets/data/roster.json', { cache: 'no-store' })
    .then(res => res.json())
    .then(data => {
      categories = data.categories || [];
      athletes = data.athletes || [];
      buildHead();
      buildFilters();
      render();
    })
    .catch(() => {
      tableBody.innerHTML = '<tr><td style="padding:40px 20px; text-align:center; color:var(--mute-2);">선수 명단을 불러오지 못했습니다.</td></tr>';
    });

  function buildHead() {
    const cols = ['이름', '소속', ...categories.map(c => c.label)];
    tableHead.innerHTML = '<tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
  }

  function buildFilters() {
    if (!filterRow) return;
    filterRow.innerHTML = categories.map(cat => {
      const values = [...new Set(athletes.map(a => a[cat.key]).filter(Boolean))].sort();
      const options = values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      return `
        <select data-key="${cat.key}">
          <option value="">${escapeHtml(cat.label)} 전체</option>
          ${options}
        </select>`;
    }).join('');
    filterRow.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        if (sel.value) activeFilters[sel.dataset.key] = sel.value;
        else delete activeFilters[sel.dataset.key];
        render();
      });
    });
  }

  function render() {
    const q = (searchInput && searchInput.value || '').trim().toLowerCase();
    const filtered = athletes.filter(a => {
      if (q && !(a.name || '').toLowerCase().includes(q)) return false;
      for (const key in activeFilters) {
        if ((a[key] || '') !== activeFilters[key]) return false;
      }
      return true;
    });

    if (!filtered.length) {
      const colspan = 2 + categories.length;
      const msg = athletes.length
        ? '검색/필터 조건에 맞는 선수가 없습니다.'
        : '등록된 선수가 없습니다. 명단은 접수 및 확정에 따라 순차적으로 업데이트됩니다.';
      tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding:50px 20px; color:var(--mute-2);">${msg}</td></tr>`;
    } else {
      tableBody.innerHTML = filtered.map(a => {
        const nameTeamCells = [a.name, a.team].map(c =>
          `<td class="text-truncate-1" style="max-width:220px;" title="${escapeHtml(c || '-')}">${escapeHtml(c || '-')}</td>`
        ).join('');
        const catCells = categories.map(c => `<td>${escapeHtml(a[c.key] || '-')}</td>`).join('');
        return `<tr>${nameTeamCells}${catCells}</tr>`;
      }).join('');
    }

    if (countEl) {
      countEl.textContent = athletes.length
        ? `총 ${athletes.length}명 중 ${filtered.length}명 표시`
        : '';
    }
  }

  if (searchInput) {
    searchInput.removeAttribute('disabled');
    searchInput.addEventListener('input', render);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }
});
