/**
 * 一键部署「熊猫比价」到腾讯云 SCF（Web 函数）
 *
 * 用法（在你自己机器上，需 Node 18+ 与可访问 scf.tencentcloudapi.com 的网络）：
 *   set TENCENT_SECRET_ID=AKIDxxxxxxxx
 *   set TENCENT_SECRET_KEY=xxxxxxxx
 *   node deploy_scf.js
 * 可选环境变量：TENCENT_REGION（默认 ap-guangzhou）、CPS_SECRET（自定义短链防篡改密钥）
 *
 * 说明：函数不存在则 CreateFunction（Web 函数 HTTP 类型），已存在则 UpdateFunctionCode。
 * 部署后访问地址在腾讯云控制台「函数服务 - 触发管理」查看。
 */
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const FUNCTION_NAME = 'panda-price-compare';
const REGION = process.env.TENCENT_REGION || 'ap-guangzhou';
const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const ZIP = path.join(__dirname, 'panda-scf.zip');

function sha256hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data, 'utf8').digest(); }

function callTcApi({ action, payload }) {
  const service = 'scf';
  const host = service + '.tencentcloudapi.com';
  const version = '2018-04-16';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payloadStr = JSON.stringify(payload);
  const hashedPayload = sha256hex(payloadStr);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
  const credentialScope = `${date}/${service}/request`;
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, sha256hex(canonicalRequest)].join('\n');
  const secretDate = hmac('TC3' + SECRET_KEY, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': REGION,
    'X-TC-Version': version
  };
  return new Promise((resolve, reject) => {
    const req = https.request('https://' + host, { method: 'POST', headers }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('响应解析失败: ' + d.slice(0, 300))); } });
    });
    req.on('error', reject);
    req.write(Buffer.from(payloadStr, 'utf8'));
    req.end();
  });
}

async function main() {
  if (!SECRET_ID || !SECRET_KEY) {
    console.error('✗ 请先设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
    process.exit(1);
  }
  if (!fs.existsSync(ZIP)) {
    console.error('✗ 找不到 panda-scf.zip，请先运行（在项目根目录）：\n  PowerShell: Compress-Archive -Path "deploy\\*" -DestinationPath panda-scf.zip -Force');
    process.exit(1);
  }
  const zipB64 = fs.readFileSync(ZIP).toString('base64');
  const envVars = [];
  if (process.env.CPS_SECRET) envVars.push({ Key: 'CPS_SECRET', Value: process.env.CPS_SECRET });

  const base = { FunctionName: FUNCTION_NAME, Namespace: 'default' };
  const createPayload = {
    ...base,
    Handler: 'scf_bootstrap',
    Runtime: 'Nodejs18.17',
    Type: 'HTTP',
    Code: { ZipFile: zipB64 },
    MemorySize: 128,
    Timeout: 30,
    Description: '熊猫比价 - 全网比价工作台',
    Environment: envVars.length ? { Variables: envVars } : undefined
  };
  Object.keys(createPayload).forEach((k) => createPayload[k] === undefined && delete createPayload[k]);

  let r = await callTcApi({ action: 'CreateFunction', payload: createPayload });
  if (r.Response && r.Response.Error) {
    const code = r.Response.Error.Code || '';
    if (code === 'ResourceInUse.FunctionName' || /already exists/i.test(code)) {
      console.log('· 函数已存在，改为更新代码…');
      const upd = await callTcApi({
        action: 'UpdateFunctionCode',
        payload: { ...base, Handler: 'scf_bootstrap', Code: { ZipFile: zipB64 } }
      });
      if (upd.Response && upd.Response.Error) { console.error('✗ 更新失败:', JSON.stringify(upd.Response.Error)); process.exit(1); }
      console.log('✓ 代码已更新');
    } else {
      console.error('✗ 创建失败:', JSON.stringify(r.Response.Error));
      process.exit(1);
    }
  } else {
    console.log('✓ 函数已创建');
  }

  // 等待就绪
  for (let i = 0; i < 20; i++) {
    const g = await callTcApi({ action: 'GetFunction', payload: base });
    const st = g.Response && g.Response.Status;
    if (st === 1) {
      console.log('✓ 函数状态: Active');
      const f = g.Response;
      const url = (f.AccessUrls && (f.AccessUrls.InternetUrl || f.AccessUrls.InternalUrl)) ||
        (f.Triggers && f.Triggers[0] && f.Triggers[0].TriggerUrl) || '（请在控制台「触发管理」查看 Web 函数访问地址）';
      console.log('→ 访问地址:', url);
      console.log('\n部署完成！微信里直接打开该地址即可使用熊猫比价。');
      return;
    }
    console.log('· 等待函数就绪… 当前状态', st);
    await new Promise((res) => setTimeout(res, 3000));
  }
  console.log('⚠ 函数仍在初始化，请稍后在控制台确认状态与访问地址。');
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1); });
