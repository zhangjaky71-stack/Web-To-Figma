# Web2Figma（W2F）Architecture V2.1 Addendum

> **状态：APPROVED ADDENDUM**  
> **作用：补充 Web2Figma W2F Development Implementation Plan V2 Baseline，不替代 V2。**  
> **后续唯一实施基线：V2 Baseline + 本 V2.1 Addendum。**  
> **日期：2026-08-21**  
> **原则：只补充会影响 NODE-02 / NODE-03 数据协议和后续长期兼容性的架构预留，不再无限扩展 Scope。**

---

# 0. Addendum 目标

V2 已具备正式开工条件。V2.1 不重新设计整体系统，只补充以下六个若不提前进入 Schema/IR，未来较容易发生破坏性返工的能力：

1. **Token Graph**
2. **Structural Fingerprint**
3. **Incremental Merge Metadata**
4. **Scroll Root Model**
5. **Composed Tree Mapping**
6. **Geometry Precision Policy**

同时登记但不阻塞 NODE-00～NODE-04 的后续增强：

- Design-System-Aware Import
- Dynamic Page Loading
- Resource Provenance
- Accessibility Semantic Model
- Render Profiles
- Browser Zoom / CSS Zoom 分离
- iframe Origin Isolation
- Designer Operation Benchmark
- Corpus Versioning
- Known Limitations Contract
- UI State / Component Variant
- SPA Route / Application State
- Print Capture
- Incremental Update Engine

---

# 1. 基线关系

正式关系如下：

```text
V2 Baseline
    +
V2.1 Addendum
    =
Current Implementation Baseline
```

V2.1 不更改 V2 NODE-00～NODE-31 的总体顺序。

只对以下 NODE 增加硬性要求：

```text
NODE-02 — W2F File Spec V2
NODE-03 — W2F IR V2
NODE-04 — Stable Identity & Source Mapping
NODE-08 — Standard DOM Capture
NODE-09 — CDP High Fidelity Adapter
NODE-11 — CSS Cascade & Authored Semantics
NODE-16 — Responsive Inference Engine
NODE-19 — Render Tree Optimizer
NODE-22~28 — Figma Import / Render
NODE-29~30 — QA
```

---

# 2. Token Graph

## 2.1 为什么必须预留

真实网页大量通过 CSS Custom Properties 建立设计系统：

```css
:root {
  --color-primary: #0A84FF;
  --color-text: #111111;
  --space-2: 8px;
  --space-4: 16px;
  --radius-md: 12px;
}
```

如果 W2F 只保存最终 resolved 值：

```text
#0A84FF
16px
12px
```

则导入 Figma 后：

- 视觉可以正确；
- 但 Token 关系全部消失；
- 同一个 Token 使用 200 次会变成 200 个独立 literal；
- 后期无法高质量映射为 Figma Variables；
- 未来 Design System 提取需要重新猜测。

因此 V2.1 正式增加：

# W2F Token Graph

---

## 2.2 Token 类型

```ts
type W2FTokenKind =
  | "color"
  | "number"
  | "dimension"
  | "spacing"
  | "radius"
  | "opacity"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "shadow"
  | "gradient"
  | "string"
  | "unknown"
```

---

## 2.3 Token 定义

```ts
interface W2FToken {
  id: string
  name: string
  kind: W2FTokenKind

  rawValue: string
  resolvedValue?: unknown

  scope: {
    sourceNodeId?: string
    stylesheetRef?: string
    selector?: string
  }

  references: string[]
  source: {
    type:
      | "css-custom-property"
      | "inline-variable"
      | "derived"
  }

  confidence: number
}
```

---

## 2.4 Token Usage

```ts
interface W2FTokenUsage {
  tokenId: string
  sourceNodeId: string
  property: string

  authoredValue: string
  resolvedValue: string
}
```

例如：

```css
.card {
  padding: var(--space-4);
}
```

IR：

```json
{
  "tokenId": "tok_space_4",
  "property": "padding",
  "authoredValue": "var(--space-4)",
  "resolvedValue": "16px"
}
```

---

## 2.5 Token alias

支持：

```css
--button-bg: var(--color-primary);
```

