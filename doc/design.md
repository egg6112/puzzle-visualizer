# puzzle-visualizer 設計書

作成日：2026-05-31  
更新日：2026-06-03  
公開URL：`https://egg6112.github.io/puzzle-visualizer/`

---

## 1. 概要

15パズル（4×4スライドパズル）を A*・IDA*・WD+A*・WD+IDA*・PDB-row・PDB-diag・PDB-max の 7 アルゴリズムで逐次解法し、探索過程と解答手順をアニメーションで比較できる静的 Web アプリ。

**主な特徴：**
- 2 パネルが独立したドロップダウンで 7 アルゴリズムを自由に切り替えて比較できる
- Explore Replay（探索順）と Solution Replay（解答手順）の 2 モードを切り替え可能
- Manhattan距離・Walking Distance・PDB のリアルタイム進捗バー（3 行）を表示
- 7 アルゴリズム比較カードリストに★（最優秀）・カラーコーディングを表示
- アルゴリズムを 1 本ずつ `POST /solve_one` で逐次呼び出し、完了した行からリアルタイムに結果を反映
- 実行中アルゴリズムのセルにインラインスピナー表示
- シークスライダーで任意フレームへジャンプできる
- Walking Distance テーブルを JS 側でも起動時に事前構築し、ヒューリスティック値をリアルタイム表示
- コールドスタート対策のウォームアップ処理を内蔵
- 3 種の PDB 系（PDB-row / PDB-diag / PDB-max）を並べることで、max の保険効果を視覚で比較できる

---

## 2. ファイル構成

