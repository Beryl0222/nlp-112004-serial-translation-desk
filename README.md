# 连载译稿的叙事视角与读者可见性

虚构小说《漂灯手记》的版权方提供三回原稿、地区译文、用语简报及读者区发行日志。handles 是用语简报里的可能称谓，editorOnly 是仅给编校的人物背景，不参与公开版。分回号用于叙事顺序，发行另有各区的实际批次。

## 本地资料

全部为 UTF-8 编码的合成业务资料。`data/contract.json` 中的列类型带 `?` 时可以是 JSON null。每组记录的 `id` 在该组中唯一，跨组关系以字段说明和清单的 `links` 为准。文字字段保留来源原句，嵌套对象按表中现有格式记录。

- `data/chapters.json`。书稿的一段或编辑附注。pointOfView 记录原作标明的叙事视角，序号有回内和回间两级。
- `data/lexicon.json`。编校部用语简报。visibleAfter 为可引用的原作锚点，为 null 时仍须按读者视角使用。
- `data/translations.json`。地区主编收到的译稿和修订，links 是供编校核看的提议原作对应。
- `data/issues.json`。发行日志，requires 指编辑登记的必读原作锚点。state 为已发、撤下、编辑中；at 为记录时间。
- `data/editorial.json`。编辑部意见。related 是涉及的已知稿件。

## 使用约定

各地区发行日志的晚记录可以对同一稿件改变可见状态。已发资料在其发放时实际可见，撤回不等于从未可见。文字和边注区分读者版与仅编辑可见的用语简报。原稿的回内顺序只对原作有效，译文并段后依然允许一段对应多个原锚点。读者的订阅地区可以不同，复核地区发行时间取本地记录的时区。

## 读取与检查

使用 Node.js 22.23.4，依赖仅用 Node.js 标准库。资料检查依次读入各组 JSON，检查列类型、组内编号及已登记的组间引用，并列出各组记录数。读取入口为 `tools/materials.mjs`，可单独读取一组记录，或读取整个已登记资料包。

```sh
npm run check-data
npm test
```

## 叙事视角与读者可见性编校

在读取层之上另有一组纯函数模块，围绕「身份何时可定论、读者此刻读到什么」组织：

- `tools/story.mjs`。原作锚点的回内/回间顺序、`visibleAfter` 揭示点、视角人物与仍成立的候选人物。揭示点未到前身份只能保持多解；`visibleAfter` 为 null 的词条没有定论时刻。
- `tools/glossary.mjs`。编校维护的跨语言词面表与扫描器，把真名/称谓映射到 en、es 译稿实际词面，并识别原作的多解线索（如「不只一位」「不能排除」）与职务泛称口吻。
- `tools/review.mjs`。单稿双闸门审查——故事位（链接锚点是否已到揭示点）与读者位（该区是否实际可读揭示锚点）。结论分级：
  - `PREMATURE_IDENTITY`（blocker，分 `story`/`region` 闸门）、`CLOSED_ALTERNATIVE`（blocker，排除了原作仍允许的候选）、`COMBINED_DEANON`（blocker，跨稿合看完成指认）；
  - `CLUE_DROPPED`、`UNRESOLVED_REVEAL`（warning，丢线索或以「已证实」口吻写译注）；
  - `AMBIGUITY_RETAINED`、`GENERIC_HANDLE`、`VOICE_HANDLE`、`CLUE_PRESERVED`（info，区分真歧义、职务泛称与身份已定后的口吻保留）。
- `tools/visibility.mjs`。地区发行台账：晚记录覆盖可见状态、可见窗口、可读锚点汇总、前置要求评估与撤下回退级联（未发附注降回待审，已发内容标「读者可能已经知情」，撤回不抹历史窗口）。
- `tools/catalog.mjs`。读者安全目录与编辑侧分层视图；`assertNoEditorLeak` 自检 `editorOnly` 释义不进入读者输出。
- `tools/replay.mjs`。按时间线回放某区实际可见顺序、每步争议译法、前置缺口与仍须校改范围。
- `tools/desk.mjs`。修订批准（允许跨区不同词形，拒绝区内身份/线索矛盾）与同锚点跨区词形对照。

命令行入口（时刻可选，默认取资料末日后的固定时刻）：

```sh
npm run desk -- catalog <地区> [时刻]     # 读者安全目录（含 editorOnly 泄漏自检）
npm run desk -- review  <地区> <译稿id>   # 单稿双闸门审查
npm run desk -- corpus  <地区> <译稿id...># 跨稿合看（译注与正文连着看）
npm run desk -- replay  <地区> [时刻]     # 发行回放
npm run desk -- prereq  <地区>            # 前置章节/必读附注评估
npm run desk -- withdraw <地区> <撤下发行id> # 撤下回退级联
npm run desk -- approve <地区> <译稿id>   # 修订批准
npm run desk -- wording <原作锚点>        # 跨区词形对照
```
