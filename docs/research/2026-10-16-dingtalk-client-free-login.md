# 钉钉企业内部应用 H5 微应用端内免登 · 官方文档调研笔记

- 日期：2026-10-16
- 范围：钉钉客户端（工作台）内打开 H5 微应用（网页应用）时的免登（免扫码登录），以及与本仓库（`idrl-portal`，Next.js + iron-session，已有扫码登录）的落地结合。
- 调研方式：全部结论取自 open.dingtalk.com 官方文档站正文（注：文档站为 SPA，正文实际托管在其官方内容源 `icms-document.oss-cn-beijing.aliyuncs.com/zh-CN/dingtalk/<namespace>/topics/<slug>.html`，与文档站渲染内容一致，页面内标注了 `gmtModify` 更新时间；本文所有来源均给出 open.dingtalk.com 规范 URL）、官方 GitHub demo（open-dingtalk org）、npm 官方包 `dingtalk-jsapi`（含包内源码与 README）。

---

## TL;DR 最佳实践结论

1. **端内免登用 `dd.runtime.permission.requestAuthCode({ corpId })`，不要用 `dd.getAuthCode`**：官方支持表明确 `dd.getAuthCode` 仅支持小程序，网页应用（原 H5 微应用）不支持；H5 微应用免登授权码唯一入口是 `requestAuthCode`（新版 SDK 示例同时传 `corpId` + `clientId`）。[来源](https://open.dingtalk.com/document/development/jsapi-get-auth-code)、[来源](https://open.dingtalk.com/document/development/jsapi-request-auth-code)
2. **免登授权码（tmp_auth_code/authCode）有效期 5 分钟、一次性**，且**该 JSAPI「无需鉴权即可直接调用」**——即免登链路不需要 `dd.config`/jsapiTicket 签名；只有调用其他需要鉴权的 JSAPI 时才做 `dd.config`。[来源](https://open.dingtalk.com/document/development/jsapi-request-auth-code)、[来源](https://open.dingtalk.com/document/development/jsapi-overview-1)
3. **官方免登后端链路是：应用 access_token + 免登码 → `POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo`**，直接返回 `userid` + `unionId` + `name`（还有 `sys`/`sys_level`）。官方免登文档（development/orgapp/orgapp-server 三个命名空间）均走这条链路，**没有**任何官方免登文档把 JSAPI 免登码接到 `POST /v1.0/oauth2/userAccessToken` 上——后者官方定位是「扫码登录 / 统一授权」的 OAuth2 authorization code 换用户凭证。[来源](https://open.dingtalk.com/document/development/obtain-the-userid-of-a-user-by-using-the-log-free)、[来源](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)、[来源](https://open.dingtalk.com/document/orgapp/obtain-user-token)
4. **应用 access_token 走新版 `POST https://api.dingtalk.com/v1.0/oauth2/{corpId}/token`（grant_type=client_credentials）或 `POST /v1.0/oauth2/accessToken`，有效期 7200 秒，必须服务端缓存**。[来源](https://open.dingtalk.com/document/development/api-gettoken)、[来源](https://open.dingtalk.com/document/development/obtain-orgapp-token)
5. **域名一致性硬约束**：调用免登 JSAPI 前，网页应用的**首页地址 / 重定向URL（回调地址）/ 端内免登地址必须与运行该 JSAPI 的页面域名保持一致**（在开发者后台「开发配置 > 安全设置」配置）。[来源](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)
6. **corpId 从首页地址模板参数拿**：应用首页地址配置成 `https://your-host/?corpid=$CORPID$`，钉钉工作台打开时会自动替换为真实 corpId；只有从工作台进入才会正确解析。[来源](https://open.dingtalk.com/document/orgapp/enterprise-internal-application-logon-free)、[来源](https://open.dingtalk.com/document/dingstart/develop-webapp-frontend)
7. **拿到 userId/unionId 后，应用必须自建会话**（官方原话：应用应处理自身的登录会话管理，避免每次交互重新免登），官方还建议把用户信息缓存到前端（`dd.setStorage`）或 cookie 中。[来源](https://open.dingtalk.com/document/orgapp-server/enterprise-internal-application-logon-free)、[来源](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)
8. **SDK 引入：npm 安装 `dingtalk-jsapi`（官方推荐），CDN 引入官方明示不推荐**；建议在 `dd.ready` 回调后再调 JSAPI（老版本必须，新版 SDK 可自动延后）；包自带 TypeScript 类型与 `dd.env` 环境判断。[来源](https://open.dingtalk.com/document/dingstart/webapp-read-before-development)、[npm README](https://www.npmjs.com/package/dingtalk-jsapi)
9. **必须发布应用后才能在工作台使用**，且免登只能在钉钉客户端内完成，「端外无法正常调用免登组件」——浏览器里保留现有扫码登录即可。[来源](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)、[来源](https://open.dingtalk.com/document/dingstart/publish-dingtalk-application)
10. **常见免登失败**集中在：错误码 `40078`（授权码不存在/过期/已用/类型混用）、`40079`（用户不在应用可见范围、免登权限未开、调用时机过早）。用户必须**在应用可见范围内**。[来源](https://open.dingtalk.com/document/development/development-mlogon-faq)

---

## 1. 前端 JSAPI：requestAuthCode / getAuthCode / dd.config / 端内检测

### 1.1 `dd.runtime.permission.requestAuthCode`（H5 微应用免登唯一入口）

官方 JSAPI 文档（[requestAuthCode](https://open.dingtalk.com/document/development/jsapi-request-auth-code)）：

- 用途：「获取微应用免登授权码」，免登 = 用户进入应用后无需输入钉钉账号密码，应用自动获取当前用户身份。
- **免登授权码有效期 5 分钟，且只能使用一次**。
- 官方免登流程：调用本接口拿 code → 调 [获取应用的 Access Token](https://open.dingtalk.com/document/development/api-gettoken) → 调 [通过免登码获取用户信息](https://open.dingtalk.com/document/development/obtain-the-userid-of-a-user-by-using-the-log-free) → （可选）查用户详情。
- **鉴权规则：「无需鉴权即可直接调用」**（即不需要 `dd.config` 签名）。
- 支持应用类型：企业内部应用（是）、第三方企业应用（是）、**第三方个人应用（否）**。
- 官方支持表（客户端版本）：网页应用 Android/iOS ≥ 7.0.45、HarmonyOS ≥ 7.0.0、Mac/Windows ≥ 7.0.50；小程序全平台不支持。
  - 注意：npm 包 `dingtalk-jsapi@3.2.9` 源码中该 API 声明的最低版本是 android/ios 2.4.0、pc 3.0.0、harmony 7.0.0（[包源码 `api/runtime/permission/requestAuthCode.js`](https://www.npmjs.com/package/dingtalk-jsapi)）。文档表与包内声明存在口径差异，实践上以「近两年的主流客户端版本均可」理解即可，见 §8 兼容性。
- 示例（官方文档原样，注意同时传 `corpId` 和 `clientId`）：

```js
dd.requestAuthCode({
  corpId: 'corpid',
  clientId: 'clientid',   // 即应用的 AppKey/Client ID
  onSuccess: function (result) {
    /* { code: 'hYLK98jkf0m' } // string authCode */
  },
  onFail: function (err) {},
});
// success 返回对象示例：{ "code": "hYLK98jkf0m" }
```

[来源](https://open.dingtalk.com/document/development/jsapi-request-auth-code)、[免登主文档同款示例](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)

### 1.2 `dd.getAuthCode`：小程序专用，网页应用不支持

[getAuthCode 文档](https://open.dingtalk.com/document/development/jsapi-get-auth-code) 的「支持说明」表：**网页应用（原H5微应用）Android/iOS/Harmony/Mac/Windows 全部「不支持」**；小程序 Android/iOS/Mac/Windows ≥ 6.0.0（Harmony 不支持）。示例为：

```js
dd.getAuthCode({
  corpId: 'ding12345xxx',
  success: (res) => { const { authCode } = res; },
  fail: () => {}, complete: () => {},
});
// 返回 { "authCode": "hYLK98jkf0m" }，同样 5 分钟有效、一次性
```

[免登 FAQ](https://open.dingtalk.com/document/development/development-mlogon-faq) 对两个 API 的分工说得很直白：**小程序应用请通过 `getAuthCode` 获取授权码；H5 微应用请通过 `requestAuthCode` 或 `getOperateAuthCode` 获取**。混用会报 `40078 不存在的临时授权码`。

> 结论：对本文目标（H5 微应用端内免登），`dd.getAuthCode` 不在候选之内；网上部分教程推荐 `dd.getAuthCode` 是小程序语境的，照抄会翻车。

### 1.3 是否需要 `dd.config` 鉴权签名

- 免登 JSAPI（`requestAuthCode`）：**不需要**。官方 [JSAPI 总览](https://open.dingtalk.com/document/development/jsapi-overview-1) 中 `runtime.permission.requestAuthCode` 的「是否需鉴权」列为**不需要**（对照组：`runtime.permission.requestOperateAuthCode` 需要鉴权）。
- 若应用还要调**需要鉴权**的 JSAPI，官方 [开发网页应用前端](https://open.dingtalk.com/document/dingstart/develop-webapp-frontend) 给出的完整 `dd.config` 流程是：
  1. 用应用 accessToken 调 [获取 jsapiTicket](https://open.dingtalk.com/document/development/create-a-jsapi-ticket)；jsapiTicket 未过期时重复获取返回相同值并续期 2 小时，但**自生成起最大有效期 24 小时**，必须服务端缓存；
  2. 服务端计算签名，参与签名的是 `jsapi_ticket、noncestr、timestamp、url`（url 为当前页面 `location.href` 原内容、**不含 `#` 及其后部分，不要提前 encode**）；当前文档示例代码使用 **SHA-256**（`MessageDigest.getInstance("SHA-256")` / `crypto.createHash('sha256')`）。⚠️ 冲突提示：社区历史资料普遍为 SHA-1，**以官方文档当前示例（SHA-256）为准**，如遇 `dd.config` 鉴权失败可两种都试；
  3. 前端调用：

```js
dd.config({
  agentId: '',      // 企业内部应用的 agentId
  corpId: '',       // 必填
  timeStamp: '', nonceStr: '', signature: '',
  type: 0,          // 0=微应用 jsapi（默认）
  jsApiList: ['biz.contact.choose'],  // 不要带 dd. 前缀
});
dd.error(function (err) { /* 必须注册，用于捕获鉴权异常 */ });
```

  - 官方注意事项：`dd.config` 参数值**必须从服务端获取**；父子页面场景必须对父页面鉴权（签名不支持路由页面地址）。
- `dd.ready` / `dd.error` 用法：官方 demo（[h5app-auth-demo](https://github.com/open-dingtalk/h5app-auth-demo) 的 `frontend/src/App.js`）把 `requestAuthCode` 放在 `dd.ready(function(){...})` 内——`dd.ready` 在容器环境准备就绪时触发，「jsapi 的调用需要保证在该回调函数触发后调用，否则无效」（[demo 注释原话](https://github.com/open-dingtalk/h5app-auth-demo)）。npm 包 README 补充：新版 dingtalk-jsapi 对鉴权后的调用做了优化，「不再需要包括 dd.ready，接口自动延后执行」（[npm README](https://www.npmjs.com/package/dingtalk-jsapi)）——但为兼容 PC 老版本，免登调用包在 `dd.ready` 里仍是官方示范写法。

### 1.4 钉钉客户端内检测

- **`dd.env`**：npm 包内置环境模块（`dingtalk-javascript-env`），包内 README（随 `dingtalk-jsapi` 分发）给出字段：`isDingTalk`（是否钉钉容器，含移动端和 PC）、`isDingTalkPC`、`isDingTalkPCMac/isDingTalkPCWindows/isDingTalkPCWeb`、`runtime`（'Web'|'Weex'|'Unknown'）、`platform`（'Mac'|'Windows'|'iOS'|'Android'|'iPad'|'Browser'|'Unknown'）、`version`（客户端版本）等（[npm 包 README](https://www.npmjs.com/package/dingtalk-jsapi)，包源码 `lib/packages/dingtalk-javascript-env/README.md`）。
- **URL 自动附加 corpId**：钉钉不会改 UA 之外的协议，官方机制是**应用首页地址配置模板变量**：把首页地址配成 `http(s)://host/?corpid=$CORPID$`（大小写两种写法官方文档均出现过：免登文档用 `?corpid=$CORPID$`，前端开发文档用 `?corpId=$CORPID$`），钉钉工作台打开应用时把 `$CORPID$` 替换为当前用户所属企业 corpId；「必须从工作台访问应用，才会正确解析当前访问用户的组织 corpId」（[企业内部应用免登·Demo 配置](https://open.dingtalk.com/document/orgapp/enterprise-internal-application-logon-free)、[开发网页应用前端](https://open.dingtalk.com/document/dingstart/develop-webapp-frontend)）。落地时读 `location.search` 里的 `corpid` 即可。
- **UA 检测**：未在本次抓到的官方文档中找到「UA 包含 DingTalk」之类的正式说明（社区通行做法是 `navigator.userAgent` 含 `DingTalk`）。官方推荐的形态判断通道是 `dd.env` / `dd.checkJsApi`（npm README 列为官方特性）。
- `dd.context`：**未在官方文档与 `dingtalk-jsapi@3.2.9` 包中确认**（老版本 API，已不推荐）。判断环境用 `dd.env`。

---

## 2. 后端换 token：免登码换用户身份的正确姿势

### 2.1 官方免登链路（推荐用于端内免登）

**`POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo`**（[通过免登码获取用户信息](https://open.dingtalk.com/document/development/obtain-the-userid-of-a-user-by-using-the-log-free)）：

- Query：`access_token`（应用凭证；企业内部应用用 [获取企业内部应用的accessToken](https://open.dingtalk.com/document/development/obtain-orgapp-token) / [获取应用的 Access Token](https://open.dingtalk.com/document/development/api-gettoken) 获取）。
- Body：`code`（免登授权码，「此授权码五分钟内有效，且只能使用一次」）。
- 权限：`qyapi_base`（调用企业 API 的基本权限，默认开通口径）。
- 返回 `result`：`userid`、`unionid`、`associated_unionid`、`device_id`、`name`、`sys`（是否管理员）、`sys_level`（1 主管理员 / 2 子管理员 / 100 老板 / 0 其他）。

```bash
curl -X POST "https://oapi.dingtalk.com/topapi/v2/user/getuserinfo" \
  -H 'Content-Type: application/x-www-form-urlencoded;charset=utf-8' \
  -d 'access_token=xxx' -d 'code=<免登授权码>'
```

应用 access_token（服务端必须缓存，[api-gettoken](https://open.dingtalk.com/document/development/api-gettoken)、[obtain-orgapp-token](https://open.dingtalk.com/document/development/obtain-orgapp-token)）：

```bash
# 新版统一接口：POST https://api.dingtalk.com/v1.0/oauth2/{corpId}/token
{ "client_id": "<AppKey/ClientId>", "client_secret": "<AppSecret>", "grant_type": "client_credentials" }
# 或 POST https://api.dingtalk.com/v1.0/oauth2/accessToken
# access_token 有效期 7200 秒；有效期内重复获取返回相同结果并自动续期；需按应用区分缓存
```

### 2.2 `POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken` 与免登码的关系（重要取舍）

[获取用户token](https://open.dingtalk.com/document/orgapp/obtain-user-token) 文档要点：

- 入参：`clientId`（企业内部应用传 AppKey）、`clientSecret`（AppSecret）、`code`（**「OAuth 2.0 临时授权码」**，文档描述其来源为「第三方企业应用需要接入统一授权套件/获取登录用户的访问凭证」即 OAuth 授权流程）、`refreshToken`（30 天有效期）、`grantType`（`authorization_code` 或 `refresh_token`）。
- 返回：`accessToken`（用户个人身份凭证）、`refreshToken`、`expireIn`、`corpId`；权限「默认开通」。

**冲突/边界说明（已核对官方文档）**：本文抓取的三份官方免登文档（[development](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)、[orgapp](https://open.dingtalk.com/document/orgapp/enterprise-internal-application-logon-free)、[orgapp-server](https://open.dingtalk.com/document/orgapp-server/enterprise-internal-application-logon-free)）以及 [免登 FAQ](https://open.dingtalk.com/document/development/development-mlogon-faq) 的服务端示例，**全部**把 JSAPI 免登码接到 `topapi/v2/user/getuserinfo`；`/v1.0/oauth2/userAccessToken` 的官方文档对 `code` 的描述只提到 OAuth 授权码（扫码登录、统一授权套件、[获取登录用户的访问凭证](https://open.dingtalk.com/document/isvapp/obtain-identity-credentials)）。**官方文档未写明「JSAPI 免登 authCode 可直接传给 `/v1.0/oauth2/userAccessToken`」**。因此稳妥做法是：

- 端内免登 → `topapi/v2/user/getuserinfo`（本文推荐，100% 官方文档背书）；
- 浏览器扫码登录 → 维持本仓库现有链路 `login.dingtalk.com/oauth2/auth`（scope=openid）→ `/v1.0/oauth2/userAccessToken` → `/contact/users/me`。
- 若坚持想用 `/v1.0/oauth2/userAccessToken` 消化免登码（社区有可行案例），属于「官方未确认」行为，上线前必须实测并准备回退到 2.1 链路。

### 2.3 旧版 `GET https://oapi.dingtalk.com/user/getuserinfo`（v1）

[orgapp-server 免登文档](https://open.dingtalk.com/document/orgapp-server/enterprise-internal-application-logon-free) 的示例代码仍在用旧接口 `oapi/user/getuserinfo`，但其官方新文档均指向 v2 接口 `topapi/v2/user/getuserinfo`（v2 返回值多出 `unionid`/`name`/`sys` 等字段）。**新项目直接用 v2**；旧接口仅为存量代码兼容。

### 2.4 有效期与一次性小结

| 凭证 | 有效期 | 一次性 | 来源 |
|---|---|---|---|
| 免登授权码 authCode/tmp_auth_code | 5 分钟 | 是 | [FAQ](https://open.dingtalk.com/document/development/development-mlogon-faq)、[requestAuthCode](https://open.dingtalk.com/document/development/jsapi-request-auth-code) |
| 应用 access_token | 7200 秒（自动续期） | 否（可缓存复用） | [api-gettoken](https://open.dingtalk.com/document/development/api-gettoken) |
| jsapiTicket（仅鉴权 JSAPI 需要） | 2 小时可续期，生成起最长 24 小时 | 否 | [开发网页应用前端](https://open.dingtalk.com/document/dingstart/develop-webapp-frontend) |
| 用户 accessToken（OAuth 链路） | `expireIn` 秒 | 否 | [obtain-user-token](https://open.dingtalk.com/document/orgapp/obtain-user-token) |
| refreshToken | 30 天 | 否 | [obtain-user-token](https://open.dingtalk.com/document/orgapp/obtain-user-token) |

---

## 3. 用户信息：权限点、返回字段、unionId ↔ userid

### 3.1 `GET /v1.0/contact/users/me`（OAuth/扫码链路用）

[获取用户通讯录个人信息](https://open.dingtalk.com/document/development/dingtalk-retrieve-user-information)：

- `GET https://api.dingtalk.com/v1.0/contact/users/{unionId}`，**路径参数可传 `me`** 表示当前授权人。
- 请求头 `x-acs-dingtalk-access-token`：**个人用户 accessToken**（不是应用 access_token），来自「获取登录用户的访问凭证」流程。
- 权限点：**`Contact.User.Read`（通讯录个人信息读权限）**。
- 返回字段：`nick`（钉钉昵称）、`avatarUrl`、`mobile`、`openId`、`unionId`、`email`、`stateCode`（国家区号）。
- 手机号限制：第三方企业应用只能拿到脱敏手机号（`155****3240`）；要拿完整手机号需在开发者后台申请「个人手机号信息」权限。
- 错误：`404 invalidParameter.user.notFound`（找不到该用户）等。

### 3.2 unionId 与 userid 的关系

- unionId 语义（[根据unionid获取用户userid](https://open.dingtalk.com/document/orgapp/query-a-user-by-the-union-id)）：「unionid 是员工在**当前开发者企业账号**范围内的唯一标识，由系统生成」；同一开发者企业账号下的多个应用（含扫码登录等场景）unionId 一致；跨开发者企业账号则不同。
- **免登链路不需要换算**：`topapi/v2/user/getuserinfo` 直接同时返回 `userid` 和 `unionid`。
- 确需 unionId → userid 换算（例如只有 OAuth 链路的 unionId，却要调用按 userid 寻址的通讯录接口）：`POST https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=<应用token>`，body `{ "unionid": "..." }`，权限为「成员信息读权限」。官方注意事项：该接口要用**应用维度** access_token 调用，不能用免登/OAuth 得到的用户个人 token 调用。

### 3.3 需要开通的权限清单（对照本仓库）

| 链路 | 权限点 | 用途 |
|---|---|---|
| 端内免登 | `qyapi_base`（基本权限）+ 通讯录「成员信息读权限」（按需） | getuserinfo / getbyunionid |
| 扫码 OAuth（现有） | `Contact.User.Read` | `/contact/users/me` |
| 取完整手机号 | 开发者后台单独申请「个人手机号信息」 | contact/users/me 的 `mobile` |

---

## 4. 开发者后台配置清单（企业内部应用）

1. **创建应用**：[应用创建与配置](https://open.dingtalk.com/document/dingstart/create-application) —— 开发者后台 → 应用开发 > 钉钉应用 > 创建应用；「凭证与基础信息」页查看 Client ID / Client Secret / AgentId。
2. **添加网页应用能力并配置首页**：[配置网页应用](https://open.dingtalk.com/document/dingstart/configure-web-application) —— 移动端首页地址与 PC 端首页地址**二选一必填**（必须 http/https 开头，未配置的一端不在该端工作台展示）；可选配置管理后台地址。免登 Demo 官方示例把首页配成 `http://localhost:5173?corpid=$CORPID$`（仅本地调试；生产应为公网 https 域名，[demo README](https://github.com/open-dingtalk/h5app-auth-demo) 提示无公网 IP 可用官方内网穿透工具）。
3. **安全设置**：[企业内部应用免登](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free) —— 「应用创建与配置后，单击左侧导航栏的**开发配置 > 安全设置**」配置**端内免登地址 / 重定向URL（回调地址）**；且三者（首页地址、重定向URL、端内免登地址）必须与运行免登 JSAPI 的页面**域名一致**。
   - 「服务器出口IP」白名单：**未能在当前官方文档中确认其现行说明**（该配置项存在于开发者后台「开发配置 > 安全设置」界面；文档站搜索「出口IP/IP白名单」无有效命中，尝试过的关键词：`服务器出口IP`、`IP白名单`、`ip 白名单`、`安全设置 重定向URL`）。第三方 ISV 场景另有「钉钉安全域名」机制（[钉钉安全域名](https://open.dingtalk.com/document/dingstart/config-domain-name)，绑定私网 SLB），与企业内部应用无关。
4. **权限开通**：在「权限管理」中开通 `qyapi_base`、通讯录成员信息读权限（免登链路），`Contact.User.Read`（OAuth 链路）等（[免登 Demo README 要求「成员信息读权限」](https://github.com/open-dingtalk/h5app-auth-demo)）。
5. **发布**：[发布应用](https://open.dingtalk.com/document/dingstart/publish-dingtalk-application) —— 应用发布 > 版本管理与发布 > 创建新版本；版本号格式 `1.0.0`（每段最大 99）；**发布网页应用时必须同时勾选「工作台应用」，否则应用会被默认下线**；配置应用可见范围；非企业管理员发布需要管理员审批（「仅我可见」免审批）。发布后应用才在工作台可见，免登流程要求「免登操作需要在钉钉端内实现，端外无法正常调用免登组件」（[免登主文档](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)）。

---

## 5. 安全最佳实践（结合官方文档与本仓库现状）

1. **clientSecret 只放服务端**：官方所有 token 兑换示例（gettoken / userAccessToken / getuserinfo）均为服务端调用；前端 JSAPI 只需要 `clientId` 与免登码。本仓库已符合：`DINGTALK_CLIENT_SECRET` 仅在 `lib/dingtalk.ts` / `lib/dingtalk-admin.ts`（服务端）读取。
2. **authCode 不落日志、即换即用**：授权码 5 分钟一次性（[FAQ](https://open.dingtalk.com/document/development/development-mlogon-faq)）；服务端收到后应立即兑换并避免完整记录（本仓库 `app/api/auth/callback/dingtalk/route.ts` 目前 `console.error` 只输出错误信息，落地免登端点时保持同样纪律——不要把 `code` 打进访问日志/审计日志）。
3. **自建会话而非每次免登**：官方明确「获得到 userId 之后应用应该处理应用自身的登录会话管理（session），避免后续的业务交互每次都要重新获取用户身份」（[orgapp-server 免登](https://open.dingtalk.com/document/orgapp-server/enterprise-internal-application-logon-free)），并建议「用户信息保存在前端缓存（dd.setStorage）或 cookie 中」（[免登主文档](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)）。本仓库 iron-session 会话（`lib/session.ts`）已设置 `httpOnly: true`、`sameSite: 'lax'`、生产 `secure: true`、ttl 7 天，直接复用即可，不要把钉钉 token 持久化进会话。
4. **state/CSRF**：扫码链路已有 `dingtalk_oauth_state` cookie 校验；免登链路发生在钉钉容器内的自家页面 → 后端接口，建议同样做 origin/referer 校验（可复用 `lib/request-origin.ts`）并对免登端点限流（`lib/rate-limit.ts`）。
5. **域名一致性 + HTTPS**：首页地址/回调地址/端内免登地址同域（[免登主文档](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)）；生产用 https。「安全域名」绑定（私网 SLB/计算巢）仅第三方 ISV 应用需要（[config-domain-name](https://open.dingtalk.com/document/dingstart/config-domain-name)）。
6. **IP 白名单**：若后台「服务器出口IP」配置项可用，可限制调用来源（官方现行文档未见成文说明，见 §4.3「未确认」）。
7. **最小权限**：只开 `qyapi_base` + 必要通讯录权限；手机号权限按需单独申请（[contact/users/me 文档](https://open.dingtalk.com/document/development/dingtalk-retrieve-user-information)）。

---

## 6. dingtalk-jsapi 引入方式与 Next.js（SSR）加载

- **npm 引入（官方推荐）**：`npm install dingtalk-jsapi --save`，`import * as dd from 'dingtalk-jsapi'`（整体加载）或按需加载（`import 'dingtalk-jsapi/entry/union'` + 按方法引入，体积更小）。官方说明：「建议在全局上下文（如 main.js 或 app.js）中完成引入」。（[客户端SDK介绍](https://open.dingtalk.com/document/dingstart/webapp-read-before-development)）
- **CDN 引入（官方不推荐）**：`<script src="https://g.alicdn.com/dingding/dingtalk-jsapi/3.1.0/dingtalk.open.js"></script>`，暴露全局 `dd`。官方原话：「不推荐使用浏览器引入方法，这样无法按需加载，而且难以获得底层依赖模块的 bug 快速修复支持，如当前使用 CDN 方式，建议迁移至 npm 方案」。（同上）
- **版本**：npm `dist-tags.latest = 3.2.9`（含 beta 通道 3.2.x-beta）；官方文档要求「一段式」调用（如 `chooseChat`）至少 3.0.27；3.0.27+ 同时支持一段式与三段式（`模块.子模块.方法`），**三段式是官方推荐调用形态**。包自带 `index.d.ts` TypeScript 类型、原生 Promise 返回、`dd.checkJsApi`（检测当前环境是否支持某 JSAPI）、`dd.env`（[npm README](https://www.npmjs.com/package/dingtalk-jsapi)）。注意新版包安装后会带出底层包 `@dd-sdk/client ^2.0.0`（官方文档「检查 package.json」一节）。
- **Next.js（SSR）加载方式**：官方**没有** Next.js/SSR 专章（未确认项）。可靠做法（与官方「npm + 客户端运行时调用」的形态一致）：
  - 只在 `'use client'` 组件里 `await import('dingtalk-jsapi')`（动态 import），或在 `useEffect` 中再调用，避免 SSR 阶段触碰 `window`/`location`（包的 `requestAuthCode` 内部会读 `location.href`，见 §1.1 包源码说明）；
  - 免登逻辑整体放在客户端组件（读 `?corpid=` → `dd.ready` → `requestAuthCode` → POST 后端），服务端组件只负责渲染骨架。

---

## 7. 官方 Demo 结构与推荐实现

### 7.1 GitHub: [open-dingtalk/h5app-auth-demo](https://github.com/open-dingtalk/h5app-auth-demo)（经典 H5 免登 Demo）

- 结构：`frontend/`（React SPA，`src/App.js` 为核心）+ `backend/`（Spring Boot，`DingTalkUserService.java` 为核心）+ 启动脚本 `dingBoot-*.{sh,bat}`。
- 前端流程（`App.js`）：`dd.ready(() => { fetch('/config') 拿 corpId → dd.runtime.permission.requestAuthCode({ corpId, onSuccess }) → 携带 authCode 调后端 /login })`。
- 后端流程（`DingTalkUserService.java`）：`AccessTokenUtil`（appKey/appSecret → access_token）→ `topapi/v2/user/getuserinfo`（authCode → userid）→ `topapi/v2/user/get`（userid → 用户详情）。
- README 配置要点：应用首页地址需公网地址（无公网可用官方内网穿透）、开通「成员信息读权限」。
- 借鉴点：**前端拿 corpId 的方式（后端下发/URL 模板）、authCode 换 userid 后立即建立自有会话**；demo 用 GET query 传 authCode 仅是演示，生产建议 POST body（见 §5.2）。

### 7.2 官方免登文档内置 Demo：web-app-sso.zip

[企业内部应用免登（orgapp）](https://open.dingtalk.com/document/orgapp/enterprise-internal-application-logon-free) 提供下载（[web-app-sso.zip](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251113/vrmiiu/web-app-sso.zip)，2025-11 更新版），结构同为 `frontend/`（Vite）+ `backend/`（Spring Boot），前端启动 `npm run dev -- --clientId=xxx`，后端 `--dingtalk.clientId=... --dingtalk.clientSecret=...`，首页地址示例 `http://localhost:5173?corpid=$CORPID$`。这是**当前最新官方推荐实现**（更新时间 2025-06/2025-11，比 GitHub demo 更新）。

---

## 8. 常见坑（官方 FAQ 与文档要点）

来源除注明外均为[免登常见问题](https://open.dingtalk.com/document/development/development-mlogon-faq)：

| 现象/错误码 | 官方原因与解法 |
|---|---|
| `errcode=40078 不存在的临时授权码` | ① 授权码获取方式不对（小程序用 `getAuthCode`，H5 用 `requestAuthCode`/`getOperateAuthCode`，**不能混用**，管理后台免登码也不能喂给企业内部应用接口）；② 授权码已过期（5 分钟）；③ 授权码已被使用（一次性）。 |
| `errcode=41007 无效的ssocode` | ssoCode 不存在/拼写错误/过期（约 5 分钟）/已被消费。 |
| `errcode=41026 / 40091 缺少 tmp_auth_code` | 请求体没有 `tmp_auth_code` 字段、参数名拼错（`temp_auth_code`/`authCode` 都不对）、前端没把 `code` 传回服务端。 |
| `errcode=40079 不存在的授权信息` | 用户**不在应用可见范围**；应用免登相关权限未配置；调用时机过早（用户上下文未就绪）→ 在 `dd.ready` 后再调。 |
| `errcode=40087 创建永久授权码失败` | 应用类型不支持/缺「持久授权」权限/触发限流/应用状态异常。 |
| 免登组件端外调用失败 | 「免登操作需要在钉钉端内实现，端外无法正常调用免登组件」→ 浏览器必须走扫码 OAuth（本仓库现状），端内才走免登。（[免登主文档](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)） |
| JSAPI 调了没反应 | 未包在 `dd.ready` 里（环境未就绪），或域名与首页/回调/端内免登地址不一致。（[免登主文档](https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free)、[demo](https://github.com/open-dingtalk/h5app-auth-demo)） |
| `dd.config` 鉴权失败 | 签名 url 用了 encode 后的值（应使用 `location.href` 原内容且去掉 `#` 后部分）、参数不是从服务端获取、父子页面未鉴权父页面、jsapiTicket 过 24 小时上限。（[开发网页应用前端](https://open.dingtalk.com/document/dingstart/develop-webapp-frontend)） |
| access_token 过期 | 应用 access_token 7200 秒，需缓存并自动续期；有效期内重复获取返回相同值。（[api-gettoken](https://open.dingtalk.com/document/development/api-gettoken)） |
| 客户端版本兼容 | `requestAuthCode` 官方支持表：Android/iOS ≥ 7.0.45、HarmonyOS ≥ 7.0.0、Mac/Windows ≥ 7.0.50（[JSAPI 文档](https://open.dingtalk.com/document/development/jsapi-request-auth-code)）；npm 包声明下限更低（android/ios 2.4.0、pc 3.0.0、harmony 7.0.0）。**专属钉钉/政企专有版差异：未在官方文档确认**。 |
| 企业内部应用 vs 三方应用免登差异 | 免登 JSAPI：企业内部应用、第三方企业应用均支持；**第三方个人应用不支持 `requestAuthCode`**（它走 `dd.getAuthCode` + `/v1.0/oauth2/userAccessToken` 的个人应用链路）。ISV 应用换用户凭证走「统一授权套件/获取登录用户的访问凭证」。（[JSAPI 支持表](https://open.dingtalk.com/document/development/jsapi-request-auth-code)、[obtain-identity-credentials](https://open.dingtalk.com/document/isvapp/obtain-identity-credentials)） |
| 重定向/跨域 | 免登不走重定向；若误把免登码当 OAuth code 走 `login.dingtalk.com` 流程会直接失败（码类型不同，参见 §2.2）。回调地址相关要求见 §4.3。 |

---

## 9. 推荐落地流程（结合本仓库）

### 9.1 总体

```
钉钉客户端内（工作台打开）：
  首页 https://portal.example.com/?corpid=$CORPID$
    → 前端检测: dd.env.isDingTalk === true（或 URL 带 corpid）
    → dd.ready → dd.runtime.permission.requestAuthCode({ corpId, clientId })
    → POST /api/auth/dingtalk/exchange-authcode { authCode, corpId }
        → 服务端: 应用 access_token（缓存复用 lib/dingtalk-admin.ts 的 getEnterpriseAccessToken）
        → POST oapi.dingtalk.com/topapi/v2/user/getuserinfo { code: authCode }
        → 得到 userid + unionId + name
        → 复用现有 upsert 逻辑（User(provider='dingtalk', externalId=unionId) + Person 关联）
        → 建立 iron-session 会话
浏览器：维持现有扫码链路不变（login.dingtalk.com/oauth2/auth → /v1.0/oauth2/userAccessToken → /contact/users/me）。
```

### 9.2 前端伪代码（Next.js 客户端组件）

```tsx
'use client';
useEffect(() => {
  const corpId = new URLSearchParams(window.location.search).get('corpid');
  const inDingTalk = /DingTalk/i.test(navigator.userAgent); // 或 dd.env.isDingTalk
  if (!inDingTalk || !corpId) return;                       // 浏览器保持扫码入口

  let dd: typeof import('dingtalk-jsapi');
  (async () => {
    dd = (await import('dingtalk-jsapi')).default;          // SSR 安全：仅客户端动态加载
    dd.ready(async () => {
      dd.runtime.permission.requestAuthCode({
        corpId,
        clientId: process.env.NEXT_PUBLIC_DINGTALK_CLIENT_ID!, // 仅 clientId 可进前端
        onSuccess: async ({ code }) => {
          await fetch('/api/auth/dingtalk/exchange-authcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authCode: code, corpId }),   // POST body，不进 URL/日志
          });
          // 成功后刷新/跳转
        },
        onFail: (err) => { /* 展示错误 + 引导扫码兜底 */ },
      });
    });
  })();
}, []);
```

### 9.3 后端端点设计

新增 `POST /api/auth/dingtalk/exchange-authcode`（或挂在现有 `app/api/auth/` 下）：

```
lib/dingtalk.ts 增加：
  getuserinfoByAuthCode(authCode: string, accessToken: string)
    → POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo
      ?access_token=<应用token>   body: code=<authCode>（x-www-form-urlencoded）
    → { errcode, result: { userid, unionid, name, ... } }
route 逻辑：
  1) 校验 corpId ∈ 允许列表（可选）、请求限流（lib/rate-limit.ts）
  2) const appToken = await getEnterpriseAccessToken()   // 复用 lib/dingtalk-admin.ts，内部已缓存 7200s
  3) const { result } = await getuserinfoByAuthCode(authCode, appToken)
     // errcode=40078/40079 → 返回可读错误，不重试（码已消耗）
  4) 复用 callback/route.ts 的 upsert：User(provider='dingtalk', externalId=result.unionid)
     + Person（dingUserId 关联），把该段逻辑抽成共享函数供扫码回调与本端点复用
  5) 建立 iron-session 会话（lib/session.ts 现有配置：httpOnly + lax + prod secure）
  6) 日志中不输出 authCode/userid 全文
```

不需要改动：现有扫码链路、`exchangeDingTalkCode`（OAuth code 专用）、`fetchDingTalkUserInfo`（OAuth 链路专用）。免登链路**不使用** `/v1.0/oauth2/userAccessToken`（理由见 §2.2）。

---

## 10. 本仓库落地 TODO 建议

1. [ ] 开发者后台：配置「开发配置 > 安全设置」的重定向 URL / 端内免登地址；把网页应用首页地址改为 `https://<生产域名>/?corpid=$CORPID$`（本地联调可用内网穿透，见 §4）。
2. [ ] 权限：确认已开 `qyapi_base` 与通讯录「成员信息读权限」（扫码已在用的 `Contact.User.Read` 保留）。
3. [ ] `npm install dingtalk-jsapi`（≥3.0.27，当前 latest 3.2.9）；新增客户端组件（`'use client'`）实现 `corpid` 解析 + `dd.ready` + `requestAuthCode`，浏览器环境自动跳扫码。
4. [ ] `lib/dingtalk.ts` 新增 `getuserinfoByAuthCode()`（topapi/v2/user/getuserinfo），复用 `lib/dingtalk-admin.ts#getEnterpriseAccessToken()` 做应用 token 缓存。
5. [ ] 把 `app/api/auth/callback/dingtalk/route.ts` 中的「upsert User + 关联 Person + 建会话」抽成 `lib/dingtalk-identity.ts`（或类似）共享函数，新增 `POST /api/auth/dingtalk/exchange-authcode` 复用。
6. [ ] 免登失败 UX：`40078`/`40079` 时展示「请在工作台内打开 / 联系管理员加入可见范围」，并保留扫码兜底按钮。
7. [ ] 发布应用新版本（勾选工作台应用），在工作台实测免登 → 会话 → 登出全链路；回归浏览器扫码。
8. [ ] 观测：对免登端点加审计（不记 authCode 明文）、限流与失败率监控；如需手机号再单独申请权限。

---

## 附：本文引用的官方 URL 清单

| 主题 | URL |
|---|---|
| 企业内部网页应用免登（主文档，gmtModify 2026-09-16） | https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free |
| 网页应用（H5微应用）免登（orgapp 版） | https://open.dingtalk.com/document/orgapp/enterprise-internal-application-logon-free |
| 企业内部应用免登（服务端视角） | https://open.dingtalk.com/document/orgapp-server/enterprise-internal-application-logon-free |
| JSAPI requestAuthCode | https://open.dingtalk.com/document/development/jsapi-request-auth-code |
| JSAPI getAuthCode（小程序） | https://open.dingtalk.com/document/development/jsapi-get-auth-code |
| 小程序免登授权码 | https://open.dingtalk.com/document/orgapp-client/mini-program-free-login |
| 免登常见问题 FAQ | https://open.dingtalk.com/document/development/development-mlogon-faq |
| 通过免登码获取用户信息（topapi/v2/user/getuserinfo） | https://open.dingtalk.com/document/development/obtain-the-userid-of-a-user-by-using-the-log-free |
| 获取应用的 Access Token（api-gettoken） | https://open.dingtalk.com/document/development/api-gettoken |
| 获取企业内部应用的 accessToken | https://open.dingtalk.com/document/development/obtain-orgapp-token |
| 获取用户 token（/v1.0/oauth2/userAccessToken） | https://open.dingtalk.com/document/orgapp/obtain-user-token |
| 获取登录用户的访问凭证（ISV 统一授权） | https://open.dingtalk.com/document/isvapp/obtain-identity-credentials |
| 获取用户通讯录个人信息（contact/users/me） | https://open.dingtalk.com/document/development/dingtalk-retrieve-user-information |
| 根据 unionid 获取用户 userid | https://open.dingtalk.com/document/orgapp/query-a-user-by-the-union-id |
| JSAPI 总览（是否需鉴权列） | https://open.dingtalk.com/document/development/jsapi-overview-1 |
| 客户端 SDK 介绍（npm vs CDN） | https://open.dingtalk.com/document/dingstart/webapp-read-before-development |
| 开发网页应用前端（dd.config/jsapiTicket/corpId 模板） | https://open.dingtalk.com/document/dingstart/develop-webapp-frontend |
| 配置网页应用 | https://open.dingtalk.com/document/dingstart/configure-web-application |
| 应用创建与配置 | https://open.dingtalk.com/document/dingstart/create-application |
| 发布应用 | https://open.dingtalk.com/document/dingstart/publish-dingtalk-application |
| 钉钉安全域名（ISV 专用，仅供区分） | https://open.dingtalk.com/document/dingstart/config-domain-name |
| 官方 Demo h5app-auth-demo | https://github.com/open-dingtalk/h5app-auth-demo |
| 官方 Demo web-app-sso.zip（文档内置） | https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251113/vrmiiu/web-app-sso.zip |
| npm: dingtalk-jsapi（README/版本/类型） | https://www.npmjs.com/package/dingtalk-jsapi |

## 附：未能在官方文档确认的点（及尝试记录）

1. **JSAPI 免登 authCode 是否可直接传 `POST /v1.0/oauth2/userAccessToken`**：官方免登文档均走 `topapi/v2/user/getuserinfo`；`obtain-user-token` 文档对 `code` 只描述为 OAuth 授权码。已核对 development/orgapp/orgapp-server 三份免登文档与 FAQ，均未提及兼容。若要用需实测。
2. **「服务器出口IP」白名单的现行官方说明**：文档站搜索 `服务器出口IP`、`IP白名单`、`安全设置 重定向URL` 均无有效命中；旧文档 `configure-orgapp` 的 OSS 内容源已 404。该配置项目前只能在实际开发者后台界面确认。
3. **`dd.context`**：官方文档与 `dingtalk-jsapi@3.2.9` 包内均未见（`lib/` 下无 context 模块），视为已废弃，环境判断用 `dd.env`。
4. **专属钉钉 / 政企专有版对免登的兼容差异**：本次抓取的文档未提及，未确认。
5. **Next.js/SSR 下加载 dingtalk-jsapi 的官方指南**：不存在（官方仅提供通用 npm/CDN 引入说明）；§6 的 SSR 做法为依据包实现（内部读取 `location.href`）推导的工程实践，非官方文档。
6. **`dd.config` 签名算法 SHA-1 vs SHA-256**：当前官方文档示例代码为 SHA-256，与社区历史资料（SHA-1）冲突；已按「以官方文档现状为准 + 冲突标注」处理。
