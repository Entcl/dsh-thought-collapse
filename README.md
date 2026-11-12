# 思考过程折叠 (dsh-thought-collapse)

自动折叠对话中的思考节点与工具调用，保持界面清爽。

装上之后，每个已完成的回合末尾会出现一枚「已完成分析」胶囊按钮：

- 回合里没有任何展开的思考 / 工具调用时，显示「已收起」，点一下整段展开。
- 回合里有展开的项时，显示「已展开 N 项」，点一下整段收起。
- 回合刚结束时，插件会自动收起该回合内所有思考与工具调用（每个回合只自动收一次，之后你自己展开的状态不会被抢走）。

## 功能边界

思考（reasoning）行和工具调用（tool call）行本身由 DSH 内置的 Chat 插件渲染，它们各自维护自己的展开状态。本插件**不重写**这些行，而是：

1. 读取内置行已有的 DOM 标记（`data-variant="think"`、`data-tool`、`data-disclosure-row`、`data-open`）判断展开与否；
2. 通过内置行自己的折叠控件驱动展开 / 收起，所以内置的动画、键盘可达性、无障碍属性全部保留；
3. 用一个**回合级**控件（挂在 `conversation.chat.turnTail`）提供「一键收起整回合」和「回合结束自动收起」。

也就是说：**默认折叠**来自 DSH 内置行为（`transcriptView` 策略，默认 `detailed` 下已完成回合的思考与工具行本来就是收起的），本插件负责的是**回合级的再收起**和**结束即收**。

## 目录结构

```
dsh-thought-collapse/
├── package.json        # 包清单：dsh.bundle.patch / dsh.client / 图标 / 本地化文件
├── cordis.patch.yml    # 装进 Profile 的 Loader 片段（insert 一条 Loader 项）
├── index.js            # Host 半边：activate / deactivate / apply
├── client.js           # Client 半边：注册 turnTail 插槽贡献
├── locale/
│   ├── zh.json         # 插件显示名与描述（中文）
│   └── en.json         # 插件显示名与描述（英文）
├── icon.svg            # 左侧栏插件列表图标
└── README.md
```

## 各文件职责

| 文件 | 作用 |
| --- | --- |
| `package.json` | 声明 `dsh.bundle.patch`（本包是 bundle）、`dsh.client`（Web 端 Client 半边）、`exports`（`./client`、`./icon`、`./locale/*.json`） |
| `cordis.patch.yml` | 只有一条 `insert`，把本包作为 Loader 项插进 Profile；**启用/停用开关就是这一项的 enable/disable** |
| `index.js` | Host 半边生命周期。功能全在 Client，Host 只保留对称的 `activate`/`deactivate` 边界，便于以后加持久化偏好 |
| `client.js` | 全部 UI 逻辑：本地化、样式、插槽注册、DOM 读取与折叠驱动 |
| `locale/*.json` | `meta.title` / `meta.description`，左侧栏「已安装插件」里显示的插件名与描述 |
| `icon.svg` | 左侧栏列表图标（24×24，使用品牌蓝 `#3B5BDB`） |

## 安装

本包是标准的 DSH bundle，装进当前 Profile 即可（不需要手改 `~/.dsh/profiles/<profile>/package.json` 或 `cordis.patch.yml`）：

1. 让 DSH 从本地目录安装这个包（`plugin_manager` 的 `install_bundle`，`target` 传本目录的绝对路径）：
   ```
   C:\Users\q1273\Documents\deepseek-harness\default-workspace\dsh-thought-collapse
   ```
2. 安装完成后打开左侧栏「插件」→「已安装插件」，应能看到一行：
   - 图标：蓝底白色下折箭头
   - 名称：**思考过程折叠**
   - 描述：自动折叠对话中的思考节点与工具调用，保持界面清爽。
3. 右侧 Toggle 打开即生效（Client 半边立即注册 `conversation.chat.turnTail` 贡献），关闭即移除。**无需重启**。

> 只有在**替换**已安装的同名包（版本升级、改代码后重新安装）时，才需要重启一次以加载新的模块代际。

## 本地测试步骤

### 1. 静态检查（安装前就能做）

```powershell
cd C:\Users\q1273\Documents\deepseek-harness\default-workspace\dsh-thought-collapse
node --check index.js
node --check client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
node -e "JSON.parse(require('fs').readFileSync('locale/zh.json','utf8')); JSON.parse(require('fs').readFileSync('locale/en.json','utf8')); console.log('locale OK')"
```

`client.js` 必须是**纯 JavaScript**：不能有 JSX / TypeScript，元素用 `React.createElement` 构造（本包用 `const h = React.createElement` 别名）。

### 2. 安装并确认包被识别

- `plugin_manager` → `action: "list_plugins"`，确认列表中出现 `dsh-thought-collapse`，且 `enabled` 为 `true`。
- 如果返回里带 `failed` / `overridden` / `restart-required`，按提示分别处理：`failed` 说明 Loader 片段有问题（看 `cordis.patch.yml`），`restart-required` 说明需要重启一次。

### 3. 确认 Client 半边真的注册上了

用 `cordis_inspect_query`（`platform: "client"`）查 `Slots` 的 `listSubTree`，在 `conversation.chat.turnTail` 的 `selected.occupants` 里应当能看到：

