# 思考过程折叠 (dsh-thought-collapse)

自动折叠对话中的思考节点与工具调用，保持界面清爽。

装上之后，**每个刚结束的回合会自动收起一次**，界面立刻回到你要的那种清爽状态：

```
已完成，用时 6 分 2 秒  ⌄        ← 回合级胶囊（DSH 内置，收起后思考/工具全部隐藏）
ⓘ 思考 持续了几秒                 ← 折叠态只留一行摘要
✎ 已修改 2 文件 [package.json]     ← 步骤组头（DSH 内置）
```

本插件**不新增任何界面元素**。上面这三行都是 DSH 内置 Chat 插件原本就有的控件，插件做的是「在回合结束的那一刻，把该回合还展开着的内置控件替你按一下收起」。

## 它到底做了什么

一句话：**回合结束 → 找到该回合的内置折叠控件 → 点一下**。

1. 插件挂载在 `conversation.chat.turnTail` 插槽上。这个插槽**只在回合已经 `turn/end` 之后才渲染**，所以「插件挂载」本身就等于「回合结束」的信号，不需要监听任何事件（DSH 也没有 `turn.completed` 这类 Client 事件）。
2. 挂载后，插件在本会话的对话列（`[data-chat-flow]`）里，按回合号找到该回合的三类内置控件，并把仍然展开的逐个点收起：
   - `button[data-turn-process]` —— 回合级胶囊（「已完成，用时 …」），收起它等于收起整段工作过程；
   - `button[data-process-activity]` —— 步骤组头（「已修改 2 文件」），收起它等于收起组内的工具调用行；
   - `[data-variant="think"]` —— 思考行，收起它等于只留一行摘要。
3. 点的都是内置控件自己的 `onClick`，所以**动画、键盘可达性、`aria-expanded`、深色主题全部沿用内置实现**，插件不碰样式、不复制组件。

## 为什么不会抢走你手动展开的状态

`turnTail` 对**所有**已结束回合都会渲染，包括你打开会话时从历史里恢复的那些。如果无条件收起，你上次特意展开的内容会在每次打开会话时被打回去。

所以插件带一个 **10 秒新鲜度窗口**：只有 `turn.end.time` 距离当前时间在 10 秒内的回合才会被自动收起。历史回合原样保留你离开时的展开状态。

窗口内也不是「只点一次」：插件在 0 / 60 / 180 / 420 ms 各跑一遍，因为内置控件是在 `turn/end` 之后分几帧才渲染完的，跑多遍能确保最后一遍看到的是稳定 DOM。每一遍都只点「当前仍然展开」的控件，已经收起的会被跳过，所以重复执行是幂等的。

## 功能边界

- **不重写内置行。** 覆盖内置的思考行 / 工具行需要 `replaceRisk: "shadows-shipped-ui"` 的 keyed 插槽，等于把内置组件复制一遍，版本升级必碎。本插件只挂 `replaceRisk: "none"` 的 `conversation.chat.turnTail`，新增的只是一个 `display:none` 的锚点 `span`。
- **默认折叠来自内置策略。** DSH 的 `transcriptView` 策略（`compact` / `standard` / `detailed` / `verbose`）里，前三种的 `foldCompletedTurns` 都是 `true`，所以已完成回合本来就是收起的；`verbose` 下 `foldCompletedTurns` 为 `false`，此时内置胶囊是 `disabled` 的，插件会跳过它而不是强行点击。本插件的增量价值是**「结束即收」的确定性**：即使某回合中途被你展开过、或内置策略在 `collapseTiming: "next-input"` 下故意延后收起，回合一结束仍会被收起。
- **不跨会话。** 两个会话并排时都会有「第 3 回合」，所以查找范围严格限定在锚点所属的对话列内；找不到容器就放弃这一遍，绝不退化成扫描整个 `document`。

  这里有个容易踩的细节：内置的步骤组内容区**也**带 `data-chat-flow`（和对话列同名），所以「最近的 `[data-chat-flow]` 祖先」可能是那个很窄的组内容区，而不是对话列。插件取的是**最外层**的那个 `[data-chat-flow]` 祖先，这样即使回合页脚本身渲染在某个步骤组内部，胶囊也仍在查找范围内。两种情形都有对应的自动化测试。
- **不写 DOM 到组件外。** 除了自己持有的一个 `<style data-plugin-css="thought-collapse">`（随 `ctx.effect` 清理函数移除），插件不向 `document.head` / `body` 追加任何东西。

## 目录结构

