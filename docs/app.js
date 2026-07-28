/* 全网比价工作台 前端逻辑（零依赖，自绘 SVG 趋势图） */
const $ = (id) => document.getElementById(id);

const PLATFORM_ORDER = ['taobao', 'jd', 'pdd', 'douyin', 'kuaishou', 'vipshop'];
let currentQuotes = [];
let legendState = {};

$('goBtn').addEventListener('click', analyze);
$('inputBox').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze();
});
document.querySelectorAll('.tip-chip').forEach(chip => {
  chip.addEventListener('click', () => { $('inputBox').value = chip.dataset.demo; analyze(); });
});

async function analyze() {
  const input = $('inputBox').value.trim();
  if (!input) { $('inputBox').focus(); return; }

  $('result').classList.add('hidden');
  $('loading').classList.remove('hidden');
  $('goBtn').disabled = true;

  try {
    const data = await PandaEngine.analyze(input);
    render(data);
  } catch (e) {
    alert(e.message || '查询失败，请重试');
  } finally {
    $('loading').classList.add('hidden');
    $('goBtn').disabled = false;
  }
}

function render(data) {
  $('productTitle').textContent = data.product.title;
  const firstOk = data.quotes.find(q => !q.error && q.image);
  $('productImage').src = firstOk ? firstOk.image : '';
  $('modeBadge').classList.toggle('hidden', data.mode !== 'mock');

  // 建议卡
  const adv = data.advice;
  const card = $('adviceCard');
  card.className = 'advice-card ' + adv.verdict;
  $('adviceIcon').textContent = { buy: '✅', wait: '⏳', neutral: '👌' }[adv.verdict] || '💡';
  $('adviceTitle').textContent = adv.title;
  $('adviceReasons').innerHTML = (adv.reasons || []).map(r => `<li>${esc(r)}</li>`).join('');

  // 比价卡
  const quotes = data.quotes.filter(q => !q.error);
  currentQuotes = quotes;
  const okSorted = quotes.filter(q => q.inStock).sort((a, b) => a.finalPrice - b.finalPrice);
  const bestPlatform = okSorted[0] ? okSorted[0].platform : null;

  const ordered = [...quotes].sort((a, b) =>
    (a.inStock === b.inStock ? a.finalPrice - b.finalPrice : (a.inStock ? -1 : 1)));

  $('quoteGrid').innerHTML = ordered.map(q => quoteCard(q, q.platform === bestPlatform)).join('');

  // 趋势图
  legendState = {};
  quotes.forEach(q => legendState[q.platform] = true);
  renderLegend(quotes);
  drawChart();

  $('result').classList.remove('hidden');
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function quoteCard(q, isBest) {
  const save = Math.round((q.listPrice - q.finalPrice) * 100) / 100;
  const tags = [
    ...q.coupons.map(c => `<span class="q-tag coupon">🎫 ${esc(c.name)}（${esc(c.endAt)}止）</span>`),
    ...q.promos.map(p => `<span class="q-tag promo">🔥 ${esc(p.name)} -¥${p.value}</span>`)
  ].join('');

  const action = q.inStock
    ? `<div class="q-actions">
         <a class="btn-buy" href="${q.buyUrl}" target="_blank" rel="noopener">💰 ¥${q.finalPrice} 去下单</a>
         ${q.tkl ? `<button class="btn-tkl" onclick="copyTkl('${esc(q.tkl)}')">复制口令</button>` : ''}
       </div>`
    : `<div class="q-oos">暂时缺货</div>`;

  return `
  <div class="quote-card ${isBest ? 'best' : ''}">
    ${isBest ? '<div class="best-tag">全网最低</div>' : ''}
    <div class="q-head">
      <span class="p-badge" style="background:${q.meta.color}">${esc(q.meta.name)}</span>
      <span class="q-shop">${esc(q.shop)}</span>
    </div>
    <div class="q-body">
      <img class="q-img" src="${q.image || ''}" alt="商品图" loading="lazy" />
      <div class="q-body-main">
        <div class="q-price-row">
          <span class="q-final"><small>券后 ¥</small>${q.finalPrice}</span>
          ${save > 0 ? `<span class="q-list">¥${q.listPrice}</span><span class="q-save">共省 ¥${save}</span>` : ''}
        </div>
        <div class="q-tags">${tags || '<span class="q-tag" style="color:#999;background:#f5f5f5">暂无优惠</span>'}</div>
      </div>
    </div>
    <div class="q-meta"><span>销量 ${fmtSales(q.sales)}</span><span>评分 ${q.rating}</span></div>
    <div class="q-hist">近一年：最低 <b class="low">¥${q.stats.lowYear}</b> · 均价 ¥${q.stats.avgYear} · 最高 ¥${q.stats.highYear}</div>
    ${action}
  </div>`;
}

function copyTkl(tkl) {
  navigator.clipboard.writeText(tkl).then(() => alert('口令已复制，打开淘宝App即可查看：' + tkl));
}

/* ---------- 趋势图（自绘 SVG） ---------- */
function renderLegend(quotes) {
  $('chartLegend').innerHTML = quotes.map(q => `
    <span class="legend-item on" data-p="${q.platform}" style="color:${q.meta.color}">
      <span class="dot" style="background:${q.meta.color}"></span>${esc(q.meta.name)}
    </span>`).join('');
  document.querySelectorAll('.legend-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.dataset.p;
      legendState[p] = !legendState[p];
      el.classList.toggle('on', legendState[p]);
      el.classList.toggle('off', !legendState[p]);
      drawChart();
    });
  });
}

