# puzzle-visualizer 設計書

作成日：2026-05-31  
更新日：2026-06-05  
公開URL：`https://egg6112.github.io/puzzle-visualizer/`

---

## 1. 概要

15パズル（4×4スライドパズル）の可視化アプリ。2つのページで構成される。

| ページ | ファイル | 目的 |
|---|---|---|
| Algorithm Comparator | `index.html` | 7アルゴリズムを逐次解法して探索過程・解手順を比較 |
| PDB-max vs L字 Duel | `duel.html` | 最適探索（PDB-max）と段階的解法（L字）を同時再生で対比 |

**Algorithm Comparator の主な特徴：**
- 2パネルが独立ドロップダウンで 7 アルゴリズムを切り替え比較
- Explore Replay（探索順）と Solution Replay（解答手順）の 2 モード
- MH・WD・PDB の 3 行 h-compare バーをリアルタイム更新
- 7アルゴリズム比較カードリスト（★・カラーコーディング）
- `/solve_one` 逐次呼び出しで完了した行からリアルタイム反映
- シークスライダーによる任意フレームジャンプ

**PDB-max vs L字 Duel の主な特徴：**
- PDB-max と L字 を同じ盤面で同時に Solution Replay して手数・時間差を可視化
- L字の現フェーズ名（「3,4 ペア回し込み」等）をリアルタイム表示
- シークバー上に L字 フェーズ境界マーカーを表示
- 両パネルに MH・WD の h-compare バー
- index.html/main.js/style.css と完全独立（duel.css / duel.js に分離）

---

## 2. ファイル構成

```
puzzle-visualizer/
├── index.html   # Algorithm Comparator — HTML 構造
├── main.js      # Algorithm Comparator — 状態管理・API通信・描画
├── style.css    # 共通デザイントークン・レイアウト・アニメーション
├── duel.html    # PDB-max vs L字 Duel — HTML 構造
├── duel.js      # PDB-max vs L字 Duel — ロジック（main.js から独立コピー）
├── duel.css     # PDB-max vs L字 Duel — duel 専用スタイル
└── doc/
    ├── design.md                    # 本ドキュメント
    └── pdb_algorithm_explanation.md # PDB アルゴリズム解説
```

**設計方針：** duel.html・duel.js・duel.css は既存の index.html・main.js・style.css を一切変更しない。  
共通化よりも「コピーして独立」を優先することで、既存ページへの影響リスクをゼロにしている。

---

## 3. ホスティング

| 項目 | 値 |
|---|---|
| ホスティング | GitHub Pages |
| リポジトリ | `egg6112/puzzle-visualizer`（`main` ブランチ・`/ (root)`） |
| 公開URL (メイン) | `https://egg6112.github.io/puzzle-visualizer/` |
| 公開URL (Duel) | `https://egg6112.github.io/puzzle-visualizer/duel.html` |
| 自動デプロイ | `main` ブランチへの push で自動反映 |
| バックエンドAPI | `https://puzzle-api-m99y.onrender.com`（別リポジトリ） |

---

## 4. 画面レイアウト

### 4-1. index.html（Algorithm Comparator）

```
┌────────────────────────────────────────────────────────────────────┐
│           header（タイトル・サブタイトル・API docs リンク）            │
├──────────────────┬─────────────────────┬───────────────────────────┤
│                  │  パネル 0            │  パネル 1                  │
│  コントロール     │  ドロップダウン(A*) │  ドロップダウン(PDB-max)   │
│  サイドバー      │  ┌───────────────┐  │  ┌───────────────┐         │
│  ・Shuffle/Solve │  │  グリッド224×224│  │  │  グリッド224×224│         │
│    /Reset        │  └───────────────┘  │  └───────────────┘         │
│  ・Max time 入力 │  統計 States/Moves/ │  統計 States/Moves/        │
│  ・モード切替    │    h / Time         │    h / Time                │
│  ・シークバー    │  h-compare バー3行  │  h-compare バー3行         │
│  ・再生コントロール│  ステータスバー     │  ステータスバー             │
│  ・比較カードリスト│                   │                            │
└──────────────────┴─────────────────────┴───────────────────────────┘
```

### 4-2. duel.html（PDB-max vs L字 Duel）

