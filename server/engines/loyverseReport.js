// Wildcard-match report (Step loyverse-preview-iii) - the "you-only" debug
// view of what every wildcard row in the name map actually caught, so an
// over-capture (a new "Braised Beef Tapa" under "braised beef*") is seen
// before anything feeds an audit.
//
// PURE: takes computePreview()'s result, returns the report text. Prints
// names and quantities only - the preview carries no price and no token.

// pattern -> dish groups for one account's candidates, in first-seen order.
function groupByPattern(candidates) {
  const groups = new Map();
  for (const c of candidates) {
    const key = `${c.pattern}|${c.dish_code}`;
    let g = groups.get(key);
    if (!g) {
      g = { pattern: c.pattern, dish_code: c.dish_code, subtotal: 0, lines: [] };
      groups.set(key, g);
    }
    g.subtotal += c.quantity;
    g.lines.push(c);
  }
  return [...groups.values()];
}

function itemLabel(c) {
  return c.variant_name ? `${c.item_name} [${c.variant_name}]` : c.item_name;
}

function matchSection(title, preview, matchedBy, dishNames) {
  const out = [title];
  for (const account of preview.accounts) {
    out.push(`  ${account.label}`);
    if (!account.ok) {
      out.push('    (account failed - see status below)');
      continue;
    }
    const groups = groupByPattern(preview.idCandidates.filter(
      c => c.account === account.label && c.matchedBy === matchedBy,
    ));
    if (groups.length === 0) out.push('    (none)');
    for (const g of groups) {
      out.push(`    ${g.pattern} -> ${g.dish_code} ${dishNames.get(g.dish_code) || ''}: ${g.subtotal}`);
      for (const c of g.lines) out.push(`      ${itemLabel(c)}: ${c.quantity}`);
    }
  }
  return out;
}

function statusLine(account) {
  if (!account.ok) return `  ${account.label}: FAILED - ${account.error}`;
  const refunds = (account.receiptTypes && account.receiptTypes.REFUND) || 0;
  return `  ${account.label}: ${account.receiptsKept} receipts kept, ${refunds} refunds`;
}

// preview: computePreview()'s result. { all: true } also lists exact matches.
function formatReport(preview, { all = false } = {}) {
  const dishNames = new Map(preview.dishes.map(d => [d.dish_code, d.name]));
  const out = [`Loyverse wildcard matches - ${preview.date}`, ''];
  out.push(...matchSection('Wildcard matches', preview, 'wildcard', dishNames), '');
  if (all) out.push(...matchSection('Exact matches', preview, 'exact', dishNames), '');
  if (preview.unmatched.length > 0) {
    out.push('Unmatched');
    for (const u of preview.unmatched) out.push(`  ${u.account}: ${u.item_name}: ${u.quantity}`);
    out.push('');
  }
  out.push('Accounts', ...preview.accounts.map(statusLine));
  return out.join('\n') + '\n';
}

module.exports = { formatReport };
