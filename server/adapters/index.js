/**
 * 平台适配器注册表
 * 每个适配器实现两个方法：
 *   fetchQuote(parsed, cfg)  → 返回该平台的报价（价格/券/历史）
 *   convertCps(quote, parsed, cfg) → 返回该平台的 CPS 推广链接（真实模式下调联盟API转链）
 *
 * mode=mock 时走模拟引擎；填入 config.json 凭证并把 mode 改为 live 后，
 * 在各适配器的 liveFetch / liveConvert 中接入真实 API 即可，路由层无需改动。
 */
const { genQuote } = require('../mock');

const PLATFORM_META = {
  taobao:   { name: '淘宝/天猫', color: '#FF5000', home: 'https://item.taobao.com' },
  jd:       { name: '京东',     color: '#E1251B', home: 'https://item.jd.com' },
  pdd:      { name: '拼多多',   color: '#E02E24', home: 'https://mobile.yangkeduo.com' },
  douyin:   { name: '抖音商城', color: '#161823', home: 'https://haohuo.jinritemai.com' },
  kuaishou: { name: '快手小店', color: '#FF4906', home: 'https://app.kwaixiaodian.com' },
  vipshop:  { name: '唯品会',   color: '#E4007F', home: 'https://www.vip.com' }
};

/** 模拟转链：生成带 pid 的联盟格式链接（真实模式替换为联盟API返回值） */
function mockConvert(platform, quote, parsed, cfg) {
  const pidMap = {
    taobao:   `https://uland.taobao.com/coupon/edetail?activityId=demo&pid=${cfg.cps.taobao.pid || 'mm_demo'}&itemId=${encodeURIComponent(parsed.productKey)}`,
    jd:       `https://u.jd.com/demo_${Buffer.from(parsed.productKey).toString('base64url').slice(0, 10)}`,
    pdd:      `https://p.pinduoduo.com/demo_${Buffer.from(parsed.productKey).toString('base64url').slice(0, 10)}`,
    douyin:   `https://v.douyin.com/demo_${Buffer.from(parsed.productKey).toString('base64url').slice(0, 8)}/`,
    kuaishou: `https://v.kuaishou.com/demo_${Buffer.from(parsed.productKey).toString('base64url').slice(0, 8)}`,
    vipshop:  `https://t.vip.com/demo_${Buffer.from(parsed.productKey).toString('base64url').slice(0, 10)}`
  };
  const h5 = pidMap[platform];
  return {
    cpsUrl: h5,
    // 手机端 App 唤起 scheme（真实模式下用联盟转链返回的 schemaUrl/deeplink 替换）
    appScheme: buildAppScheme(platform, h5, parsed),
    // 真实模式下可返回口令，供用户复制到 App 打开
    tkl: platform === 'taobao' ? `￥demo${Math.abs(require('../mock').hashStr(parsed.productKey)).toString(36).slice(0, 8)}￥` : null
  };
}

/**
 * 各平台 App 唤起 scheme
 * 真实接入时：淘宝联盟/京东联盟/多多进宝转链接口大多直接返回 deeplink（如 jd 的 shortURL 支持 openapp、
 * pdd 返回 mobile_url/schema_url、抖音返回 dy_deeplink、快手返回 kwaiUrl、唯品会返回 deeplinkUrl），
 * 优先使用联盟返回值，以下为通用兜底格式。
 */
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

function buildAdapter(platform) {
  return {
    platform,
    meta: PLATFORM_META[platform],

    async fetchQuote(parsed, cfg) {
      if (cfg.mode === 'live') {
        // TODO 接入真实API：
        // taobao → 淘宝联盟 taobao.tbk.item.info.get / 折淘客聚合接口
        // jd → 京东联盟 jd.union.open.goods.query
        // pdd → 多多进宝 pdd.ddk.goods.search
        // douyin → 精选联盟 buyin.kolProductsSearch
        // kuaishou → 快手分销开放平台
        // vipshop → 唯品会联盟 union.goods.query
        // 未实现前回退 mock，保证服务可用
      }
      const hint = parsed.type === 'keyword' ? parsed.keyword : null;
      return genQuote(parsed.productKey, platform, hint);
    },

    async convertCps(quote, parsed, cfg) {
      if (cfg.mode === 'live') {
        // TODO 真实转链：
        // taobao → taobao.tbk.privilege.get（需授权渠道ID）
        // jd → jd.union.open.promotion.byunionid.get
        // pdd → pdd.ddk.goods.promotion.url.generate
        // douyin/kuaishou/vipshop → 对应联盟转链接口
      }
      return mockConvert(platform, quote, parsed, cfg);
    }
  };
}

const adapters = {};
for (const p of Object.keys(PLATFORM_META)) adapters[p] = buildAdapter(p);

module.exports = { adapters, PLATFORM_META };