```
┌────────────────────────────────────────────────────────────────────┐
│  header（タイトル「最適 vs 人間流」・← メインに戻るリンク）           │
├──────────────────┬─────────────────────┬───────────────────────────┤
│                  │  左パネル            │  右パネル                  │
│  コントロール     │  [PDB-max]          │  [L字]                    │
│  サイドバー      │  max(row,diag) PDB  │  段階的解法                │
│  ・Shuffle/Solve │  ┌───────────────┐  │  ┌───────────────┐         │
│    /Reset        │  │  グリッド224×224│  │  │  グリッド224×224│         │
│  ・Max time 入力 │  └───────────────┘  │  └───────────────┘         │
│  ・Solution Replay│  h(MH) / h(WD)     │  h(MH) / h(WD)            │
│  ・シークバー    │  Time / Optimal     │  Time / Total Moves        │
│    (フェーズマーカー│  Moves / States     │  h-compare バー2行        │
│     付き)        │  h-compare バー2行  │  現フェーズ名ボックス       │
│  ・再生コントロール│  ステータスバー     │  ステータスバー             │
│  ・Speed スライダー│                   │                            │
│  ・凡例          │                    │                            │
└──────────────────┴─────────────────────┴───────────────────────────┘
```

---

## 5. ユーザー操作フロー（index.html）

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
[Solve] ── GET /warmup → 7本逐次 POST /solve_one
  │         完了行からリアルタイムに比較テーブルと各パネルを更新
  │         全完了後 → play() で自動再生開始
  │
  ▼
再生中 ── [Pause] / [◀◀] / [▶▶] / シークスライダー
  │
  ▼
ドロップダウンでパネルのアルゴリズムを切り替え
  │
  ▼
[Solution Replay] / [Explore Replay] でモード切り替え
  │
  ▼
[Reset] ── ゴール盤面に戻す
```

---

## 6. ユーザー操作フロー（duel.html）

```
起動
  │
  ▼
ゴール盤面を表示
  │
  ▼
[Shuffle] ── ランダムウォーク150手でシャッフル
  │            両パネルに MH・WD 値をすぐ表示
  │
  ▼
[Solve] ── GET /warmup
  │     ├─ POST /solve_one {algo:"maxidastar"} → PDB-max 解を取得
  │     └─ POST /solve_staged             → L字 解を取得（phases 付き）
  │         両パネルのローディングオーバーレイを切り替えながら逐次実行
  │         完了後 → step=0 → play() で自動同時再生開始
  │
  ▼
再生中（PDB-max と L字 が同じ step 変数で同期）
  │  ├─ PDB-max: 最適46手前後で先に完了 → ゴール盤面で停止
  │  └─ L字: 94手前後で長く動き続ける → フェーズ名が手順に合わせ切り替わる
  │
  ▼
[◀◀] / [▶▶] / シークスライダー（フェーズマーカー付き）
  │
  ▼
