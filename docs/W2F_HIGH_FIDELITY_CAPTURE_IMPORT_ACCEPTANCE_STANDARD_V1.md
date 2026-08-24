# Web-to-Figma 高保真可编辑网页捕获与导入实施总指令

> 文档定位：**开发指导 + 架构约束 + 验收标准**  
> 适用范围：Browser Extension、`.wtf` 中间格式、Figma Plugin、性能/稳定性/视觉验证  
> 核心原则：**结构化重建，不允许用整页截图冒充 1:1 导入**

---

## 0. 产品最终目标

本项目不是“网页截图导入 Figma”工具。

本项目必须实现：

```text
Browser DOM / CSS / Assets
        ↓
W2F Structured Capture
        ↓
.wtf Intermediate Package
        ↓
Figma Native Editable Reconstruction
```

最终效果要求：

- 浏览器页面视觉结构尽量达到像素级一致。
- 网页 DOM 层级在 Figma Layers 中能够清晰还原。
- 文字优先还原成 Figma `TextNode`。
- 图片必须导入真实图片资源。
- SVG/Icon 必须优先转换为真正矢量节点。
- DIV、Section、Header、Card、Button 等结构必须还原为 Frame / Group / Shape 等 Figma 原生节点。
- 背景色、渐变、边框、圆角、阴影、透明度、混合模式等必须转换为对应 Figma 属性。
- 页面不得整体截图后作为单张图片导入。
- 不允许以空白矩形代替未处理资源。
- 无法完全转换的特殊元素必须有明确的**最小局部降级策略**，并记录原因。
- 视频按照产品需求使用明确的视频占位节点，但必须保存视频尺寸、URL、poster、圆角等元数据。
- `.wtf` 必须保存足够的数据，使导入端在离线状态下也能完成还原。

截图只允许用于：

1. 捕获完成后的 QA 验证。
2. 浏览器端和 Figma 端的视觉 Diff。
3. Canvas/WebGL 等天生为像素表面的特殊节点局部降级。

严禁使用“整页截图作为实际导入内容”的方式完成本项目。

---

# 1. 总体技术架构

数据链路固定设计为：

```text
Browser Page
    ↓
DOM Scanner
CSSOM Scanner
Layout Scanner
Asset Collector
Font Collector
SVG Collector
Pseudo Element Collector
Iframe Collector
    ↓
W2F Capture Scene Graph
    ↓
Normalizer
    ↓
Resource Deduplication
    ↓
Streaming .wtf Writer
    ↓
.wtf
    ↓
Figma Streaming Reader
    ↓
Import Planner
    ↓
Font Resolver
Asset Resolver
Node Builder
Layout Builder
Vector Builder
Text Builder
    ↓
Figma Native Editable Nodes
    ↓
Visual QA / Diff
```

中间必须存在自己的：

```text
W2F Intermediate Representation
```

简称：

```text
W2F-IR
```

浏览器端不得直接按照 Figma API 建模。  
Figma 端也不得直接读取原始 HTML 后随意解析。

两个插件统一通过 W2F-IR 和 `.wtf` Schema 通讯。

这样后续才能稳定升级捕获器和 Figma Renderer。

---

# 2. “1:1”的工程定义

项目中的“1:1”必须同时满足四种 Fidelity：

```text
Visual Fidelity
视觉还原

Structural Fidelity
结构还原

Asset Fidelity
资源还原

Editability Fidelity
可编辑性还原
```

## Visual Fidelity

必须保存：

- viewportWidth
- viewportHeight
- devicePixelRatio
- pageWidth
- pageHeight
- scrollWidth
- scrollHeight
- 浏览器 zoom
- 元素最终 bounding box
- transform matrix
- opacity
- z-index
- stacking context
- clipping
- overflow
- background
- border
- radius
- shadow
- filter
- blend mode

目标不是重新“猜 CSS”。

必须优先读取浏览器已经计算完成的最终结果：

```javascript
getComputedStyle()
getBoundingClientRect()
CSSOM
DOM
```

---

# 3. 浏览器端——完整页面导出

用户点击：

```text
导出完整页面
```

后不能马上开始保存 DOM。

必须首先执行：

```text
PRELOAD_AND_STABILIZE
```

流程：

