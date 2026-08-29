// Step 18 - "BATCH_PREPPED over-sold warning", the second real command
// registered against the step-14 panel scaffold (see
// public/commands/sync-batch-stock.js for the first). Calls the
// read-only GET /api/commands/oversold-check and formats the result as
// a WARNING, never blocking anything - there's no save-time check
// anywhere in the app for this, by design (see the roadmap: "surface
// this as a WARNING through the command panel, not a hard block").

(function () {
  window.CommandPanel.register(
    'oversold-check',
    'Check over-sold (BATCH_PREPPED)',
    async () => {
      const res = await fetch('/api/commands/oversold-check');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Check failed');
      }
      if (data.oversold_count === 0) {
        return 'No over-sold days found.';
      }
      const lines = data.rows.map(r =>
        `WARNING: ${r.restaurant_name} - ${r.dish_code} ${r.dish_name} on ${r.business_date}: sold ${r.sold}, prepped ${r.prepped} (short ${r.shortfall.toFixed(2)})`
      );
      return `${data.oversold_count} over-sold day(s):\n${lines.join('\n')}`;
    }
  );
})();
