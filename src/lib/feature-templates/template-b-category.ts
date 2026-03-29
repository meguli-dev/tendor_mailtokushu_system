/**
 * Template B: カテゴリ特集型
 * ヒーロー → 導入文 → おすすめ商品(ピックアップ) → 商品一覧(グリッド) → 選び方ガイド(カード) → 利用シーン → FAQ → CTA
 */
export function getTemplateB(vars: {
  themeColor: string
  themeColorLight: string
  themeColorDark: string
}): string {
  const { themeColor, themeColorLight, themeColorDark } = vars

  return `<div style="max-width:960px;margin:0 auto;font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans',Meiryo,sans-serif;color:#333;line-height:1.8;box-sizing:border-box;">

  <!-- ヒーロー画像 -->
  <!--IF:HERO_IMAGE-->
  <div style="margin:0 0 40px;text-align:center;">
    <img src="{{HERO_IMAGE}}" alt="{{PAGE_TITLE}}" style="width:100%;max-width:960px;border-radius:10px;">
  </div>
  <!--ENDIF:HERO_IMAGE-->

  <!-- 導入テキスト -->
  <div style="margin:48px 0;">
    <div style="background:${themeColorLight};border:1px solid ${themeColorDark};border-radius:10px;padding:28px 24px;">
      <p style="font-size:15px;color:#555;margin:0;line-height:2;">{{INTRO_TEXT}}</p>
    </div>
  </div>

  <!-- おすすめピックアップ -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">おすすめピックアップ</h2>
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;">
      {{RECOMMEND_PRODUCTS}}
    </div>
  </div>

  <!-- 商品一覧グリッド -->
  <!--IF:PRODUCT_GRID-->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">商品一覧</h2>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;">
      {{PRODUCT_GRID}}
    </div>
  </div>
  <!--ENDIF:PRODUCT_GRID-->

  <!-- 選び方ガイド（カード形式） -->
  <!--IF:SELECTION_GUIDE-->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">{{SELECTION_GUIDE_TITLE}}</h2>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">
      {{SELECTION_GUIDE_CARDS}}
    </div>
  </div>
  <!--ENDIF:SELECTION_GUIDE-->

  <!-- 利用シーン -->
  <!--IF:USE_CASES-->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">こんなシーンにおすすめ</h2>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">
      {{USE_CASES}}
    </div>
  </div>
  <!--ENDIF:USE_CASES-->

  <!-- FAQ -->
  <!--IF:FAQ-->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">よくある質問</h2>
    </div>
    {{FAQ_ITEMS}}
  </div>
  <!--ENDIF:FAQ-->

  {{SHARED_SECTIONS}}

  <!-- CTA -->
  <div style="text-align:center;margin:48px 0;">
    <a href="{{CTA_URL}}" style="display:inline-block;padding:16px 54px;background:${themeColor};color:#FFFFFF;font-family:'Noto Sans JP',Meiryo,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:999px;">{{CTA_TEXT}}</a>
  </div>

</div>`
}

/** おすすめ商品カード（大きめ、説明付き） */
export function recommendProductCard(
  name: string, imageUrl: string, productUrl: string,
  description: string, themeColor: string
): string {
  return `<a href="${productUrl}" style="flex:1 1 300px;max-width:440px;background:#fff;border:2px solid ${themeColor};border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;display:block;">
        <img src="${imageUrl}" alt="${name}" style="width:100%;height:220px;object-fit:contain;background:#f9f9f9;padding:12px;">
        <div style="padding:16px;">
          <h4 style="font-size:16px;margin:0 0 8px;color:${themeColor};">${name}</h4>
          <p style="font-size:13px;color:#666;margin:0;line-height:1.7;">${description}</p>
        </div>
      </a>`
}

/** 商品グリッドカード（コンパクト） */
export function gridProductCard(name: string, imageUrl: string, productUrl: string, specs: string): string {
  return `<a href="${productUrl}" style="flex:1 1 200px;max-width:220px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;text-align:center;text-decoration:none;color:inherit;display:block;">
        <img src="${imageUrl}" alt="${name}" style="width:100%;height:160px;object-fit:contain;background:#f9f9f9;padding:8px;">
        <div style="padding:12px;">
          <h4 style="font-size:14px;margin:0 0 4px;">${name}</h4>
          <p style="font-size:12px;color:#777;margin:0;">${specs}</p>
        </div>
      </a>`
}

/** 選び方ガイドカード */
export function selectionGuideCard(title: string, description: string, themeColor: string): string {
  return `<div style="flex:1 1 200px;max-width:300px;background:#fff;border:2px solid ${themeColor};border-radius:10px;padding:20px;text-align:center;">
        <span style="display:inline-flex;align-items:center;justify-content:center;background:${themeColor};color:#fff;font-size:13px;font-weight:bold;padding:5px 16px;border-radius:20px;margin-bottom:10px;"><span style="position:relative;top:1px;">${title}</span></span>
        <p style="font-size:13px;color:#666;margin:8px 0 0;line-height:1.7;">${description}</p>
      </div>`
}

/** 利用シーンカード */
export function categoryUseCaseCard(title: string, description: string, themeColor: string): string {
  return `<div style="flex:1 1 200px;max-width:300px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:20px;">
        <h4 style="font-size:15px;margin:0 0 6px;color:${themeColor};">${title}</h4>
        <p style="font-size:13px;margin:0;color:#666;line-height:1.7;">${description}</p>
      </div>`
}

/** FAQアイテム */
export function categoryFaqItem(question: string, answer: string): string {
  return `<details style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;overflow:hidden;">
      <summary style="padding:14px 18px;font-size:14px;font-weight:bold;cursor:pointer;">Q. ${question}</summary>
      <div style="padding:0 18px 16px 18px;font-size:13px;color:#555;line-height:1.8;">${answer}</div>
    </details>`
}
