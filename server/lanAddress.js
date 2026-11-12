// Step lan-address: works out the http://<PC IP>:<port> addresses a phone on
// the same Wi-Fi can reach, so the server can print them next to localhost.
// Pure and dependency-free: index.js hands it os.networkInterfaces() and the
// port. It only ever shapes addresses into URLs - it reads no secrets.

// lanUrls(interfaces, port): interfaces has the shape of os.networkInterfaces()
// - an object keyed by adapter name, each value an array of address entries.
// Returns one { name, url } per non-internal IPv4 address, in the order given.
// IPv6 and internal (loopback) entries are skipped. Empty input -> [].
function lanUrls(interfaces, port) {
  const out = [];
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    for (const addr of addrs || []) {
      if (addr.internal) continue;
      // Node reports family as the string 'IPv4' (18+) or the number 4 (older).
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      out.push({ name, url: `http://${addr.address}:${port}` });
    }
  }
  return out;
}

module.exports = { lanUrls };
