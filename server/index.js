/**
 * 全网比价工作台 — 零依赖 Node HTTP 服务
 * POST /api/analyze  { input }  → 解析 + 六平台比价 + 购买建议 + CPS短链
 * GET  /go/:code                → CPS 短链 302 跳转（记录点击，佣金后端记账）
 * GET  /api/admin/report        → 内部佣金/点击报表（生产环境需加鉴权）
 * 其余                          → public 静态文件
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const { parseInput } = require('./parser');
const { adapters } = require('./adapters');
const { advise } = require('./advisor');
const cps = require('./cps');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleAnalyze(req, res, body) {
  let payload;
  try { payload = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: '请求格式错误' }); }

  const parsed = parseInput(payload.input);
  if (parsed.error) return json(res, 400, { error: parsed.error });

  // 并发请求六个平台适配器
  const platforms = Object.keys(adapters);
  const results = await Promise.all(platforms.map(async (p) => {
    try {
      const quote = await adapters[p].fetchQuote(parsed, config);
      const conv = await adapters[p].convertCps(quote, parsed, config);
      // 生成短链（佣金只进后端记账，不下发）
      const code = cps.createShortLink({
        platform: p, cpsUrl: conv.cpsUrl, appScheme: conv.appScheme,
        productKey: parsed.productKey
      });
      // 剥离内部字段
      const { _commission, _commissionRate, ...pub } = quote;
      return { ...pub, meta: adapters[p].meta, buyUrl: '/go/' + code, tkl: conv.tkl };
    } catch (e) {
      return { platform: p, meta: adapters[p].meta, error: '该平台查询失败' };
    }
  }));

  const okQuotes = results.filter(r => !r.error);
  const advice = advise(okQuotes);

  json(res, 200, {
    mode: config.mode,
    parsed: { type: parsed.type, sourcePlatform: parsed.sourcePlatform || null, keyword: parsed.keyword || null },
    product: { title: okQuotes[0] ? okQuotes[0].title : (parsed.keyword || '未知商品') },
    quotes: results,
    advice
  });
}

/** 手机端 App 唤起中转页：尝试 scheme 打开 App，1.8s 未成功则回落 H5 */
function bouncePage(rec) {
  const nameMap = { taobao: '淘宝', jd: '京东', pdd: '拼多多', douyin: '抖音', kuaishou: '快手', vipshop: '唯品会' };
  const appName = nameMap[rec.platform] || '购物';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>正在打开${appName}App…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;background:#f5f6f8;color:#1f2329;gap:16px;padding:20px;text-align:center}
.sp{width:40px;height:40px;border:3px solid #e5e6eb;border-top-color:#1456f0;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
a{color:#1456f0}</style></head><body>
<div class="sp"></div>
<div>正在为你打开 <b>${appName} App</b> 领取优惠…</div>
<div style="font-size:13px;color:#8a919f">如未自动打开，<a id="h5" href="${rec.cpsUrl.replace(/"/g, '&quot;')}">点此在浏览器中继续</a></div>
<script>
(function(){
  var scheme=${JSON.stringify(rec.appScheme)},h5=${JSON.stringify(rec.cpsUrl)};
  var t=Date.now();
  location.href=scheme;
  setTimeout(function(){
    // 若已切到 App，页面会被挂起，时间差会明显大于阈值
    if(Date.now()-t<2300&&!document.hidden){location.href=h5;}
  },1800);
})();
</script></body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // CPS 短链跳转：手机端优先唤起对应 App（scheme），失败自动回落 H5；电脑端直接 302
  if (url.pathname.startsWith('/go/')) {
    const code = url.pathname.slice(4);
    const rec = cps.resolve(code);
    if (!rec) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('链接已失效'); }
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
    if (isMobile && rec.appScheme) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(bouncePage(rec));
    }
    res.writeHead(302, { Location: rec.cpsUrl });
    return res.end();
  }

  // 内部报表（生产需加鉴权！）
  if (url.pathname === '/api/admin/report') {
    return json(res, 200, { rows: cps.report() });
  }

  if (url.pathname === '/api/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => handleAnalyze(req, res, body).catch(e => json(res, 500, { error: '服务器错误' })));
    return;
  }

  // 静态文件
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// PaaS 平台（Railway/Render/云函数等）通过环境变量 PORT 注入端口，本地回退到 config.port
const PORT = process.env.PORT || config.port;
server.listen(PORT, () => {
  console.log(`[比价工作台] 已启动: http://localhost:${PORT}  模式: ${config.mode}`);
});