Graph：

```text
button-bg
   ↓
color-primary
```

不能只保存最终颜色。

---

## 2.6 Token cycle

CSS Variables 可能存在循环或 fallback：

```css
--a: var(--b);
--b: var(--a, red);
```

捕获层只记录浏览器最终 resolved result + source relation。

W2F 不重新实现完整 CSS variable resolver。

---

## 2.7 `.wtf` 文件增加

```text
tokens.json
```

建议结构：

```json
{
  "tokens": [],
  "usages": []
}
```

---

## 2.8 Figma V2 首版行为

默认：

```text
Literal Import
```

即：

```text
W2F token relation 保留
但 Figma 先使用实际值
```

后续可增加：

```text
Create Figma Variables
Match Existing Variables
```

因此现在只需要保证数据不会丢。

---

# 3. Structural Fingerprint

## 3.1 与 Stable Identity 的区别

Stable Identity 回答：

> “这是不是上一次 Capture 的同一个节点？”

Structural Fingerprint 回答：

> “这些节点是不是同一种结构/组件模式？”

例如网页中 20 张 Card：

```text
Card A
Card B
Card C
...
```

它们 stableNodeId 不同。

但 structuralFingerprint 应相同或高度相似。

---

## 3.2 用途

未来：

```text
Repeated structure
↓
Component Candidate
↓
Figma Component + Instances
```

V2 首版：

```text
只识别
不自动组件化
```

---

## 3.3 Fingerprint 输入

建议分层：

### Semantic Fingerprint

```text
tag/role tree
text slot pattern
asset slot pattern
```

### Layout Fingerprint

```text
layout mode
child count
gap
padding
sizing semantics
```

### Paint Fingerprint

```text
background
radius
border
shadow
```

### Full Structural Fingerprint

组合：

```text
semanticHash
layoutHash
paintHash
```

---

## 3.4 不应该纳入 fingerprint 的内容

默认忽略：

- 实际文本字符串；
- 图片 URL；
- 动态 ID；
- current price；
- username；
- 时间戳。

否则相同 Card 会无法识别。

---

## 3.5 Schema

```ts
interface StructuralFingerprint {
  semanticHash: string
  layoutHash: string
  paintHash?: string
  combinedHash: string
  confidence: number
}
```

RenderNode：

```ts
componentCandidate?: {
  fingerprint: StructuralFingerprint
  groupId?: string
}
```

---

## 3.6 组件候选阈值

初期：

```text
同 combinedHash
+
至少出现 3 次
```

才标记候选。

不在 V2 首版自动创建 Component。

---

# 4. Incremental Merge Metadata

## 4.1 为什么 Stable ID 仍然不够

未来：

```text
Capture #1
→ Figma
→ 设计师编辑

网页变化
→ Capture #2
```

此时存在：

```text
Base Web
Latest Web
Current Figma
```

如果只知道 node identity，无法判断谁改了什么。

因此需要从现在预留字段。

---

## 4.2 Node Hashes

每个 SourceNode / RenderNode 保存：

```ts
interface NodeRevisionHashes {
  contentHash?: string
  geometryHash?: string
  layoutHash?: string
  paintHash?: string
  assetHash?: string
  hierarchyHash?: string
}
```

---

## 4.3 Document Revision

```ts
interface W2FRevision {
  documentId: string
  captureId: string
  revisionId: string

  parentRevisionId?: string

  sourceFingerprint: string

  capturedAt: string
}
```

---

## 4.4 未来三方 Merge

```text
Base:
contentHash=A
paintHash=B

Latest Web:
contentHash=C
paintHash=B

Current Figma:
contentHash=A
paintHash=D
```

推断：

```text
网页改了 content
设计师改了 paint
```

未来 Update Engine 可以安全合并。

---

## 4.5 V2 首版要求

必须：

- 写 hashes；
- 写 revision metadata；
- Figma Plugin 保存对应 import metadata。

不必须：

- 做更新 UI；
- 做自动 merge；
- 做 conflict resolution。

这些属于后续 NODE。

---

# 5. Scroll Root Model

## 5.1 为什么 document 不等于页面

很多 SaaS：