```text
开始
 ↓
记录 viewport
 ↓
扫描初始 document
 ↓
等待 document.fonts.ready
 ↓
等待首屏图片 decode
 ↓
开始自动滚动
 ↓
触发 lazy-load
 ↓
等待新资源
 ↓
继续滚动
 ↓
检测 scrollHeight 是否变化
 ↓
发现新内容 → 继续
 ↓
到底部
 ↓
反向检查
 ↓
再次检测 scrollHeight
 ↓
连续多个周期稳定
 ↓
回到顶部
 ↓
等待 Layout Stable
 ↓
开始最终 DOM/CSS 捕获
```

不能只执行一次：

```javascript
window.scrollTo(0, document.body.scrollHeight)
```

必须使用分段滚动。

建议：

```text
step ≈ viewportHeight × 0.7~0.9
```

每段执行：

```text
scroll
→ requestAnimationFrame
→ resource wait
→ img.decode
→ MutationObserver settle
→ layout settle
```

直到以下指标连续若干周期保持稳定：

```text
scrollHeight
DOM node count
resource count
```

---

# 4. Lazy Load 内容

必须支持：

```html
loading="lazy"
data-src
data-srcset
IntersectionObserver
background-image lazy load
dynamic components
```

滚动不是为了截图。  
滚动只是为了强制网页把本应该加载的内容真正加载出来。

完成加载后必须返回顶部，并重新计算最终 Layout。

---

# 5. Virtualized List

必须专门处理：

```text
React Virtualized
React Window
虚拟瀑布流
虚拟表格
虚拟列表
```

这类页面即使滚动到底部，DOM 中仍然可能只有屏幕附近的元素。

不能简单依赖最终 DOM。

需要实现：

```text
Scroll Segment Capture
```

滚动过程中持续记录：

```text
element fingerprint
content
computed style
document coordinates
asset references
```

随后进行：

```text
segment merge
deduplicate
position merge
```

避免由于 DOM 节点复用导致大量内容丢失。

---

# 6. 浏览器端元素选择导出

用户点击：

```text
选择区域导出
```

不能实现成截图式框选。

必须实现：

```text
DOM Element Picker
```

类似 Chrome DevTools 元素选择器。

鼠标移动时使用：

```javascript
document.elementsFromPoint(x, y)
```

寻找实际 DOM 元素，并显示：

```text
hover outline
element tag
class
width × height
```

用户点击后锁定：

```text
TargetElement
```

必须捕获：

```text
TargetElement 本身
TargetElement children
TargetElement descendants
::before
::after
background
SVG
images
fonts
external assets
clipping
shadows
transform
```

如果目标元素自身包含：

```css
overflow: scroll;
overflow: auto;
```

需要检查：

```text
scrollWidth
scrollHeight
```

并尝试捕获整个内部内容，而不仅是当前可见区域。

最终 `.wtf` 的 root：

```text
type = ELEMENT
```

完整页面：

```text
type = PAGE
```

---

# 7. DOM Scene Graph

每个网页节点建立自己的 W2F Node。

示意：

```json
{
  "id": "w2f_xxxx",
  "parentId": "w2f_parent",
  "tag": "div",
  "semanticRole": "container",
  "name": "hero-card",
  "bounds": {},
  "style": {},
  "layout": {},
  "text": null,
  "assetRefs": [],
  "children": []
}
```

禁止只记录：

```text
x
y
width
height
```

至少需要记录：

```text
DOM relation
layout data
computed style
source style metadata
resource references
text runs
stacking
clip
transform
```

---

# 8. CSS 必须捕获的内容

至少覆盖：

```text
display

position
top/right/bottom/left

width/height
min/max width
min/max height

margin
padding
gap

flex
grid

align-items
justify-content
align-content

font-family
font-size
font-weight
font-style
line-height
letter-spacing
text-align
text-decoration

color

background-color
background-image
linear-gradient
radial-gradient

border
border-width
border-style
border-color

border-radius

box-shadow
text-shadow

opacity

transform
transform-origin

overflow

clip-path

mask

filter

mix-blend-mode

object-fit
object-position

z-index
```

同时保存 CSS Variables 的 resolved value。

捕获阶段必须解析为最终值，不能要求 Figma 再次解释：

```text
var(--color-primary)
```

---

# 9. Figma 图层结构

网页：

```html
<body>
  <header />
  <main>
    <section>
      <div>
        <img />
        <span />
      </div>
    </section>
  </main>
</body>
```

Figma Layers 应尽量成为：

```text
PAGE
└─ body
   ├─ header
   └─ main
      └─ section
         └─ div
            ├─ img
            └─ span
```

