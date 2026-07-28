/**
 * CPS 短链管理 + 佣金内部记账
 * - 对外只暴露 /go/:code 短链，用户看不到 pid、佣金等敏感信息
 * - 无论用户选择哪个平台，点击都经过 /go 短链 → 记录点击 → 302 到转链后的联盟链接
 * - 佣金数据仅存后端内存/日志（生产可换成数据库）
 */
const crypto = require('crypto');

const store = new Map();   // code → { platform, cpsUrl, tkl, productKey, commission, createdAt, clicks }

function genCode() {
  return crypto.randomBytes(4).toString('hex');
}

function createShortLink({ platform, cpsUrl, appScheme, tkl, productKey, commission, commissionRate }) {
  const code = genCode();
  store.set(code, {
    platform, cpsUrl, appScheme, tkl, productKey,
    commission, commissionRate,          // 内部记账字段，不下发
    createdAt: new Date().toISOString(),
    clicks: 0
  });
  return code;
}

function resolve(code) {
  const rec = store.get(code);
  if (!rec) return null;
  rec.clicks++;
  rec.lastClickAt = new Date().toISOString();
  return rec;
}

/** 内部报表（仅供运营后台，不暴露给 C 端） */
function report() {
  const rows = [];
  for (const [code, r] of store) {
    rows.push({
      code, platform: r.platform, productKey: r.productKey,
      clicks: r.clicks, estCommission: r.commission, rate: r.commissionRate + '%',
      createdAt: r.createdAt
    });
  }
  return rows.sort((a, b) => b.clicks - a.clicks);
}

module.exports = { createShortLink, resolve, report };
