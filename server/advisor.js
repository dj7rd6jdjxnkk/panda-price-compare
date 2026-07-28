/**
 * 购买建议引擎
 * 综合：到手价、90天历史位置、券临期、平台服务、销量口碑 → 输出建议
 */

const PLATFORM_SERVICE = {
  jd: '物流快、售后省心',
  taobao: '商品丰富、可用88VIP',
  pdd: '百亿补贴价格猛',
  vipshop: '正品特卖有保障',
  douyin: '直播价常有惊喜',
  kuaishou: '补贴力度大'
};

function advise(quotes) {
  const valid = quotes.filter(q => q.inStock);
  if (!valid.length) return { verdict: 'wait', title: '暂时缺货', reasons: ['所有平台均无货，建议加入收藏等补货'] };

  const sorted = [...valid].sort((a, b) => a.finalPrice - b.finalPrice);
  const best = sorted[0];
  const second = sorted[1];
  const reasons = [];

  // 1. 价格优势
  if (second) {
    const diff = Math.round((second.finalPrice - best.finalPrice) * 100) / 100;
    const pct = Math.round(diff / second.finalPrice * 1000) / 10;
    if (diff > 0) reasons.push(`${platformName(best.platform)}到手价 ¥${best.finalPrice}，比第二低的${platformName(second.platform)}便宜 ¥${diff}（${pct}%）`);
    else reasons.push(`${platformName(best.platform)}与${platformName(second.platform)}价格持平，按服务偏好选择即可`);
  }

  // 2. 历史价格位置（近一年）
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

  // 3. 券临期提醒
  const expiring = best.coupons.filter(c => {
    const days = (new Date(c.endAt) - Date.now()) / 86400000;
    return days <= 3;
  });
  if (expiring.length) {
    reasons.push(`「${expiring[0].name}」${expiring[0].endAt} 到期，想买建议尽快下单`);
    if (timing === 'neutral') timing = 'buy';
  }

  // 4. 平台服务
  if (PLATFORM_SERVICE[best.platform]) reasons.push(`${platformName(best.platform)}：${PLATFORM_SERVICE[best.platform]}`);

  // 5. 口碑
  if (best.rating >= 4.8 && best.sales > 5000) reasons.push(`销量 ${formatSales(best.sales)}、评分 ${best.rating}，口碑扎实`);

  const verdictMap = {
    buy: { verdict: 'buy', title: `建议现在下单 · 首选${platformName(best.platform)}` },
    wait: { verdict: 'wait', title: `建议再等等 · 关注${platformName(best.platform)}降价` },
    neutral: { verdict: 'neutral', title: `可以入手 · 首选${platformName(best.platform)}` }
  };

  return { ...verdictMap[timing], bestPlatform: best.platform, reasons };
}

function platformName(p) {
  return { taobao: '淘宝/天猫', jd: '京东', pdd: '拼多多', douyin: '抖音', kuaishou: '快手', vipshop: '唯品会' }[p] || p;
}

function formatSales(n) {
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
}

module.exports = { advise };