图层名称不能全部是：

```text
Frame 1
Frame 2
Rectangle 1
```

应当根据：

```text
tag
id
class
aria-label
role
semantic type
```

生成有意义的名称。

例如：

```text
header.navbar
section.hero
div.product-card
img.product-cover
text.product-title
button.buy-now
```

---

# 10. Figma Layout 策略

不能为了“看起来高级”强行全部转换成 Auto Layout。

第一目标是：

```text
视觉位置准确
```

因此默认使用：

```text
Nested Frame + Absolute Geometry
```

当系统能够确认：

```text
Flexbox → Auto Layout
```

不会造成位置变化时，再转换为 Figma Auto Layout。

必须遵循：

```text
Layout Fidelity First
Semantic AutoLayout Second
```

---

# 11. Text 文字处理

正常网页文字必须优先创建 Figma `TextNode`。

必须保存：

```text
characters
font-family
font-style
font-weight
font-size
line-height
letter-spacing
text-align
text-decoration
color
opacity
```

如果一个 DOM Text Node 中存在不同字体、不同粗细、不同颜色等样式，不能压平成一个统一样式。

必须形成：

```text
Text Runs
```

并在 Figma 中通过 Range API 分段设置。

---

# 12. 字体策略

浏览器端需要建立：

```text
FontManifest
```

保存：

```text
family
style
weight
stretch
source URL
format
hash
CSS declaration
```

`.wtf` 可以保存网页实际字体资源，用于归档、验证和后续字体解析，但不能假设 Figma Plugin 能直接注册任意网络字体。

导入时使用：

```text
FontResolver
```

三级策略。

### Level A

Figma 已存在完全相同的：

```text
family
style
weight
```

则直接创建 `TextNode`，达到：

```text
Editable + Fidelity
```

### Level B

字体不存在，但可以找到可靠映射。

允许创建 `TextNode`，但 `ImportReport` 必须明确显示发生字体替换。

### Level C

目标字体在 Figma 完全不存在。

不能悄悄使用 Arial / Inter 替换。

需要生成：

```text
Visual Glyph Layer
+
Editable Text Metadata Layer
```

保证视觉效果尽可能准确，同时保留原始：

```text
text
font
style
position
```

数据。

用户安装/启用对应字体后，可以执行：

```text
Relink Font
```

重新转换为真正可编辑 TextNode。

不能谎称在字体不可用时仍可无条件同时实现：

```text
100% 像素一致
+
100% 文字编辑
```

---

# 13. 图片

网页 `<img>`：

不能做：

```text
灰色矩形
空白 Rectangle
URL 文本
```

必须下载实际资源。

`.wtf` 保存：

```text
original bytes
mime
width
height
hash
source URL
```

使用：

```text
SHA-256
```

资源去重。

同一个 Logo 出现 40 次，`.wtf` 只保存一次资源，所有节点通过 `assetHash` 引用。

---

# 14. 超大图片

不能把超大图片简单缩放。

建立：

```text
ImageTiler
```

如果图片超过 Figma 单张图像允许范围，自动分片。

Figma 中建立：

```text
ImageContainer
├─ tile-0-0
├─ tile-0-1
├─ tile-0-2
...
```

外层保持：

```text
原始 width
原始 height
clip
object-fit
object-position
```

视觉上必须仍然是一张完整图片。

---

# 15. SVG / 图标

SVG 不能全部 rasterize。

优先：

```text
SVG → Figma Vector
```

保留：

```text
path
fill
stroke
opacity
gradient
mask
transform
```

对于：

```html
<svg>
  <path />
  <circle />
  <rect />
</svg>
```

必须作为矢量结构导入。

图标字体需要识别并优先转换为：

```text
Vector Glyph
```

同时保留：

```text
unicode
font-family
font metadata
```

---

# 16. CSS `::before` / `::after`

必须检测：

```javascript
getComputedStyle(el, "::before")
getComputedStyle(el, "::after")
```

如果存在有效：

```text
content
background
border
shape
image
```

必须生成专门节点：

```text
element
├─ ::before
├─ content
└─ ::after
```

不能丢失。

---

# 17. Gradient

CSS：

```css
linear-gradient(...)
radial-gradient(...)
```

优先映射成 Figma Gradient Fill。

不能截图代替。

---

# 18. Shadow

```css
box-shadow
```

解析：