```html
<body>
  <div class="app">
    <aside>...</aside>
    <main class="scroll-container">
       ...
    </main>
  </div>
</body>
```

真正“完整内容”可能在：

```text
main.scroll-container
```

而不是 document。

---

## 5.2 模型

```ts
interface ScrollContainerInfo {
  sourceNodeId: string

  scrollWidth: number
  scrollHeight: number

  clientWidth: number
  clientHeight: number

  scrollLeft: number
  scrollTop: number

  overflowX: string
  overflowY: string

  isDocumentScrollRoot: boolean
  isPrimaryApplicationScrollRoot: boolean

  parentScrollContainerId?: string
}
```

---

## 5.3 Primary Scroll Root Detection

候选证据：

```text
scrollHeight > clientHeight
visible major area
contains majority content
position/layout context
viewport-filling container
```

输出：

```text
confidence
reasons
```

不允许只判断：

```text
overflow:auto
```

---

## 5.4 Full Page Capture 定义升级

Capture Target：

```ts
type CaptureTarget =
  | { type: "document" }
  | { type: "scroll-root"; sourceNodeId: string }
  | { type: "region"; bounds: Rect }
```

浏览器 UI 第一版可自动选择：

```text
Document
```

如果检测到强 primary application scroll root：

提示：

```text
Scrollable app area detected.

Capture:
● Entire application
○ Browser document
```

---

## 5.5 Sticky / Fixed

Sticky 的 containing block 与 scroll root 必须保存。

否则导入时无法解释：

```text
为什么元素在当前 Capture 位于这里
```

---

# 6. Composed Tree Mapping

## 6.1 DOM Tree 不等于最终视觉树

Web Components：

```html
<custom-card>
  <span slot="title">Hello</span>
</custom-card>
```

Shadow：

```html
<div class="card">
  <slot name="title"></slot>
</div>
```

最终浏览器视觉层级：

```text
card
└ Hello
```

但 Source DOM parent 仍是 custom-card。

---

## 6.2 V2.1 三种关系

每个节点需要能够表示：

```text
sourceParentId
composedParentId
renderParentId
```

三者可能不同。

---

## 6.3 Schema

```ts
interface NodeRelationships {
  sourceParentId?: string
  composedParentId?: string
  renderParentId?: string

  assignedSlotId?: string
  shadowHostId?: string
}
```

---

## 6.4 Source Tree

保留：

```text
Light DOM
Shadow DOM
Slot
Host
```

---

## 6.5 Composed Tree

表达浏览器最终 flattening 后关系。

Render Tree 默认以：

```text
Composed Tree + Layout/Paint Evidence
```

为主要依据。

---

## 6.6 Standard vs CDP

Standard：

- open shadow；
- slot.assignedNodes；
- composed inference。

CDP：

- 使用更完整 flatten/DOMSnapshot 信息。

两者最终归一成同一 `NodeRelationships`。

---

# 7. Geometry Precision Policy

## 7.1 问题

浏览器经常返回：

```text
143.3333282470703px
```

如果 Capture 时直接：

```ts
Math.round()
```

深层嵌套会产生累计误差。

例如：

```text
0.33
+ 0.33
+ 0.33
...
```

最终可能错几像素。

---

## 7.2 原则

W2F IR：

```text
保存浏览器原始 double precision
```

禁止 Capture 层主动整数化。

---

## 7.3 Geometry 类型

```ts
interface Rect {
  x: number
  y: number
  width: number
  height: number
}
```

所有 number：

```text
IEEE-754 double in JS/JSON semantics
```

---

## 7.4 Quantization 只能发生在 Renderer

```ts
interface GeometryQuantizationPolicy {
  mode:
    | "none"
    | "pixel"
    | "half-pixel"
    | "adaptive"

  epsilon: number
}
```

默认建议：

```text
adaptive
```

规则：

- 视觉边界接近整数 → snap；
- transform/percentage 引起的真实 fractional → 保留；
- Text geometry 谨慎；
- raster tile origin 保证像素对齐。

---

## 7.5 Geometry Validation

Figma 写入后：

```text
expected
vs
actual
```

差值：

```text
abs(delta) <= epsilon
```

