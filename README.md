# Typefun MVP

一个面向长期自用的古诗词打字练习网页应用 MVP。

## 已实现

- 课程页（卡片列表、锁定态、星级展示）
- 练习页（拼音/汉字双行、当前字高亮、错误反馈）
- 核心输入状态机（英文拼音输入 + 中文 IME 合成输入）
- 实时统计（准确率、按键速度、打字速度、正确速度、进度）
- 自动保存与续练（localStorage）

## 本地运行

推荐用静态服务器打开（避免浏览器对 `file://` 模块加载限制）：

```bash
cd /Users/staff/project/AI/typefun
python3 -m http.server 4173
```

浏览器访问：

`http://127.0.0.1:4173/index.html`
