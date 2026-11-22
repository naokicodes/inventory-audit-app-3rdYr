// Step ui-shell (ADR-111): one top bar and one grouped menu on every page.
// Each page keeps an empty <nav></nav> and loads this script right after it;
// this file is the one link list. <body data-shell="login"> gets the logo only
// (no menu, no name). The name comes from one fetch of /api/auth/me; if that
// fails, the bar shows Log in and the page works as before.
//
// Everyone sees every link for now (ADR-111): following each person's roles
// comes with login-tonight. The server's refusals are unchanged.
//
// Public API (window.AppShell):
//   groups - [{ name, links: [{ label, href }] }], the same list Home builds from.
//   me     - a Promise of the logged-in user, or null (logged out or /me failed).
//   logOut() - logs out and opens the login page.

(function () {
  const groups = [
    { name: 'Kitchen', links: [
      { label: 'Landing', href: 'daily-audit.html' },
      { label: 'Kitchen Sales', href: 'kitchen-sales.html' },
      { label: 'Allocations', href: 'allocations.html' },
      { label: 'Stock Receipts', href: 'stock-receipts.html' },
    ] },
    { name: 'Commissary', links: [
      { label: 'Commissary', href: 'commissary.html' },
      { label: 'Shipments', href: 'commissary-shipments.html' },
      { label: 'Terminal', href: 'terminal.html' },
    ] },
    { name: 'Management', links: [
      { label: 'Dashboard', href: 'dashboard.html' },
    ] },
    { name: 'Admin', links: [
      { label: 'Settings', href: 'settings.html' },
      { label: 'Roles', href: 'roles.html' },
      { label: 'History', href: 'history.html' },
      { label: 'Typed sales', href: 'sales.html' },
    ] },
  ];

  const me = fetch('/api/auth/me')
    .then((res) => (res.ok ? res.json() : { user: null }))
    .then((body) => (body && body.user) || null)
    .catch(() => null);

  async function logOut() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (err) { /* open login anyway */ }
    location.href = 'login.html';
  }

  window.AppShell = { groups, me, logOut };

  const nav = document.querySelector('nav');
  if (!nav) return;
  const loginOnly = document.body && document.body.dataset.shell === 'login';
  const here = location.pathname.split('/').pop() || 'index.html';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  nav.className = 'app-shell';
  const bar = el('div', 'shell-bar');
  const brand = el('a', 'shell-brand');
  brand.href = 'index.html';
  const logo = el('img');
  logo.src = 'icons/icon-192.png';
  logo.alt = '';
  logo.width = 32;
  logo.height = 32;
  brand.append(logo, el('span', null, 'Inventory'));
  bar.appendChild(brand);
  nav.appendChild(bar);
  if (loginOnly) return;

  const right = el('div', 'shell-right');
  const who = el('div', 'shell-who');
  const menuBtn = el('button', 'shell-menu-btn', 'Menu');
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.setAttribute('aria-controls', 'shell-menu');
  right.append(who, menuBtn);
  bar.appendChild(right);

  const menu = el('div', 'shell-menu');
  menu.id = 'shell-menu';
  for (const group of groups) {
    const box = el('div', 'shell-group');
    box.appendChild(el('span', 'shell-group-name', group.name));
    for (const link of group.links) {
      const a = el('a', 'shell-link', link.label);
      a.href = link.href;
      if (link.href === here) a.setAttribute('aria-current', 'page');
      box.appendChild(a);
    }
    menu.appendChild(box);
  }
  nav.appendChild(menu);

  function setOpen(open) {
    nav.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('menu-open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('menu-open') && !nav.contains(e.target)) setOpen(false);
  });

  me.then((user) => {
    if (user) {
      const out = el('button', 'shell-user');
      out.type = 'button';
      out.title = 'Log out';
      out.append(el('span', 'shell-user-name', user.name), el('span', 'shell-user-out', 'Log out'));
      out.addEventListener('click', logOut);
      who.appendChild(out);
    } else {
      const login = el('a', 'shell-login', 'Log in');
      login.href = 'login.html';
      who.appendChild(login);
    }
  });
})();
