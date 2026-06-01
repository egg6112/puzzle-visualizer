# puzzle-visualizer 設計書

作成日：2026-05-31  
更新日：2026-06-02  
公開URL：`https://egg6112.github.io/puzzle-visualizer/`

---

## 1. 概要

15パズル（4×4スライドパズル）を A*・IDA*・WD+A*・WD+IDA* の 4 アルゴリズムで並列解法し、探索過程と解答手順をアニメーションで比較できる静的 Web アプリ。

**主な特徴：**
- 2 パネルが独立したドロップダウンで 4 アルゴリズムを自由に切り替えて比較できる
- Explore Replay（探索順）と Solution Replay（解答手順）の 2 モードを切り替え可能
- Manhattan距離と Walking Distance のリアルタイム進捗バーを表示
- 4 アルゴリズム比較テーブルに★（最優秀）・カラーコーディングを表示
- シークスライダーで任意フレームへジャンプできる
- Walking Distance テーブルを JS 側でも起動時に事前構築し、ヒューリスティック値をリアルタイム表示
- コールドスタート対策のウォームアップ処理を内蔵

---

## 2. ファイル構成

```
puzzle-visualizer/
├── index.html   # HTML 構造・セマンティクス
├── main.js      # 状態管理・API通信・描画ロジック
├── style.css    # デザイントークン・レイアウト・アニメーション
└── doc/
    └── design.md  # 本ドキュメント
```

---

## 3. ホスティング

| 項目 | 値 |
|---|---|
| ホスティング | GitHub Pages |
| リポジトリ | `egg6112/puzzle-visualizer`（`main` ブランチ・`/ (root)`） |
| 公開URL | `https://egg6112.github.io/puzzle-visualizer/` |
| 自動デプロイ | `main` ブランチへの push で自動反映 |
| バックエンドAPI | `https://puzzle-api-m99y.onrender.com`（別リポジトリ） |

---

## 4. 画面レイアウト

```
┌──────────────────────────────────────────────────────────────────────┐
│           header（タイトル・サブタイトル・API docs リンク）              │
├─────────────────────┬────────────────────────┬────────────────────────┤
│                     │  パネル 0               │  パネル 1               │
│  コントロール        │  ドロップダウン(A*)      │  ドロップダウン(WD+IDA*)│
│  サイドバー         │  ┌──────────────────┐   │  ┌──────────────────┐   │
│  （aside）          │  │  グリッド 224×224  │   │  │  グリッド 224×224  │   │
│  ・Shuffle/Solve/   │  │  (loading overlay)│   │  │  (loading overlay)│   │
│    Reset ボタン     │  └──────────────────┘   │  └──────────────────┘   │
│  ・Max time 入力    │  統計（States/Moves/h/  │  統計（States/Moves/h/  │
│  ・モード切替       │    Time）               │    Time）               │
│  ・シークスライダー  │  h-compare バー         │  h-compare バー         │
│  ・再生コントロール  │  ステータスバー          │  ステータスバー          │
│  ・比較テーブル     │                         │                         │
│  ・API note         │                         │                         │
└─────────────────────┴────────────────────────┴────────────────────────┘
```

**ブレークポイント（860px 以下）：**

サイドバーとパネルが縦積みになる（flex-direction: column）。

---

## 5. ユーザー操作フロー

```
起動
  │
  ▼
ゴール盤面を表示（[1,2,3,...,15,0]）
  │
  ▼
[Shuffle] ── ランダムウォーク150手で盤面をシャッフル
  │            initMH・initWD を更新（プログレスバーの基準値）
  │
  ▼
[Solve] ────────────────────────────────────────────────────────────┐
  │                                                                   │
  ├─ setBusy(true) / showLoading(true)                                │
  │                                                                   │
  ├─ GET /warmup（失敗しても続行）                                     │
  │      └─ Render コールドスタート対策                                 │
  │                                                                   │
  ├─ POST /compare                                                    │
  │      body: { board, max_time }                                    │
  │      signal: AbortController（max_time + 15s でタイムアウト）       │
  │                                                                   │
  ├─ 成功時                                                            │
  │      ├─ 4アルゴリズム分の結果を results{} に格納                    │
  │      ├─ 各アルゴリズムの buildPath / buildExploredPath でパス生成   │
  │      ├─ updateComparisonTable() で比較テーブル更新                 │
  │      ├─ setPanelResult() で統計表示更新                            │
  │      └─ play() で Explore Replay の自動再生開始                    │
  │                                                                   │
  └─ 失敗時                                                            │
         ├─ AbortError → ⏱ Timed out (Ns) をパネルステータスに表示     │
         └─ TypeError(fetch失敗) → global-error バナーに表示           │
               │
               ▼
          再生中 ── [Pause] / [◀◀] / [▶▶] / シークスライダー
               │
               ▼
          ドロップダウンでパネルのアルゴリズムを切り替え（switchPanelAlgo）
               │
               ▼
          比較テーブルの [▶] ボタンで任意アルゴリズムを Solution Replay
               │
               ▼
          [Solution Replay] / [Explore Replay] でモード切り替え
               │
               ▼
          [Reset] ── ゴール盤面に戻す・results をクリア
```

