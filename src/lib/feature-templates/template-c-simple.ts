/**
 * Template C: シンプル訴求型
 * ヒーロー → 訴求テキスト → 商品一覧(6商品) → CTA
 */
export function getTemplateC(vars: {
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

  <!-- 訴求テキスト -->
  <div style="margin:48px 0;">
    <div style="background:${themeColorLight};border:1px solid ${themeColorDark};border-radius:10px;padding:32px 28px;text-align:center;">
      <h2 style="font-size:22px;font-weight:bold;color:${themeColor};margin:0 0 16px;">{{PAGE_TITLE}}</h2>
      <p style="font-size:15px;color:#555;margin:0;line-height:2;">{{APPEAL_TEXT}}</p>
    </div>
  </div>

  <!-- 商品一覧 -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">おすすめ商品</h2>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;">
      {{PRODUCT_LIST}}
    </div>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin:48px 0;">
    <a href="{{CTA_URL}}" style="display:inline-block;padding:16px 54px;background:${themeColor};color:#FFFFFF;font-family:'Noto Sans JP',Meiryo,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:999px;">{{CTA_TEXT}}</a>
  </div>

</div>`
}

/** 商品カード（説明付き） */
export function simpleProductCard(
  name: string, imageUrl: string, productUrl: string,
  description: string, themeColor: string
): string {
  return `<a href="${productUrl}" style="flex:1 1 280px;max-width:300px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;display:block;">
        <img src="${imageUrl}" alt="${name}" style="width:100%;height:200px;object-fit:contain;background:#f9f9f9;padding:10px;">
        <div style="padding:16px;">
          <h4 style="font-size:15px;margin:0 0 8px;color:${themeColor};">${name}</h4>
          <p style="font-size:13px;color:#666;margin:0;line-height:1.7;">${description}</p>
        </div>
      </a>`
}
