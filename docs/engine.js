/* 熊猫比价 · 浏览器端引擎（纯前端，无需后端）
 * 合并自后端 parser / mock / advisor / adapter，全部浏览器兼容。
 * 演示模式为确定性模拟数据；接入真实联盟 API 时请改用后端版本（见 README）。
 * 佣金仅在内部计算，永不传入 UI，对用户不可见。
 */
(function (global) {
  'use strict';

  /* ---------- 通用工具 ---------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // UTF-8 安全的 base64
  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  // base64url（用于拼接商品 key，模拟联盟短链）
  function b64url(str) {
    return b64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* ---------- 商品解析 ---------- */
  const URL_RULES = [
    { platform: 'taobao',   re: /(item\.taobao\.com|detail\.tmall\.com|tb\.cn|taobao\.com|tmall\.com|m\.tb\.cn)/i },
    { platform: 'jd',       re: /(item\.jd\.com|jd\.com|3\.cn|jingxi\.com|jd\.hk)/i },
    { platform: 'pdd',      re: /(yangkeduo\.com|pinduoduo\.com|pdd\.cn|p\.pinduoduo)/i },
    { platform: 'douyin',   re: /(douyin\.com|jinritemai\.com|v\.douyin\.com|haohuo\.jinritemai)/i },
    { platform: 'kuaishou', re: /(kuaishou\.com|kwaixiaodian\.com|v\.kuaishou\.com)/i },
    { platform: 'vipshop',  re: /(vip\.com|vipshop\.com|m\.vip\.com)/i }
  ];
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
      const pathId = u.pathname.match(/(\d{6,})/);
      if (pathId) return pathId[1];
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
          return { type: 'url', sourcePlatform: rule.platform, rawUrl: url,
                   productKey: rule.platform + ':' + extractItemId(url, rule.platform) };
        }
      }
      return { type: 'url', sourcePlatform: 'unknown', rawUrl: url, productKey: 'url:' + url };
    }
    const tkl = input.match(TKL_RE) || input.match(TKL_RE2);
    if (tkl) {
      return { type: 'tkl', sourcePlatform: 'taobao', tkl: tkl[0],
               productKey: 'tkl:' + (tkl[1] || tkl[0]).replace(/[^0-9A-Za-z]/g, '') };
    }
    return { type: 'keyword', sourcePlatform: null, keyword: input, productKey: 'kw:' + input };
  }

  /* ---------- 模拟数据引擎 ---------- */
  const TITLES = [
    '旗舰无线降噪蓝牙耳机 Pro 主动降噪 超长续航',
    '轻薄笔记本电脑 14英寸 16G+512G 高色域屏',
    '全自动咖啡机 家用意式浓缩 一键奶泡',
    '男女同款轻量跑步鞋 缓震透气运动鞋',
    '大容量保温杯 316不锈钢 智能温显',
    '洗地机无线智能 自清洁家用吸拖一体机',
    '儿童电动牙刷 声波震动 软毛护龈',
    '4K高清投影仪 家用智能 自动对焦'
  ];
  const IMG_META = [
    { emoji: '🎧', bg1: '#dbeafe', bg2: '#93c5fd' },
    { emoji: '💻', bg1: '#e0e7ff', bg2: '#a5b4fc' },
    { emoji: '☕', bg1: '#fef3c7', bg2: '#fcd34d' },
    { emoji: '👟', bg1: '#dcfce7', bg2: '#86efac' },
    { emoji: '🥤', bg1: '#fce7f3', bg2: '#f9a8d4' },
    { emoji: '🧹', bg1: '#cffafe', bg2: '#67e8f9' },
    { emoji: '🪥', bg1: '#fee2e2', bg2: '#fca5a5' },
    { emoji: '📽️', bg1: '#ede9fe', bg2: '#c4b5fd' }
  ];
  function genImage(baseSeed, title) {
    const m = IMG_META[baseSeed % IMG_META.length];
    const short = (title || '').slice(0, 12);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${m.bg1}"/><stop offset="1" stop-color="${m.bg2}"/></linearGradient></defs>` +
      `<rect width="300" height="300" fill="url(#g)"/>` +
      `<text x="150" y="150" font-size="110" text-anchor="middle" dominant-baseline="central">${m.emoji}</text>` +
      `<text x="150" y="262" font-size="17" text-anchor="middle" fill="#334155" font-family="sans-serif">${short}</text>` +
      `</svg>`;
    return 'data:image/svg+xml;base64,' + b64(svg);
  }
  const SHOP_SUFFIX = {
    taobao: ['官方旗舰店', '天猫超市', '品牌直营店'],
    jd: ['京东自营', '官方旗舰店', '京东超市'],
    pdd: ['官方旗舰店', '百亿补贴', '品牌黑标店'],
    douyin: ['官方旗舰店', '抖音超市', '品牌直播间'],
    kuaishou: ['官方旗舰店', '快手优选', '品牌直播间'],
    vipshop: ['唯品自营', '品牌特卖', '官方旗舰']
  };
  const PLATFORM_BIAS = {
    taobao: 1.00, jd: 1.04, pdd: 0.92, douyin: 0.97, kuaishou: 0.95, vipshop: 0.96
  };
  function pickTitle(seed, hintTitle) {
    if (hintTitle) return hintTitle;
    return TITLES[seed % TITLES.length];
  }
  function genQuote(productKey, platform, hintTitle) {
    const seed = hashStr(productKey + '::' + platform);
    const rnd = mulberry32(seed);
    const baseSeed = hashStr(productKey);
    const baseRnd = mulberry32(baseSeed);

    const basePrice = Math.round((50 + baseRnd() * 3000) * 100) / 100;
    const bias = PLATFORM_BIAS[platform] || 1;
    const listPrice = Math.round(basePrice * bias * (0.96 + rnd() * 0.1) * 100) / 100;

    // 近一年（365天）历史价格
    const history = [];
    const today = new Date();
    let p = listPrice * (1.02 + rnd() * 0.1);
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      p = p * (1 + (rnd() - 0.5) * 0.02) * (1 + (listPrice - p) / listPrice * 0.004);
      p = Math.min(Math.max(p, listPrice * 0.72), listPrice * 1.45);
      const m = d.getMonth() + 1, day = d.getDate();
      let promoDip = 1;
      if ((m === 3 && day >= 6 && day <= 8) || (m === 6 && day >= 15 && day <= 20) ||
          (m === 9 && day >= 8 && day <= 10) || (m === 11 && day >= 9 && day <= 12) ||
          (m === 12 && day >= 10 && day <= 13) || (m === 1 && day >= 15 && day <= 25)) {
        promoDip = 0.82 + rnd() * 0.06;
      }
      const dayPrice = Math.max(basePrice * 0.6, p * promoDip);
      history.push({ date: d.toISOString().slice(0, 10), price: Math.round(dayPrice * 100) / 100 });
    }
    history[history.length - 1].price = listPrice;

    // 优惠券
    const coupons = [];
    if (rnd() > 0.25) {
      const step = [300, 200, 100, 50, 30][Math.floor(rnd() * 5)];
      const threshold = Math.max(step * 2, Math.round(listPrice * (0.4 + rnd() * 0.5) / 10) * 10);
      const value = Math.min(step, Math.round(threshold * 0.25));
      if (listPrice >= threshold) {
        coupons.push({
          type: 'coupon', name: `满${threshold}减${value}优惠券`, threshold, value,
          endAt: new Date(today.getTime() + Math.floor(1 + rnd() * 7) * 86400000).toISOString().slice(0, 10)
        });
      }
    }
    // 平台活动
    const promos = [];
    const promoPool = {
      taobao: ['88VIP专享95折', '天猫购物金膨胀', '跨店满300减30'],
      jd: ['PLUS会员价', '京东跨店满299减30', '闪购直降'],
      pdd: ['百亿补贴直降', '限时秒杀', '多人团再减'],
      douyin: ['直播间专属价', '抖音商城满减', '新人立减'],
      kuaishou: ['直播补贴价', '快手券后立减', '粉丝专享'],
      vipshop: ['唯品特卖折上折', 'SVIP再享9.5折', '大牌日直降']
    };
    if (rnd() > 0.4) {
      const pool = promoPool[platform];
      const cut = Math.round(listPrice * (0.02 + rnd() * 0.06) * 100) / 100;
      promos.push({ type: 'promo', name: pool[Math.floor(rnd() * pool.length)], value: cut });
    }

    const couponCut = coupons.reduce((s, c) => s + c.value, 0);
    const promoCut = promos.reduce((s, c) => s + c.value, 0);
    const finalPrice = Math.round((listPrice - couponCut - promoCut) * 100) / 100;

    // 佣金（仅内部计算，绝不下发 UI）
    const commissionRate = 0.01 + rnd() * 0.14;
    const commission = Math.round(finalPrice * commissionRate * 100) / 100;

    const shops = SHOP_SUFFIX[platform];
    const prices = history.map(h => h.price);
    const title = pickTitle(baseSeed, hintTitle);
    return {
      platform, title, image: genImage(baseSeed, title),
      shop: shops[Math.floor(rnd() * shops.length)],
      sales: Math.floor(100 + rnd() * 50000),
      rating: Math.round((4.4 + rnd() * 0.6) * 10) / 10,
      inStock: rnd() > 0.05,
      listPrice, coupons, promos, finalPrice, history,
      stats: {
        lowYear: Math.min(...prices),
        highYear: Math.max(...prices),
        avgYear: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100
      },
      _commission: commission,
      _commissionRate: Math.round(commissionRate * 1000) / 10
    };
  }

  /* ---------- 平台元数据 + CPS 转链（演示） ---------- */
  const PLATFORM_META = {
    taobao:   { name: '淘宝/天猫', color: '#FF5000', home: 'https://item.taobao.com' },
    jd:       { name: '京东',     color: '#E1251B', home: 'https://item.jd.com' },
    pdd:      { name: '拼多多',   color: '#E02E24', home: 'https://mobile.yangkeduo.com' },
    douyin:   { name: '抖音商城', color: '#161823', home: 'https://haohuo.jinritemai.com' },
    kuaishou: { name: '快手小店', color: '#FF4906', home: 'https://app.kwaixiaodian.com' },
    vipshop:  { name: '唯品会',   color: '#E4007F', home: 'https://www.vip.com' }
  };
  function buildAppScheme(platform, h5Url, parsed) {
    const enc = encodeURIComponent(h5Url);
    const map = {
      taobao:   `taobao://uland.taobao.com/coupon/edetail?activityId=demo&itemId=${encodeURIComponent(parsed.productKey)}`,
      jd:       `openapp.jdmobile://virtual?params=${encodeURIComponent(JSON.stringify({ category: 'jump', des: 'm', url: h5Url }))}`,
      pdd:      `pinduoduo://com.xunmeng.pinduoduo/duo_coupon_landing.html?url=${enc}`,
      douyin:   `snssdk1128://webview?url=${enc}`,
      kuaishou: `kwai://webview?url=${enc}`,
      vipshop:  `vipshop://showWeb?url=${enc}`
    };
    return map[platform] || null;
  }
  function mockConvert(platform, quote, parsed) {
    const pidMap = {
      taobao:   `https://uland.taobao.com/coupon/edetail?activityId=demo&pid=mm_demo&itemId=${encodeURIComponent(parsed.productKey)}`,
      jd:       `https://u.jd.com/demo_${b64url(parsed.productKey).slice(0, 10)}`,
      pdd:      `https://p.pinduoduo.com/demo_${b64url(parsed.productKey).slice(0, 10)}`,
      douyin:   `https://v.douyin.com/demo_${b64url(parsed.productKey).slice(0, 8)}/`,
      kuaishou: `https://v.kuaishou.com/demo_${b64url(parsed.productKey).slice(0, 8)}`,
      vipshop:  `https://t.vip.com/demo_${b64url(parsed.productKey).slice(0, 10)}`
    };
    const h5 = pidMap[platform];
    return {
      cpsUrl: h5,
      appScheme: buildAppScheme(platform, h5, parsed),
      tkl: platform === 'taobao' ? `￥demo${Math.abs(hashStr(parsed.productKey)).toString(36).slice(0, 8)}￥` : null
    };
  }

  /* ---------- 购买建议引擎 ---------- */
  const PLATFORM_SERVICE = {
    jd: '物流快、售后省心', taobao: '商品丰富、可用88VIP', pdd: '百亿补贴价格猛',
    vipshop: '正品特卖有保障', douyin: '直播价常有惊喜', kuaishou: '补贴力度大'
  };
  function platformName(p) {
    return { taobao: '淘宝/天猫', jd: '京东', pdd: '拼多多', douyin: '抖音', kuaishou: '快手', vipshop: '唯品会' }[p] || p;
  }
  function formatSales(n) {
    return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
  }
  function advise(quotes) {
    const valid = quotes.filter(q => q.inStock);
    if (!valid.length) return { verdict: 'wait', title: '暂时缺货', reasons: ['所有平台均无货，建议加入收藏等补货'] };
    const sorted = [...valid].sort((a, b) => a.finalPrice - b.finalPrice);
    const best = sorted[0], second = sorted[1];
    const reasons = [];
    if (second) {
      const diff = Math.round((second.finalPrice - best.finalPrice) * 100) / 100;
      const pct = Math.round(diff / second.finalPrice * 1000) / 10;
      if (diff > 0) reasons.push(`${platformName(best.platform)}到手价 ¥${best.finalPrice}，比第二低的${platformName(second.platform)}便宜 ¥${diff}（${pct}%）`);
      else reasons.push(`${platformName(best.platform)}与${platformName(second.platform)}价格持平，按服务偏好选择即可`);
    }
    const { lowYear, avgYear } = best.stats;
    const posVsLow = (best.finalPrice - lowYear) / lowYear;
    let timing;
    if (best.finalPrice <= lowYear * 1.02) {
      timing = 'buy';
      reasons.push(`当前到手价处于近一年最低区间（年度最低 ¥${lowYear}），是好价`);
    } else if (best.finalPrice <= avgYear) {
      timing = 'buy';
      reasons.push(`当前价低于近一年均价 ¥${avgYear}，价格合理`);
    } else if (posVsLow > 0.15) {
      timing = 'wait';
      reasons.push(`当前价比近一年最低价 ¥${lowYear} 高出 ${Math.round(posVsLow * 100)}%，不着急可等大促`);
    } else {
      timing = 'neutral';
      reasons.push(`当前价略高于近一年均价，可接受但非最佳`);
    }
    const expiring = best.coupons.filter(c => (new Date(c.endAt) - Date.now()) / 86400000 <= 3);
    if (expiring.length) {
      reasons.push(`「${expiring[0].name}」${expiring[0].endAt} 到期，想买建议尽快下单`);
      if (timing === 'neutral') timing = 'buy';
    }
    if (PLATFORM_SERVICE[best.platform]) reasons.push(`${platformName(best.platform)}：${PLATFORM_SERVICE[best.platform]}`);
    if (best.rating >= 4.8 && best.sales > 5000) reasons.push(`销量 ${formatSales(best.sales)}、评分 ${best.rating}，口碑扎实`);
    const verdictMap = {
      buy: { verdict: 'buy', title: `建议现在下单 · 首选${platformName(best.platform)}` },
      wait: { verdict: 'wait', title: `建议再等等 · 关注${platformName(best.platform)}降价` },
      neutral: { verdict: 'neutral', title: `可以入手 · 首选${platformName(best.platform)}` }
    };
    return { ...verdictMap[timing], bestPlatform: best.platform, reasons };
  }

  /* ---------- 对外：分析入口 ---------- */
  const DEMO_CPS = { taobao: {}, jd: {}, pdd: {}, douyin: {}, kuaishou: {}, vipshop: {} };
  function analyze(input) {
    const parsed = parseInput(input);
    if (parsed.error) return Promise.reject(new Error(parsed.error));
    const platforms = Object.keys(PLATFORM_META);
    const quotes = platforms.map(p => {
      const quote = genQuote(parsed.productKey, p, parsed.type === 'keyword' ? parsed.keyword : null);
      const conv = mockConvert(p, quote, parsed, DEMO_CPS);
      const { _commission, _commissionRate, ...pub } = quote;
      const buyUrl = 'go.html?p=' + p +
        '&url=' + encodeURIComponent(conv.cpsUrl) +
        '&scheme=' + encodeURIComponent(conv.appScheme || '') +
        (conv.tkl ? '&tkl=' + encodeURIComponent(conv.tkl) : '');
      return { ...pub, meta: PLATFORM_META[p], buyUrl, tkl: conv.tkl };
    });
    const advice = advise(quotes.filter(q => !q.error));
    const firstOk = quotes.find(q => !q.error && q.image);
    return Promise.resolve({
      mode: 'mock',
      parsed: { type: parsed.type, sourcePlatform: parsed.sourcePlatform || null, keyword: parsed.keyword || null },
      product: { title: firstOk ? firstOk.title : (parsed.keyword || '未知商品') },
      quotes, advice
    });
  }

  global.PandaEngine = { analyze, parseInput };
})(window);
