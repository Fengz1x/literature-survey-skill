# 建库完成度与交付

这里检查“约定范围内记录是否处理到位”，不证明整个领域找齐，也不证明 AI 真读过或理解正确。脚本不执行搜索、读论文或生成语义标签；这些由执行 skill 的 AI 完成。账本只记实际行为。

## 1. 范围和计划

新项目默认 full_scope。若人明确要求试跑或限制范围，使用 bounded 并写实际同意的 reason。确认的来源分别提供 track_ids，如 `["main", "short"]`；不得用一个未检查的入口代替所有轨道。通用 tracks 仍是给人的文字说明。

project.json 中的配置例：

```json
{
  "collection": {
    "mode": "full_scope",
    "rules_version": "v1",
    "include_preprints": true,
    "required_attributes": ["impl", "training"]
  }
}
```

非模型领域不需实现/训练属性，可留空。启用的筛选属性以及实际填了非空值的实现/训练标签仍需证据；不能清空 required_attributes 绕过标签检查。修改准入或分类规则时更新 rules_version 并重新核实受影响判断，不只修改版本字符串。

`retrieval-plan.json` 是数组。每项定义一个来源—年份—轨道目录或一个明确主题查询，字段为：

| 字段 | 含义 |
|---|---|
| id | 唯一检索单元 ID |
| source_id, year, pool | 已确认来源、年份、core/preprint |
| track | 明确的轨道 ID；预印本可用 preprint |
| fields | 实际检索字段数组，如 title、abstract；只查标题就如实写 title |
| selection_rule | 关键词、同义词及如何选取候选的明确规则 |
| query | 预印本单元必填，保存真实查询；不把示例查询当领域通用方案 |

full_scope 核对所有已确认正式来源×窗口年份×track_ids；如纳入预印本，各年须有查询单元。双年会议、尚未举办等格也留下 not_applicable 记录与一手依据。脚本不能判断查询词是否足够，AI还需用少量综述、种子论文、不同方法类型反查明显缺口，补查也登记新单元。

## 2. 来源记录和完整召回队列

`search-log.json` 每项使用 unit_id 对应计划。同一单元用一条最终汇总记录，详细请求仍可放缓存/附录。完成项需要 status=complete、url、checked_at、pages_expected、pages_read、pagination_checked=true、recall_count。页数必须相等；单页也需要核实分页或动态加载。检查 API 的 totalResults 等元数据，不能自行把第一页当全集。

访问失败记 status=access_gap/pending 和实际原因，此时整体为 partial。not_applicable 需要 reason、evidence_url，且没有该单元召回记录。

`recall.jsonl` 保存所有命中项，而非最终保留集：

```json
{"id":"r1","title":"原始完整题名","unit_ids":["source-2024-main"],"abstract":"取得的完整摘要","abstract_source":"https://example.org/paper","identifiers":{"doi":"10.example/id"}}
```

同一命中身份可合并 unit_ids；每个单元的 recall_count 必须等于保存队列中关联的记录数。不要只保存被挑中的200条、同时把原始命中数写成200来消除缺口。明显噪声也保留排除记录。原始页面/响应和真实总数用于人工追溯，脚本无法发现未保存且未声明的命中。

## 3. 逐篇判断

`screening.jsonl` 每条对应一个 recall_id，必填 decision、rules_version、reason、source_url、title_sha256、read_scope；有摘要时还需 abstract_sha256。哈希计算为 `sha256(text.strip().encode('utf-8'))`，对象是保存的完整原文，不是截断后的显示片段。

- include：paper_id 指向 papers.json，完整可用摘要的 read_scope=full_abstract；不能用 abstract_prefix 或 title_only 完成保留项分类。
- exclude：明显无关可 title_only 排除并写理由；涉及摘要的排除读完整可用摘要。排除不是为了凑阅读上限。
- duplicate：paper_id 指向正式保留项，核对完整题名或共同强标识；不能只凭缩写合并。
- insufficient：保存缺失原因，计为待解决证据缺口，不算已完成分类。

未取得摘要但有可靠方法介绍时，在 recall 中保存 method_text、method_source，判断使用 read_scope=method_intro 与 method_sha256，明确实际阅读范围。只有标题且无法确定相关性的记录不得强行 include。独立字段有歧义时可留空，不因此删除整篇相关论文。

include 的 classification 保存 path 及适用属性的独立判断。例：

```json
{
  "path": {"value":["scene","object","method"],"support":"inferred","evidence":"实际原文片段","reason":"为何属于这条主路径"},
  "impl": {"value":"software","support":"direct","evidence":"实际原文片段","reason":"已有硬件上的软件执行方案"},
  "training": {"value":null,"support":"unknown","reason":"现有材料不足以确定是否训练专用组件"}
}
```

value 必须与 papers.json 一致；direct/inferred 必须有可在标题、摘要或保存的方法介绍中找到的片段与独立理由。unknown 只能对应空值，并解释不足之处。场景/对象/方法路径不可用 unknown 伪装成已分类。

每条召回有且只有一条处置；每篇保留项有且只有一个 include，其他身份用 duplicate。输入或规则改变后旧判断不能继续冒充当前判断。老数据可带真实证据迁移；没有阅读记录时保持未核验，不能批量自动补“full_abstract”。

## 4. 内部检查与交付

```bash
python3 scripts/survey.py audit /path/to/project --require-complete
python3 scripts/survey.py validate /path/to/project
python3 scripts/survey.py deliver /path/to/project
```

audit 写 completion.json，列出漏检单元、未筛记录、失配输入和标签问题。AI据此继续批处理并修正；不要只给人一份错误清单就停止。validate 是结构/日期/去重/全文证据检查，二者不能互相代替。按 ui-contract 检查适用交互和布局，修正后只重查受影响部分；没有实际浏览条件就如实写结构检查，不冒称视觉验收。

deliver 重算完成度，不信任旧 completion.json。完整交付只接受 complete，含义仅是声明计划及保存队列处理完；bounded 的完成不会宣称全范围完成。build 是预览，仍自动显示未完成/未核验状态。完成度警示属于数据状态，沿用当前模板，不另造复杂工作台。

访问缺口、明确预算等原因仍存在时：

```bash
python3 scripts/survey.py deliver /path/to/project --partial-reason "具体缺口和本轮停止原因"
```

阶段性交付保留缺口、下一批和真实完成范围，不能说建库已全范围完成。已确认范围内的正常补漏、证据补查、冲突修正和排版检查由AI自主完成；人仍负责研究范围、分类维度和深入分支的决定。没有有效账本的既有项目显示 untracked；不能据该状态断言既有研究没有做过检索。
