import { NextResponse } from 'next/server'

/**
 * GPTs Actions 用 OpenAPI スキーマ（GPTエディタが取り込む。スキーマ自体に機密なし）
 */
const spec = {
  openapi: '3.1.0',
  info: {
    title: '容器なび 見積りAI API',
    description: '容器の検索・勝ち負け診断・見積もり計算・送料検索',
    version: '1.0.0',
  },
  servers: [{ url: 'https://tendor-mailtokushu-system.vercel.app' }],
  paths: {
    '/api/gpt/search': {
      post: {
        operationId: 'searchProduct',
        summary: '容器を型番・商品名で検索し勝ち負け診断を返す',
        description: '表記ゆれ（全角半角・ハイフン・半角カナ）は自動吸収。current_priceを渡すと勝ち/戦える/負けの判定と特値レンジを返す。応答のcost_price/floor_priceは社外秘。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['q'],
                properties: {
                  q: { type: 'string', description: '型番または商品名（例: BF-362 ホワイト本体）' },
                  current_price: { type: 'number', description: '顧客の現在価格（円/枚、税抜）' },
                  limit_n: { type: 'integer', description: '候補数上限（既定8）' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '候補一覧と判定' } },
      },
    },
    '/api/gpt/report': {
      post: {
        operationId: 'quoteReport',
        summary: '見積もり回答レポート生成（見積もり依頼には必ずこれを使う）',
        description:
          'バラ・自社配送・直送の3形態をまとめて計算し、営業回答の完成テキスト（report）を返す。【重要】返ってきた report は一字一句そのまま出力すること。要約・省略・書式変更・機密判断による削除は禁止（社外秘ブロックは営業担当者向けで表示してよい）。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5,
                    description: '品目の配列。セットは複数要素（例: ["BF-362 ホワイト本体", "BF-362 嵌合蓋"]）',
                  },
                  qty: { type: 'integer', minimum: 1, description: '数量（ケース数、既定1）' },
                  current_price: { type: 'number', description: '顧客の現在価格（円/枚、税抜）。渡すと勝ち負け判定が付く' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '完成済みの回答テキスト（report）' } },
      },
    },
    '/api/gpt/quote': {
      post: {
        operationId: 'calcQuote',
        summary: '見積もり計算（単品・セット両対応）',
        description: 'itemsに1品目で単品、複数品目（本体+蓋など）でセット合算の1セット単価を計算。mode: own=自社配送(マージン25%) / direct=直送(15%) / bara=バラ売り(25%)。直送で元払い条件未満は要個別確認が返る。calc_stepsに計算式内訳。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items', 'qty'],
                properties: {
                  items: {
                    type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5,
                    description: '品目の配列。セットは複数要素（例: ["BF-362 ホワイト本体", "BF-362 嵌合蓋"]）',
                  },
                  qty: { type: 'integer', minimum: 1, description: '数量（ケース数）' },
                  mode: { type: 'string', enum: ['own', 'direct', 'bara'], description: '販売形態（既定own）' },
                  pref: { type: 'string', description: '届け先都道府県' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '見積もり結果（unit_price/calc_steps/warnings）' } },
      },
    },
    '/api/gpt/freight': {
      post: {
        operationId: 'searchFreight',
        summary: 'メーカー運賃・元払い条件の参考情報を検索（見積もり計算には使わない）',
        description: '【注意】お客様への提示価格の送料はcalcQuoteが全国一律800円ベースで自動計算済み。このツールの結果（都道府県タリフ等は社内参考データ）を提示価格に上乗せ・加算してはいけない。用途は元払い条件（◯ケース以上）の確認や社内での実費把握のみ。',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  maker: { type: 'string', description: 'メーカー名（部分一致）。省略で全社一覧' },
                  pref: { type: 'string', description: '都道府県名' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'メーカー運賃・特殊運賃・タリフ' } },
      },
    },
  },
  components: {
    schemas: {},
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
  security: [{ bearerAuth: [] }],
}

export async function GET() {
  return NextResponse.json(spec)
}