```
puzzle-visualizer/
├── index.html   # HTML 構造・セマンティクス
├── main.js      # 状態管理・API通信・描画ロジック
├── style.css    # デザイントークン・レイアウト・アニメーション
└── doc/
    ├── design.md                    # 本ドキュメント
    └── pdb_algorithm_explanation.md # PDB アルゴリズム解説
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
│  コントロール        │  ドロップダウン(A*)      │  ドロップダウン(PDB-max) │
│  サイドバー         │  ┌──────────────────┐   │  ┌──────────────────┐   │
│  （aside）          │  │  グリッド 224×224  │   │  │  グリッド 224×224  │   │
│  ・Shuffle/Solve/   │  │  (loading overlay)│   │  │  (loading overlay)│   │
│    Reset ボタン     │  └──────────────────┘   │  └──────────────────┘   │
│  ・Max time 入力    │  統計（States/Moves/h/  │  統計（States/Moves/h/  │
│  ・モード切替       │    Time）               │    Time）               │
│  ・シークスライダー  │  h-compare バー(3行)    │  h-compare バー(3行)    │
│  ・再生コントロール  │  ステータスバー          │  ステータスバー          │
│  ・比較カードリスト  │                         │                         │
│    (7行)            │                         │                         │
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
  │            initPDB は Solve 完了後に最初の /solve_one レスポンスから取得
  │
  ▼
[Solve] ────────────────────────────────────────────────────────────────┐
  │                                                                       │
  ├─ setBusy(true)                                                        │
  ├─ algoStates を全キー 'waiting' に初期化                               │
  ├─ updateComparisonTable()（全行 "—" 表示）                              │
  │                                                                       │
  ├─ GET /warmup（失敗しても続行）                                         │
  │      └─ Render コールドスタート対策                                     │
  │                                                                       │
  ├─ for algo of ALGO_KEYS                                                │
  │      （'astar'→'idastar'→'wdastar'→'wdidastar'                       │
  │        →'pdbidastar'→'diagidastar'→'maxidastar'）                    │
  │      │                                                                │
  │      ├─ algoStates[algo] = 'running'                                  │
  │      ├─ updateComparisonTable()（該当行にスピナー）                    │
  │      ├─ updatePanelLoading()（パネルが該当アルゴなら Solving… 表示）   │
  │      │                                                                │
  │      ├─ POST /solve_one                                               │
  │      │      body: { board, algo, max_time }                           │
  │      │      signal: AbortController（max_time + 15s でタイムアウト）   │
  │      │                                                                │
  │      ├─ 成功時（HTTP 200）                                             │
  │      │      ├─ initPDB = data.h_pdb（最初の non-zero 値で確定）        │
  │      │      ├─ results[algo] に path / exploredPath / exploredHPdb を格納
  │      │      ├─ algoStates[algo] = 'done'                              │
  │      │      ├─ updateComparisonTable()（行を即時確定）                 │
  │      │      └─ panelAlgos[p] === algo なら setPanelResult / renderAll  │
  │      │                                                                │
  │      ├─ HTTP 400 時（解けない盤面）                                    │
  │      │      └─ showGlobalError / aborted=true / 残りアルゴはスキップ   │
  │      │                                                                │
  │      └─ AbortError / TypeError 時                                     │
  │             ├─ algoStates[algo] = 'failed'                            │
  │             └─ TypeError → showGlobalError / aborted=true             │
  │                                                                       │
  ├─ setBusy(false)                                                        │
  ├─ updateComparisonTable()（allDone=true で★・カラー確定）               │
  └─ 1件以上成功 → step=0 → renderAll() → play()                          │
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
| `API_URL` | `API_BASE + '/compare'` | （後方互換用・現在は未使用） |
| `SIZE` | `4` | グリッドサイズ |
| `CELL` | `56` | セルサイズ（px） |
| `GAP` | `3` | タイルのセル内オフセット（px） |
| `GOAL` | `[1,2,...,15,0]` | ゴール盤面 |
| `ALGO_KEYS` | `['astar','idastar','wdastar','wdidastar','pdbidastar','diagidastar','maxidastar']` | アルゴリズム識別キー（実行順） |
| `ALGO_LABELS` | `{astar:'A*', ..., pdbidastar:'PDB-row', diagidastar:'PDB-diag', maxidastar:'PDB-max'}` | アルゴリズム表示名マップ |
| `ALGO_DESC` | `{astar:'Best-first search', ..., diagidastar:'Diagonal PDB, IDA*', maxidastar:'max(row,diag) PDB, IDA*'}` | パネルヘッダー用の説明文マップ |
| `ALGO_BADGE` | `{astar:'b-a', ..., pdbidastar:'b-pdb', diagidastar:'b-pdb-diag', maxidastar:'b-pdb-max'}` | バッジ CSS クラスマップ |
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
| `panelAlgos` | `string[]` | `panelAlgos[p]` = パネル p が現在表示しているアルゴリズムキー。デフォルト `['astar','maxidastar']` |
| `results` | `object` | アルゴリズムキー → 結果オブジェクトのマップ |
| `algoStates` | `object` | アルゴリズムキー → `'waiting'\|'running'\|'done'\|'failed'` |
| `initMH` | `number` | Shuffle 時の初期 Manhattan 距離（プログレスバー基準） |
| `initWD` | `number` | Shuffle 時の初期 Walking Distance（プログレスバー基準） |
| `initPDB` | `number` | Solve 後の初期 PDB 値（最初の /solve_one レスポンスの `h_pdb`）。0 = 未取得 |
| `tileEls` | `object[][]` | `tileEls[p][v]` = パネル p・タイル番号 v の DOM 要素 |

#### results オブジェクトの構造

```js
results[key] = {
  // API から受け取るフィールド（/solve_one レスポンスに存在）
  moves: string[],
  states_explored: number,
  optimal_moves: number,
  time_ms: number,
  explored_log: number[][],
  explored_h_pdb: number[],   // PDB h値の並走配列（explored_log と同長）
  h_manhattan: number,        // 初期盤面の Manhattan+LC 値
  h_wd: number,               // 初期盤面の WD 値
  h_pdb: number,              // 初期盤面の PDB 値（PDB未ロード時は 0）

  // JS 側で生成するフィールド（成功時のみ）
  path: number[][],           // moves から構築した盤面スナップショット列
  exploredPath: number[][],   // explored_log をそのまま変換
  exploredHPdb: number[],     // explored_h_pdb をそのまま保持（step index で参照）

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
| `randomShuffle()` | ゴールからランダムウォーク 150 手でシャッフル |
| `buildPath(initial, moves)` | API の `moves` リストから盤面スナップショット列を生成 |
| `buildExploredPath(log)` | API の `explored_log` を盤面配列に変換 |
| `initGrids()` | タイル DOM 要素を生成してグリッドに挿入 |
| `placePanel(p, st)` | CSS `left/top` でタイルを絶対配置。正位置タイルに `.correct` クラスを付与 |
| `flashPanel(p, from, to)` | 移動したタイルに `.moved` クラスを付与してグロウアニメーションを発火 |
| `activePath(p)` | パネル p の現在モードに対応するパス配列を返す |
| `renderPanel(p, prevStep)` | パネル p を現在 step で描画。prevStep がある場合はフラッシュ |
| `renderAll(prevStep)` | 両パネルを描画し `syncProgress()` を呼ぶ |
| `updateHBar(p, st)` | MH・WD を計算し統計と進捗バーを更新。Explore Replay 時は `exploredHPdb[step]` から PDB バーも更新 |
| `setPanelResult(p)` | パネル p の統計（states/moves/time）と status を results から更新 |
| `setPanelStatus(p, msg, type)` | ステータスバーのテキストと CSS クラスを設定 |
| `updatePanelHeader(p)` | ドロップダウン選択に合わせてバッジ・説明文を更新 |
| `updateComparisonTable()` | 7 アルゴリズムの比較カードリストを results と algoStates から更新。`allDone` 時のみ★・カラーを確定 |
| `updatePanelLoading()` | `algoStates[panelAlgos[p]] === 'running'` のパネルだけローディングオーバーレイを表示 |
| `syncProgress()` | シークスライダーの max・value・disabled を更新 |
| `showLoading(visible)` | 両パネルのローディングオーバーレイを一括表示/非表示 |
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
| `doShuffle()` | 盤面をシャッフルして initMH・initWD・initPDB・results・algoStates をリセット |
| `doSolve()` | ウォームアップ → 7 本逐次 `/solve_one` 呼び出し → 結果をリアルタイムにパネルへ反映 |
| `doReset()` | ゴール盤面に戻す |

---

## 7. API 通信フロー（doSolve）

```
doSolve() 呼び出し
      │
      ├─ setBusy(true)
      ├─ algoStates = { astar:'waiting', ..., maxidastar:'waiting' }
      ├─ updateComparisonTable()（全行 "—"）
      │
      ├─ GET /warmup（失敗しても continue）
      │
      ├─ for algo of ['astar','idastar','wdastar','wdidastar',
      │               'pdbidastar','diagidastar','maxidastar']
      │      │
      │      ├─ aborted なら { error:'Skipped' } で skip
      │      │
      │      ├─ algoStates[algo] = 'running'
      │      ├─ updateComparisonTable()（スピナー表示）
      │      ├─ updatePanelLoading()
      │      │
      │      ├─ POST /solve_one
      │      │      body: { board, algo, max_time }
      │      │      signal: AbortController（max_time + 15s）
      │      │
      │      ├─ res.ok チェック
      │      │      400 → aborted=true, showGlobalError
      │      │      他NG → per-algo failed
      │      │
      │      ├─ data = await res.json()
      │      ├─ initPDB = data.h_pdb（最初の non-zero で確定）
      │      │
      │      ├─ data.error あり → algoStates='failed', results[algo]={error,...}
      │      │   なし           → algoStates='done',
      │      │                     results[algo]={...data,
      │      │                       path:buildPath(...),
      │      │                       exploredPath:buildExploredPath(...),
      │      │                       exploredHPdb: data.explored_h_pdb ?? []}
      │      │
      │      └─ updateComparisonTable() / updatePanelLoading()
      │         panelAlgos[p]===algo → setPanelResult / renderAll
      │
      ├─ setBusy(false)
      ├─ updateComparisonTable()（allDone=true → ★ 確定）
      └─ 成功アルゴが1件以上 → step=0 → renderAll() → play()

  catch (AbortError)
      results[algo] = { error: 'Timed out (Ns)', ... }
  catch (TypeError / fetch失敗)
      showGlobalError("Cannot reach API…")
      aborted = true
```

---

## 8. 再生モード

| モード | データソース | スライダー表示 | 用途 |
|---|---|---|---|
| Explore Replay | `results[key].exploredPath`（`explored_log`） | ステップ N / M | アルゴリズムがどの順番で盤面を探索したか。PDB バーがリアルタイム更新される |
| Solution Replay | `results[key].path`（`moves` から構築） | ステップ N / M | 最短解答手順のステップ。PDB バーは "PDB:—" 固定 |

- 両パネルは**同じ `step` 変数を共有**する
- スライダーの最大値は `max(パネル 0 のパス長, パネル 1 のパス長) - 1`
- モード切り替え・アルゴリズム切り替え時は `step = 0` にリセットして先頭から再生

---

## 9. 比較カードリスト

`updateComparisonTable()` が全 7 アルゴリズムの結果を描画する。

**レイアウト構造（縦持ちカードリスト）：**

```
ALGORITHM    STS   STATES    TIME
[A*]          ✓    40,489    7.47s   ▶
[IDA*]        ✓    61,941    9.68s   ▶
[WD+A*]       ✓    27,785    7.90s   ▶
[WD+IDA*]     ✓    41,621    9.88s   ▶
[PDB-row]     ✓   119,680   12.31s   ▶
[PDB-diag]    ✓    63,773    6.61s   ▶
[PDB-max]     ✓    49,473★   6.24s   ▶
```

| 項目 | ロジック |
|---|---|
| waiting | 全セル "—"（Solve 未実行） |
| running | Status セルにインラインスピナー（`.tbl-spinner`）。States/Time は "—" |
| Status（done） | 成功: `✓`（緑ピル）、失敗: `✗`（赤ピル） |
| States | `allDone` 時のみ: 最少★ = `val-best`（緑）、5倍超 = `val-slow`（橙）、それ以外 = `val-mid` |
| Time | `allDone` 時のみ: 最速★ = `val-best`（緑）、5倍超 = `val-slow`（橙）、それ以外 = `val-mid` |
| Replay | 各行の [▶] ボタン押下で該当アルゴリズムをパネルに表示し Solution Replay 開始 |

**ID 命名規則（JS との対応）：**

各行の可変セルは `id="tbl-{algo}-{metric}"` を持つ `<span>` 要素。  
ラッパー `<div class="cmp-col-*">` がレイアウトを担うため、JS の `el.className = 'tbl-val ...'` がラッパーに影響しない。

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
| `--pdb-color` | `#2dd4bf` | PDB-row バッジ色（ティール） |
| `--pdb-diag-color` | `#22d3ee` | PDB-diag バッジ色（シアン） |
| `--pdb-max-color` | `#7dd3fc` | PDB-max バッジ色（ライトスカイ） |
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
| `.b-pdb` | PDB-row | ティール（`--pdb-color`） |
| `.b-pdb-diag` | PDB-diag | シアン（`--pdb-diag-color`） |
| `.b-pdb-max` | PDB-max | ライトスカイ（`--pdb-max-color`） |

PDB 系 3 種はティール → シアン → ライトスカイの濃淡で識別できる。

### 11-3. タイルアニメーション

- **移動**：`transition: left 0.22s cubic-bezier(0.4,0,0.2,1), top 0.22s ...` による CSS トランジション
- **フラッシュ**：`@keyframes tile-moved`（インディゴのグロウ）を `.moved` クラスで発火（400ms）
- **正位置**：ゴール位置に収まったタイルに `.correct` クラスを付与（青色ハイライト + グロウ）

### 11-4. h-compare プログレスバー（3 行）

各パネルの下部に Manhattan・Walking Distance・PDB の進捗を 3 本のバーで表示する。

```
MH:8   ████████████████░░░░░░░░  ← --accent-hi (インディゴ)
WD:10  ████████████████████░░░░  ← #34d399 (エメラルド)
PDB:32 ████████████░░░░░░░░░░░░  ← --pdb-color (ティール)
```

- **進捗率** = `(1 - 現在h / 初期h) × 100%`（0% = 初期状態、100% = ゴール）
- MH・WD の初期値は Shuffle 時に `initMH`・`initWD` として記録する
- `initPDB` は Solve 後に最初の `/solve_one` レスポンスの `h_pdb` から取得する
- PDB バーは **Explore Replay のみ**有効。`exploredHPdb[step]` を参照する（Solution Replay では "PDB:—"）
- IDA* 系は h_pdb が一時的に初期値を超えることがある（バックトラック）→ width を `[0, 100%]` にクランプ
- `explored_h_pdb` の物差しは **pdb-01（行優先）** に統一。diagidastar / maxidastar 実行中でも同じ尺度で比較できる

### 11-5. 比較カードリスト（.cmp-row）

```css
.cmp-row         /* flex コンテナ。1行 = 1アルゴリズム */
.cmp-col-badge   /* flex: 0 0 66px — バッジ列 */
.cmp-col-status  /* flex: 0 0 22px — ✓/✗/スピナー列 */
.cmp-col-states  /* flex: 1        — States 列（右寄せ） */
.cmp-col-time    /* flex: 0 0 40px — Time 列（右寄せ） */
.cmp-col-replay  /* flex: 0 0 20px — [▶] ボタン列 */
```

### 11-6. インラインスピナー（.tbl-spinner）

比較カードリストの Status セルに表示する 9px のインラインスピナー。  
`@keyframes spin`（既存の大型スピナーと共用）でアニメーションする。

### 11-7. アクセシビリティ対応

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
| 2.0.0 | 2026-06-01 | WD+A*・WD+IDA* を追加。パネルをドロップダウンで切り替え可能に。h-compare バー（MH/WD 2行）・比較テーブルの★カラーコーディングを追加。Walking Distance を JS 側でも事前構築 |
| 3.0.0 | 2026-06-02 | PDB+IDA* を 5 本目として追加。`/compare` 一括呼び出しから `/solve_one` 逐次呼び出しに変更（algoStates ステートマシン・スピナー・逐次フィードバック）。比較表を横持ちテーブルから縦持ちカードリストに刷新。h-compare バーに PDB バー（3行目）を追加。PDB バーは Explore Replay で `exploredHPdb[step]` を参照 |
| 4.0.0 | 2026-06-03 | PDB-diag / PDB-max を追加し 7 アルゴリズム構成に拡張。比較カードリスト 5行→7行。ドロップダウン 5択→7択。pdbidastar の表示名を "PDB+IDA*" → "PDB-row" に変更。`--pdb-diag-color` / `--pdb-max-color` CSS 変数・`.b-pdb-diag` / `.b-pdb-max` バッジクラスを追加。Panel 1 のデフォルトを `maxidastar`（PDB-max）に変更 |

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
