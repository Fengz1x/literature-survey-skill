# 项目文件与命令

Python 3.10+，无第三方运行依赖；Node.js只用于仓库自检。HTML内嵌数据、CSS和JS，离线可浏览，外部论文链接需要网络。检索与全文阅读使用 AI 环境已有的搜索、浏览、PDF工具；无网络时记录缺口，不伪造文献。

## 文件

| 文件 | 内容 |
|---|---|
| project.json | 标题、范围、年份、截止、确认来源、分类树、简短覆盖限制 |
| papers.json | 去重、初筛与分类后的唯一论文实体列表 |
| analyses.json | 按方法组ID索引的精读分析；尚未精读时为 `{}` |
| state.json | 当前阶段、已确认的决定、选定分支；继续时先读 |
| search-log.json | 查询、来源、年份/轨道、分页与访问缺口 |
| pdfs/ | 可选本地全文；不默认放入Git仓库或分发 |

## project.json

```json
{
  "schema_version": 1,
  "title": "研究调研",
  "scope": "研究对象、任务与准入边界",
  "start_year": 2024,
  "cutoff": "2026-11-05",
  "sources": [{"id":"source-a","label":"来源A","url":"https://example.org/","tracks":"已确认轨道","reason":"官方scope与代表作依据"}],
  "taxonomy": [{"id":"scene-a","label":"场景A","children":[{"id":"object-a","label":"对象A","children":[{"id":"method-a","label":"方法A"}]}]}],
  "level_labels": ["场景","对象","方法","细分"],
  "filter_fields": [],
  "limitations": ["检索覆盖简述"]
}
```

以上是结构示例，不是真实来源推荐。分类树深度任意，每个兄弟节点ID唯一；论文路径必须走到一个叶节点。前三层分别为场景/对象/方法；必要的更多细分位于其后。不靠节点名称推断机制。`filter_fields` 控制适用的独立筛选：模型领域可设为 `["impl","training"]`，非模型领域按需启用或留空，不显示无意义的训练/实现筛选。新建项目默认留空。

## papers.json

每项至少包含：

| 字段 | 要求 |
|---|---|
| id, title, url | 稳定实体ID、完整题名、可追溯来源URL |
| pool | core / preprint，互斥 |
| source_id | core必须在已确认sources中；预印本可为null |
| publication_date | 正式池年度图使用；YYYY / YYYY-MM / YYYY-MM-DD，不猜精度 |
| first_public_date | 预印本年度图使用；同上 |
| date_source | 所用日期的依据；可为URL或带来源定位的说明 |
| window_evidence | 所用日期未知时，说明为什么确认属于观察窗口；缺失则不能进入主统计 |
| path | 如 `["scene-a","object-a","method-a"]`，唯一主路径 |
| impl | software / hardware / null；null只随“全部”纳入 |
| training | none / aux / target / null；未知不默认none |
| classification_basis | 实际读过的摘要/方法依据；初筛无需填满所有全文证据 |
| abstract | 可选；保留取得的摘要，不生成仿真摘要 |
| identifiers | 可选，如 arxiv、doi、openreview；保留别名以便合并 |
| known_formal_publication | 已知正式发表时为true，阻止伪装为preprint |

正式日期晚于截止、明确早于观察窗口会拒绝生成；不会压入边界月份。年/月精度按可知的最早边界检查，保留原精度；当年尚未完整的图明确标注。主统计只放已经确认属于窗口的论文，排除候选另存后台。

如选择录用年而不是发表年，在project中设置 `core_clock_label` 明示，论文date_source写出真实依据；不能用任意当前年补齐。

## analyses.json

复用 `examples/inference/analyses.json` 的完整结构，每个分析组包含：

- id、title、path、scope_note、notes；path可定位分类树中的一个节点。
- papers：本组方法论文，加明确 `role: background` 的架构/问题先例。方法论文ID集合必须与所选路径下的候选集合一致，不能悄悄漏读。
- 每篇记录 paper_id（对应papers.json的id）、short/title、source_url、pdf_url、所读version、authors/affiliations、labels、reading_level、reading_scope、pdf_sha256、可选local_pdf、axes、conditions、reading、results、limits。
- axes为 problem/cognition/method，每项label/text/refs。refs是 `[{"url":"https://…#page=4","locator":"§3式2"}]`。
- results按 condition/value/caveat/refs；limits按text/refs；精读记录的实际范围与引用必须真实。
- depth：source_pdf_sha256、mechanisms、papers（逻辑链/主张证据）、disagreements、example（共同输入和各case）。
- figures：同一source_pdf_sha256、contributions、problem、methods、teaching_note。通用分析提供 `common_input: {title, stages:[三个简短显示阶段]}`；数值四专家示例使用示例专用input数组。
- 每篇方法图采用 `kind: flow`、title/comparator/takeaway/refs、left/right；panel含title、三个显示stages、两行rows（token/decision/result）、footer/weight_note。每行用换行控制短标签。方法数和逻辑链长度不限，画布组件的显示槽位固定。
- lineage：external_nodes、edges、controls、graph_note、coverage_note；边kind为baseline/combination/citation，包含from/to、version、url、locator、context。内部对照放controls，不造外部论文。

`reading_level` 为full_paper/abstract_only/partial。全文标注必须保留哈希与真实阅读范围；partial不冒充已精读。未打包PDF时local_pdf=null；有本地PDF则位于项目pdfs/内，校验其哈希。结构校验无法核实AI是否真实读过。明确的虚构界面测试可在分析组设is_synthetic=true、reading_level=synthetic，界面标识为合成示意；不用于真实论文。

## 命令

```bash
python3 scripts/survey.py init /path/to/project --title "研究调研" --scope "本次范围" --start-year 2024 --cutoff 2026-11-05
python3 scripts/survey.py dedupe /path/to/raw.json --output /path/to/merged.json --log /path/to/duplicates.json
python3 scripts/survey.py validate /path/to/project
python3 scripts/survey.py build /path/to/project
```

替换路径与日期。dedupe不覆盖输入，只合并强标识或完整标准化题名；正式版本优先，冲突保留日志。检查冲突后再替换canonical papers.json；不做模糊题名自动合并。原始元数据保留在项目后台。

build默认写项目survey.html，也可用--output指定。提交Git前检查所选文件，不默认提交项目数据、PDF、缓存或凭据。