才认为通过。

---

# 8. Browser Scale Model

与 Geometry Precision 同时预留：

```ts
interface ScaleContext {
  devicePixelRatio: number
  browserPageZoom: number
  cssZoom?: number
  visualViewportScale?: number
}
```

不要混为一个 scale。

V2 首版可不完整处理所有浏览器 zoom 情况，但 Schema 必须区分。

---

# 9. Resource Provenance

不阻塞 NODE-02/03，但建议一并写入资产模型。

```ts
interface ResourceProvenance {
  sourceType:
    | "img"
    | "picture"
    | "css-background"
    | "svg-inline"
    | "svg-external"
    | "blob"
    | "data-url"
    | "canvas"
    | "video-frame"
    | "raster-fallback"

  sourceNodeId?: string
  sourceUrl?: string
  frameOrigin?: string
}
```

用途：

- Debug；
- missing asset；
- fallback explanation；
- future sync。

---

# 10. Accessibility Semantic Model

SourceNode 增加 optional：

```ts
interface AccessibilitySemantics {
  role?: string
  label?: string
  headingLevel?: number
  disabled?: boolean
  checked?: boolean
  expanded?: boolean
}
```

用途：

- Layer naming；
- Section detection；
- component candidate；
- structure QA。

不要求 V2 做完整 accessibility audit。

---

# 11. iframe / Origin Isolation

每个 SourceNode 可保存：

```ts
interface FrameContext {
  frameId: string
  parentFrameId?: string
  origin?: string
  url?: string
}
```

CSS/Stable Identity/Assets 都要知道自己属于哪个 frame。

防止：

```text
两个 iframe 中相同 selector
```

发生错误合并。

---

# 12. SPA / Application State Contract

V2 正式定义 Capture Unit：

> **Current Rendered Application State**

“完整页面”含义：

```text
当前应用状态中
当前已渲染/通过支持的 scroll capture 可获取的内容
```

不自动表示：

- 所有 routes；
- 所有 tabs；
- 所有 modal 状态；
- 所有 accordion；
- 所有分页；
- 所有隐藏 state。

以后可增加：

```text
State Explorer
Route Capture
```

但不纳入当前 V2 Release Gate。

---

# 13. Render Profiles

V2 已有：

```text
High Fidelity
Balanced
Design Friendly
```

V2.1 明确它们本质上是 Renderer Policy Profiles。

```ts
interface RenderPolicy {
  visualWeight: number
  editabilityWeight: number
  structureWeight: number
  rasterThreshold: number
  wrapperReductionLevel: number
  textFragmentLevel: number
}
```

`.wtf` 数据保持一致。

不为不同模式生成不同 capture 文件。

---

# 14. Design-System-Aware Import 预留

后续可增加：

```text
Literal
Create Variables
Match Existing
```

和：

```text
Repeated structure
→ Existing Component match
```

V2 首版不实现自动匹配。

但：

- Token Graph；
- Structural Fingerprint；
- Semantic Role；

已经为它准备数据基础。

---

# 15. Figma Dynamic Page Loading

作为平台约束登记。

后续任何跨页面行为：

```text
find old W2F import
scan styles/components
update existing import
```

不得假设完整 Figma document 已经加载。

实现时：

- 优先 current page；
- 需要指定 page 时显式加载；
- 避免对大型文档无条件 loadAllPages。

---

# 16. Designer Operation Benchmark

自动 QA 外增加人工/半自动任务基准：

```text
1. 修改 Hero 标题
2. 替换 Hero 图片
3. 修改 Card Gap
4. 修改品牌主色
5. Resize section
6. 删除一个 Card
7. Duplicate Card
```

记录：

```text
操作是否自然
是否需解除大量错误 wrapper
是否出现 layout collapse
```

用于评估：

```text
Design Usability
```

---

# 17. Corpus Versioning

正式 Fixture：

```text
必须本地固定版本
```

目录：

```text
benchmarks/corpus/
  corpus-v1/
  corpus-v2/
```

每次 Release：

```text
benchmark corpus version
```

必须写入报告。

真实公网网站：

```text
Compatibility Smoke Test
```

不能作为唯一 regression baseline。

