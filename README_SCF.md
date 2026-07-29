# 部署「熊猫比价」到腾讯云 SCF（Web 函数 · 免费版）

方案②：腾讯云函数 SCF **Web 函数**，免费额度 **100 万次/月调用 + 40 万 GBs 资源 + 1GB 出流量**，国内节点、自带腾讯云域名（微信里可直接打开），零后端改造。

> ⚠️ 无论哪种部署，真实比价 + 真实 CPS 佣金都需要**联盟/聚合 API 凭证**（淘宝联盟/京东联盟/多多进宝，或折淘客/大淘客一个 Key 转全平台）。当前部署包跑的是 `mock` 演示数据，用来验证链路；凭证齐了改 `config.json` + 适配器 `live` 实现即可出真数据。

---

## 方式 A：控制台上传（最稳，推荐，约 2 分钟）

1. 打开 [腾讯云 SCF 控制台](https://console.cloud.tencent.com/scf) → **函数服务** → **新建**。
2. 创建方式选「**Web 函数**」，运行环境选 **Node.js 18**，地域选国内（广州/上海/北京均可）。
3. 函数名称填 `panda-price-compare`；提交方式选「**本地上传 zip 包**」，上传本项目根目录的 **`panda-scf.zip`**（已生成，约 22KB，零依赖）。
4. 高级配置：内存 **128MB**、超时 **30s**；如需自定义短链防篡改密钥，可在「环境变量」加 `CPS_SECRET=你的密钥`（不设则用默认值）。
5. 点创建。完成后在左侧 **触发管理** 看到 Web 函数访问地址（形如 `https://xxx.apigw.tencentcs.com/...` 或 `https://xxx.scm.tencentcs.com/...`），**微信里直接打开就能用**。

> Web 函数的启动文件已内置为 `scf_bootstrap`（它会读取平台注入的 `PORT` 并拉起 `server/index.js`），**无需改任何代码**。

---

## 方式 B：一键脚本（需要你自己的 SecretId/SecretKey）

在你自己能联网的机器上（需 Node 18+）：

```bash
set TENCENT_SECRET_ID=AKIDxxxxxxxx
set TENCENT_SECRET_KEY=xxxxxxxx
# 可选：set TENCENT_REGION=ap-guangzhou
node deploy_scf.js
```

脚本会：函数不存在则 `CreateFunction`（HTTP/Web 类型），已存在则 `UpdateFunctionCode`；随后轮询状态，Active 后打印访问地址。

---

## 改成真实数据（拿到凭证后）

1. 打开 `config.json`，把 `mode` 从 `"mock"` 改为 `"live"`，并填入对应平台 `appKey/appSecret/pid` 等；或填 `aggregator`（折淘客/大淘客）一个 Key 转全平台。
2. 在 `server/adapters/index.js` 里把每个平台的 `liveFetch`（查价）和 `liveConvert`（转 CPS 链）按对应平台文档实现（文件内已有 TODO 与字段名提示）。
3. 重新打包：`PowerShell: Compress-Archive -Path "deploy\*" -DestinationPath panda-scf.zip -Force`，再上传/运行脚本。

---

## 上线前必做

- **合规**：页面已含「含推广链接」说明，对外运营请保留；CPS 推广通常要求明示。
- **统计**：无状态短链不再记录点击/佣金（云函数多实例所致）。需要看报表就在 `server/cps.js` 的 `resolve` 里接 TencentDB/Redis 上报，再开放 `/api/admin/report`（务必加鉴权）。
- **成本**：免费额度内 ¥0/月；详见聊天里的成本测算。