---

## 6. JavaScript 設計（main.js）

### 6-1. 定数

| 定数 | 値 | 説明 |
|---|---|---|
| `API_BASE` | `"https://puzzle-api-m99y.onrender.com"` | API のベース URL |
| `API_URL` | `API_BASE + '/compare'` | 4 アルゴリズム並列実行エンドポイント |
| `SIZE` | `4` | グリッドサイズ |
| `CELL` | `56` | セルサイズ（px） |
| `GAP` | `3` | タイルのセル内オフセット（px） |
| `GOAL` | `[1,2,...,15,0]` | ゴール盤面 |
| `ALGO_KEYS` | `['astar','idastar','wdastar','wdidastar']` | アルゴリズム識別キー |
| `SPEED_MS` | `[1800,1200,800,550,400,280,180,110,60,30]` | 速度スライダー値 1〜10 に対応する ms |

### 6-2. グローバル状態

| 変数 | 型 | 説明 |
|---|---|---|
| `board` | `number[]` | 現在の盤面（16 要素） |
| `step` | `number` | 再生中のステップインデックス |
| `playing` | `boolean` | 自動再生中かどうか |
| `timer` | `number\|null` | `setTimeout` のタイマー ID |
| `speed` | `number` | 1 ステップあたりのミリ秒 |
| `replayMode` | `'explore'\|'solution'` | 再生モード |
| `panelAlgos` | `string[]` | `panelAlgos[p]` = パネル p が現在表示しているアルゴリズムキー |
| `results` | `object` | アルゴリズムキー→結果オブジェクトのマップ |
| `initMH` | `number` | Shuffle 時の初期 Manhattan 距離（プログレスバー基準） |
| `initWD` | `number` | Shuffle 時の初期 Walking Distance（プログレスバー基準） |
| `tileEls` | `object[][]` | `tileEls[p][v]` = パネル p・タイル番号 v の DOM 要素 |

#### results オブジェクトの構造

```js
results[key] = {
  // API から受け取るフィールド
  moves: string[],
  states_explored: number,
  optimal_moves: number,
  time_ms: number,
  explored_log: number[][],

  // JS 側で生成するフィールド（成功時のみ）
  path: number[][],          // moves から構築した盤面スナップショット列
  exploredPath: number[][], // explored_log をそのまま変換

  // エラー時のみ
  error: string,
}
```

### 6-3. Walking Distance 事前計算

solver.py の `_build_wd_table` / `_row_config` / `_col_config` を JS で完全に再実装している。

| 関数 | 説明 |
|---|---|
| `buildWdTable()` | モジュール評価時に 1 回だけ実行。ゴール行配置から BFS し `Map<string, number>` を返す |
| `rowConfig(state)` | 行方向の配置キーを `"t00,t01,...,br"` 形式の文字列で返す |
| `colConfig(state)` | 列方向の配置キーを同形式で返す |
| `walkingDistance(state)` | `_WD_TABLE.get(rowConfig) + _WD_TABLE.get(colConfig)` |
| `manhattan(state)` | 各タイルのマンハッタン距離の合計 |

### 6-4. 主要関数

