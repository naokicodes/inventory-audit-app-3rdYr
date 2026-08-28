// Command panel scaffold - step 14 (session-status.md).
// Shared across every page via <script src="command-panel.js"></script>
// right before </body>. Purely client-side plumbing: a tiny pluggable
// registry plus a floating panel UI to list/run whatever's registered.
// No real commands yet - just a no-op proving register -> appear -> run
// works end to end. Running a command never writes to the server; any
// "log" is the ephemeral on-screen result line only, not persisted
// anywhere (that's deliberately step 15's job, via activity_log, per
// rule 9 - this scaffold logs nothing meaningful, on purpose).
//
// Public API (window.CommandPanel):
//   register(id, label, run) - run may return a value or a Promise;
//     whatever it resolves to is shown as the result. Duplicate ids are
//     rejected (throws) rather than silently overwriting - a real
//     mistake to catch early once step 15+ add more commands.
//   list() - returns the registered commands, id/label only (no run
//     function) - for introspection, not currently used by the UI.

(function () {
  const commands = [];

  function register(id, label, run) {
    if (commands.some(c => c.id === id)) {
      throw new Error(`Command "${id}" is already registered`);
    }
    commands.push({ id, label, run });
    renderList();
  }

  function list() {
    return commands.map(({ id, label }) => ({ id, label }));
  }

  // --- Minimal injected UI ---
  // Scoped inline styles here rather than editing style.css - keeps this
  // step to one new file (plus the one-line <script> include per page),
  // isolated from every existing working page per rule 17's spirit, even
  // though this step is landing fully done, not as WIP.
  const style = document.createElement('style');
  style.textContent = `
    #command-panel-toggle {
      position: fixed; bottom: 1rem; right: 1rem; z-index: 1000;
      padding: 0.5rem 0.9rem; font-size: 0.85rem; border-radius: 4px;
      border: 1px solid #ccc; background: #fff; cursor: pointer;
    }
    #command-panel {
      position: fixed; bottom: 3.2rem; right: 1rem; z-index: 1000;
      width: 16rem; max-height: 60vh; overflow-y: auto;
      border: 1px solid #ccc; border-radius: 4px; background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 0.75rem;
      font-size: 0.85rem; display: none;
    }
    #command-panel.open { display: block; }
    #command-panel h2 { margin: 0 0 0.5rem; font-size: 0.9rem; }
    #command-panel .cmd-row {
      display: flex; justify-content: space-between; align-items: center;
      gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px solid #eee;
    }
    #command-panel .cmd-row:last-child { border-bottom: none; }
    #command-panel button.run-btn { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
    #command-panel .cmd-result { font-size: 0.78rem; color: #666; margin-top: 0.5rem; }
    #command-panel .cmd-empty { color: #999; font-style: italic; }
  `;
  document.head.appendChild(style);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'command-panel-toggle';
  toggleBtn.type = 'button';
  toggleBtn.textContent = 'Commands';

  const panel = document.createElement('div');
  panel.id = 'command-panel';
  panel.innerHTML = '<h2>Commands</h2><div class="cmd-list"></div><div class="cmd-result"></div>';

  toggleBtn.addEventListener('click', () => panel.classList.toggle('open'));

  function renderList() {
    const listEl = panel.querySelector('.cmd-list');
    if (commands.length === 0) {
      listEl.innerHTML = '<div class="cmd-empty">No commands registered.</div>';
      return;
    }
    listEl.innerHTML = '';
    for (const cmd of commands) {
      const row = document.createElement('div');
      row.className = 'cmd-row';
      const labelEl = document.createElement('span');
      labelEl.textContent = cmd.label;
      const runBtn = document.createElement('button');
      runBtn.className = 'run-btn';
      runBtn.type = 'button';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', () => runCommand(cmd));
      row.appendChild(labelEl);
      row.appendChild(runBtn);
      listEl.appendChild(row);
    }
  }

  async function runCommand(cmd) {
    const resultEl = panel.querySelector('.cmd-result');
    resultEl.textContent = `Running "${cmd.label}"...`;
    try {
      const result = await cmd.run();
      resultEl.textContent = String(result);
    } catch (err) {
      resultEl.textContent = `Error: ${err.message}`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);
    renderList();
  });

  window.CommandPanel = { register, list };

  // The one no-op command, registered immediately on script load - proves
  // register -> appear -> run works with no real functionality behind it
  // yet. Step 15 adds the first real command ("Sync batch stock") the
  // same way, via this same register() call.
  register('noop', 'No-op (test)', () => 'Ran no-op - no real action taken, nothing logged.');
})();