function drawChart() {
  const active = currentQuotes.filter(q => legendState[q.platform]);
  const wrap = $('chartWrap');
  if (!active.length) { wrap.innerHTML = '<div style="text-align:center;color:#999;padding:40px 0">请至少选择一个平台</div>'; return; }

  const W = 1000, H = 360, PADL = 64, PADR = 20, PADT = 20, PADB = 40;
  const all = active.flatMap(q => q.history.map(h => h.price));
  let min = Math.min(...all), max = Math.max(...all);
  const span = Math.max(max - min, 1); min -= span * 0.08; max += span * 0.08;

  const n = active[0].history.length;
  const x = i => PADL + (W - PADL - PADR) * i / (n - 1);
  const y = v => PADT + (H - PADT - PADB) * (1 - (v - min) / (max - min));

  let g = '';
  // 网格 + Y轴
  for (let i = 0; i <= 4; i++) {
    const v = min + (max - min) * i / 4, yy = y(v);
    g += `<line x1="${PADL}" y1="${yy}" x2="${W - PADR}" y2="${yy}" stroke="#eceef1" stroke-width="1"/>`;
    g += `<text x="${PADL - 8}" y="${yy + 4}" text-anchor="end" font-size="12" fill="#8a919f">¥${v.toFixed(0)}</text>`;
  }
  // X轴日期（一年跨度，按 2 个月一格展示 年-月）
  const hist = active[0].history;
  const ticks = 6;
  for (let t = 0; t <= ticks; t++) {
    const i = Math.min(n - 1, Math.round((n - 1) * t / ticks));
    g += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#8a919f">${hist[i].date.slice(2, 7)}</text>`;
  }

  // 折线
  for (const q of active) {
    const pts = q.history.map((h, i) => `${x(i).toFixed(1)},${y(h.price).toFixed(1)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${q.meta.color}" stroke-width="2" stroke-linejoin="round" opacity="0.9"/>`;
    // 终点标价
    const last = q.history[n - 1];
    g += `<circle cx="${x(n - 1)}" cy="${y(last.price)}" r="3.5" fill="${q.meta.color}"/>`;
    // 近一年最低点标记（绿=低点好价）
    const lowIdx = q.history.reduce((mi, h, i, arr) => h.price < arr[mi].price ? i : mi, 0);
    g += `<circle cx="${x(lowIdx)}" cy="${y(q.history[lowIdx].price)}" r="4" fill="none" stroke="#0a9c50" stroke-width="2"/>`;
  }

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;

  // 涨跌提示（红涨绿跌）
  const tips = active.map(q => {
    const first = q.history[0].price, last = q.history[n - 1].price;
    const chg = Math.round((last - first) / first * 1000) / 10;
    const color = chg > 0 ? '#e02e24' : '#0a9c50';
    const arrow = chg > 0 ? '↑' : '↓';
    return `<span style="color:${color};margin-left:12px">${esc(q.meta.name)} 一年${arrow}${Math.abs(chg)}%</span>`;
  }).join('');
  $('chartHint').innerHTML = '○ 绿圈 = 近一年最低点' + tips;
}

function fmtSales(n) { return n >= 10000 ? (n / 10000).toFixed(1) + '万+' : n + '+'; }
function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