- `id`: `thought-collapse`
- `order`: `100`
- `active`: `true`

如果看不到，通常是 Client 半边抛错了。Client 半边抛错时会被**放弃本次会话**（abdication），控制台里会有一行带包名前缀的日志，例如 `client half failed to parse in this browser: …`，按提示修 `client.js`。

> 实测记录：注册 `apply` 里最初用了 `styles.insert(CSS)`，但 `styles` 只是**动态求值的 Client 半边**（`evaluateClientHalf`）的注入参数，`__ModuleLoader__` 工厂形式里并不存在，于是 `apply` 抛 `ReferenceError`、`ctx.slots.inject` 根本没执行，插槽里一直没有本插件。改成自带 `<style data-plugin-css>` 元素后，插槽贡献立刻出现。**这就是必须查插槽而不是只看 Toggle 的原因。**

### 3b. 确认 Host 半边活着

用 `cordis_inspect_query`（`platform: "host"`）查 `Config` 的 `listConfigs`，`name` 传 `dsh-thought-collapse`：

```json
{ "id": "include:thought-collapse", "patchId": "thought-collapse",
  "name": "dsh-thought-collapse", "status": "absent" }
```

`status: "absent"` 在这里是**正常且期望**的：它只说明「这个 Loader 项没有声明 `Config`」。反过来说，能返回 `absent` 就证明这一项**已经挂载且未被禁用**（未挂载 / 被禁用会返回 `inactive`）。所以这一行同时验证了两件事：`cordis.patch.yml` 的 `insert` 生效了，Toggle 是打开的。

### 4. 界面验证

1. 打开一个已有历史的会话，滚到某个**已完成**回合的末尾。
2. 期望看到「已完成分析」胶囊：回合内思考/工具都收起时显示「已收起」，有展开项时显示「已展开 N 项」。
3. 点胶囊 → 该回合内所有思考与工具调用一起展开 / 一起收起；胶囊上的计数随之变化。
4. 让模型跑一个新回合（带工具调用），回合结束的瞬间该回合应自动收起一次；再手动展开后**不应**被再次收起。
5. 切到深色主题，确认胶囊边框、文字、hover 背景都跟随主题（全部使用 `--dsw-alias-*` 变量）。
6. 切到英文界面，确认文案变成 `Analysis complete` / `Folded` / `N unfolded`。
7. 关闭左侧栏的 Toggle，胶囊应立刻消失；重新打开，胶囊立刻回来。

### 5. 出问题时的定位顺序

| 现象 | 先看哪里 |
| --- | --- |
| 左侧栏看不到插件行 | `locale/*.json` 的 `meta.title`、`package.json` 的 `dsh.bundle.patch` |
| 插件行在但 Toggle 打开无变化 | Client 半边的 `apply` 是否抛错（控制台有包名前缀日志） |
| `Slots.listSubTree` 里没有 `thought-collapse` | `apply` 是否在 `ctx.slots.inject` 之前就抛了（`styles`、`host`、`process` 在本形态下都不存在） |
| `Config.listConfigs` 返回 `inactive` | Toggle 被关掉了，或 `cordis.patch.yml` 没插进去 |
| 胶囊出现但点击无反应 | `[data-chat-turn]` 是否包住了思考/工具行（换版本后 DOM 标记可能变） |
| 胶囊一直显示「暂无可折叠内容」 | 该回合确实没有思考或工具调用，或内置行的 DOM 标记变了 |
| 折叠只收起了本回合一部分 | 内置行若不再渲染 `[data-disclosure-row]` / `[data-expandable]`，点击驱动会失效 |

## 设计取舍

- **不重写内置行。** 覆盖内置的思考行/工具行需要把它们整体复制一遍（`replaceRisk: "shadows-shipped-ui"`），版本升级极易碎。本插件只挂 `replaceRisk: "none"` 的 `conversation.chat.turnTail`。
- **DOM 驱动而非状态驱动。** 内置行的展开状态在 `useDisclosure` 里，属于 ui-chat 私有，没有对外事件。所以插件读 DOM、点 DOM：内置行怎么变，插件就怎么跟。
- **折叠范围限定在本会话的回合列表内。** 两个会话并排时都会有「第 3 回合」，所以 `collectOwners` 从 `[data-turn-tail]` 往上找最近的、含多个 `[data-chat-turn]` 的容器，只在它内部查找，绝不跨会话误收。
- **不写 DOM 到组件外。** 除读写自己回合内的既有元素外，不向 `document.body` 追加任何节点；样式是插件自己持有的一个 `<style data-plugin-css="thought-collapse">`，随 `ctx.effect` 的清理函数移除，停用即回收。
- **宿主无推送。** DSH 没有 host→client push，回合结束的信号只能在 Client 侧从 `turn.status === "closed"` 读，因此自动收起发生在 turnTail 渲染后的一帧。
- **没有 `Config`。** 本插件不需要用户配置，所以 `index.js` 不导出 `Config`。此时 `Config.listConfigs` 对该插件返回 `status: "absent"`，这是**正常状态**，不是加载失败（加载失败会返回 `failed`）。真要加配置项，需要 `@deepseek-ai/schemastery` 的真实 schema 对象，普通 JSON Schema 会得到 `status: "unsupported"`。
