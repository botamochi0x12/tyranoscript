# TyranoScript — Modern Stack Reimplementation

ティラノスクリプトのコアエンジンを、モダンスタックで再実装したものです。
同梱のサンプルゲーム（`data/` 以下のシナリオ・アセット）は**そのまま**動作します。

## スタック

| | 旧実装 | 新実装 |
| --- | --- | --- |
| 言語 | ES5 JavaScript（約4万行） | TypeScript（strict、約2,500行） |
| DOM操作 | jQuery 3.6 + jQuery UI + migrate | ネイティブDOM API |
| アニメーション | anime.js / jQuery.animate | Web Animations API + CSS |
| オーディオ | howler.js | HTMLAudioElement |
| モーダル/UI | remodal / alertify / jsrender | プレーンDOM + CSS |
| セーブ | lz-string + 独自シリアライズ | `localStorage` + JSON（宣言的ステージ状態） |
| ビルド/開発 | なし（scriptタグ直列読み込み） | Vite（HMR・バンドル） |
| テスト | なし | Vitest（パーサ/式評価/インタプリタ 26件） |

ランタイム依存ライブラリは**ゼロ**。ビルド後のエンジンは約 40KB（gzip 13KB）です
（旧実装のライブラリ群は約 1.5MB）。

## 使い方

```bash
npm install
npm run dev        # 開発サーバ（http://localhost:5173）
npm run build      # dist/ に本番ビルド
npm run preview    # ビルド結果の確認
npm test           # ユニットテスト
npm run typecheck  # 型チェック
```

旧エンジンは `tyrano/` 以下に参照用として残してあり、旧エントリポイントは
`index.legacy.html` です（静的サーバでルートを配信すれば従来どおり動きます）。

## アーキテクチャ

```
src/
├─ main.ts               # ブート（Config.tjs 読込 → Engine起動）
├─ styles.css            # ステージ/メッセージ/システムUIのスタイル
└─ core/
   ├─ parser.ts          # .ks パーサ（タグ/テキスト/ラベル/iscript）
   ├─ interpreter.ts     # 実行ループ・マクロ・if分岐・call/jumpスタック
   ├─ expressions.ts     # f/sf/tf/mp スコープと & % エンティティ評価
   ├─ engine.ts          # 統括ファサード（タグディスパッチ・入力・セーブ/ロード）
   ├─ stage.ts           # レイヤ合成・fore/back・トランジション（宣言的状態付き）
   ├─ message.ts         # メッセージウィンドウ（タイプライタ・クリック待ち・フォント）
   ├─ chara.ts           # キャラクター管理（登録/表情/自動整列）
   ├─ audio.ts           # BGM/SE（フェード・自動再生ブロック対応）
   ├─ resources.ts       # アセット解決・シナリオ/Config.tjs ロード
   ├─ tags/              # タグ実装（control/message/layer/chara/ui/audio）
   └─ ui/overlays.ts     # メニュー・セーブ/ロード・バックログ
```

シナリオ（`.ks`）・アセットの形式、`data/` のディレクトリ構成、
`Config.tjs` の主要設定（`scWidth`/`scHeight`/`chSpeed` など）は旧来と互換です。

## 対応タグ

サンプルゲームの全編が動作するタグセットを実装しています。

- 制御: `jump` `call` `return` `s` `wait` `wt` `eval` `emb` `iscript/endscript`
  `macro/endmacro`（`%param|default`・`*` 転送）`if/elsif/else/endif` `clearstack` `title`
- メッセージ: テキスト表示 `p` `l` `r` `cm` `er` `delay` `font` `resetfont` `deffont`
  `ruby` `#話者`（`chara_ptext`）縦書き（`position vertical=true`）
- レイヤ: `bg` `image` `freeimage` `free` `ptext` `backlay` `trans`（crossfade/slide）
  `layopt` `position`（frame画像・margin・opacity）
- キャラ: `chara_new` `chara_face` `chara_config` `chara_show` `chara_mod` `chara_hide`
- UI: `button`（enterimg・role・exp/preexp）`glink` `link/endlink` `clearfix`
  `showmenubutton` `hidemenubutton` `anim` `quake`
- オーディオ: `playbgm` `stopbgm` `fadeoutbgm` `bgmopt` `seopt` `playse` `stopse`
- ロールボタン: save / load / quicksave / quickload / auto / skip / backlog /
  fullscreen / window / title / menu

未実装タグは実行時に `console.warn` を出してスキップします（ゲームは停止しません）。

## 既知の制限（旧実装との差分）

- `role=sleepgame` は「別シナリオの一時実行→復帰」ではなくジャンプとして近似。
- 旧エンジンの内部API（`TG.*`）や jQuery を直接呼ぶ `[iscript]` は互換スタブで
  受けるか、警告を出して安全にスキップします（`config.ks` の一部がこれに該当）。
- 3D（`tag_three`）・カメラ・AR・Live2D・ビデオ系タグは対象外。
- トランジションの `method` は crossfade / slide のみ（その他は crossfade に
  フォールバック）。

## テスト

- `tests/parser.test.ts` — .ks 構文（属性・ラベル・話者行・iscript・実サンプルの
  不正記法への耐性）
- `tests/expressions.test.ts` — 変数スコープ・`&`/`%` エンティティ・型変換
- `tests/interpreter.test.ts` — 実行ループ・ジャンプ・call/return・マクロ・if分岐・
  セーブポイント

加えて、Playwright + 同梱デモゲームによるE2E（タイトル→本編→選択肢分岐→
BGM再生→ロールボタン→セーブ/ロード復元）で検証済みです。