| 関数 | 説明 |
|---|---|
| `randomShuffle()` | ゴールからランダムウォーク 150 手でシャッフル。隣接盤面を列挙して無作為選択 |
| `buildPath(initial, moves)` | API の `moves` リストから盤面スナップショット列を生成 |
| `buildExploredPath(log)` | API の `explored_log` を盤面配列に変換 |
| `initGrids()` | タイル DOM 要素を生成してグリッドに挿入。既存タイルを削除後に再生成 |
| `placePanel(p, st)` | CSS `left/top` でタイルを絶対配置。正位置タイルに `.correct` クラスを付与 |
| `flashPanel(p, from, to)` | 移動したタイルに `.moved` クラスを付与してグロウアニメーションを発火 |
| `activePath(p)` | パネル p の現在モードに対応するパス配列を返す |
| `renderPanel(p, prevStep)` | パネル p を現在 step で描画。prevStep がある場合はフラッシュ |
| `renderAll(prevStep)` | 両パネルを描画し `syncProgress()` を呼ぶ |
| `updateHBar(p, st)` | Manhattan・WD を計算し、h 統計と進捗バーを更新 |
| `setPanelResult(p)` | パネル p の統計（states/moves/time）と status を results から更新 |
| `setPanelStatus(p, msg, type)` | ステータスバーのテキストと CSS クラスを設定 |
| `updatePanelHeader(p)` | ドロップダウン選択に合わせてバッジ・説明文を更新 |
| `updateComparisonTable()` | 4 アルゴリズムの比較テーブルを results から更新。最優秀に★を付与 |
| `syncProgress()` | シークスライダーの max・value・disabled を更新 |
| `showLoading(visible)` | 両パネルのローディングオーバーレイを表示/非表示 |
| `showGlobalError(msg)` | グローバルエラーバナーを表示 |
| `clearGlobalError()` | グローバルエラーバナーを非表示 |
| `setBusy(busy)` | 解答中にボタン・ドロップダウンをすべて disabled にする |
| `play()` | 自動再生開始（step が末尾なら先頭に戻す） |
| `pause()` | タイマーを止めて playing=false |
| `togglePlay()` | Play/Pause を切り替え |
| `tick()` | 1 ステップ進めて自動再生を継続するタイマーコールバック |
| `stepForward()` | 1 ステップ進む（手動） |
| `stepBack()` | 1 ステップ戻る（手動） |
| `setReplayMode(mode)` | Explore / Solution モードを切り替え |
| `switchPanelAlgo(p, key)` | パネル p のアルゴリズムを切り替え、ヘッダー・統計・描画を更新 |
| `applySpeed(val)` | スライダー値（1〜10）を `SPEED_MS` テーブルで ms に変換し `speed` に設定 |
| `doShuffle()` | 盤面をシャッフルして initMH・initWD・results をリセット |
| `doSolve()` | ウォームアップ → `/compare` 呼び出し → 結果をパネルに反映 |
| `doReset()` | ゴール盤面に戻す |

---

## 7. API 通信フロー（doSolve）

```
doSolve() 呼び出し
      │
      ├─ setBusy(true) / showLoading(true)
      │
      ├─ GET /warmup（失敗しても continue）
      │
      ├─ POST /compare
      │      body: { board: state, max_time: maxTime }
      │      signal: AbortController（max_time + 15s）
      │
      ├─ res.ok チェック
      │      NG → body.detail を Error として throw
      │
      ├─ data = await res.json()
      │
      ├─ for key of ALGO_KEYS
      │      d.error あり → results[key] = { ...d }
      │      なし         → results[key] = {
      │                         ...d,
      │                         path:         buildPath(board, d.moves),
      │                         exploredPath: buildExploredPath(d.explored_log),
      │                       }
      │
      ├─ showLoading(false) / setBusy(false)
      ├─ updateComparisonTable()
      ├─ for p: setPanelResult(p)
      └─ step=0 → renderAll() → play()

  catch (err)
      AbortError  → setPanelStatus(p, "⏱ Timed out (Ns)", 'error-timeout')
      TypeError   → showGlobalError("Cannot reach API…")
```

---

## 8. 再生モード

| モード | データソース | スライダー表示 | 用途 |
|---|---|---|---|
| Explore Replay | `results[key].exploredPath`（`explored_log`） | ステップ N / M | アルゴリズムがどの順番で盤面を探索したか |
| Solution Replay | `results[key].path`（`moves` から構築） | ステップ N / M | 最短解答手順のステップ |

- 両パネルは**同じ `step` 変数を共有**する
- スライダーの最大値は `max(パネル 0 のパス長, パネル 1 のパス長) - 1`
- モード切り替え・アルゴリズム切り替え時は `step = 0` にリセットして先頭から再生

---

## 9. 比較テーブル

`updateComparisonTable()` が全 4 アルゴリズムの結果を描画する。

| 項目 | ロジック |
|---|---|
| Status | 成功: `✓`（緑ピル）、失敗: `✗`（赤ピル） |
| States | 最少★ = `val-best`（緑）、5倍超 = `val-slow`（橙）、それ以外 = `val-mid`（インディゴ） |
| Time | 最速★ = `val-best`（緑）、5倍超 = `val-slow`（橙）、それ以外 = `val-mid`（インディゴ） |
| Replay | 各行の [▶] ボタン押下で該当アルゴリズムをパネルに表示し Solution Replay 開始 |

---

## 10. アニメーション速度

スライダー値（1〜10）に対応するミリ秒テーブル：

