import type { BillingTranslations } from './types_billing'
import type { GatewayHostTranslations } from './types_gateway_host'

export const trBillingBlock: BillingTranslations = {
  billingBlock: {
    titleNous: 'Nous kredin tükendi',
    titleProvider: provider => `Kredi tükendi — ${provider}`,
    fallbackMessage: 'Hesabındaki krediler tükendi. Devam etmek için kredi ekle.',
    openBilling: 'Faturalandırmayı aç',
    addCredits: 'Kredi ekle',
    dismiss: 'Kapat'
  }
}

export const trGatewayHost: GatewayHostTranslations = {
  unavailableTitle: 'Ağ geçidi ayarları kullanılamıyor',
  unavailableDesc: 'Bağlantı ayarları yalnızca ağ geçidini çalıştıran bilgisayardaki Hermes Masaüstü uygulamasından değiştirilebilir.',
  webappHostTitle: 'Hermes sunucusu',
  webappHostDesc:
    'Web uygulaması her zaman onu sunan Hermes ana makinesinde çalışır. Aşağıdaki kayıtlı bağlantılar bu makinenin listesidir ve Hermes Masaüstü ile paylaşılır; diğer ağ geçitlerine bu ana makine üzerinden ulaşılır.',
  webappOauthPaste: {
    title: 'Girişi tamamla',
    description: 'Giriş sekmesi yüklenmeyen bir adreste kaldıysa (bu tarayıcı ağ geçidinin makinesinde değilse), o adresi buraya yapıştır.',
    placeholder: 'http://127.0.0.1:…/webapp/gateway-connections/oauth/callback?…',
    finish: 'Tamamla',
    failed: 'Giriş tamamlanamadı'
  },
  webAccess: {
    title: 'Web erişimi',
    intro: 'Nous hesabınla giriş yapmış olarak bu bilgisayardaki Hermes’i telefonundan veya başka bir bilgisayardan aç. Giriş yapan kişi bu bilgisayarda komut çalıştırabilir.',
    failed: 'Web erişimi değiştirilemedi',
    running: 'Çalışıyor',
    stopped: 'Durduruldu',
    starting: 'Başlatılıyor',
    stopping: 'Durduruluyor',
    restartNeeded: 'Yeniden başlatma gerekiyor',
    unavailable: 'Kullanılamıyor',
    notRunningDetail: 'Hermes’i başka bir cihazdan açmak için başlat.',
    needsNous: 'Önce Sağlayıcılar altında Nous hesabına giriş yap.',
    runningLan: 'Aynı ağdaki bir cihazdan bu adresi aç.',
    runningPublic: 'Özel adresin üzerinden sunuluyor.',
    runningLocal: 'Yalnızca bu bilgisayar açabilir. Diğer cihazlardan açmak için durdurup yeniden başlat.',
    pendingOn: 'Kaydedildi. Ağ geçidi yeniden başlatıldığında web uygulamasını sunar.',
    pendingOff: 'Kapatıldı ancak ağ geçidi yeniden başlatılana kadar web uygulamasını sunmaya devam eder.',
    unavailableDetail: reason => `Ağ geçidi web uygulamasını sunamadı: ${reason}`,
    restartBusy: 'Kaydedildi. Bir sohbet çalıştığı için ağ geçidi yeniden başlatılmadı. Sohbet bitince Ağ geçidini yeniden başlat’ı seç.',
    restartFailed: 'Kaydedildi ancak ağ geçidi yeniden başlatılamadı. Tekrar denemek için Ağ geçidini yeniden başlat’ı seç.',
    restartFailedBecause: reason => `Ağ geçidi yeniden başlatılamadı: ${reason}`,
    startTimedOut: 'Ağ geçidi 90 saniye içinde web uygulamasını sunmadı.',
    stopTimedOut: 'Ağ geçidi 90 saniye içinde web uygulamasını durdurmadı.',
    startStages: {
      preparing: 'Web uygulaması hazırlanıyor. Derleme birkaç dakika sürebilir.',
      building: 'Web uygulaması derleniyor. Bu birkaç dakika sürebilir.',
      registering: 'Bu adres için Nous oturumu ayarlanıyor.',
      restarting: 'Web uygulamasını sunmak için ağ geçidi yeniden başlatılıyor.'
    },
    startElapsed: time => `${time} geçti`,
    start: 'Başlat',
    stop: 'Durdur',
    restartGateway: 'Ağ geçidini yeniden başlat',
    modeLan: 'Bu ağ',
    modeLanDetail: url => `Wi-Fi ağındaki cihazlar ${url} adresini açar. Yalnızca güvendiğin bir ağda kullan.`,
    lanUnencrypted: 'Bağlantı şifreli değildir: bu ağdaki diğer kişiler gönderip aldıklarını okuyabilir.',
    noLan: 'Bu bilgisayarın diğer cihazların ulaşabileceği bir ağ adresi yok.',
    modePublic: 'Kendi URL adresim',
    modePublicDetail: port => `Tailscale Serve veya tünel gibi zaten çalıştırdığın bir HTTPS adresi http://127.0.0.1:${port} adresine yönlendirilir.`
  }
}