```text
offsetX
offsetY
blur
spread
color
inset
```

映射：

```text
DROP_SHADOW
INNER_SHADOW
```

如果 Figma 和 CSS 对某个参数语义不完全一致：

- 保留原始 CSS metadata。
- 采用最接近的视觉实现。
- 在必要时记录降级原因。

---

# 19. Border / Radius

必须支持：

```text
四边不同 border
四角不同 radius
```

不能简单统一为：

```text
stroke = 1
cornerRadius = 8
```

如果 Figma 单节点无法精确表示，使用子 Shape 实现。

---

# 20. CSS Transform

必须保存：

```text
translate
scale
rotate
skew
matrix
matrix3d
transform-origin
```

转换成 Figma：

```text
relativeTransform
rotation
geometry
```

不能忽略 transform。

---

# 21. `position: fixed / sticky`

完整页面捕获前经过 Lazy Load 滚动后，必须回到顶部，再执行最终布局解析。

Fixed：作为独立 overlay 节点保存一次。

Sticky：需要记录：

```text
normal-flow position
sticky CSS metadata
capture state
```

禁止因为滚动捕获导致同一个 Header 被重复几十次。

---

# 22. iframe

对 iframe 采用分级方案。

### 可注入 iframe

Browser Extension 使用：

```text
all_frames
host_permissions
content script
message passing
```

对 Frame 内 DOM 单独捕获，然后挂载到 iframe W2F Node。

### 无法访问的 sandbox / 特殊 iframe

必须明确标记：

```text
UnsupportedEmbeddedContext
```

不能产生空白。

允许对该 iframe 元素本身执行局部视觉降级，同时保存：

```text
src
bounds
sandbox
allow
title
metadata
```

这属于特殊节点降级，不属于“整页截图导入”。

---

# 23. Canvas

HTML Canvas 本身就是一个像素绘制表面。

不能虚构里面不存在的 DOM。

因此 Canvas 允许转为：

```text
Canvas Bitmap
```

作为 Image Fill 导入。

外层 `Canvas Frame` 必须保持：

```text
尺寸
位置
clip
transform
opacity
metadata
```

这是正常语义映射，不是敷衍截图。

---

# 24. WebGL

同 Canvas：

```text
WebGL framebuffer
→ bitmap resource
```

外层结构仍可编辑。

不得因此把整个网页 rasterize。

---

# 25. Video

按照产品需求：

```text
Video → Placeholder
```

占位符必须至少包含：

```text
poster
video icon
width
height
border-radius
background
source URL
duration（能够获取时）
controls metadata
autoplay metadata
```

图层名称建议：

```text
VIDEO — xxx.mp4
```

让设计师明确知道这里原来是什么。

---

# 26. `<picture>` / `srcset`

必须解析浏览器当前真正选中的：

```javascript
HTMLImageElement.currentSrc
```

而不是只保存 `src`，以保证导出的图片就是当前页面真实使用的版本。

---

# 27. Background Image

不能只处理 `<img>`。

还必须捕获：

```css
background-image: url(...)
```

资源进入统一 `AssetManifest`，然后映射为 Figma Image Fill。

---

# 28. 动画

必须增加：

```text
Capture Freeze
```

捕获时确定一个稳定状态。

对于：

```text
CSS Animation
Transition
GIF
Lottie
```

必须记录：

```text
type
source
capture state
```

默认捕获当前稳定视觉状态，避免滚动过程中动画不断变化导致 layout unstable。

---

# 29. `.wtf` 文件格式

`.wtf` 不能只是一个巨大 JSON。

建议作为 ZIP-compatible container，例如：

```text
example.wtf

manifest.json

document/
  meta.json

nodes/
  000001.jsonl
  000002.jsonl
  000003.jsonl

styles/
  styles.json

fonts/
  manifest.json
  assets/...

assets/
  sha256_xxx.png
  sha256_xxx.webp
  sha256_xxx.svg

frames/
  manifest.json

qa/
  metadata.json
```

生产版可以不写入完整 QA 截图。

---

# 30. `.wtf` 必须支持 Streaming

严禁：

```javascript
JSON.stringify(entirePage)
```

然后一次塞进内存。

浏览器捕获：

```text
DOM Walker
 ↓
Node Buffer
 ↓
Chunk
 ↓
Compression Stream
 ↓
.wtf
```

每个 Chunk 建议数百到数千 nodes，具体由 Benchmark 决定。

资源也必须：

