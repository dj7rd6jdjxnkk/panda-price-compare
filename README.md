# 熊猫比价 🐼

一条商品链接/淘口令 → 淘宝/京东/拼多多/抖音/快手/唯品会 六平台比价（含商品主图对版）→ 近一年历史价格趋势 → 券后到手价 → 购买建议 → CPS 转链下单（佣金对用户不可见，手机端自动唤起对应 App）。

## 快速启动

```bash
node server/index.js
# 打开 http://localhost:3721
```

零依赖，无需 npm install。端口在 `config.json` 里改。

## 部署到 GitHub Pages（静态版，已上线）

线上演示站：**https://dj7rd6jdjxnkk.github.io/panda-price-compare/**

静态版代码在 `docs/`（`index.html` / `style.css` / `app.js` / `engine.js` / `go.html`）：
- `engine.js` 把后端的 parser / mock / advisor / adapter 逻辑整体搬到浏览器端，零后端即可比价、画一年趋势、算券后到手价与购买建议。
- `go.html` 替代后端 `/go/:code` 短链，承担「手机唤起 App / 电脑直跳」的 CPS 中转。
- 佣金仅在 `engine.js` 内部计算，UI 不渲染，对用户不可见。
- GitHub Pages 源已设为 `main` 分支 `/docs` 目录。

> 静态版是演示模式（mock 数据）。要做**真实比价 + 真实 CPS 转链**，需要把 `server/` 这套 Node 后端部署到可运行 Node 的服务器/容器，前端改回调用 `/api/analyze`（把 `docs/app.js` 里的 `PandaEngine.analyze` 换回 `fetch('/api/analyze')`），并在 `config.json` 填联盟凭证、`mode` 改 `live`。

## 部署到腾讯云 SCF（Web 函数 · 免费版，跑真后端）

免费额度 **100 万次/月调用**，国内节点、自带腾讯云域名（微信里可直接打开），且 Web 函数由 `scf_bootstrap` 拉起 Node 服务，**零代码改造**。

- 部署包已生成：**`panda-scf.zip`**（约 22KB，含 `server/` `public/` `config.json` `package.json` `scf_bootstrap`）
- 详细步骤（控制台上传 / 一键脚本 / 真实数据切换）：见 **[README_SCF.md](./README_SCF.md)**
- 重新打包命令：`PowerShell: Compress-Archive -Path "deploy\*" -DestinationPath panda-scf.zip -Force`

> 为适配云函数「无状态 + 多实例 + 冷启动」，CPS 短链已从「内存记账」改为**无状态编码短链**（HMAC 签名防篡改，见 `server/cps.js`）。代价是不再记录点击/佣金统计——需要报表请在 `resolve` 里接 TencentDB/Redis 上报，并给 `/api/admin/report` 加鉴权。


## 工作流程

```
用户粘贴 链接/淘口令/关键词
   ↓ parser.js 识别平台与商品
   ↓ adapters 并发查询六平台（价格/优惠券/活动/近一年历史）
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
- 短链 `/go/:code` 为无状态编码（HMAC 签名），不依赖内存/数据库，云函数冷启动不丢链；点击/佣金统计需接外部存储后另接

## 目录结构

```
server/
  index.js          HTTP 服务与路由（托管 public/ + /api/analyze + /go/:code）
  parser.js         链接/淘口令/关键词解析
  adapters/index.js 六平台适配器（mock ↔ live 切换点）
  mock.js           确定性模拟数据引擎
  advisor.js        购买建议引擎
  cps.js            CPS 无状态编码短链（HMAC 签名）
public/             前端（比价卡片/SVG趋势图/建议卡），调用 /api/analyze
config.json         端口、模式、联盟凭证
scf_bootstrap       SCF Web 函数启动脚本
deploy_scf.js       一键部署脚本（TC3 签名）
serverless.yml      serverless 配置（可选）
panda-scf.zip       部署包（控制台上传 / 脚本部署用）
```

## 合规提醒

- 对外运营需在页面披露「部分链接含推广」属性（《互联网广告管理办法》要求），页脚已有基础说明，可按需加强
- 各联盟 API 有调用频率限制，生产环境建议加缓存（相同商品 5~10 分钟内复用结果）
