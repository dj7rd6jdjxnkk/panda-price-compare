/**
 * 商品输入解析器：识别 链接 / 淘口令 / 关键词
 * 输出统一结构 { sourcePlatform, productKey, rawUrl, tkl, keyword }
 */

const URL_RULES = [
  { platform: 'taobao',   re: /(item\.taobao\.com|detail\.tmall\.com|tb\.cn|taobao\.com|tmall\.com|m\.tb\.cn)/i },
  { platform: 'jd',       re: /(item\.jd\.com|jd\.com|3\.cn|jingxi\.com|jd\.hk)/i },
  { platform: 'pdd',      re: /(yangkeduo\.com|pinduoduo\.com|pdd\.cn|p\.pinduoduo)/i },
  { platform: 'douyin',   re: /(douyin\.com|jinritemai\.com|v\.douyin\.com|haohuo\.jinritemai)/i },
  { platform: 'kuaishou', re: /(kuaishou\.com|kwaixiaodian\.com|v\.kuaishou\.com)/i },
  { platform: 'vipshop',  re: /(vip\.com|vipshop\.com|m\.vip\.com)/i }
];

// 淘口令：￥xxxx￥ / $xxxx$ / (xxxx) 等各种符号包裹的 8-14 位码
const TKL_RE = /[¥￥$€₤《【]([0-9A-Za-z]{8,14})[¥￥$€₤》】]/;
const TKL_RE2 = /([0-9]{1,2}[¥￥$])[0-9A-Za-z]{8,14}([¥￥$])/;

function extractUrl(text) {
  const m = text.match(/https?:\/\/[^\s\u4e00-\u9fa5，。！？"']+/i);
  return m ? m[0] : null;
}

function extractItemId(url, platform) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('id') || u.searchParams.get('goods_id') ||
               u.searchParams.get('sku') || u.searchParams.get('itemId');
    if (id) return id;
    // 京东 item.jd.com/100012043978.html
    const pathId = u.pathname.match(/(\d{6,})/);
    if (pathId) return pathId[1];
    // 短链：用整个短链作为 key
    return u.hostname + u.pathname;
  } catch (e) {
    return url;
  }
}

function parseInput(text) {
  const input = (text || '').trim();
  if (!input) return { error: '请输入商品链接、淘口令或商品名称' };

  const url = extractUrl(input);
  if (url) {
    for (const rule of URL_RULES) {
      if (rule.re.test(url)) {
        return {
          type: 'url',
          sourcePlatform: rule.platform,
          rawUrl: url,
          productKey: rule.platform + ':' + extractItemId(url, rule.platform)
        };
      }
    }
    return { type: 'url', sourcePlatform: 'unknown', rawUrl: url, productKey: 'url:' + url };
  }

  const tkl = input.match(TKL_RE) || input.match(TKL_RE2);
  if (tkl) {
    return {
      type: 'tkl',
      sourcePlatform: 'taobao',
      tkl: tkl[0],
      productKey: 'tkl:' + (tkl[1] || tkl[0]).replace(/[^0-9A-Za-z]/g, '')
    };
  }

  // 关键词搜索
  return { type: 'keyword', sourcePlatform: null, keyword: input, productKey: 'kw:' + input };
}

module.exports = { parseInput };