| スライダー | ms | 倍率表示 |
|---|---|---|
| 1 | 1800 | 0.6× |
| 2 | 1200 | 0.8× |
| 3 | 800 | 1.3× |
| 4 | 550 | 1.8× |
| 5 | 400 | 2.5×（デフォルト） |
| 6 | 280 | 3.6× |
| 7 | 180 | 5.6× |
| 8 | 110 | 9.1× |
| 9 | 60 | 16.7× |
| 10 | 30 | 33.3× |

---

## 11. CSS 設計

### 11-1. デザイントークン（CSS カスタムプロパティ）

Dark Glass パレットをベースにした暗色テーマ。

| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#0a0f1e` | ページ背景 |
| `--surface` | `#111827` | カード・パネル背景 |
| `--surface2` | `#1e2d45` | 入力欄・stat カード背景 |
| `--border` | `#2d3f58` | ボーダー色 |
| `--accent` | `#6366f1` | インディゴ（A* カラー・ボタン） |
| `--accent-hi` | `#818cf8` | インディゴ明（A* バッジ・統計値） |
| `--astar-color` | `#818cf8` | A* バッジ色 |
| `--idastar-color` | `#34d399` | IDA* バッジ色（エメラルド） |
| `--wda-color` | `#fb923c` | WD+A* バッジ色（オレンジ） |
| `--wida-color` | `#c084fc` | WD+IDA* バッジ色（パープル） |
| `--correct` | `#1d4ed8` | 正位置タイルの背景 |
| `--success` | `#10b981` | Solve ボタン / Solved! ステータス |
| `--cell` | `56px` | グリッドのセルサイズ（4×56 = 224px） |
| `--tile` | `50px` | タイルのサイズ（セルより 6px 小さい） |
| `--grid-size` | `224px` | グリッド全体のサイズ |

### 11-2. アルゴリズムバッジ

| CSS クラス | アルゴリズム | 色 |
|---|---|---|
| `.b-a` | A* | インディゴ（`--astar-color`） |
| `.b-ida` | IDA* | エメラルド（`--idastar-color`） |
| `.b-wda` | WD+A* | オレンジ（`--wda-color`） |
| `.b-wida` | WD+IDA* | パープル（`--wida-color`） |

### 11-3. タイルアニメーション

- **移動**：`transition: left 0.22s cubic-bezier(0.4,0,0.2,1), top 0.22s ...` による CSS トランジション
- **フラッシュ**：`@keyframes tile-moved`（インディゴのグロウ）を `.moved` クラスで発火（400ms）
- **正位置**：ゴール位置に収まったタイルに `.correct` クラスを付与（青色ハイライト + グロウ）

### 11-4. h-compare プログレスバー

各パネルの下部に Manhattan・Walking Distance の進捗を 2 本のバーで表示する。

```
MH:8  ████████████████░░░░░░░░  ← --accent-hi (インディゴ)
WD:10 ████████████████████░░░░  ← #34d399 (エメラルド)
```

- **進捗率** = `(1 - 現在h / 初期h) × 100%`（0% = 初期状態、100% = ゴール）
- 初期 h は Shuffle 時に `initMH`・`initWD` として記録する
- ゴール（h=0）で 100% になる

### 11-5. アクセシビリティ対応

| 対応 | 内容 |
|---|---|
| `prefers-reduced-motion` | タイルの transition・アニメーション・スピナーをすべて無効化 |
| `<aside aria-label="Control panel">` | コントロールパネルのセマンティクス |
| `aria-label` | Prev（◀◀）/ Next（▶▶）ボタンのスクリーンリーダー対応 |
| `<label for="max-time-input">` | Max time 入力欄とラベルの関連付け |
| `role="alert"` | グローバルエラーバナーの通知 |
| `aria-live="polite"` | ローディングオーバーレイの動的更新通知 |

---

## 12. バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0.0 | 2026-05-31 | 初版。A*・IDA* の 2 アルゴリズム、固定パネル |
| 2.0.0 | 2026-06-02 | WD+A*・WD+IDA* を追加。パネルをドロップダウンで切り替え可能に。h-compare バー・比較テーブルの★カラーコーディングを追加。Walking Distance を JS 側でも事前構築 |

---

## 13. 関連リポジトリ・URL

| 名前 | URL |
|---|---|
| puzzle-visualizer（フロント） | `https://egg6112.github.io/puzzle-visualizer/` |
| puzzle-visualizer リポジトリ | `https://github.com/egg6112/puzzle-visualizer` |
| puzzle-api（バックエンド） | `https://puzzle-api-m99y.onrender.com` |
| puzzle-api Swagger UI | `https://puzzle-api-m99y.onrender.com/docs` |
| puzzle-api リポジトリ | `https://github.com/egg6112/Hosted`（`puzzle-api/` サブディレクトリ） |
| about-me（リンク元） | `https://egg6112.github.io/about-me/` |
