# puzzle-visualizer 設計書

作成日：2026-05-31  
公開URL：`https://egg6112.github.io/puzzle-visualizer/`

---

## 1. 概要

15パズル（4×4スライドパズル）を A* と IDA* で並列解法し、探索過程と解答手順をアニメーションで比較できる静的 Web アプリ。

**主な特徴：**
- A* パネルと IDA* パネルが同一盤面を共有し、同じステップで再生される
- Explore Replay（探索順）と Solution Replay（解答手順）の2モードを切り替え可能
- シークスライダーで任意フレームへジャンプできる
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
┌─────────────────────────────────────────────────┐
│              header（タイトル・サブタイトル）       │
├──────────────┬──────────────────────────────────┤
│              │  A* パネル   │  IDA* パネル        │
│  コントロール │  ┌────────┐  │  ┌────────┐        │
│  サイドバー  │  │  グリッド │  │  │  グリッド │        │
│  （aside）   │  └────────┘  │  └────────┘        │
│              │  統計情報   │  統計情報            │
│              │  ステータス  │  ステータス           │
└──────────────┴──────────────────────────────────┘
```

**ブレークポイント 860px 以下：**

```
┌─────────────────────────┐
│  header                 │
├─────────────────────────┤
│  コントロールサイドバー   │
├─────────────────────────┤
│  A* パネル               │
├─────────────────────────┤
│  IDA* パネル             │
└─────────────────────────┘
```

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
  │
  ▼
[Solve] ──────────────────────────────────────────────────┐
  │                                                        │
  ├─ GET /warmup（コールドスタート対策）                     │
  │                                                        │
  ├─ POST /compare（A* と IDA* を並列実行）                 │
  │                                                        │
  ├─ レスポンス受信 → explored_log・moves をパネルに格納    │
  │                                                        │
  └─ 自動再生開始（Explore Replay モード）──────────────────┘
        │
        ▼
   再生中 ── [Pause] / [◀◀] / [▶▶] / シークスライダー
        │
        ▼
   [Solution Replay] / [Explore Replay] でモード切り替え
        │
        ▼
   [Reset] ── ゴール盤面に戻す
```

---

## 6. JavaScript 設計（main.js）

### 6-1. グローバル状態

| 変数 | 型 | 説明 |
|---|---|---|
| `state` | `number[]` | 現在の盤面（16要素） |
| `step` | `number` | 再生中のステップインデックス |
| `playing` | `boolean` | 自動再生中かどうか |
| `timer` | `number\|null` | `setTimeout` のタイマーID |
| `speed` | `number` | 1ステップあたりのミリ秒 |
| `replayMode` | `'explore'\|'solution'` | 再生モード |

### 6-2. パネル状態（`panels` オブジェクト）

A* と IDA* それぞれに独立した状態を持つ。

| フィールド | 型 | 説明 |
|---|---|---|
| `tileEls` | `{[v]: HTMLElement}` | タイル番号→DOM要素のマップ |
| `path` | `number[][]\|null` | 解答手順の盤面リスト（Solution Replay用） |
| `exploredPath` | `number[][]\|null` | 探索過程の盤面リスト（Explore Replay用） |
| `error` | `string\|null` | ソルバーのエラーメッセージ |

### 6-3. 主要関数

| 関数 | 説明 |
|---|---|
| `randomShuffle()` | ゴールからランダムウォーク150手でシャッフル。パリティチェック不要 |
| `buildPath(initial, moves)` | APIの `moves` リストから盤面スナップショット列を生成 |
| `buildExploredPath(exploredLog)` | APIの `explored_log` を盤面配列に変換 |
| `initGrids()` | タイル DOM 要素を生成してグリッドに挿入 |
| `placePanel(key, st)` | CSS `left/top` でタイルを絶対配置 |
| `flashPanel(key, from, to)` | 移動したタイルに `moved` クラスを付与してアニメーション発火 |
| `renderAll(prevStep)` | 両パネルを現在の `step` で描画。`prevStep` がある場合はフラッシュ |
| `doShuffle()` | 盤面をシャッフルして状態をリセット |
| `doSolve()` | ウォームアップ → `/compare` 呼び出し → 結果をパネルに反映 |
| `doReset()` | ゴール盤面に戻す |
| `tick()` | 1ステップ進めて自動再生を継続するタイマーコールバック |
| `setReplayMode(mode)` | Explore / Solution モードを切り替え |

