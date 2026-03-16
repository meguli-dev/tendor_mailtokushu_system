# 容器なび メルマガ・特集ページ構築アプリ 設計書

**プロジェクト名**: 容器なび メルマガ・特集ビルダー  
**クライアント**: テンドール物流株式会社  
**作成日**: 2026-03-15  
**バージョン**: v0.1（壁打ち後初版）

---

## 1. システム概要

### 1.1 目的

容器なび（yo-ki-navi.com）のメールマガジンおよび特集ページのHTML生成を、初心者でも運用できるWebアプリとして構築する。商品画像の自動取得、AI活用によるバナー/ヘッダー画像生成支援、メール配信サービス（Cunote）への連携を一気通貫で実現する。

### 1.2 スコープ

**含むもの:**
- メルマガ本文HTML生成（テンプレートベース）
- 特集ページHTML生成
- 商品ページからの自動画像取得 → S3アップロード
- ヘッダー画像/バナー生成支援（3方式）
- ユーザー認証（SCOS共通基盤）

**含まないもの:**
- メール配信そのもの（Cunoteで実施）
- 容器なびECサイト本体の改修
- SCOSとの業務データ連携（将来対応）


### 1.3 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js (App Router) |
| ホスティング | Vercel |
| バックエンドAPI | Next.js API Routes (Route Handlers) |
| データベース | Amazon RDS (MySQL/PostgreSQL) ※SCOS共通 |
| 画像ストレージ | Amazon S3 ※既存バケット共用 |
| AI（画像生成） | Google Gemini API (Imagen) |
| AI（テキスト生成） | Google Gemini API |
| 外部連携 | Manus API（将来拡張枠） |

---

## 2. システムアーキテクチャ

### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────┐
│                    ユーザー（ブラウザ）                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              Vercel（Next.js App）                     │
│  ┌───────────────┐  ┌────────────────────────────┐  │
│  │  フロントエンド   │  │   API Routes               │  │
│  │  (React/Next)  │  │   /api/auth/*              │  │
│  │                │  │   /api/newsletter/*        │  │
│  │  - メルマガ編集  │  │   /api/product/*           │  │
│  │  - 画像生成     │  │   /api/image/*             │  │
│  │  - テンプレ選択  │  │   /api/banner/*            │  │
│  │  - HTML出力    │  │   /api/feature-page/*      │  │
│  └───────────────┘  └──────┬─────────────────────┘  │
└─────────────────────────────┼────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│  Amazon RDS   │   │  Amazon S3   │   │  外部サービス      │
│              │   │              │   │                  │
│  - users     │   │  - 商品画像   │   │  - Gemini API    │
│  - sessions  │   │  - バナー画像  │   │  - 容器なび       │
│  - templates │   │  - ヘッダー画像 │   │    (スクレイピング) │
│  - newsletters│  │              │   │  - Manus API     │
│  - products  │   │              │   │    (将来拡張)     │
│  - images    │   │              │   │                  │
└──────────────┘   └──────────────┘   └──────────────────┘
```

### 2.2 データフロー

```
【メルマガ作成フロー】

商品URL入力 ──┬── [自動] fetch → HTMLパース → 商品名・画像URL取得
              │         → 画像DL → S3アップ → S3 URL生成
              │
              └── [手動] 画像URLを直接入力（トグルで切替）
                    │
                    ▼
          テンプレートパターン選択
                    │
                    ▼
          メール本文HTML生成 ←── AI（キャッチコピー生成）
                    │
                    ├── [ヘッダー画像なし] → HTML出力完了
                    │
                    └── [ヘッダー画像あり] → ②③④のいずれかへ
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ② Gemini生成     ③ GenSpark      ④ Manus API
        テンプレ選択      プロンプト生成     （将来拡張）
        商品画像指定      参考画像選択
        テキスト入力      素材画像指定
              │               │
              ▼               ▼
        画像生成・承認    プロンプトコピー
              │          → GenSparkで実行
              ▼          → 画像DL
        S3アップ         → S3アップ
              │               │
              └───────┬───────┘
                      ▼
            ヘッダー画像URL取得
                      │
                      ▼
            ヘッダー付きHTML出力完了
                      │
                      ▼
              Cunoteに貼り付けて配信
```

---

## 3. 画面設計

### 3.1 画面一覧

| # | 画面名 | パス | 概要 |
|---|---|---|---|
| 0 | ログイン | `/login` | SCOS共通認証 |
| 1 | ダッシュボード | `/` | 作成済みメルマガ一覧・新規作成ボタン |
| 2 | メルマガ作成 | `/newsletter/new` | メイン編集画面 |
| 3 | メルマガ編集 | `/newsletter/[id]` | 既存メルマガ編集 |
| 4 | HTML出力 | `/newsletter/[id]/export` | 生成HTML表示・コピー |
| 5 | バナー/ヘッダー生成 | `/banner/create` | 画像生成（②③④切替） |
| 6 | 特集ページ作成 | `/feature/new` | 特集ページHTML編集 |
| 7 | 特集ページ編集 | `/feature/[id]` | 既存特集ページ編集 |
| 8 | 画像管理 | `/images` | S3アップ済み画像一覧 |
| 9 | テンプレート管理 | `/templates` | テンプレートパターン管理（管理者向け） |

### 3.2 ワイヤーフレーム

#### 画面0: ログイン

```
┌─────────────────────────────────────┐
│           容器なび                    │
│      メルマガ・特集ビルダー             │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  ログインID                     │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  パスワード                     │  │
│  └───────────────────────────────┘  │
│                                     │
│       [ ログイン ]                   │
│                                     │
└─────────────────────────────────────┘
```

#### 画面1: ダッシュボード

```
┌─────────────────────────────────────────────────────┐
│  容器なび メルマガビルダー        [画像管理] [ログアウト]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐  ┌─────────────────┐          │
│  │  + メルマガ作成   │  │  + 特集ページ作成 │          │
│  └─────────────────┘  └─────────────────┘          │
│                                                     │
│  ── 最近のメルマガ ──────────────────────────────     │
│  │ タイトル          │ 作成日    │ 状態  │ 操作  │     │
│  │ 春の丼もの特集      │ 2026/3/10 │ 下書き │ 編集  │     │
│  │ 新商品入荷のお知らせ │ 2026/3/5  │ 配信済 │ 複製  │     │
│  │ ...               │           │       │       │     │
│                                                     │
│  ── 最近の特集ページ ────────────────────────────     │
│  │ タイトル          │ 作成日    │ 状態  │ 操作  │     │
│  │ ...               │           │       │       │     │
└─────────────────────────────────────────────────────┘
```

#### 画面2: メルマガ作成（メイン画面）

```
┌──────────────────────────────────────────────────────────────┐
│  ← 戻る    メルマガ作成                         [下書き保存]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  メルマガタイトル                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  春の容器特集 〜テイクアウトを華やかに〜                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ── ヘッダー画像設定 ────────────────────────────────────     │
│  ┌──────────────────────────┐                               │
│  │  ☑ ヘッダー画像を使用する   │                               │
│  └──────────────────────────┘                               │
│  ヘッダー画像URL: [________________________] [バナー生成へ →]  │
│                                                              │
│  ── テンプレート選択 ────────────────────────────────────     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                      │
│  │ パターンA │ │ パターンB │ │ パターンC │                      │
│  │ 2商品    │ │ 4商品    │ │ ランキング│                      │
│  │ [thumb]  │ │ [thumb]  │ │ [thumb]  │                      │
│  └─────────┘ └─────────┘ └─────────┘                      │
│                                                              │
│  ── 商品登録 ─────────────────────────────────────────       │
│                                                              │
│  画像取得方式:  ○ 自動（URLから取得）  ○ 手動（画像URL指定）     │
│                                                              │
│  商品1                                                       │
│  ┌──────────────────────────────────┐ ┌──────┐             │
│  │ https://yo-ki-navi.com/product... │ │ 取得  │             │
│  └──────────────────────────────────┘ └──────┘             │
│  → 商品名: DLV麺丼18（73）  画像: ✅ S3アップ済               │
│                                                              │
│  商品2                                                       │
│  ┌──────────────────────────────────┐ ┌──────┐             │
│  │ https://yo-ki-navi.com/product... │ │ 取得  │             │
│  └──────────────────────────────────┘ └──────┘             │
│  → 取得中...                                                 │
│                                                              │
│  [+ 商品を追加]                                               │
│                                                              │
│  ── ランキング / 追加商品情報（テンプレートに応じて表示）──        │
│  商品URL × 4  + 各画像URL                                     │
│                                                              │
│  ── 特集情報（任意）─────────────────────────────────         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  特集タイトル / 説明文                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│           [ プレビュー ]     [ HTML生成 ]                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 画面5: バナー/ヘッダー画像生成

```
┌──────────────────────────────────────────────────────────────┐
│  ← メルマガ編集に戻る    バナー/ヘッダー画像生成                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ── 生成方式 ────────────────────────────────                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ ② Gemini生成  │ │ ③ GenSpark   │ │ ④ Manus API  │        │
│  │    (実験)     │ │  (プロンプト) │ │   (将来)     │        │
│  │   ★選択中     │ │              │ │   🔒無効     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                              │
│  ── メルマガ情報（自動入力）──────────────────────────         │
│  タイトル: 春の容器特集 〜テイクアウトを華やかに〜               │
│  商品数: 4点                                                  │
│  ┌──────────────────────────────────────┐                   │
│  │ ページ説明（①の出力から自動生成）         │                   │
│  │ 春のテイクアウト需要に応える容器を...      │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  ── ② Gemini生成 設定 ──────────────────────────────         │
│                                                              │
│  テンプレートパターン:                                         │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ 丸抜き6枚│ │ 横並び3枚│ │ メイン1枚│                          │
│  └────────┘ └────────┘ └────────┘                          │
│                                                              │
│  使用する商品画像:                                             │
│  [✅ DLV麺丼18] [✅ CT沙楽 K27-20] [✅ CFカップ] [☐ ...]     │
│                                                              │
│  メインテキスト:                                               │
│  ┌──────────────────────────────────────┐                   │
│  │  春の丼もの特集                         │                   │
│  └──────────────────────────────────────┘                   │
│  サブテキスト:                                                 │
│  ┌──────────────────────────────────────┐                   │
│  │  テイクアウトを華やかに                  │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  サイズ: [  800  ] × [  400  ] px                             │
│                                                              │
│          [ 生成する ]                                         │
│                                                              │
│  ── 生成結果 ────────────────────────────────                │
│  ┌──────────────────────────────────────┐                   │
│  │                                      │                   │
│  │         [生成された画像プレビュー]       │                   │
│  │                                      │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│    [ 再生成 ]    [ ✅ 承認してS3にアップ ]                      │
│                                                              │
│  ── ③ GenSpark プロンプト出力エリア（タブ切替時）──              │
│  ┌──────────────────────────────────────┐                   │
│  │  以下のプロンプトをGenSparkに貼り付けて   │                   │
│  │  ください:                              │                   │
│  │                                        │                   │
│  │  「800x400pxのバナー画像を作成して...     │                   │
│  │   参考画像のスタイルで、以下の商品画像を   │                   │
│  │   丸く切り抜いて配置し...」              │                   │
│  │                                        │                   │
│  └──────────────────────────────────────┘                   │
│              [ 📋 クリップボードにコピー ]                      │
│                                                              │
│  完成画像のアップロード:                                       │
│  [ファイルを選択] または [画像URLを入力]                         │
│              [ S3にアップ → メルマガに反映 ]                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 画面4: HTML出力

```
┌──────────────────────────────────────────────────────────────┐
│  ← 編集に戻る    HTML出力                                      │
├────────────────────────────┬─────────────────────────────────┤
│                            │                                 │
│  ── HTMLソース ──           │  ── プレビュー ──                │
│  ┌────────────────────┐   │  ┌───────────────────────────┐  │
│  │ <!DOCTYPE html>    │   │  │                           │  │
│  │ <html>             │   │  │   [ヘッダー画像]           │  │
│  │ <head>...</head>   │   │  │                           │  │
│  │ <body>             │   │  │   春の容器特集              │  │
│  │   <table>          │   │  │   〜テイクアウトを華やかに〜 │  │
│  │   ...              │   │  │                           │  │
│  │                    │   │  │   [商品1] [商品2]          │  │
│  │                    │   │  │   [商品3] [商品4]          │  │
│  │                    │   │  │                           │  │
│  └────────────────────┘   │  └───────────────────────────┘  │
│                            │                                 │
│  [ 📋 HTMLをコピー ]        │                                 │
│  [ 📧 Cunoteへの手順を表示 ] │                                 │
│                            │                                 │
└────────────────────────────┴─────────────────────────────────┘
```

---

## 4. データベース設計

### 4.1 既存テーブル（SCOS認証基盤）

```
※ SCOS側で構築済み。本アプリはこれを参照する。

users（既存）
├── id                  : INT (PK)
├── login_id            : VARCHAR
├── password_hash       : VARCHAR
├── name                : VARCHAR
├── email               : VARCHAR
├── role                : ENUM('admin', 'editor', 'viewer')
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

sessions（既存）
├── id                  : VARCHAR (PK)
├── user_id             : INT (FK → users.id)
├── token               : VARCHAR
├── expires_at          : TIMESTAMP
└── created_at          : TIMESTAMP
```

### 4.2 新規テーブル（本アプリ用）

```
newsletters（メルマガ）
├── id                  : INT (PK, AUTO_INCREMENT)
├── user_id             : INT (FK → users.id)
├── title               : VARCHAR(255)
├── template_id         : INT (FK → newsletter_templates.id)
├── has_header_image    : BOOLEAN DEFAULT false
├── header_image_url    : VARCHAR(500) NULL
├── feature_title       : VARCHAR(255) NULL
├── feature_description : TEXT NULL
├── html_output         : LONGTEXT NULL
├── status              : ENUM('draft', 'exported', 'sent') DEFAULT 'draft'
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

newsletter_products（メルマガ×商品 中間テーブル）
├── id                  : INT (PK, AUTO_INCREMENT)
├── newsletter_id       : INT (FK → newsletters.id)
├── sort_order          : INT
├── product_url         : VARCHAR(500)
├── product_name        : VARCHAR(255) NULL
├── product_image_url   : VARCHAR(500) NULL  ── 元の容器なびURL
├── s3_image_url        : VARCHAR(500) NULL  ── S3にアップ後のURL
├── is_ranking          : BOOLEAN DEFAULT false
├── rank_position       : INT NULL
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

newsletter_templates（メルマガテンプレート）
├── id                  : INT (PK, AUTO_INCREMENT)
├── name                : VARCHAR(100)
├── description         : VARCHAR(255)
├── product_count       : INT  ── 2 or 4
├── has_ranking         : BOOLEAN DEFAULT false
├── html_template       : LONGTEXT  ── テンプレートHTML（変数埋め込み用）
├── thumbnail_url       : VARCHAR(500) NULL
├── is_active           : BOOLEAN DEFAULT true
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

feature_pages（特集ページ）
├── id                  : INT (PK, AUTO_INCREMENT)
├── user_id             : INT (FK → users.id)
├── title               : VARCHAR(255)
├── template_id         : INT (FK → feature_templates.id)
├── header_image_url    : VARCHAR(500) NULL
├── html_output         : LONGTEXT NULL
├── status              : ENUM('draft', 'published') DEFAULT 'draft'
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

feature_templates（特集ページテンプレート）
├── id                  : INT (PK, AUTO_INCREMENT)
├── name                : VARCHAR(100)
├── html_template       : LONGTEXT
├── thumbnail_url       : VARCHAR(500) NULL
├── is_active           : BOOLEAN DEFAULT true
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

feature_products（特集ページ×商品）
├── id                  : INT (PK, AUTO_INCREMENT)
├── feature_page_id     : INT (FK → feature_pages.id)
├── sort_order          : INT
├── product_url         : VARCHAR(500)
├── product_name        : VARCHAR(255) NULL
├── s3_image_url        : VARCHAR(500) NULL
├── description         : TEXT NULL
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

images（画像管理）
├── id                  : INT (PK, AUTO_INCREMENT)
├── user_id             : INT (FK → users.id)
├── s3_key              : VARCHAR(500)
├── s3_url              : VARCHAR(500)
├── original_url        : VARCHAR(500) NULL  ── 元URL（自動取得の場合）
├── image_type          : ENUM('product', 'banner', 'header', 'other')
├── file_name           : VARCHAR(255)
├── file_size           : INT NULL
├── width               : INT NULL
├── height              : INT NULL
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP

banner_generation_logs（バナー生成ログ）
├── id                  : INT (PK, AUTO_INCREMENT)
├── user_id             : INT (FK → users.id)
├── newsletter_id       : INT NULL (FK → newsletters.id)
├── feature_page_id     : INT NULL (FK → feature_pages.id)
├── method              : ENUM('gemini', 'genspark_prompt', 'manus', 'manual')
├── prompt              : TEXT NULL
├── input_params        : JSON NULL  ── 入力パラメータ全体
├── result_image_url    : VARCHAR(500) NULL
├── status              : ENUM('pending', 'generated', 'approved', 'rejected')
├── created_at          : TIMESTAMP
└── updated_at          : TIMESTAMP
```

### 4.3 ER図

```
users (既存/SCOS)
  │
  ├──< newsletters
  │       │
  │       ├──< newsletter_products
  │       │
  │       └── newsletter_templates
  │
  ├──< feature_pages
  │       │
  │       ├──< feature_products
  │       │
  │       └── feature_templates
  │
  ├──< images
  │
  └──< banner_generation_logs
            │
            ├── newsletters (nullable)
            └── feature_pages (nullable)
```

---

## 5. API設計

### 5.1 認証

| メソッド | エンドポイント | 概要 |
|---|---|---|
| POST | `/api/auth/login` | ログイン（SCOS共通認証） |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | ログインユーザー情報取得 |

### 5.2 メルマガ

| メソッド | エンドポイント | 概要 |
|---|---|---|
| GET | `/api/newsletter` | メルマガ一覧取得 |
| POST | `/api/newsletter` | メルマガ新規作成 |
| GET | `/api/newsletter/:id` | メルマガ詳細取得 |
| PUT | `/api/newsletter/:id` | メルマガ更新 |
| DELETE | `/api/newsletter/:id` | メルマガ削除 |
| POST | `/api/newsletter/:id/export` | HTML生成・エクスポート |
| POST | `/api/newsletter/:id/duplicate` | メルマガ複製 |

### 5.3 特集ページ

| メソッド | エンドポイント | 概要 |
|---|---|---|
| GET | `/api/feature-page` | 特集ページ一覧取得 |
| POST | `/api/feature-page` | 特集ページ新規作成 |
| GET | `/api/feature-page/:id` | 特集ページ詳細取得 |
| PUT | `/api/feature-page/:id` | 特集ページ更新 |
| DELETE | `/api/feature-page/:id` | 特集ページ削除 |
| POST | `/api/feature-page/:id/export` | HTML生成・エクスポート |

### 5.4 商品情報取得

| メソッド | エンドポイント | 概要 |
|---|---|---|
| POST | `/api/product/scrape` | 商品ページから情報取得（商品名・画像URL） |

**リクエスト例:**
```json
{
  "product_url": "https://yo-ki-navi.com/product.php?id=2415",
  "auto_upload_s3": true
}
```

**レスポンス例:**
```json
{
  "product_name": "DLV麺丼18（73）",
  "original_image_url": "https://yo-ki-navi.com/uploads/images/fpco/deli/dlvmen/dlv-men.jpg",
  "s3_image_url": "https://s3.ap-northeast-1.amazonaws.com/bucket/products/2415_dlv-men.jpg"
}
```

**スクレイピングロジック:**
```
セレクタ: .__primary .__main img[src] → メイン商品画像
セレクタ: h1.__title → 商品名
URL: product.php?id=XXXX → IDをファイル名に利用
```

### 5.5 画像管理

| メソッド | エンドポイント | 概要 |
|---|---|---|
| GET | `/api/image` | アップ済み画像一覧 |
| POST | `/api/image/upload` | 画像を直接S3にアップ |
| POST | `/api/image/upload-from-url` | URLから画像取得→S3アップ |
| DELETE | `/api/image/:id` | 画像削除 |

### 5.6 バナー/ヘッダー画像生成

| メソッド | エンドポイント | 概要 |
|---|---|---|
| GET | `/api/banner/templates` | バナーテンプレートパターン一覧 |
| POST | `/api/banner/generate-gemini` | ②Gemini画像生成 |
| POST | `/api/banner/generate-prompt` | ③GenSparkプロンプト生成 |
| POST | `/api/banner/generate-manus` | ④Manus API呼び出し（将来） |
| POST | `/api/banner/:id/approve` | 生成画像を承認→S3アップ |

**② Gemini生成リクエスト例:**
```json
{
  "template_pattern": "circle_6",
  "product_images": [
    "https://s3.../products/2415_dlv-men.jpg",
    "https://s3.../products/3001_ct-sara.jpg"
  ],
  "main_text": "春の丼もの特集",
  "sub_text": "テイクアウトを華やかに",
  "width": 800,
  "height": 400,
  "page_context": "春のテイクアウト需要に応える容器を厳選..."
}
```

**③ GenSparkプロンプト生成リクエスト例:**
```json
{
  "reference_image_url": "https://s3.../banners/ref_donmono.png",
  "product_images": [
    "https://s3.../products/2415_dlv-men.jpg"
  ],
  "main_text": "春の丼もの特集",
  "sub_text": "テイクアウトを華やかに",
  "width": 800,
  "height": 400,
  "page_context": "春のテイクアウト需要に応える容器を厳選..."
}
```

**③ GenSparkプロンプト生成レスポンス例:**
```json
{
  "prompt": "800×400pxのバナー画像を作成してください。\n\n【参考スタイル】\n添付の参考画像と同じレイアウト・トーンで...\n\n【配置する商品画像】\n1. DLV麺丼18（73）（添付画像1）\n...\n\n【テキスト】\nメイン: 春の丼もの特集\nサブ: テイクアウトを華やかに\n...",
  "reference_images": ["https://s3.../banners/ref_donmono.png"],
  "product_images": ["https://s3.../products/2415_dlv-men.jpg"]
}
```

### 5.7 テンプレート管理

| メソッド | エンドポイント | 概要 |
|---|---|---|
| GET | `/api/template/newsletter` | メルマガテンプレート一覧 |
| GET | `/api/template/feature` | 特集テンプレート一覧 |
| GET | `/api/template/banner` | バナーテンプレートパターン一覧 |

---

## 6. 商品画像 自動取得仕様

### 6.1 対象サイト

容器なび（https://yo-ki-navi.com）- Bカートベース

### 6.2 取得方式

```
方式: サーバーサイド HTTP fetch + HTMLパース（cheerio）
※ Puppeteer不要（画像はlazyloadなし、直接srcに記述）

手順:
1. product.php?id=XXXX をGETリクエスト
2. cheerioでHTMLパース
3. セレクタ .__primary .__main img の src属性 → メイン商品画像URL
4. セレクタ h1.__title のテキスト → 商品名
5. 画像URLからfetchでバイナリ取得
6. S3にアップロード（キー: products/{product_id}_{sanitized_filename}.{ext}）
7. S3 URLを返却
```

### 6.3 手動/自動切替

フロントエンドのトグルスイッチで切替:
- **自動ON**: 商品URL入力 → 「取得」ボタン → 自動でスクレイピング+S3アップ
- **自動OFF**: 商品画像URLを直接入力するフィールドが表示される

---

## 7. バナー/ヘッダー画像生成仕様

### 7.1 方式②: Gemini API画像生成

```
利用API: Google Gemini API (Imagen)
用途: テンプレートパターンに基づく画像生成（実験的）

入力:
- テンプレートパターン（レイアウト指示）
- 商品画像URL群
- メインテキスト / サブテキスト
- サイズ指定
- ページコンテキスト（①の出力）

処理:
1. テンプレートパターンに基づくプロンプト構築
2. Gemini APIで画像生成
3. 生成画像をプレビュー表示
4. ユーザー承認 → S3アップ / 再生成

課題・留意点:
- 日本語テキスト描画の品質が不安定
- 商品画像の正確な再現が困難な場合あり
- 背景生成 + プログラム合成のハイブリッドも検討
```

### 7.2 方式③: GenSparkプロンプト生成（メイン）

```
用途: GenSparkに貼り付けるための最適化プロンプトを自動構築

入力:
- 参考画像（過去のバナー）
- 商品画像URL群
- テキスト情報
- サイズ指定
- ページコンテキスト（①の出力）

処理:
1. 入力情報からGenSpark向け最適化プロンプトを構築（LLM使用）
2. プロンプトをテキストエリアに表示
3. 「クリップボードにコピー」ボタン
4. ユーザーがGenSparkで実行
5. 完成画像をアプリに戻してS3アップ
   - ファイルアップロード
   - または画像URL入力

注: アプリ外での作業が発生するが、最も確実に高品質なバナーが作れる方式
```

### 7.3 方式④: Manus API（将来拡張）

```
前提: Manus有料契約 + APIキー登録
優先度: 低（将来対応）

処理:
1. Manus APIにタスクを送信
2. Manusが内部でGemini等を使い画像生成
3. 品質確認・再生成をエージェントが自動実行
4. 完成画像をアプリに返却
5. ユーザー承認 → S3アップ

設定画面でAPIキーを登録すると有効化される仕組み
```

---

## 8. 非機能要件

### 8.1 認証・セキュリティ

- SCOS共通のRDSユーザーテーブルで認証
- セッションベース認証（JWT or cookie-session）
- API Routes は全て認証ミドルウェアを通す
- S3アクセスはサーバーサイド経由（クライアントにAWSキーを露出しない）

### 8.2 パフォーマンス

- 商品画像スクレイピング: 1商品あたり2-3秒以内
- HTML生成: 即時（テンプレート埋め込み）
- Gemini画像生成: 10-30秒（ローディング表示必須）

### 8.3 運用想定

- 利用者: テンドール物流 社内担当者（少人数）
- 配信頻度: 月2-4回程度
- 同時利用: 1-2名

---

## 9. 開発フェーズ（案）

| フェーズ | 内容 | 目安 |
|---|---|---|
| Phase 1 | 認証 + ダッシュボード + メルマガHTML生成（①の基本機能） | 2-3週間 |
| Phase 2 | 商品自動取得 + S3アップ + 手動/自動切替 | 1-2週間 |
| Phase 3 | ③GenSparkプロンプト生成 + バナー画像アップ | 1-2週間 |
| Phase 4 | ②Gemini画像生成（実験） | 1-2週間 |
| Phase 5 | 特集ページHTML生成 | 1-2週間 |
| Phase 6 | ④Manus API連携（将来） | TBD |
