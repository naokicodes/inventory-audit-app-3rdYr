// Step 15 - the first real command registered against the step-14
// command panel scaffold (public/command-panel.js). Kept as its own
// file rather than added into command-panel.js itself, so the scaffold
// and its first real command stay separately reviewable, and so future
// commands (step 18's over-sold warning, etc.) follow the same pattern:
// one small file per command, each just calling its own backend route
// and registering itself.
//
// What it does: POSTs to /api/commands/sync-batch-stock, which copies
// sales into `prepped` for any BATCH_PREPPED dish/date/restaurant combo
// that has sales but no prepped entry yet. Safe to run repeatedly -
// already-synced or already-manually-entered combos are always skipped
// server-side, never overwritten.

(function () {
  window.CommandPanel.register(
    'sync-batch-stock',
    'Sync batch stock',
    async () => {
      const res = await fetch('/api/commands/sync-batch-stock', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      if (data.synced === 0) {
        return 'Nothing to sync - all BATCH_PREPPED dishes with sales already have a prepped entry.';
      }
      return `Synced ${data.synced} prepped row(s) from sales.`;
    }
  );
})();