```text
download
→ hash
→ write
→ release memory
```

不能等所有图片下载完成后一起 ZIP。

---

# 31. 资源去重

建立：

```text
Content Addressed Asset Store
```

Key：

```text
SHA-256(asset bytes)
```

避免同一资源重复出现时把 `.wtf` 体积成倍放大。

---

# 32. Figma 大文件导入架构

这是必须重点实施的模块。

禁止：

```text
读取整个 .wtf
→ 全量 parse
→ 一次创建所有节点
```

必须：

```text
File.stream()
 ↓
WTFReader
 ↓
Manifest
 ↓
Chunk Iterator
 ↓
Import Scheduler
 ↓
Node Batch
 ↓
Figma API
 ↓
release
```

采用 Producer / Consumer 模型。

---

# 33. Import Scheduler

建立：

```text
ImportScheduler
```

负责：

```text
batch size
priority
memory pressure
asset loading
font loading
node creation
yield
retry
progress
```

流程：

```text
读取 1 个 chunk
 ↓
解析
 ↓
创建少量 Figma nodes
 ↓
提交
 ↓
释放 JS 对象
 ↓
yield event loop
 ↓
读取下一 chunk
```

绝对不能持续同步执行几万、十几万个节点。

---

# 34. Backpressure

建立：

```text
BackpressureController
```

如果：

```text
pending assets ↑
pending node jobs ↑
batch duration ↑
memory estimate ↑
```

立即暂停读取，等 Consumer 消化完再继续。

---

# 35. Adaptive Batch

不能写死：

```text
1000 nodes/batch
```

系统根据：

```text
平均节点复杂度
图片数量
SVG复杂度
最近一次 batch duration
```

自动调整。

例如：

```text
simple node → batch 增大
SVG/image heavy → batch 减小
```

---

# 36. Yield

必须周期性：

```javascript
await new Promise(resolve => setTimeout(resolve, 0))
```

或者等价异步 yield。

避免：

```text
Plugin UI 冻结
Figma 无响应
Watchdog timeout
```

---

# 37. Import Passes

导入建议分阶段。

### PASS 1

创建结构：

```text
Frame
Group
basic Shape
```

### PASS 2

创建：

```text
Text
Image
SVG
```

### PASS 3

应用：

```text
effects
mask
clip
complex style
```

### PASS 4

修正：

```text
layer order
constraints
relationships
```

### PASS 5

执行 validation。

避免节点创建时存在大量前后依赖。

---

# 38. 图片加载队列

不能：

```javascript
Promise.all(5000Images)
```

必须建立：

```text
ImageQueue
```

并限制并发，例如 2~8，具体由 Benchmark 确定。

完成后立即释放 source bytes。

---

# 39. Font Loading

必须去重。

例如页面包含：

```text
Inter Regular × 20000 text nodes
```

字体加载只能缓存并复用同一个 Promise。

建立：

```text
FontPromiseCache
```

---

# 40. Import Progress

Figma Plugin UI 必须显示真实进度。

例如：

```text
正在解析文件 12%
正在创建页面结构 28%
正在导入文字 46%
正在导入图片 63%
正在创建 SVG 75%
正在处理效果 88%
正在验证 96%
完成 100%
```

同时显示：

```text
Nodes
Images
Vectors
Texts
Fonts
Warnings
Memory mode
```

禁止用户面对一个无限 Loading 圈。

---

# 41. Import Report

完成后必须生成：

```text
Import Report
```

示例：

```text
Total nodes        18,426
Editable nodes     18,102

Text               4,216
Images               963
SVG                  287

Fonts resolved        14
Fonts substituted      2

Canvas fallback        3
Video placeholder      2
Iframe fallback        1

Errors                 0
Warnings               8
```

任何降级必须透明。

---

# 42. Capture Report

Browser Export 同样生成：

```text
Capture Report
```

至少统计：

```text
DOM nodes
Captured nodes
Images
Background images
SVG
Fonts
Pseudo elements
iframes
canvas
video
Lazy load passes
Page height
Asset size
Compressed size
```

---

# 43. 视觉验证系统

“看起来差不多”不能作为验收。

浏览器端允许生成：

```text
Reference Render
```

但该截图只用于测试，不能作为正常 Figma 内容。

Figma 导入完成后执行：

```text
Browser Reference
vs
Figma Render
```

进行：

```text
Visual Diff
```

建议指标包含：

