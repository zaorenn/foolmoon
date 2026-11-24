import type { Translations } from './types'

export const trBoot = {
  boot: {
    ready: 'Hermes Masaüstü hazır',
    desktopBootFailedWithMessage: message => `Masaüstü başlatılamadı: ${message}`,
    steps: {
      connectingGateway: 'Canlı masaüstü ağ geçidine bağlanılıyor',
      loadingSettings: 'Hermes ayarları yükleniyor',
      loadingSessions: 'Son oturumlar yükleniyor',
      retryingRemoteBackend: 'Uzak Hermes arka ucuna yeniden bağlanılıyor…',
      startingDesktopConnection: 'Masaüstü bağlantısı başlatılıyor',
      startingHermesDesktop: 'Hermes Masaüstü başlatılıyor…'
    },
    errors: {
      backgroundExited:
        'Sohbetlerini çalıştıran hizmet beklenmedik şekilde kapandı. Devam etmek için yeniden başlat — sohbetlerin ve ayarların güvende.',
      backgroundExitedDuringStartup: 'Hermes başladıktan hemen sonra durdu.',
      backendStopped: 'Hermes arka planda çalışmayı durdurdu',
      restartHermes: 'Hermes’i yeniden başlat',
      openLogs: 'Günlükleri aç',
      desktopBootFailed: 'Hermes başlatılamadı',
      gatewayConnectionLost: 'Hermes bağlantısını kaybetti',
      gatewayConnectionLostDetail:
        'Yeniden bağlanmaya çalışılıyor. Okumaya ve taslak yazmaya devam edebilirsin. Sorun sürerse şimdi yeniden bağlan veya bağlantı ayarlarını kontrol et.',
      reconnectNow: 'Şimdi yeniden bağlan',
      connectionSettings: 'Bağlantı ayarları',
      gatewaySignInRequired: 'Uzak Hermes oturumunu kapattı',
      gatewaySignInRequiredDetail: 'Yeniden bağlanmak için tekrar giriş yap. Sohbetlerin ve ayarların güvende.',
      signInAgain: 'Tekrar giriş yap',
      ipcBridgeUnavailable: 'Hermes Masaüstü kendi arka plan katmanıyla iletişim kuramadı. Uygulamayı yeniden başlat.'
    },
    causes: {
      exitedEarly: 'Hermes arka plan hizmeti başladıktan hemen sonra durdu.',
      timedOut: 'Hermes arka plan hizmeti zamanında yanıt vermedi.',
      permission: 'Hermes veri klasörüne yazamadı (izin sorunu).',
      diskFull: 'Disk dolu olduğu için Hermes başlatılamadı.',
      portInUse: 'Başka bir program Hermes’in ihtiyaç duyduğu ağ portunu kullanıyor.',
      installMissing: 'Hermes kurulumunun bir bölümü eksik. Geri yüklemek için Kurulumu onar’ı seç.'
    },
    failure: {
      title: 'Hermes başlatılamadı',
      description:
        'Hermes arka plan hizmeti ayağa kalkmadı. Aşağıdaki kurtarma adımlarından birini dene. Buradaki hiçbir işlem sohbetlerini veya ayarlarını silmez.',
      details: 'Ayrıntılar',
      remoteTitle: 'Uzak ağ geçidi oturumu gerekli',
      remoteDescription:
        'Uzak ağ geçidi oturumunun süresi doldu. Yeniden bağlanmak için tekrar giriş yap. Hiçbir işlem sohbetlerini veya ayarlarını silmez.',
      webappTitle: 'Hermes’e giriş yap',
      webappDescription: 'Bu tarayıcıda oturum açmak için bu bilgisayarda hermes webapp komutunu çalıştır.',
      retry: 'Tekrar dene',
      repairInstall: 'Kurulumu onar',
      useLocalGateway: 'Yerel ağ geçidini kullan',
      gatewaySettings: 'Ağ geçidi ayarları',
      back: 'Geri',
      openLogs: 'Günlükleri aç',
      repairHint: 'Onarım, kurucuyu yeniden çalıştırır ve yeni bir makinede birkaç dakika sürebilir.',
      bundledReinstallHint:
        'Bu paketli kurulum uygulama içinden kendini onaramaz — arka ucunu geri yüklemek için uygulamayı yeniden kur.',
      reinstallApp: 'Uygulamayı yeniden kur',
      remoteSignInHint: signInLabel =>
        `Kayıtlı uzak tarayıcı oturumundan çıkış yapar ve ${signInLabel} ekranını açar. Paketli arka uca geçmek için Yerel ağ geçidini kullan.`,
      signOutAndSignIn: 'Çıkış yap ve giriş yap',
      remoteFailureHint: 'Ağ geçidi ayarlarından adresi ve oturumu kontrol et veya yerel ağ geçidine geç.',
      cloudDownTitle: 'Nous Cloud ajanı kapalı',
      cloudDownDescription:
        'Bu ağ geçidinin bağlandığı Nous yönetimli bulut ajanı sunucu hatası döndürüyor. Buradan yeniden başlatılamaz — durumunu kontrol et, yerel ağ geçidine geç veya destek al.',
      cloudDownHint:
        'Aşağıdaki düğmeler Nous Portalı’nı (örnek durumu ve kontroller) ve destek için Discord kanalımızı açar.',
      cloudDownCheckPortal: 'Portal durumunu kontrol et',
      cloudDownDiscord: 'Discord’dan yardım al',
      hideRecentLogs: 'Son günlükleri gizle',
      showRecentLogs: 'Son günlükleri göster',
      signedInTitle: 'Giriş yapıldı',
      signedInMessage: 'Uzak ağ geçidine yeniden bağlanılıyor…',
      signInIncompleteTitle: 'Giriş tamamlanmadı',
      signInIncompleteMessage: 'Kimlik doğrulama bitmeden giriş penceresi kapandı.',
      signInFailed: 'Giriş başarısız',
      signInToRemoteGateway: 'Uzak ağ geçidine giriş yap',
      signInWithProvider: provider => `${provider} ile giriş yap`,
      identityProvider: 'kimlik sağlayıcınız'
    },
    updateHold: {
      title: 'Önceki bir güncelleme hâlâ Hermes’i tutuyor',
      titleUnverified: 'Hermes son güncellemenin bittiğini doğrulayamıyor',
      description:
        'Bir güncellemenin hâlâ değiştirebileceği dosyaları yüklememek için Hermes açılışı bekletiyor. Bekleme kalkar kalkmaz kendiliğinden başlar.',
      heldByProcess: pid =>
        `Güncelleme (işlem ${pid}) kapandı ancak başlattığı bir işlem hâlâ Hermes kurulumunu tutuyor.`,
      heldUnknown: 'Bir güncelleme kapandı ancak başlattığı bir işlem hâlâ Hermes kurulumunu tutuyor.',
      unverified: 'Güncelleme yardımcısı şu anda Hermes kurulumunu kimin tuttuğunu doğrulayamadı. Kontrol sürüyor.',
      since: time => `${time} itibarıyla bekleniyor`,
      lastChecked: time => `Son kontrol: ${time}`,
      recoveryHint:
        'Genelde birkaç dakika içinde düzelir. Düzelmezse Hermes’ten çık, kalan git veya hermes işlemlerini sonlandır (ya da bilgisayarı yeniden başlat) ve Hermes’i tekrar aç.',
      checkAgain: 'Tekrar kontrol et',
      quit: 'Hermes’ten çık',
      openLogs: 'Günlükleri aç',
      startAnyway: 'Yine de başlat…',
      confirmTitle: 'Güncelleme hâlâ tutarken Hermes başlatılsın mı?',
      confirmBody:
        'Kalan güncelleme işlemi hâlâ Hermes dosyalarını değiştiriyor olabilir. Şimdi başlatmak yarı güncellenmiş bir kurulum yükleyebilir. Hermes bu seçimi günlüğe kaydeder.',
      confirmKeepWaiting: 'Beklemeye devam et',
      confirmStart: 'Yine de başlat',
      startAnywayRefused: 'Hermes başlamadan önce kurulumu tutan işlem değişti. Gözden geçirip tekrar dene.'
    }
  }
} satisfies Pick<Translations, 'boot'>