---

## 7. API 通信フロー（doSolve）

```
doSolve() 呼び出し
      │
      ├─ setBusy(true)・showLoadingAll(true)
      │
      ├─ GET /warmup（失敗しても続行）
      │      └─ status: "Waking up API… (first request may take 30–50 s)"
      │
      ├─ POST /compare
      │      body: { board: state, max_time: maxTime }
      │      signal: AbortController（max_time + 10s でタイムアウト）
      │
      ├─ 成功時
      │      ├─ A* / IDA* それぞれのエラー判定
      │      ├─ buildPath / buildExploredPath でパス生成
      │      ├─ setPanelStats・setPanelStatus 更新
      │      └─ play() で自動再生開始
      │
      └─ 失敗時
             ├─ AbortError → Timeout 表示
             └─ TypeError (fetch失敗) → global-error ストリップ表示
```

---

## 8. 再生モード

| モード | データソース | スライダー表示 | 用途 |
|---|---|---|---|
| Explore Replay | `exploredPath`（`explored_log`） | `Explore N / M` | A* と IDA* がどの順番で盤面を探索したか |
| Solution Replay | `path`（`moves` から構築） | `Step N / M` | 最短解答手順のステップ |

両パネルは**同じ `step` 変数を共有**する。スライダーの最大値は `max(A*パスの長さ, IDA*パスの長さ) - 1`。

---

## 9. アニメーション速度

スライダー値（1〜10）に対応するミリ秒テーブル：

| スライダー | ms | 倍率表示 |
|---|---|---|
| 1 | 1800 | 0.6× |
| 5 | 400 | 2.5×（デフォルト） |
| 10 | 30 | 33.3× |

---

## 10. CSS 設計

### 10-1. デザイントークン（CSS カスタムプロパティ）

Dark Glass パレットをベースにした暗色テーマ。

| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#0a0f1e` | ページ背景 |
| `--surface` | `#111827` | カード・パネル背景 |
| `--accent` | `#6366f1` | インディゴ（A* カラー・ボタン） |
| `--astar-color` | `#818cf8` | A* バッジ・統計値 |
| `--idastar-color` | `#34d399` | IDA* バッジ（エメラルド） |
| `--cell` | `80px` | グリッドのセルサイズ（4×80=320px） |
| `--tile` | `74px` | タイルのサイズ（セルより6px小さい） |
| `--grid-size` | `320px` | グリッド全体のサイズ |

### 10-2. タイルアニメーション

- **移動**：`transition: left 0.22s, top 0.22s` による CSS トランジション
- **フラッシュ**：`@keyframes tile-moved`（インディゴのグロー）を `.moved` クラスで発火
- **正位置**：ゴール位置に収まったタイルに `.correct` クラスを付与（青色ハイライト）

### 10-3. アクセシビリティ対応

| 対応 | 内容 |
|---|---|
| `prefers-reduced-motion` | タイルの transition・アニメーション・スピナーをすべて無効化 |
| `<aside aria-label="...">` | コントロールパネルのセマンティクス |
| `aria-label` | Prev / Next ボタンのスクリーンリーダー対応 |
| `<label for="...">` | Max time 入力欄とラベルの関連付け |
| `role="alert"` | エラーストリップの通知 |
| `aria-live="polite"` | ローディングオーバーレイの動的更新通知 |

---

## 11. 関連リポジトリ・URL

| 名前 | URL |
|---|---|
| puzzle-visualizer（フロント） | `https://egg6112.github.io/puzzle-visualizer/` |
| puzzle-visualizer リポジトリ | `https://github.com/egg6112/puzzle-visualizer` |
| puzzle-api（バックエンド） | `https://puzzle-api-m99y.onrender.com` |
| puzzle-api Swagger UI | `https://puzzle-api-m99y.onrender.com/docs` |
| puzzle-api リポジトリ | `https://github.com/egg6112/Hosted`（`puzzle-api/` サブディレクトリ） |
| about-me（リンク元） | `https://egg6112.github.io/about-me/` |