[Reset] ── ゴール盤面に戻す
```

---

## 7. JavaScript 設計（main.js）

### 7-1. 定数

| 定数 | 値 | 説明 |
|---|---|---|
| `API_BASE` | `"https://puzzle-api-m99y.onrender.com"` | API ベース URL |
| `SIZE` | `4` | グリッドサイズ |
| `CELL` | `56` | セルサイズ（px） |
| `GAP` | `3` | タイルのセル内オフセット（px） |
| `GOAL` | `[1,2,...,15,0]` | ゴール盤面 |
| `ALGO_KEYS` | `['astar','idastar','wdastar','wdidastar','pdbidastar','diagidastar','maxidastar']` | 実行順 |
| `SPEED_MS` | `[1800,1200,800,550,400,280,180,110,60,30]` | 速度スライダー 1〜10 対応 ms |

### 7-2. グローバル状態

| 変数 | 型 | 説明 |
|---|---|---|
| `board` | `number[]` | 現在の盤面（16要素） |
| `step` | `number` | 再生ステップインデックス |
| `playing` | `boolean` | 自動再生中フラグ |
| `speed` | `number` | 1ステップあたりの ms |
| `replayMode` | `'explore'\|'solution'` | 再生モード |
| `panelAlgos` | `string[2]` | 各パネルが表示するアルゴリズムキー |
| `results` | `object` | algo → 結果オブジェクトのマップ |
| `algoStates` | `object` | algo → `'waiting'\|'running'\|'done'\|'failed'` |
| `initMH` | `number` | Shuffle 時の初期 Manhattan 距離 |
| `initWD` | `number` | Shuffle 時の初期 Walking Distance |
| `initPDB` | `number` | Solve 後の初期 PDB 値（最初の /solve_one レスポンスから） |
| `tileEls` | `object[2]` | `tileEls[p][v]` = パネル p・タイル v の DOM 要素 |

#### results オブジェクトの構造

```js
results[key] = {
  // API から受け取るフィールド
  moves, states_explored, optimal_moves, time_ms,
  explored_log, explored_h_pdb, h_manhattan, h_wd, h_pdb,
  // エラー時: error, time_ms, states_explored

  // JS 側で生成（成功時のみ）
  path:         buildPath(initial, moves),       // 盤面スナップショット列
  exploredPath: buildExploredPath(explored_log), // Explore Replay 用
  exploredHPdb: explored_h_pdb,                 // step index で参照
}
```

### 7-3. Walking Distance 事前計算

solver.py の `_build_wd_table` を JS で完全再実装。  
`buildWdTable()` → `Map<string, number>`（24,964エントリ）をモジュール評価時に 1 回構築。

### 7-4. 主要関数

| 関数 | 説明 |
|---|---|
| `randomShuffle()` | ゴールからランダムウォーク 150 手 |
| `buildPath(initial, moves)` | moves リストから盤面スナップショット列を生成 |
| `initGrids()` | タイル DOM 要素を生成してグリッドに挿入 |
| `placePanel(p, st)` | CSS `left/top` でタイルを絶対配置。`.correct` クラスを付与 |
| `flashPanel(p, from, to)` | 移動タイルに `.moved` クラスを付与（グロウアニメーション） |
| `renderAll(prevStep)` | 両パネルを描画し `syncProgress()` を呼ぶ |
| `updateHBar(p, st)` | MH・WD・PDB を計算しバーと統計を更新 |
| `updateComparisonTable()` | 比較カードリスト（7行）を results と algoStates から更新 |
| `doSolve()` | ウォームアップ → 7本逐次 `/solve_one` → リアルタイム反映 |
| `play()` / `pause()` / `tick()` | 再生・停止・ステップ進行 |
| `setReplayMode(mode)` | Explore / Solution モード切り替え |

---

## 8. JavaScript 設計（duel.js）

main.js から puzzle ヘルパーと WD テーブルをコピーし、duel 専用ロジックを追加。  
main.js は変更しない・`import` も使わない（完全独立ファイル）。

### 8-1. main.js からコピーした関数

`buildWdTable` / `rowConfig` / `colConfig` / `walkingDistance` / `manhattan` /  
`getNeighbors` / `randomShuffle` / `buildPath` / `initGrids` / `placePanel` / `flashPanel`

### 8-2. duel 専用状態

| 変数 | 説明 |
|---|---|
| `board` | 現在の盤面 |
| `pdbPath` | PDB-max の盤面スナップショット列 |
| `stagedPath` | L字 の盤面スナップショット列 |
| `pdbResult` | /solve_one の結果オブジェクト |
| `stagedResult` | /solve_staged の結果オブジェクト |
| `stagedPhases` | /solve_staged の phases 配列 |
| `step` | 共有ステップインデックス（両パネルが同じ値を使う） |
| `initMH`, `initWD` | Shuffle 時の初期 h 値（h-bar の基準） |

### 8-3. duel 専用関数

| 関数 | 説明 |
|---|---|
| `getStateAt(p, s)` | パネル p のパスから step s の盤面を返す（パス末尾でクランプ） |
| `updateHBar(p, st)` | 両パネルの MH・WD バーを更新（PDB バーなし） |
| `updatePhaseDisplay()` | 現在 step が属する L字 フェーズ名を右パネルに表示 |
| `checkSolvedBothPanels()` | 各パネルがゴールに到達したら "Solved! ✓" を表示 |
| `updatePhaseMarkers()` | シークバーのフェーズ境界に `.phase-marker` を挿入 |
| `doSolve()` | /warmup → /solve_one(maxidastar) → /solve_staged を逐次実行 |
| `stepForward()` / `stepBack()` | 1 ステップ進む / 戻る |

### 8-4. 同時再生の設計

両パネルが同一の `step` 変数を共有する。

```
maxPathLen() = max(pdbPath.length, stagedPath.length)
getStateAt(0, step) → pdb のパスから、path の末尾でクランプ（先に完了しても止まる）
getStateAt(1, step) → staged のパスから同様
```

PDB-max は46手前後で先に GOAL に到達し、その後は GOAL 状態を表示し続ける。  
L字 は94手前後まで動き続ける → 「L字の方が手数が多い」が視覚的に明確になる。

---

## 9. API 通信

### 9-1. index.html の通信フロー

```
GET /warmup
for algo of ALGO_KEYS:
    POST /solve_one {board, algo, max_time}
    → results[algo] を更新・パネルをリアルタイム描画
