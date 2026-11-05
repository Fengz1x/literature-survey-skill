# Literature Survey Skill · 文献调研

从大方向收敛到具体方法组，精读并比较已有工作，生成有出处的本地 HTML。

**起点 → 场景 → 对象 → 方法 → 全文拆解与对比**

范围到文献理解与对比结束，构思 idea 与模型实验不在本 skill 内。

## 使用

把此仓库作为一个完整skill目录交给支持SKILL.md的AI加载；其他AI先读 [SKILL.md](SKILL.md)，按当前阶段读取references。目录可以复制或克隆到使用者自己的skill目录，不依赖原作者项目、个人路径或账号。

人确认范围/来源/分类，选择深入分支并检查关键原文。AI负责检索、标题摘要语义分类、存量增长、选定组全文阅读、三轴拆解和页面生成。已确认的决定保存在项目state.json，续接时复用。

Python 3.10+即可构建，运行无第三方依赖：

```bash
python3 scripts/survey.py build examples/inference --output /tmp/survey-example.html
python3 scripts/survey.py init /path/to/project --title "我的文献调研" --scope "本次研究对象与任务" --start-year 2024 --cutoff 2026-11-05
```

按本次任务替换路径、观察年份与截止日期。新项目由AI依据真实检索填写JSON；脚本不自动联网检索，也不替AI阅读论文。使用环境需要可访问的一手文献和PDF工具，访问缺口保留记录。

建库按确认范围保存检索计划、完整召回队列和逐篇处置，交付前由AI核对并修正：

```bash
python3 scripts/survey.py audit /path/to/project --require-complete
python3 scripts/survey.py validate /path/to/project
python3 scripts/survey.py deliver /path/to/project
```

build 是预览；deliver 不把小样本或未处理完的队列作为完整建库交付。阶段性结果可用 `--partial-reason "具体原因"` 输出，页面明确标记。既有项目没有账本时显示完成度未核验，不倒填“已读”记录。这些检查核对流程与证据绑定，不保证零遗漏、零错分。

## 内容

- [workflow.md](references/workflow.md)：阶段、人的介入、分类与统计。
- [reading-and-figures.md](references/reading-and-figures.md)：全文、贡献组合、主张证据、团队与baseline图、并排方法图。
- [data-contract.md](references/data-contract.md)：项目文件、字段与命令。
- [completion.md](references/completion.md)：来源范围、队列处置、摘要阅读记录、内部纠错与交付条件。
- [ui-contract.md](references/ui-contract.md)：以用户指定“粗方向.html”为标准的四级导航、筛选、图表、提案预览与验收。
- assets：独立HTML/CSS/JS模板，搜索、任意深度分类、筛选、两池存量/年度趋势、深浅主题及方法阅读页。
- assets/reference/粗方向.html：用户指定的完整原 HTML 模板，原样保留；manifest.json 记录校验值。通用模板与交付应对照此原件。
- examples/inference：11篇有来源的限定阅读样例，两组方法对比，无PDF或全量候选库。KAB-MoE仅摘要，CuMo是架构先例。样例只展示记录结构与呈现，不是完整领域结论。
- examples/synthetic-thermal：明确标识的虚构非推理优化测试数据，用于检验换领域；不是真实论文。

沿用模板可以稳定外观和信息结构；分类与科学理解仍取决于真实阅读和证据核查。结构校验不会证明理解正确。

页面以“推理优化选题视图”的呈现方式为基准。起点、场景、对象、方法是固定主导航；待确认分类用独立提案在同一导航中预览，覆盖日志与下载放进说明。不复制参考页的论文、数量、来源名单或分类。用配置处理缺少统计条件，不在构建后用字符串替换另建布局。

## 自检

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
node tests/render.cjs
```

后者需要Node.js，无第三方包。检查包括去重、日期/窗口、未知属性、图关系、HTML数据转义及实际渲染/事件的轻量DOM检查。浏览器视觉检查单独记录，不把静态或结构检查说成完整页面验收。
