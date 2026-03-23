/**
 * Template A: 新商品紹介型
 * ヒーロー → 課題提起 → 特長 → ラインナップ → 利用シーン → 選び方 → FAQ → CTA
 */
export function getTemplateA(vars: {
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

  <!-- 課題提起セクション -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <!--IF:BADGE_TEXT-->
      <span style="display:inline-flex;align-items:center;justify-content:center;background:${themeColor};color:#fff;font-size:12px;font-weight:bold;padding:4px 14px;border-radius:20px;margin-bottom:8px;"><span style="position:relative;top:1px;">{{BADGE_TEXT}}</span></span><br>
      <!--ENDIF:BADGE_TEXT-->
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">{{PROBLEM_SECTION_TITLE}}</h2>
    </div>
    <div style="background:${themeColorLight};border:1px solid ${themeColorDark};border-radius:10px;padding:28px 24px;">

      <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;">
        <!-- これまで -->
        <div style="flex:1 1 280px;max-width:440px;">
          <h4 style="font-size:15px;margin:0 0 12px;color:#999;text-align:center;">これまで</h4>
          <!--IF:PROBLEM_BEFORE_IMAGE-->
          <div style="border-radius:8px;overflow:hidden;margin-bottom:12px;height:200px;">
            <img src="{{PROBLEM_BEFORE_IMAGE}}" alt="これまで" style="width:100%;height:100%;object-fit:cover;display:block;">
          </div>
          <!--ENDIF:PROBLEM_BEFORE_IMAGE-->
          <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:#666;">
            {{PROBLEM_BEFORE_ITEMS}}
          </ul>
        </div>
        <!-- これから -->
        <div style="flex:1 1 280px;max-width:440px;">
          <h4 style="font-size:15px;margin:0 0 12px;color:${themeColor};text-align:center;">これから</h4>
          <!--IF:PROBLEM_AFTER_IMAGE-->
          <div style="border-radius:8px;overflow:hidden;margin-bottom:12px;height:200px;">
            <img src="{{PROBLEM_AFTER_IMAGE}}" alt="これから" style="width:100%;height:100%;object-fit:cover;display:block;">
          </div>
          <!--ENDIF:PROBLEM_AFTER_IMAGE-->
          <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:#555;">
            {{PROBLEM_AFTER_ITEMS}}
          </ul>
        </div>
      </div>

      <p style="text-align:center;margin:24px 0 0;font-size:22px;color:${themeColor};font-weight:bold;line-height:1.8;">{{SOLUTION_TEXT}}</p>
    </div>
  </div>

  <!-- 特長セクション -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">{{FEATURE_SECTION_TITLE}}</h2>
    </div>

    <!-- メイン特長（3つ） -->
    <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-bottom:20px;">
      {{MAIN_FEATURES}}
    </div>

    <!-- サブ特長（4つ） -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
      {{SUB_FEATURES}}
    </div>
  </div>

  <!-- 商品ラインナップ -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">ラインナップ</h2>
    </div>
    {{PRODUCT_LINEUP}}

    <div style="text-align:center;margin-top:32px;">
      <a href="{{CTA_URL}}" style="display:inline-block;padding:16px 54px;background:${themeColor};color:#FFFFFF;font-family:'Noto Sans JP',Meiryo,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;border-radius:999px;">{{CTA_TEXT}}</a>
    </div>
  </div>

  <!-- 利用シーン -->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">こんなシーンにおすすめ</h2>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">
      {{USE_CASES}}
    </div>
  </div>

  <!-- 選び方ガイド -->
  <!--IF:SIZE_GUIDE-->
  <div style="margin:48px 0;">
    <div style="background:linear-gradient(135deg,${themeColorLight} 0%,#fff5eb 100%);border:1px solid ${themeColorDark};border-radius:10px;padding:24px;">
      <h3 style="font-size:16px;margin:0 0 16px;color:${themeColor};text-align:center;">{{SIZE_GUIDE_TITLE}}</h3>
      <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;">
        {{SIZE_GUIDE_ITEMS}}
      </div>
    </div>
  </div>
  <!--ENDIF:SIZE_GUIDE-->

  <!-- FAQ -->
  <!--IF:FAQ-->
  <div style="margin:48px 0;">
    <div style="text-align:center;margin-bottom:24px;">
      <h2 style="font-size:22px;font-weight:bold;border-bottom:3px solid ${themeColor};display:inline-block;padding-bottom:12px;margin:0;">よくある質問</h2>
    </div>
    {{FAQ_ITEMS}}
  </div>
  <!--ENDIF:FAQ-->

</div>`
}

/** メイン特長カード1つ分のHTML */
export function mainFeatureCard(index: number, title: string, description: string, themeColor: string): string {
  return `<div style="flex:1 1 200px;max-width:300px;background:#fff;border:2px solid ${themeColor};border-radius:10px;padding:20px;text-align:center;">
        <span style="display:inline-flex;align-items:center;justify-content:center;background:${themeColor};color:#fff;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:12px;margin-bottom:8px;"><span style="position:relative;top:1px;">特長${index}</span></span>
        <h4 style="font-size:15px;margin:6px 0;color:${themeColor};">${title}</h4>
        <p style="font-size:13px;color:#666;margin:0;">${description}</p>
      </div>`
}

/** サブ特長カード1つ分のHTML */
export function subFeatureCard(index: number, text: string, themeColor: string, themeColorLight: string, themeColorDark: string): string {
  return `<div style="flex:1 1 140px;max-width:220px;background:${themeColorLight};border:1px solid ${themeColorDark};border-radius:8px;padding:14px;text-align:center;">
        <span style="font-size:11px;color:${themeColor};font-weight:bold;">特長${index}</span>
        <p style="font-size:13px;margin:4px 0 0;color:#555;font-weight:bold;">${text}</p>
      </div>`
}

/** 利用シーンカード */
export function useCaseCard(title: string, description: string, themeColor: string): string {
  return `<div style="flex:1 1 200px;max-width:300px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;padding:20px;">
        <h4 style="font-size:15px;margin:0 0 6px;color:${themeColor};">${title}</h4>
        <p style="font-size:13px;margin:0;color:#666;">${description}</p>
      </div>`
}

/** 商品カード（リンク付き） */
export function productCard(name: string, imageUrl: string, productUrl: string, specs: string, note: string): string {
  return `<a href="${productUrl}" style="flex:1 1 200px;max-width:220px;background:#fff;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;text-align:center;text-decoration:none;color:inherit;display:block;">
        <img src="${imageUrl}" alt="${name}" style="width:100%;height:160px;object-fit:contain;background:#f9f9f9;padding:8px;">
        <div style="padding:12px;">
          <h4 style="font-size:14px;margin:0 0 4px;">${name}</h4>
          <p style="font-size:12px;color:#777;margin:0 0 4px;">${specs}</p>
          <p style="font-size:11px;color:#999;margin:0;">${note}</p>
        </div>
      </a>`
}

/** 選び方ガイドアイテム */
export function sizeGuideCard(label: string, specs: string, description: string, themeColor: string): string {
  return `<div style="flex:1 1 250px;max-width:400px;background:#fff;border:2px solid ${themeColor};border-radius:10px;padding:20px;text-align:center;">
          <span style="display:inline-flex;align-items:center;justify-content:center;background:${themeColor};color:#fff;font-size:13px;font-weight:bold;padding:5px 16px;border-radius:20px;margin-bottom:10px;"><span style="position:relative;top:1px;">${label}</span></span>
          <p style="font-size:14px;margin:0 0 6px;font-weight:bold;">${specs}</p>
          <p style="font-size:13px;color:#666;margin:0;">${description}</p>
        </div>`
}

/** FAQアイテム */
export function faqItem(question: string, answer: string): string {
  return `<details style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;overflow:hidden;">
      <summary style="padding:14px 18px;font-size:14px;font-weight:bold;cursor:pointer;">Q. ${question}</summary>
      <div style="padding:0 18px 16px 18px;font-size:13px;color:#555;line-height:1.8;">${answer}</div>
    </details>`
}

/** カテゴリタイトル */
export function categoryTitle(title: string, themeColor: string, themeColorDark: string): string {
  return `<h3 style="font-size:16px;color:${themeColor};margin:0 0 16px;padding-left:10px;border-left:4px solid ${themeColorDark};">${title}</h3>`
}