```text
pixel difference
SSIM
layout difference
text bounding-box difference
asset missing count
```

---

# 44. Visual Diff 分块

对于超长页面不要生成一个巨大位图。

必须分块比较，例如：

```text
tile 2048×2048
```

或其他由 Benchmark 确认的合适尺寸。

这样 QA 也不会内存溢出。

---

# 45. 结构验证

除了 Pixel Diff，还必须验证：

```text
Browser DOM Node
↔
W2F Node
↔
Figma Node
```

建立：

```text
sourceNodeId
```

最终 Figma Plugin Data 保存：

```text
w2f.sourceNodeId
w2f.tag
w2f.class
w2f.sourceBounds
```

方便追踪问题。

---

# 46. Editability 验收

不能只看截图。

必须自动统计：

```text
TEXT → TextNode
IMG → Image Fill
SVG → Vector
DIV → Frame
background → Fill
border → Stroke
shadow → Effect
```

普通 DOM 网页主体不能出现：

```text
One giant Rectangle
+
One giant Screenshot
```

一旦出现即视为：

```text
FAILED
```

---

# 47. 局部降级原则

只允许特殊元素局部降级：

```text
Canvas
WebGL
无法访问的 sandbox iframe
不支持的复杂滤镜
特殊 DRM 内容
```

降级必须满足：

```text
只降级最小子树
```

例如：

```text
页面
 ├─ Header       Native
 ├─ Hero         Native
 ├─ WebGL        Bitmap
 ├─ Cards        Native
 └─ Footer       Native
```

绝不能因为一个 WebGL 就让整个页面变成 Screenshot。

---

# 48. 不允许空白替代

任何已捕获到的：

```text
图片
SVG
图标
背景
Canvas
iframe
```

不得静默变成空白 Rectangle。

资源失败时必须 retry。

仍失败：

```text
visible error placeholder
+
ImportReport warning
+
原 URL/hash metadata
```

让问题可以定位。

---

# 49. 浏览器捕获异常重试

资源下载必须有 Retry Policy。

至少考虑：

```text
timeout
HTTP error
extension permission
CORS
temporary network error
```

Browser Extension 应优先利用 `host_permissions` 进行资源获取。

---

# 50. `.wtf` 完整性

Manifest 必须包含：

```text
schemaVersion
generatorVersion
captureTime
captureMode
sourceURL
viewport
documentSize
nodeChunkCount
assetCount
assetManifest
fontManifest
checksums
```

所有重要文件使用 SHA-256 验证。

导入损坏文件时，不能做到一半才突然报错。

首先执行：

```text
preflight
```

检测。

---

# 51. Schema Version

从现在开始建立：

```text
WTF_SCHEMA_VERSION
```

Figma Importer 必须建立：

```text
Schema Adapter
```

未来才能兼容旧 `.wtf` 文件。

---

# 52. Browser Capture Pipeline

代码层建议拆成：

```text
capture/
  page-stabilizer
  scroll-controller
  virtual-list-observer
  dom-scanner
  style-scanner
  layout-scanner
  asset-collector
  font-collector
  svg-collector
  iframe-collector
  media-collector
  scene-builder
  validator

wtf/
  schema
  writer
  asset-store
  compressor
```

禁止全部堆在 `content-script.ts` 一个文件里。

---

# 53. Figma Import Pipeline

建议：

```text
import/
  reader
  preflight
  scheduler
  backpressure
  font-resolver
  asset-resolver

renderer/
  frame-renderer
  text-renderer
  image-renderer
  svg-renderer
  border-renderer
  gradient-renderer
  effect-renderer
  mask-renderer

validation/
  structural-validator
  visual-validator
  import-report
```

---

# 54. 页面级测试样本

必须建立正式 Fixture。

至少包含：

```text
普通 Landing Page
超长页面
电商首页
瀑布流页面
大量图片页面
大量文字页面
SVG 图标页面
Gradient/Shadow 页面
Flex 页面
Grid 页面
Sticky Header 页面
Lazy Load 页面
Virtualized List 页面
Iframe 页面
Canvas 页面
WebGL 页面
超大图片页面
复杂中文网页
```

不能只用一个简单 Demo 页面测试成功以后就宣布完成。

---

# 55. 当前参考页面的验收

针对类似用户提供的超长灵感素材页面，必须确认：