```
dsh-thought-collapse/
├── package.json        # 包清单：dsh.bundle.patch / dsh.client / 图标 / 本地化文件
├── cordis.patch.yml    # 装进 Profile 的 Loader 片段（insert 一条 Loader 项）
├── index.js            # Host 半边：activate / deactivate / apply
├── client.js           # Client 半边：注册 turnTail 插槽贡献 + 折叠驱动
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
| `index.js` | Host 半边生命周期。功能全在 Client，Host 只保留对称的 `activate` / `deactivate` 边界 |
| `client.js` | 全部 UI 逻辑：插槽注册、回合号解析、会话内作用域收敛、三类内置控件的折叠驱动 |
| `locale/*.json` | `meta.title` / `meta.description`，左侧栏「已安装插件」里显示的插件名与描述 |
| `icon.svg` | 左侧栏列表图标（24×24，品牌蓝 `#3B5BDB` 底 + 白色下折箭头） |

## 安装

本包是标准 DSH bundle，装进当前 Profile 即可（不需要手改 `~/.dsh/profiles/<profile>/package.json` 或 `cordis.patch.yml`）：

1. 让 DSH 从本地目录安装（`plugin_manager` 的 `install_bundle`，`target` 传本目录绝对路径）：
   ```
   C:\Users\q1273\Documents\deepseek-harness\default-workspace\dsh-thought-collapse
   ```
2. 打开左侧栏「插件」→「已安装插件」，应能看到一行：
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

- `plugin_manager` → `action: "list_plugins"`，确认出现 `dsh-thought-collapse` 且 `enabled` 为 `true`。
- 若返回 `failed` / `overridden` / `restart-required`：`failed` 说明 Loader 片段有问题（看 `cordis.patch.yml`），`restart-required` 说明需要重启一次。
- 已装过时再次 `install_bundle` 会返回 `{"error":{"code":"already-installed"}}`，这是**正常**的，**不要**用 `remove_bundle` 去「清理」，那会解链 Profile 里的包。

### 3. 确认 Client 半边真的注册上了

用 `cordis_inspect_query`（`platform: "client"`）查 `Slots` 的 `listSubTree`，在 `conversation.chat.turnTail` 的 `selected.occupants` 里应当能看到：

- `id`: `thought-collapse`
- `order`: `100`
- `active`: `true`

看不到通常是 Client 半边抛错了：Client 半边抛错会被**放弃本次会话**（abdication），控制台里会有一行带包名前缀的日志，例如 `client half failed to parse in this browser: …`。

> 实测记录：`apply` 里最初用了 `styles.insert(CSS)`，但 `styles` 只是**动态求值的 Client 半边**（`evaluateClientHalf`）的注入参数，`__ModuleLoader__` 工厂形式里并不存在，于是 `apply` 抛 `ReferenceError`、`ctx.slots.inject` 根本没执行，插槽里一直没有本插件。改成自带 `<style data-plugin-css>` 元素后立刻出现。**这就是必须查插槽而不是只看 Toggle 的原因。**

### 3b. 确认 Host 半边活着

用 `cordis_inspect_query`（`platform: "host"`）查 `Config` 的 `listConfigs`，`name` 传 `dsh-thought-collapse`：

```json
{ "id": "include:thought-collapse", "patchId": "thought-collapse",
  "name": "dsh-thought-collapse", "status": "absent" }
```

`status: "absent"` 在这里是**正常且期望**的：它只说明「这个 Loader 项没有声明 `Config`」。能返回 `absent` 就证明这一项**已经挂载且未被禁用**（未挂载 / 被禁用会返回 `inactive`）。

### 3c. 无浏览器时的折叠逻辑自测

折叠逻辑不依赖 DSH 运行时，可以脱离浏览器直接验证。仓库里不含测试文件，下面的脚本按需自建：它用一个极小的 DOM 桩（`closest` / `querySelectorAll` / `click` / `dataset`）复刻内置对话列的结构，把 `client.js` 加载进来，然后断言插件到底点了哪些控件。

覆盖的用例（共 10 条，全部通过）：

| 用例 | 断言 |
| --- | --- |
| 新鲜回合 | 胶囊、步骤组、思考行各被点 **1** 次 |
| 历史回合（结束于 60 秒前） | 一次都不点 |
| 回合没有 `end.time` | 一次都不点 |
| 胶囊 `disabled`（`verbose` 模式） | 跳过胶囊，其余照收 |
| 三者本来就是收起的 | 一次都不点 |
| 四次 pass 的幂等性 | 即使点击后属性立刻变，仍各只点 1 次 |
| 并排两个会话 | 只动自己那个，另一个会话 0 次点击 |
| 作用域解析 | 落在对话列，而不是同名的步骤组内容区 |
| 思考行走 `leading` 按钮的形态 | 点 `leading`，不点整行 |
| 页脚嵌在步骤组内部 | 仍能穿过组内容区找到胶囊 |

写测试时发现并修掉的两个真实缺陷：

1. **作用域收得过窄。** 内置步骤组内容区也带 `data-chat-flow`，用「最近的祖先」会让作用域落在那个很窄的 div 上，胶囊落在范围外 → 静默什么都不收。改成取最外层祖先，并补了「页脚嵌在组内」的回归用例。
2. **回合号来源不一致。** 原来从 `[data-turn-tail]` 读回合号，而 `collectItems` 用 `[data-chat-turn]` 查询；两者数值相同但来源不同。改成优先读 `[data-chat-turn]`，`[data-turn-tail]` 降为回退。

> 这些测试证明的是**折叠逻辑**，不是视觉效果。折叠后的样子完全由内置组件呈现，插件不参与绘制。

### 4. 界面验证（关键：验证「结束即收」）

1. 打开一个会话，**让模型跑一个带工具调用的新回合**（不要用历史回合——历史回合在 10 秒窗口外，按设计不动）。
2. 回合进行中：确认你能看到展开的工作过程（内置行为，与本插件无关）。
3. 回合**结束的瞬间**：该回合应自动变成折叠态，即
   - 「已完成，用时 …」胶囊处于收起态（箭头朝下、下方不再显示思考/工具内容）；
   - 若该回合有步骤组，组头（如「已修改 2 文件」）也处于收起态；
   - 思考行只剩一行摘要。
4. 手动点开胶囊 / 步骤组 / 思考行，确认能正常展开——插件**不会**在之后把它们再抢回去。
5. 切换到历史回合，确认它们的展开状态与你离开时一致（新鲜度窗口生效）。
6. 切到深色主题：胶囊、组头、思考行的颜色全部跟随主题（都是内置样式，用的是 `--dsw-*` 变量）。
7. 关闭左侧栏 Toggle 再跑一个新回合，确认该回合**不再**自动收起；重新打开后恢复。
8. 把 `transcriptView` 调成 `verbose`（设置里「工作步骤展示 → 完全展开」），再跑一个新回合：内置胶囊此时是 `disabled` 的，插件应**跳过**它，界面保持展开。

### 5. 出问题时的定位顺序

| 现象 | 先看哪里 |
| --- | --- |
| 左侧栏看不到插件行 | `locale/*.json` 的 `meta.title`、`package.json` 的 `dsh.bundle.patch` |
| 插件行在但 Toggle 打开无变化 | Client 半边的 `apply` 是否抛错（控制台有包名前缀日志） |
| `Slots.listSubTree` 里没有 `thought-collapse` | `apply` 是否在 `ctx.slots.inject` 之前就抛了（`styles`、`host`、`process` 在本形态下都不存在） |
| `Config.listConfigs` 返回 `inactive` | Toggle 被关掉了，或 `cordis.patch.yml` 没插进去 |
| 回合结束后完全没折叠 | 该回合的 `turn.end.time` 是否在 10 秒内（历史回合不折叠是**设计如此**） |
| 只收起了胶囊，步骤组还是展开的 | 内置是否还在渲染 `button[data-process-activity]`（版本升级后标记可能变） |
| 胶囊是灰的、点了没反应 | 内置策略不允许折叠（`verbose` 模式、回合未结束、或回合是 aborted/interrupted/error），插件按设计跳过 |
| 折叠影响了别的会话 | `[data-chat-flow]` 作用域解析失败时会放弃，检查 DOM 里该属性是否还在 |
| 页脚嵌在步骤组里时胶囊没收起 | 作用域要取最外层 `[data-chat-flow]`；若改回「最近祖先」就会漏掉胶囊（有测试覆盖） |

## 设计取舍

- **不重写内置行。** 覆盖内置行需要 `replaceRisk: "shadows-shipped-ui"` 的 keyed 插槽，等于复制组件，版本升级必碎。本插件只挂 `replaceRisk: "none"` 的 `conversation.chat.turnTail`。
- **DOM 驱动而非状态驱动。** 内置行的展开状态在 ui-chat 私有的 `useDisclosure` 里，没有对外事件，也没有公开的 store action。所以插件读 DOM、点 DOM：内置怎么变，插件就怎么跟。
- **不自己画折叠态。** 早期版本在回合末尾画了一枚自定义胶囊（`.dtc-bar`），和内置的「已完成，用时 …」视觉语言冲突，已删除。现在折叠态完全由内置控件呈现，插件零 chrome。
- **用挂载时机代替回合事件。** DSH 没有 host→client push，Client 侧也没有 `turn.completed` 事件；而 `turnTail` 插槽只在 `turn/end` 之后渲染，于是「挂载」天然就是「回合结束」。代价是无法在回合结束**之前**预判，但本插件的语义只需要结束之后。
- **新鲜度窗口而非「只收一次」的 ref。** 用时间判断比用 `useRef` 标记更稳：切会话、切主题、重渲染都不会让历史回合被误收，也不依赖组件实例是否被复用。
- **没有 `Config`。** 本插件不需要用户配置，所以 `index.js` 不导出 `Config`。此时 `Config.listConfigs` 返回 `status: "absent"`，这是**正常状态**，不是加载失败（加载失败会返回 `failed`）。真要加配置项，需要 `@deepseek-ai/schemastery` 的真实 schema 对象，普通 JSON Schema 会得到 `status: "unsupported"`。
