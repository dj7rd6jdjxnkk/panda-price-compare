# 熊猫比价 🐼

一条商品链接/淘口令 → 淘宝/京东/拼多多/抖音/快手/唯品会 六平台比价（含商品主图对版）→ 近一年历史价格趋势 → 券后到手价 → 购买建议 → CPS 转链下单（佣金对用户不可见，手机端自动唤起对应 App）。

## 快速启动

```bash
node server/index.js
# 打开 http://localhost:3721
```

零依赖，无需 npm install。端口在 `config.json` 里改。

## 工作流程

```
用户粘贴 链接/淘口令/关键词
   ↓ parser.js 识别平台与商品
   ↓ adapters 并发查询六平台（价格/优惠券/活动/90天历史）
   ↓ advisor.js 生成购买建议（历史低点判断/券临期提醒/平台服务）
   ↓ cps.js 每个平台都生成 /go/xxx 短链（佣金只在后端记账）
用户点任意平台「去下单」：
  手机端 → 中转页尝试 scheme 唤起对应 App（淘宝/京东/拼多多/抖音/快手/唯品会），1.8s 未成功回落 H5
  电脑端 → 302 直跳 CPS 转链后的联盟链接
```

真实接入时，App 唤起链接优先使用各联盟转链接口返回的 deeplink（京东 openapp 短链、pdd schema_url、抖音 dy_deeplink、快手 kwaiUrl、唯品会 deeplinkUrl），`adapters/index.js` 的 `buildAppScheme` 仅为兜底格式。

## 接入真实数据（从演示切换到生产）

1. 在 `config.json` 填入各联盟凭证：
   - 淘宝联盟（appKey/appSecret/pid，转口令需申请渠道权限）
   - 京东联盟（unionId/positionId）
   - 多多进宝（clientId/clientSecret/pid）
   - 抖音精选联盟、快手分销、唯品会联盟
   - 或者只填 `aggregator`（折淘客/大淘客等聚合平台，一个 Key 转全平台，最省事）
2. 在 `server/adapters/index.js` 的 `fetchQuote` / `convertCps` 中按 TODO 注释接入对应 API。
3. `config.json` 里 `mode` 改为 `"live"`。
4. 历史价格：真实场景建议每日定时抓取入库（SQLite/MySQL），或接慢慢买等历史价 API。

## 佣金与安全

- 前端接口 **绝不下发** 佣金/费率/pid，接口层已剥离 `_commission` 字段
- `/api/admin/report` 是内部点击与预估佣金报表，**上线前务必加鉴权**
- 短链 `/go/:code` 记录点击次数，可扩展为订单归因

## 目录结构

```
server/
  index.js          HTTP 服务与路由
  parser.js         链接/淘口令/关键词解析
  adapters/index.js 六平台适配器（mock ↔ live 切换点）
  mock.js           确定性模拟数据引擎
  advisor.js        购买建议引擎
  cps.js            CPS 短链与佣金内部记账
public/             前端（比价卡片/SVG趋势图/建议卡）
config.json         端口、模式、联盟凭证
```

## 合规提醒

- 对外运营需在页面披露「部分链接含推广」属性（《互联网广告管理办法》要求），页脚已有基础说明，可按需加强
- 各联盟 API 有调用频率限制，生产环境建议加缓存（相同商品 5~10 分钟内复用结果）