```text
顶部 Logo
导航
登录按钮
搜索框
首屏分类内容
所有图片
所有 SVG
所有文字
瀑布流卡片
多列布局
图片比例
卡片间距
中间标题区域
收藏整理区域
缩略图
标签
文字
底部登录模块
二维码
输入框
按钮
页脚
```

均进入 `.wtf`。

Figma 导入后 Layers 面板必须看到实际层级。

用户点击标题，应选中 Text。  
点击卡片图片，应选中带 Image Fill 的节点。  
点击 SVG icon，应选中 Vector。  
点击卡片容器，应选中 Frame。

而不是选中：

```text
Screenshot.png
```

---

# 56. 性能等级

必须建立几个测试等级：

```text
S
普通元素页面

M
5,000 nodes

L
20,000 nodes

XL
50,000 nodes

XXL
100,000+ nodes
```

每一级记录：

```text
capture time
wtf size
peak browser memory
import time
peak importer memory
node creation rate
asset count
warning count
```

优化必须以 Benchmark 为依据。

---

# 57. 大文件设计原则

后续所有代码 Review 都必须检查：

```text
有没有一次读取全部文件？
有没有一次 JSON.parse 整个文件？
有没有 Promise.all 大量图片？
有没有缓存所有 image bytes？
有没有缓存所有 nodes？
有没有重复字体加载？
有没有重复图片？
有没有超大 postMessage？
有没有长时间阻塞主线程？
```

存在则不能合并。

---

# 58. GitHub 提交规则

这是强制要求。

**每完成一个独立实施步骤，立即提交 GitHub。**

不能完成多个 NODE 后一次性提交。

开发流程固定：

```text
实现一个小节点
↓
运行 test
↓
运行 lint
↓
运行 typecheck
↓
运行相关 benchmark
↓
更新实施状态文档
↓
git add
↓
git commit
↓
git push
↓
开始下一个节点
```

Commit 必须清晰，例如：

```text
feat(capture): add page stabilization pipeline
feat(capture): add lazy-load scroll controller
feat(wtf): add streaming archive writer
feat(figma): add streaming wtf reader
```

不要使用：

```text
update
fix things
misc
final
```

---

# 59. 每一步必须有测试

禁止：

```text
代码写完
→ commit
```

必须：

```text
实现
→ 测试
→ 验证
→ commit
```

发现测试失败，不得把失败状态提交为“已完成”。

---

# 60. 推荐实施顺序

接下来严格按照以下顺序开发：

```text
NODE-W2F-01  定义 Fidelity Contract
NODE-W2F-02  定义 W2F-IR Scene Graph
NODE-W2F-03  定义 WTF Schema V2
NODE-W2F-04  Page Stabilizer
NODE-W2F-05  Lazy Load Scroll Controller
NODE-W2F-06  DOM + Computed Style Scanner
NODE-W2F-07  Geometry + Stacking Scanner
NODE-W2F-08  Pseudo Element Scanner
NODE-W2F-09  Asset Collector
NODE-W2F-10  SVG Collector
NODE-W2F-11  Font Manifest
NODE-W2F-12  Iframe / Canvas / Video Strategy
NODE-W2F-13  Element Picker
NODE-W2F-14  Element Subtree Capture
NODE-W2F-15  Virtualized Content Capture
NODE-W2F-16  Streaming WTF Writer
NODE-W2F-17  Deduplicated Asset Store
NODE-W2F-18  WTF Preflight Validator
NODE-W2F-19  Figma Streaming Reader
NODE-W2F-20  Import Scheduler
NODE-W2F-21  Backpressure Controller
NODE-W2F-22  Frame Renderer
NODE-W2F-23  Text Renderer
NODE-W2F-24  Font Resolver
NODE-W2F-25  Image Renderer
NODE-W2F-26  Large Image Tiler
NODE-W2F-27  SVG Vector Renderer
NODE-W2F-28  Gradient/Border/Shadow Renderer
NODE-W2F-29  Transform/Mask Renderer
NODE-W2F-30  Layer Hierarchy Reconstruction
NODE-W2F-31  Import Report
NODE-W2F-32  Browser Capture Report
NODE-W2F-33  Structural Fidelity Validator
NODE-W2F-34  Visual Diff Validator
NODE-W2F-35  Large Page Benchmark
NODE-W2F-36  50K Node Stress Test
NODE-W2F-37  100K Node Stress Test
NODE-W2F-38  Production Hardening
```

**每一个 NODE 独立完成、测试、记录、Commit、Push。**

---