```

### 9-2. duel.html の通信フロー

```
GET /warmup
POST /solve_one {board, algo:"maxidastar", max_time} → pdbResult / pdbPath
POST /solve_staged {board}                           → stagedResult / stagedPhases / stagedPath
→ 両パネルを step=0 から play()
```

---

## 10. 再生モード（index.html）

| モード | データソース | PDB バー | 用途 |
|---|---|---|---|
| Explore Replay | `results[key].exploredPath` | `exploredHPdb[step]` を参照 | 探索順の可視化 |
| Solution Replay | `results[key].path` | "PDB:—" 固定 | 解答手順の可視化 |

duel.html は Solution Replay のみ（Explore モードなし）。

---

## 11. 比較カードリスト（index.html）

`updateComparisonTable()` が全 7 アルゴリズムの結果を描画する。

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

- `allDone` 時のみ★・カラー確定（最少 = `val-best`、5倍超 = `val-slow`）
- 各行 [▶] ボタンで該当アルゴリズムの Solution Replay をパネルに反映

---

## 12. アニメーション速度

スライダー値（1〜10）に対応する ms テーブル（SPEED_MS）：

| スライダー | ms | 倍率 |
|---|---|---|
| 1 | 1800 | 0.6× |
| 5 | 400 | 2.5×（デフォルト） |
| 10 | 30 | 33.3× |

---

## 13. CSS 設計（style.css）

### 13-1. デザイントークン

Dark Glass パレットをベースにした暗色テーマ。主要変数：

| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#0a0f1e` | ページ背景 |
| `--surface` | `#111827` | カード・パネル背景 |
| `--accent` | `#6366f1` | インディゴ（A* カラー・ボタン） |
| `--pdb-max-color` | `#7dd3fc` | PDB-max / L字フェーズ表示に流用 |
| `--cell` | `56px` | グリッドセルサイズ（4×56 = 224px） |
| `--tile` | `50px` | タイルサイズ（セルより 6px 小さい） |

### 13-2. タイルアニメーション

- **移動**：`transition: left/top 0.22s cubic-bezier(0.4,0,0.2,1)`
- **フラッシュ**：`@keyframes tile-moved`（インディゴのグロウ、400ms）
- **正位置**：`.correct` クラスで青ハイライト

### 13-3. h-compare バー

3行（MH / WD / PDB）の進捗バー。`(1 - 現在h / 初期h) × 100%` で幅を決定。  
PDB バーは Explore Replay 時のみ有効（duel.html では 2 行のみ）。

### 13-4. アクセシビリティ

`prefers-reduced-motion` でアニメーションを無効化。  
`aria-label` / `role="alert"` / `aria-live="polite"` / `<label for>` を適切に使用。

---

## 14. CSS 設計（duel.css）

style.css を変更せず、duel 専用スタイルのみを追加する。

| クラス | 用途 |
|---|---|
| `.seek-wrap` | シークバーと `.phase-marker` を重ねるための `position: relative` ラッパー |
| `.phase-marker` | フェーズ境界を示す縦線（`position: absolute`）。L字 の phases データから生成 |
| `.duel-badge-staged` | L字 バッジ（オレンジ系） |
| `.duel-phase-box` | 現フェーズ名表示ボックス（右パネル下部） |
| `.duel-label-contrast` | 「🔍 遅い・最短」「⚡ 速い・遠回り」のコントラストラベル |
| `.duel-legend` | サイドバー下部の凡例 |

---

## 15. バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0.0 | 2026-05-31 | 初版。A*・IDA* の 2 アルゴリズム、固定パネル |
| 2.0.0 | 2026-06-01 | WD+A*・WD+IDA* を追加。パネルをドロップダウンで切り替え可能に。h-compare バー（MH/WD 2行）・比較テーブルの★カラーコーディングを追加 |
| 3.0.0 | 2026-06-02 | PDB+IDA* を追加。`/compare` 一括呼び出しから `/solve_one` 逐次呼び出しに変更（algoStates ステートマシン）。比較表を縦持ちカードリストに刷新。h-compare バーに PDB バー（3行目）を追加 |
| 4.0.0 | 2026-06-03 | PDB-diag / PDB-max を追加し 7 アルゴリズム構成に拡張。`.b-pdb-diag` / `.b-pdb-max` バッジクラス追加 |
| 5.0.0 | 2026-06-05 | `duel.html` / `duel.css` / `duel.js` を新規追加。PDB-max vs L字 同時 Solution Replay 対比ページ。/solve_staged API を使用。フェーズ名表示・シークバーマーカー・h-bar 表示を実装 |

---

## 16. 関連リポジトリ・URL

| 名前 | URL |
|---|---|
| puzzle-visualizer（フロント） | `https://egg6112.github.io/puzzle-visualizer/` |
| puzzle-visualizer duel ページ | `https://egg6112.github.io/puzzle-visualizer/duel.html` |
| puzzle-visualizer リポジトリ | `https://github.com/egg6112/puzzle-visualizer` |
| puzzle-api（バックエンド） | `https://puzzle-api-m99y.onrender.com` |
| puzzle-api Swagger UI | `https://puzzle-api-m99y.onrender.com/docs` |
| about-me（リンク元） | `https://egg6112.github.io/about-me/` |
