# 澳洲战役扩展接口 v2.4.1

本版为**非侵入式接口版本**：原有 `data/campaigns.js`、墨尔本、CBD、威勒比地图和单位文件均不修改。

## 使用方式

- `melbourne-expansion-registry.json`：新增战役计划与已有战役索引，`planned` 不等于 `available`。
- `scenario-template.json`、`units-template.json`：用于开发新战役的结构提示；不是可运行地图。
- `validate_australia.py`：核对已有战役文件、注册状态、规划ID冲突。
- 新战役制作完成后，应先检查地图和单位数据，再将该战役注册到 `data/campaigns.js` 的 `australia_1943.scenarios`；不可把规划条目直接标记为可玩。

## 不变更保证

已有三场战役的场景、部队和主战役注册条目原样保留。未新增虚构部队或胜利条件。

## 扩展约定

场景ID全局唯一；新地图放在 `data/interface-scenarios/<id>/` 下，使用 `scenario-<id>.json` 和 `units-<id>.json`。日期按已存在的1943年9月时间线逐场确认，避免擅自覆盖原战役。