# 61. Definition of Done

任何 NODE 只有同时满足：

```text
implementation complete
unit test pass
integration test pass
lint pass
typecheck pass
related regression pass
documentation updated
GitHub commit created
GitHub push completed
```

才能标记：

```text
DONE
```

否则必须保持：

```text
IN_PROGRESS
```

---

# 62. 最终产品验收标准

系统最终必须能够完成：

```text
真实线上网页
↓
浏览器插件
↓
导出完整页面 .wtf
↓
离线
↓
Figma Plugin
↓
拖入 .wtf
↓
结构化重建
```

并且：

```text
网页文本
→ Figma Text

网页图片
→ Figma Image Fill

网页 SVG
→ Figma Vector

网页容器
→ Figma Frame

网页 Border
→ Figma Stroke

网页 Background
→ Figma Fill

网页 Gradient
→ Figma Gradient

网页 Shadow
→ Figma Effect

网页 DOM hierarchy
→ Figma Layer hierarchy
```

只有：

```text
Canvas
WebGL
无法访问的特殊 iframe
Figma 本身不支持的浏览器渲染能力
```

允许最小粒度局部降级。

---

# 63. 最高优先级开发原则

以后 Codex 在做任何实现决策时按以下优先级排序：

```text
1. 不丢内容
2. 不出现空白
3. 保持结构
4. 保持可编辑
5. 保持视觉
6. 控制内存
7. 控制文件大小
8. 提高速度
```

但“视觉”和“可编辑”发生冲突时：

普通 DOM：

```text
优先寻找原生 Figma 实现
```

特殊浏览器渲染能力：

```text
只允许最小局部降级
```

不能选择整页截图作为捷径。

---

# 64. 明确禁止的实现

以下任何方案一旦出现，都必须停止并重构：

```text
❌ 整页 screenshot → Figma
❌ Element screenshot → Figma
❌ 图片全部空白 Rectangle
❌ SVG 全部 PNG
❌ Text 全部 outline
❌ 不解析 DOM hierarchy
❌ 所有元素都扁平化到一层
❌ 一个超大 JSON 保存整个页面
❌ Figma 一次加载整个 .wtf
❌ Promise.all 导入几千图片
❌ 一次创建数万个 Figma nodes
❌ clientStorage 保存 .wtf
❌ 资源失败后静默忽略
❌ 字体不存在时静默换字体
❌ 只凭肉眼判断“差不多”
❌ 为赶进度降低验收标准
```

---

# 65. Codex 工作方式

执行本任务时，不要向非技术用户要求参与编码、调试或架构决策。

应主动：

```text
读取现有仓库
读取 Architecture 文档
读取 Implementation Plan
读取 Implementation Status
读取本开发指导与验收标准
判断当前节点
实施代码
补测试
运行测试
修复
更新状态
提交 GitHub
继续下一节点
```

遇到工程问题优先自行：

```text
调查代码
查官方文档
修改实现
增加测试
```

不要因为实现困难直接降低为截图方案，也不要未经说明改变已经确认的最终产品要求。

最终目标始终是：

> **将真实网页的 DOM、布局、文字、颜色、图片、SVG、图标和可映射视觉效果，重建为具有真实网页结构的 Figma 可编辑图层；`.wtf` 是结构化离线中间格式，而不是图片容器。**

---

# 66. 文档优先级与冲突处理

本文件作为 Web-To-Figma 后续开发中的**产品级高保真导入指导与验收标准**。

当其他历史实现文档与本文件在以下问题上发生冲突时，应以本文件的产品目标为上位约束：

- 是否允许整页截图作为主要导入方式；
- 是否必须保留网页结构；
- 是否必须保持文本、图片、SVG 等节点可编辑；
- 是否允许资源静默丢失或空白替代；
- 是否必须处理大文件内存与流式导入；
- 是否必须执行结构、资源、视觉和可编辑性验收；
- 是否要求每一个独立开发步骤单独 Commit / Push。

如果与已经冻结的 Architecture Baseline 存在实现层冲突，不得静默绕过。必须：

1. 记录具体冲突。
2. 判断是实现细节冲突还是产品目标冲突。
3. 若只是实现细节，采用满足本验收标准且兼容现有架构的方案。
4. 若涉及架构级变更，新增 ADR / Addendum 后再实施。
5. 不允许通过降低 1:1、可编辑性、资源完整性或大文件稳定性标准来规避冲突。
