# 《Ring Run》技术文档

## 1. 技术栈

- Vite 5 + TypeScript 5，无 UI 框架。
- 全屏 Canvas 2D 绘制请柬纸、路线、玩家戒指盒、目标与三类威胁；DOM 负责 HUD、指令和结果纸带。
- Pointer Events + pointer capture 处理连续单笔输入；Web Audio API 合成所有反馈音。
- `vite.config.ts` 使用 `base: './'`，构建产物可部署到任意子路径。

## 2. 目录结构

- `src/main.ts`：中英文案、身份加载、状态机、RDP 路线简化、弧长行进、三类碰撞、Canvas 绘制、声音与 QA API。
- `src/style.css`：全屏 HUD、结果纸带、390×844 / 320×568 响应式与 reduced-motion。
- `public/aigram-bridge.js`：AlterU 平台桥；`public/default-avatar.png`：黑白 `U` 回退；`public/poster.png`：正式海报。
- `doc/`：需求、视觉、技术和视觉 QA。
- `_qa/`：第一幕垂直切片、全场景成功、真实失败/取消、三幕完整流程测试。
- `_production/`：Aigram 正式海报生成脚本与请求记录。

## 3. 核心模块

### 状态与场景

状态为 `loading → briefing ↔ drawing → locked → running → success/failure`。`sceneIndex` 在 0–2 之间推进；成功保存本幕分数，失败只重置当前幕，第三幕成功后显示总分，`PLAY AGAIN` 清空三幕数据。

### 连续手势与路线

起点 54px、终点 64px 内自动吸附。Pointer 移动每 6px 采样，最大墨水为短边 2.65 倍；松手后用 Ramer–Douglas–Peucker 简化并限制 48 点。无效终点、短线、墨水耗尽或 pointercancel 都回到 `briefing`，不残留 active pointer。

### 弧长移动与碰撞

`rebuildRoute()` 生成累计弧长；`pointAlongRoute()` 以 94–118px/s 恒速插值，不依赖线段点密度。猫爪使用移动胶囊；机器人使用可见清扫回路 + 移动圆；香槟使用可见斜向滚动带 + 移动胶囊。每帧 delta 钳制到 33ms，路径结果与视觉危险区一致。

### 身份、多语言和音频

身份顺序为 `?avatar_url / ?user_name` → AlterU `/note/telegram/user/get/info/by/telegram_id` 的 `data.name/head_url` → `./default-avatar.png` 与 `AlterU`。头像随戒指盒运动并参与碰撞。文案集中在 `words.en/zh`，语言读取 `game_locale` 或浏览器语言。音频在首次手势后创建短寿命 oscillator/gain。

## 4. 扩展点

- 改路线容错：修改 pointer 处理中的 54/64px、6px 采样和 2.65 倍墨水。
- 改运动速度或分数：修改 `update()` 的 speed 与 `succeed()` 的公式。
- 加威胁：新增场景文案，并在 `layout()`、`threatCollision()`、`drawHazardLane()`、`drawThreat()` 做穷举分支。
- 换美术：修改 Canvas `draw*` 函数和 `src/style.css` 色值；玩家头像必须继续作为移动主体。
- 加存档/排行：在第三幕 `succeed()` 后持久化总分；平台 UUID 必须由标准脚本注入。
