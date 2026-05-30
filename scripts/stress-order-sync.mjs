/**
 * Trendyol sipariş ingest stres testi (geliştirme).
 * Kullanım: node scripts/stress-order-sync.mjs [adet]
 * Gereksinim: MONGODB_URI + çalışan Next sunucusu veya doğrudan lib import yerine HTTP
 */
const BASE = process.env.STRESS_BASE_URL || 'http://localhost:3000';
const COUNT = Math.min(500, Math.max(1, Number(process.argv[2] || 50)));

async function main() {
  const started = Date.now();
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < COUNT; i++) {
    try {
      const res = await fetch(`${BASE}/api/health?deep=0`, { cache: 'no-store' });
      if (res.ok) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }

  const ms = Date.now() - started;
  console.log(JSON.stringify({
    target: BASE,
    requests: COUNT,
    ok,
    fail,
    durationMs: ms,
    rps: (COUNT / (ms / 1000)).toFixed(1),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
