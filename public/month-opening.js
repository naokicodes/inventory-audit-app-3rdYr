// Step 26a-ii (session-status.md, "The Month opening panel"): the panel at
// the top of Landing (daily-audit.html) and Commissary (commissary.html).
// One implementation for both pages, parameterised by ledger, so the two
// panels cannot drift apart. It is the single way to enter an opening - the
// per-row opening input on both grids is gone.
//
// Server side: GET/POST .../month-opening, POST .../month-opening/copy-all
// (server/engines/monthOpening.js decides must-count vs copyable - this file
// only renders what the server says) and 26a's PATCH .../opening-stock for
// edit/clear.
//
// createMonthOpeningPanel({
//   container,        // element the panel renders into
//   ledger,           // 'restaurant' | 'commissary'
//   getOwnerId,       // () => selected restaurant id / commissary id
//   getDate,          // () => the page's selected date (YYYY-MM-DD)
//   onChange          // () => called after any write, to reload the grid
// }) -> { load }
(function () {
  const LEDGERS = {
    restaurant: {
      statusUrl: (ownerId, date) => `/api/daily-audit/month-opening?restaurant_id=${ownerId}&date=${date}`,
      recountUrl: '/api/daily-audit/month-opening',
      copyAllUrl: '/api/daily-audit/month-opening/copy-all',
      patchUrl: '/api/daily-audit/opening-stock',
      ownerBody: ownerId => ({ restaurant_id: ownerId }),
      meatBody: (ownerId, meatId) => ({ restaurant_id: ownerId, meat_id: meatId })
    },
    commissary: {
      statusUrl: (ownerId, date) => `/api/commissary/month-opening?commissary_id=${ownerId}&date=${date}`,
      recountUrl: '/api/commissary/month-opening',
      copyAllUrl: '/api/commissary/month-opening/copy-all',
      patchUrl: '/api/commissary/opening-stock',
      ownerBody: ownerId => ({ commissary_id: ownerId }),
      meatBody: (ownerId, meatId) => ({ commissary_id: ownerId, commissary_meat_id: meatId })
    }
  };

  const SOURCE_TAG = { RECOUNT: 'recount', COPY: 'copied' };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function fmt(n) {
    return (n === null || n === undefined) ? '-' : Number(n).toFixed(2);
  }

  function monthLabel(isoMonthStart) {
    const d = new Date(isoMonthStart + 'T00:00:00Z');
    return d.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  async function send(url, method, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) throw new Error(result.error || `HTTP ${res.status}`);
    return result;
  }

  window.createMonthOpeningPanel = function ({ container, ledger, getOwnerId, getDate, onChange }) {
    const L = LEDGERS[ledger];
    let editing = false;
    let message = '';

    function unopenedRowHtml(r) {
      const detail = r.must_count
        ? r.reasons.map(reason => `<span class="mo-tag">${esc(reason)}</span>`).join(' ')
        : `last month: ${fmt(r.copy_quantity)}`;
      return `
        <tr data-mo-meat-id="${r.meat_id}">
          <td>${esc(r.name)} <span class="type-badge">(${esc(r.unit)})</span></td>
          <td>${detail}</td>
          <td><input type="number" step="0.01" class="mo-recount" placeholder="count"></td>
          <td><button type="button" class="mo-save-recount">Save recount</button></td>
        </tr>`;
    }

    function openedRowHtml(r) {
      return `
        <tr data-mo-meat-id="${r.meat_id}" data-mo-date="${r.opening.business_date}">
          <td>${esc(r.name)} <span class="type-badge">(${esc(r.unit)})</span></td>
          <td>${r.opening.business_date}${r.opening.opening_source ? ` <span class="mo-tag">${SOURCE_TAG[r.opening.opening_source]}</span>` : ''}</td>
          <td><input type="number" step="0.01" class="mo-edit" value="${r.opening.quantity}"></td>
          <td><button type="button" class="mo-save-edit">Save</button> <button type="button" class="mo-clear">Clear</button></td>
        </tr>`;
    }

    function render(status) {
      const unopened = status.rows.filter(r => r.opening === null);
      const opened = status.rows.filter(r => r.opening !== null);
      const label = monthLabel(status.month_start);
      const msg = message ? `<div class="mo-message">${esc(message)}</div>` : '';

      if (status.rows.length === 0) {
        container.innerHTML = '';
        return;
      }

      if (status.complete && !editing) {
        container.innerHTML = `
          <div class="month-opening mo-complete">
            Month opening complete — <a href="#" class="mo-toggle-edit">edit</a> <span class="mo-month">(${label})</span>
            ${msg}
          </div>`;
        return;
      }

      const copyable = unopened.filter(r => !r.must_count);
      const unopenedTable = unopened.length === 0 ? '' : `
        <table class="mo-table">
          <thead><tr><th>Meat</th><th>Needs</th><th>Opening</th><th></th></tr></thead>
          <tbody>${unopened.map(unopenedRowHtml).join('')}</tbody>
        </table>
        <button type="button" class="mo-copy-all" ${copyable.length === 0 ? 'disabled' : ''}>Copy all (${copyable.length})</button>`;

      const editTable = !editing ? (opened.length ? `<p><a href="#" class="mo-toggle-edit">edit entered openings (${opened.length})</a></p>` : '') : `
        <table class="mo-table">
          <thead><tr><th>Meat</th><th>Opened</th><th>Opening</th><th></th></tr></thead>
          <tbody>${opened.map(openedRowHtml).join('')}</tbody>
        </table>
        <p><a href="#" class="mo-toggle-edit">done editing</a></p>`;

      container.innerHTML = `
        <div class="month-opening">
          <h2>Month opening — ${label}</h2>
          ${unopenedTable}
          ${editTable}
          ${msg}
        </div>`;
    }

    async function load() {
      const ownerId = getOwnerId();
      const date = getDate();
      if (!ownerId || !date) { container.innerHTML = ''; return; }
      const res = await fetch(L.statusUrl(ownerId, date));
      if (!res.ok) { container.innerHTML = ''; return; }
      render(await res.json());
    }

    async function afterWrite(text) {
      message = text;
      await load();
      if (onChange) await onChange();
    }

    container.addEventListener('click', async (e) => {
      const ownerId = Number(getOwnerId());
      const date = getDate();
      const tr = e.target.closest('tr[data-mo-meat-id]');
      const meatId = tr ? Number(tr.dataset.moMeatId) : null;

      try {
        if (e.target.matches('.mo-toggle-edit')) {
          e.preventDefault();
          editing = !editing;
          message = '';
          await load();
        } else if (e.target.matches('.mo-save-recount')) {
          const value = tr.querySelector('.mo-recount').value;
          if (value === '') { message = 'Enter the counted quantity first.'; await load(); return; }
          await send(L.recountUrl, 'POST', { ...L.meatBody(ownerId, meatId), business_date: date, quantity: Number(value) });
          await afterWrite('Recount saved.');
        } else if (e.target.matches('.mo-copy-all')) {
          const result = await send(L.copyAllUrl, 'POST', { ...L.ownerBody(ownerId), business_date: date });
          await afterWrite(`Copied ${result.copied.length} meat(s) from last month's ending.`);
        } else if (e.target.matches('.mo-save-edit')) {
          const value = tr.querySelector('.mo-edit').value;
          if (value === '') { message = 'Use Clear to remove an opening.'; await load(); return; }
          await send(L.patchUrl, 'PATCH', { ...L.meatBody(ownerId, meatId), business_date: tr.dataset.moDate, quantity: Number(value) });
          await afterWrite('Opening updated.');
        } else if (e.target.matches('.mo-clear')) {
          await send(L.patchUrl, 'PATCH', { ...L.meatBody(ownerId, meatId), business_date: tr.dataset.moDate, quantity: null });
          await afterWrite('Opening cleared.');
        }
      } catch (err) {
        message = 'Error: ' + err.message;
        await load();
      }
    });

    return {
      load: () => { message = ''; return load(); }
    };
  };
})();
