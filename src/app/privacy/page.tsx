export const metadata = {
  title: 'プライバシーポリシー | 容器なび 業務ポータル',
}

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', lineHeight: 1.9 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>プライバシーポリシー</h1>
      <p>
        本APIおよび関連ツール（見積りAI）は、テンドール物流株式会社「容器なび」（yo-ki-navi.com）の
        社内業務支援を目的として、株式会社メグリが提供するものです。
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>収集する情報</h2>
      <p>
        本APIは、見積もり計算に必要な商品型番・数量・価格情報のみを受け取り、処理します。
        個人情報（氏名・連絡先等）の入力は想定しておらず、収集・保存しません。
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>情報の利用目的</h2>
      <p>
        受け取った情報は、容器の見積もり計算・診断結果の返答のためにのみ利用します。
        第三者への提供・販売は行いません。
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>ログ</h2>
      <p>
        サービス品質維持のため、APIアクセスログ（リクエスト日時・エンドポイント等）を
        インフラ提供事業者（Vercel）の標準機能の範囲で一時的に記録することがあります。
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>お問い合わせ</h2>
      <p>本ポリシーに関するお問い合わせは、株式会社メグリまでご連絡ください。</p>
    </main>
  )
}
