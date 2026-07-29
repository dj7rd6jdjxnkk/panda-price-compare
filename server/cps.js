/**
 * CPS 短链管理（无状态，适配云函数/Serverless 多实例 + 冷启动）
 * - 对外只暴露 /go/:code 短链，用户看不到 pid、佣金等敏感信息
 * - code 本身编码了 {平台, 联盟链接, App scheme, 商品key}，并用 HMAC 签名防篡改
 * - 不依赖内存/数据库，冷启动、多实例都不丢链接
 * - 如需「点击数/佣金」统计，接外部存储（TencentDB/Redis）后在 resolve 里上报即可
 */
const crypto = require('crypto');

const SECRET = process.env.CPS_SECRET || 'panda-cps-demo-secret';
const SIG_LEN = 12; // base64url 签名长度

function createShortLink({ platform, cpsUrl, appScheme, productKey }) {
  const payload = JSON.stringify({ p: platform, u: cpsUrl, s: appScheme || '', k: productKey || '' });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url').slice(0, SIG_LEN);
  return sig + b64;
}

function resolve(code) {
  try {
    const sig = code.slice(0, SIG_LEN);
    const b64 = code.slice(SIG_LEN);
    const expect = crypto.createHmac('sha256', SECRET).update(b64).digest('base64url').slice(0, SIG_LEN);
    if (sig !== expect) return null;
    const d = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return { platform: d.p, cpsUrl: d.u, appScheme: d.s || null, productKey: d.k };
  } catch {
    return null;
  }
}

/** 统计接口：无状态架构下默认返回空，接外部存储后可在此聚合 */
function report() {
  return { note: 'serverless 无状态：点击/佣金统计需接外部存储（TencentDB/Redis），部署后另行接入', rows: [] };
}

module.exports = { createShortLink, resolve, report };
