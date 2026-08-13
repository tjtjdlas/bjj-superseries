// Public athlete roster renderer — realtime via Supabase (roster_state table)
document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.querySelector('#rosterTbody');
  const tableHead = document.querySelector('#rosterThead');
  const filterRow = document.querySelector('#categoryFilters');
  const searchInput = document.querySelector('#rosterSearch');
  const countEl = document.querySelector('#rosterCount');
  const updatedEl = document.querySelector('#rosterUpdated');
  if (!tableBody || !tableHead) return;

  function showUpdatedAt(iso) {
    if (!updatedEl || !iso) return;
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    updatedEl.textContent = `마지막 업데이트: ${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const SUPABASE_URL = window.SPYDER_SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SPYDER_SUPABASE_ANON_KEY;

  let categories = [];
  let athletes = [];
  const activeFilters = {};

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || typeof supabase === 'undefined') {
    tableBody.innerHTML = '<tr><td style="padding:40px 20px; text-align:center; color:var(--mute-2);">명단 서비스 설정이 필요합니다.</td></tr>';
    return;
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function applyState(data) {
    categories = (data && data.categories) || [];
    athletes = (data && data.athletes) || [];
    buildHead();
    buildFilters();
    render();
  }

  async function loadRoster() {
    const { data, error } = await sb
      .from('roster_state')
      .select('data, updated_at')
      .eq('id', 1)
      .single();

    if (error || !data) {
      tableBody.innerHTML = '<tr><td style="padding:40px 20px; text-align:center; color:var(--mute-2);">선수 명단을 불러오지 못했습니다.</td></tr>';
      return;
    }
    applyState(data.data);
    showUpdatedAt(data.updated_at);
  }

  loadRoster();

  // Realtime: any admin update reflects here immediately, no refresh needed
  sb.channel('roster_state_public')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roster_state', filter: 'id=eq.1' }, (payload) => {
      applyState(payload.new.data);
      showUpdatedAt(payload.new.updated_at);
    })
    .subscribe();

  function buildHead() {
    const cols = ['이름', '소속', ...categories.map(c => c.label)];
    tableHead.innerHTML = '<tr><th class="rank-col">No.</th>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
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
      const colspan = 3 + categories.length;
      const msg = athletes.length
        ? '검색/필터 조건에 맞는 선수가 없습니다.'
        : '등록된 선수가 없습니다. 명단은 접수 및 확정에 따라 순차적으로 업데이트됩니다.';
      tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; padding:50px 20px; color:var(--mute-2);">${msg}</td></tr>`;
    } else {
      tableBody.innerHTML = filtered.map((a, i) => {
        const rankCell = `<td class="rank-cell">${String(i + 1).padStart(2, '0')}</td>`;
        const nameTeamCells = [a.name, a.team].map(c =>
          `<td class="text-truncate-1" style="max-width:220px;" title="${escapeHtml(c || '-')}">${escapeHtml(c || '-')}</td>`
        ).join('');
        const catCells = categories.map(c => `<td>${escapeHtml(a[c.key] || '-')}</td>`).join('');
        return `<tr>${rankCell}${nameTeamCells}${catCells}</tr>`;
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
