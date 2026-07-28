/**
 * 确定性模拟数据引擎
 * 同一个商品链接/口令，每次生成的价格、历史曲线、优惠券都一致（基于字符串哈希做种子）
 * 接入真实 API 后此模块仅用于 mode=mock 演示
 */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 可复现的伪随机数生成器
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

// 与 TITLES 一一对应的商品图标与配色（用于生成确定性主图，全平台同图便于对版）
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

/** 生成确定性商品主图（SVG data URI，同一商品全平台一致） */
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
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const SHOP_SUFFIX = {
  taobao: ['官方旗舰店', '天猫超市', '品牌直营店'],
  jd: ['京东自营', '官方旗舰店', '京东超市'],
  pdd: ['官方旗舰店', '百亿补贴', '品牌黑标店'],
  douyin: ['官方旗舰店', '抖音超市', '品牌直播间'],
  kuaishou: ['官方旗舰店', '快手优选', '品牌直播间'],
  vipshop: ['唯品自营', '品牌特卖', '官方旗舰']
};

// 平台价格系数（模拟不同平台定价习惯）
const PLATFORM_BIAS = {
  taobao: 1.00, jd: 1.04, pdd: 0.92, douyin: 0.97, kuaishou: 0.95, vipshop: 0.96
};

function pickTitle(seed, hintTitle) {
  if (hintTitle) return hintTitle;
  return TITLES[seed % TITLES.length];
}

/**
 * 生成某平台的商品报价（含90天历史、优惠券、活动）
 */
function genQuote(productKey, platform, hintTitle) {
  const seed = hashStr(productKey + '::' + platform);
  const rnd = mulberry32(seed);
  const baseSeed = hashStr(productKey);
  const baseRnd = mulberry32(baseSeed);

  // 商品基准价（全平台共享），50 ~ 3050
  const basePrice = Math.round((50 + baseRnd() * 3000) * 100) / 100;
  const bias = PLATFORM_BIAS[platform] || 1;
  // 平台现价 = 基准价 * 平台系数 * 小扰动
  const listPrice = Math.round(basePrice * bias * (0.96 + rnd() * 0.1) * 100) / 100;

  // ---- 近一年（365天）历史价格 ----
  const history = [];
  const today = new Date();
  let p = listPrice * (1.02 + rnd() * 0.1);
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    // 随机游走 + 向现价均值回归，防止一年跨度漂移过远
    p = p * (1 + (rnd() - 0.5) * 0.02) * (1 + (listPrice - p) / listPrice * 0.004);
    p = Math.min(Math.max(p, listPrice * 0.72), listPrice * 1.45);
    // 大促节点降价：38节 / 618 / 99划算节 / 双11 / 双12 / 年货节
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
  // 最后一天与现价对齐
  history[history.length - 1].price = listPrice;

  // ---- 优惠券 ----
  const coupons = [];
  if (rnd() > 0.25) {
    const step = [300, 200, 100, 50, 30][Math.floor(rnd() * 5)];
    const threshold = Math.max(step * 2, Math.round(listPrice * (0.4 + rnd() * 0.5) / 10) * 10);
    const value = Math.min(step, Math.round(threshold * 0.25));
    if (listPrice >= threshold) {
      coupons.push({
        type: 'coupon',
        name: `满${threshold}减${value}优惠券`,
        threshold, value,
        endAt: new Date(today.getTime() + Math.floor(1 + rnd() * 7) * 86400000).toISOString().slice(0, 10)
      });
    }
  }

  // ---- 平台活动 ----
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

  // ---- 券后到手价 ----
  const couponCut = coupons.reduce((s, c) => s + c.value, 0);
  const promoCut = promos.reduce((s, c) => s + c.value, 0);
  const finalPrice = Math.round((listPrice - couponCut - promoCut) * 100) / 100;

  // ---- 佣金（仅后端记账，绝不下发前端）----
  const commissionRate = 0.01 + rnd() * 0.14; // 1% ~ 15%
  const commission = Math.round(finalPrice * commissionRate * 100) / 100;

  const shops = SHOP_SUFFIX[platform];
  const prices = history.map(h => h.price);

  const title = pickTitle(baseSeed, hintTitle);
  return {
    platform,
    title,
    image: genImage(baseSeed, title),
    shop: shops[Math.floor(rnd() * shops.length)],
    sales: Math.floor(100 + rnd() * 50000),
    rating: Math.round((4.4 + rnd() * 0.6) * 10) / 10,
    inStock: rnd() > 0.05,
    listPrice,
    coupons,
    promos,
    finalPrice,
    history,
    stats: {
      lowYear: Math.min(...prices),
      highYear: Math.max(...prices),
      avgYear: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100
    },
    // 内部字段，路由层会剥离
    _commission: commission,
    _commissionRate: Math.round(commissionRate * 1000) / 10
  };
}

module.exports = { genQuote, hashStr };