---

# 18. Known Limitations Contract

NODE-00 必须新增：

```text
docs/KNOWN_LIMITATIONS.md
```

至少说明：

- Browser ≠ Figma renderer；
- font rasterization differences；
- unsupported WebGL internals；
- dynamic behavior；
- JS interactions；
- media/container query complete execution；
- protected content；
- browser native controls；
- cross-origin restrictions；
- plugin-active requirement for canvas drop。

Known Limitations 不代表“不做”，而是明确 Release Contract。

---

# 19. `.wtf` V2.1 文件结构补充

在 V2 结构基础上增加：

```text
document.wtf
├ manifest.json
├ document.json
├ source-graph.json
├ render-tree.json
├ styles.json
├ tokens.json                 ← NEW
├ assets.json
├ responsive.json
├ states.json
├ revisions.json              ← NEW
├ diagnostics.json
├ source/
│  ├ cascade.json
│  ├ relationships.json       ← NEW/optional
│  └ metadata.json
├ assets/
├ preview/
├ fallback/
└ checksums.json
```

---

# 20. Manifest V2.1 Capability Flags

至少预留：

```json
{
  "capabilities": [
    "source-tree",
    "composed-tree",
    "render-tree",
    "stable-identity",
    "structural-fingerprint",
    "token-graph",
    "revision-hashes",
    "scroll-roots",
    "responsive-snapshots",
    "geometry-double-precision",
    "pixel-ground-truth",
    "raster-tiles"
  ]
}
```

---

# 21. W2FNode V2.1 概念合并

示意：

```ts
interface W2FSourceNode {
  captureNodeId: string

  stableIdentity: StableIdentity
  structuralFingerprint?: StructuralFingerprint

  relationships: NodeRelationships

  frameContext?: FrameContext
  scrollContainer?: ScrollContainerInfo

  bounds: Rect

  revisionHashes: NodeRevisionHashes

  tokenUsages?: string[]

  semantics?: AccessibilitySemantics

  resourceProvenance?: ResourceProvenance[]
}
```

---

# 22. RenderNode V2.1

```ts
interface W2FRenderNode {
  id: string

  sourceNodeIds: string[]

  componentCandidate?: {
    fingerprint: StructuralFingerprint
    candidateGroupId?: string
  }

  layout: W2FLayout

  renderStrategy: {
    preferred:
      | "native"
      | "emulated"
      | "absolute"
      | "raster"

    confidence: number
    reasons: string[]
  }

  revisionHashes: NodeRevisionHashes
}
```

---

# 23. NODE 修改清单

不新增大量 NODE，避免重新打乱 V2。

---

## NODE-00 增加

必须产出：

```text
KNOWN_LIMITATIONS.md
CAPTURE_SEMANTICS.md
```

并明确：

```text
Full Page
Current Application State
Scroll Root
```

三个概念。

---

## NODE-02 增加

W2F File Spec 必须包含：

- tokens；
- revisions；
- relationships；
- capability flags；
- double precision policy；
- frame context；
- scroll roots。

---

## NODE-03 增加

W2F IR 必须定义：

- Token Graph；
- Structural Fingerprint；
- Revision Hashes；
- NodeRelationships；
- ScrollContainerInfo；
- FrameContext；
- ScaleContext。

---

## NODE-04 增加

Stable Identity 同时实现：

```text
stableNodeId
structuralFingerprint
revision hashes
```

其中 Structural Fingerprint 可先最小实现。

---

## NODE-06 增加

Source Providers 需要识别：

```text
document scroll root
application scroll root
nested scroll roots
```

---

## NODE-08 / 09 增加

Capture 输出：

```text
source parent
composed parent
frame context
scroll context
```

---

## NODE-11 增加

CSS Cascade：

```text
Token Graph
```

至少从 CSS custom properties 建图。

---

## NODE-19 增加

Render Tree Optimizer：

- 参考 composed tree；
- 写 sourceNodeIds；
- 写 structural fingerprint candidate group。

---

## NODE-22~28 增加

Figma Import：

- 保存 revision metadata；
- 保存 stable source mapping；
- 默认 literal token values；
- RenderProfile policy。

---

## NODE-29 / 30 增加

QA：

- Geometry precision；
- Designer operation benchmark；
- corpus version；
- deterministic structural fingerprints。

---

# 24. 当前不做，但预留的 Future NODE

不加入 V2 主路径。

以后需要时新增：

```text
NODE-F01 — Incremental Update Engine
NODE-F02 — Three-Way Merge
NODE-F03 — Figma Variable Mapper
NODE-F04 — Component/Instance Generator
NODE-F05 — Design-System-Aware Import
NODE-F06 — UI State Explorer
NODE-F07 — Route Capture
NODE-F08 — Virtual DOM Stitcher Advanced
```

---

# 25. Release Gate 更新

V2 Release Candidate 除原有要求外，再要求：

### Data

- Token Graph schema 存在；
- Revision metadata 存在；
- Structural fingerprint 存在；
- Scroll Root model 存在；
- Composed tree relation 存在；
- geometry 不在 Capture 阶段粗暴取整。

### QA

- Geometry precision fixture；
- Shadow slot/composed-tree fixture；
- nested scroll fixture；
- CSS variable/token fixture；
- repeated card fingerprint fixture。

---

# 26. 新增必测 Fixture

## Token

```text
CSS Variables
nested aliases
fallback vars
theme vars
```

## Repeated Structure

```text
12 cards
different text/images
same layout
```

应识别同一 structural family。

## Scroll Root

```text
fixed shell
nested main overflow:auto
sticky header
```

## Composed Tree

```text
custom element
shadow root
named slots
slotted content
```

## Precision

```text
percentage grid
1fr / 3 columns
fractional transforms
nested 33.333%
```

---

# 27. V2.1 Schema Freeze 原则

NODE-02/03 完成后：

```text
V2.1 Schema
```

进入 freeze。

以后新增字段：

```text
optional first
```

破坏性变化必须：

```text
major migration
+
ADR
```

不允许在 Browser 和 Figma 两边临时添加不同字段。

---

# 28. 何时可以正式开始编码

完成本 Addendum 后：

> **无需再等待 V3。**

正式进入：

```text
NODE-00
```

NODE-00 完成后：

```text
NODE-01
NODE-02
NODE-03
NODE-04
```

其中 NODE-02/03 以：

```text
V2 Baseline
+
V2.1 Addendum
```

联合约束为准。

---

# 29. 最终决策

W2F 当前架构正式定义为：

```text
Web Source
   ↓
Source Provider
   ↓
Capture Adapter
   ↓
Source Graph
   ├ Stable Identity
   ├ Composed Relationships
   ├ Scroll Roots
   ├ CSS Cascade
   ├ Token Graph
   ├ Revision Hashes
   └ Pixel Ground Truth
   ↓
Responsive Evidence
   ↓
Semantic IR
   ↓
Render Tree Optimizer
   ├ Structural Fingerprint
   └ Section Model
   ↓
.wtf
   ↓
Figma Capability Resolver
   ↓
Render Policy
   ├ Fidelity
   ├ Balanced
   └ Design Friendly
   ↓
Figma Scene
   ↓
Visual / Structure / Editability / Responsive / Precision QA
```

---

# 30. Addendum Definition of Done

本 Addendum 视为完成，当：

- [x] 六项架构级缺口已有正式模型；
- [x] `.wtf` 文件结构有明确预留；
- [x] NODE-02/03 的新增要求明确；
- [x] 不破坏 V2 NODE-00～31 顺序；
- [x] Future 功能不阻塞 V2；
- [x] 后续可直接进入 NODE-00。

---

# 31. 结论

V2.1 的目的不是继续增加功能，而是解决“现在不预留、以后会改 Schema”的问题。

本次正式补入：

```text
Token Graph
Structural Fingerprint
Incremental Merge Metadata
Scroll Root Model
Composed Tree Mapping
Geometry Precision Policy
```

从此之后：

> **架构讨论进入冻结状态。除非 NODE 实施中发现有明确阻塞或官方平台能力发生变化，否则不再通过新增大版本推迟编码。**

下一步正式执行：

```text
NODE-00 — Product Baseline & Acceptance Contract
```
