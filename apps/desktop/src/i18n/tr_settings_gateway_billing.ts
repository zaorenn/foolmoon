import type { Translations } from './types'
import { trGatewayHost } from './tr_billing_and_host'

export const trSettingsGatewayBilling: Pick<Translations['settings'], 'gateway' | 'billing'> = {
  gateway: {
    loading: 'Ağ geçidi ayarları yükleniyor…',
    ...trGatewayHost,
    title: 'Ağ Geçidi Bağlantısı',
    envOverride: 'ortam geçersiz kılması',
    intro:
      'Varsayılan olarak yereldir. Bu uygulama başka bir yerdeki Hermes arka ucunu yönetecekse uzak seçeneğini kullan. Ağ geçidi bağlantıları makine düzeyindedir.',
    envOverrideTitle: 'Bu bağlantı Hermes’in başlatılma şekliyle sabitlendi.',
    envOverrideDesc: 'Uygulama dışındaki bir başlangıç ayarı bu bağlantıyı seçtiğinden aşağıdaki seçenekler salt okunurdur.',
    modeTitle: 'Bağlantı modu',
    localTitle: 'Yerel ağ geçidi',
    localDesc: 'localhost üzerinde özel bir Hermes arka ucu başlatır. Varsayılandır ve çevrimdışı çalışır.',
    remoteTitle: 'Uzak ağ geçidi',
    remoteDesc: 'Bu masaüstü kabuğunu uzak bir Hermes arka ucuna bağla.',
    remoteAuthHint: 'Barındırılan ağ geçitleri OAuth veya kullanıcı adı/parola kullanır; kendi sunucun oturum belirteci kullanabilir.',
    cloudTitle: 'Hermes Cloud',
    cloudDesc: 'Hermes Cloud’a bir kez giriş yap ve hesabındaki ajanlardan seç — yapıştırılacak URL yok.',
    cloudSignInTitle: 'Hermes Cloud',
    cloudSignIn: 'Hermes Cloud’a giriş yap',
    cloudSignedIn: 'Hermes Cloud’a giriş yapıldı',
    cloudNeedsSignIn: 'Hesabındaki ajanları keşfetmek için Hermes Cloud’a giriş yap.',
    cloudSignedInDesc: 'Giriş yapıldı. Aşağıdan bir ajan seç; oturum otomatik yenilenir.',
    cloudAgentsTitle: 'Ajanların',
    cloudOrgPickerTitle: 'Bir kuruluş seç',
    cloudOrgSelect: 'Seç',
    cloudOrgChange: 'Kuruluşu değiştir',
    cloudOrgRole: role => `Rol: ${role}`,
    cloudLoadingAgents: 'Ajanların yükleniyor…',
    cloudNoAgents: {
      before: 'Bu hesapta ajan bulunamadı. ',
      linkText: 'Nous portalında',
      after: ' bir tane oluştur, ardından yenile.'
    },
    cloudRefresh: 'Yenile',
    cloudConnect: 'Bağlan',
    cloudSavedTitle: 'Kayıtlı Bulut ağ geçitleri',
    cloudSavedDesc: 'Varsayılanını değiştirmeden kayıtlı bir ağ geçidini kullan. Adları kayıtlı bağlantılar listesinden yönet.',
    cloudUseSaved: 'Ağ geçidini kullan',
    cloudActive: 'Bu pencerede etkin',
    cloudConnecting: 'Bağlanıyor…',
    cloudDiscoverFailed: 'Hermes Cloud ajanların yüklenemedi',
    cloudConnectFailed: 'Bu ajana bağlanılamadı',
    cloudSignInFailed: 'Hermes Cloud girişi başarısız',
    cloudSignedOutTitle: 'Hermes Cloud oturumu kapatıldı',
    cloudSignedOutMessage: 'Hermes Cloud oturumu temizlendi.',
    cloudConnectedTitle: 'Bağlandı',
    cloudConnectedPill: 'Bağlı',
    cloudConnectedTo: name => `${name} ajanı ile bağlantı kuruldu.`,
    cloudAgentProvisioning: 'Hazırlanıyor…',
    cloudStatusLabel: status => `Durum: ${status}`,
    remoteUrlTitle: 'Uzak URL',
    remoteUrlDesc: 'Uzak kontrol paneli arka ucu için temel URL. Yol önekleri desteklenir (örn. /hermes).',
    probing: 'Bu ağ geçidinin nasıl kimlik doğruladığı kontrol ediliyor…',
    probeError: 'Hermes bu adrese ulaşamıyor. URL’yi ve diğer bilgisayarda Hermes’in çalıştığını kontrol et.',
    signedIn: 'Giriş yapıldı',
    signIn: 'Giriş yap',
    signOut: 'Çıkış yap',
    signInWith: provider => `${provider} ile giriş yap`,
    authTitle: 'Kimlik doğrulama',
    authSignedInPassword: 'Bu ağ geçidi kullanıcı adı ve parola kullanır. Giriş yapıldı; oturum otomatik yenilenir.',
    authSignedInOauth: 'Bu ağ geçidi OAuth kullanır. Giriş yapıldı; oturum otomatik yenilenir.',
    authNeedsPassword: 'Bu ağ geçidi kullanıcı adı ve parola kullanır. Bu masaüstü uygulamasına yetki vermek için giriş yap.',
    authNeedsOauth: provider => `Bu ağ geçidi OAuth kullanır. Yetki vermek için ${provider} ile giriş yap.`,
    tokenTitle: 'Oturum belirteci',
    tokenDesc: 'REST ve WebSocket erişimi için kullanılan belirteç. Kayıtlı belirteci korumak için boş bırak.',
    existingToken: value => `Mevcut belirteç ${value}`,
    savedToken: 'kayıtlı',
    pasteSessionToken: 'Oturum belirtecini yapıştır',
    plainTextConfirmTitle: 'Ağ geçidi belirteci düz metin olarak saklansın mı?',
    plainTextConfirmDesc: 'Bu makinede işletim sistemi anahtarlık hizmeti bulunamadı; belirteç şifresiz saklanacaktır.',
    plainTextConfirmAction: 'Düz metin olarak kaydet',
    plainTextStoredTitle: 'Belirteç düz metin saklandı',
    plainTextStoredDesc: 'Güvenli depolama kullanılamadığı için belirteç şifresiz saklandı.',
    keychainEncryptionTitle: 'Kayıtlı sırları sistem anahtarlığı ile şifrele',
    keychainEncryptionDesc:
      'Açık olduğunda ağ geçidi belirteçleri ve giriş bilgileri sistem anahtarlığı (DPAPI / Keychain) ile şifrelenir.',
    keychainEncryptionFailed: 'Gizli şifreleme değiştirilemedi',
    testRemote: 'Uzağı test et',
    saveForRestart: 'Sonraki başlatma için kaydet',
    saveAndReconnect: 'Kaydet ve yeniden bağlan',
    diagnostics: 'Tanılama',
    diagnosticsDesc: 'desktop.log dosyasını dosya yöneticisinde göster — ağ geçidi başlamadığında faydalıdır.',
    openLogs: 'Günlükleri aç',
    incompleteTitle: 'Uzak ağ geçidi eksik',
    incompleteSignIn: 'Uzağa geçmeden önce bir uzak URL gir ve giriş yap.',
    incompleteToken: 'Uzağa geçmeden önce bir uzak URL ve oturum belirteci gir.',
    incompleteSignInTest: 'Test etmeden önce bir uzak URL gir ve giriş yap.',
    incompleteTokenTest: 'Test etmeden önce bir uzak URL ve oturum belirteci gir.',
    enterUrlFirst: 'Önce bir uzak URL gir.',
    restartingTitle: 'Ağ geçidi bağlantısı yeniden başlatılıyor',
    savedTitle: 'Ağ geçidi ayarları kaydedildi',
    restartingMessage: 'Hermes Masaüstü kayıtlı ayarlarla yeniden bağlanacak — pencere açık kalır.',
    savedMessage: 'Sonraki başlatma için kaydedildi.',
    connectedTo: (baseUrl, version) => `${baseUrl} ile bağlantı kuruldu${version ? ` · Hermes ${version}` : ''}`,
    reachableTitle: 'Uzak ağ geçidine ulaşılabilir',
    signedOutTitle: 'Çıkış yapıldı',
    signedOutMessage: 'Uzak ağ geçidi oturumu temizlendi.',
    failedLoad: 'Ağ geçidi ayarları yüklenemedi',
    signInFailed: 'Giriş başarısız',
    signOutFailed: 'Çıkış başarısız',
    testFailed: 'Uzak ağ geçidi testi başarısız',
    applyFailed: 'Ağ geçidi ayarları uygulanamadı',
    saveFailed: 'Ağ geçidi ayarları kaydedilemedi',
    sshTitle: 'SSH üzerinden bağlan',
    sshDesc: 'Hermes uzak sunucuda SSH üzerinden başlatılır ve bu uygulamaya tünellenir. Anahtar tabanlı SSH erişimi gerektirir.',
    sshTrustHint: 'İlk sunulan ana bilgisayar anahtarı sabitlenir; sonraki değişikliklerde güvenlik için bağlantı reddedilir.',
    sshHostTitle: 'Sunucu',
    sshHostDesc: 'kullanici@sunucu veya ~/.ssh/config içindeki Host takma adı.',
    sshHostPick: 'Bir sunucu seç…',
    sshHostPickTitle: 'Sunucu',
    sshHostPickDesc: '~/.ssh/config içinden bir takma ad veya el ile yazmak için Özel.',
    sshHostCustom: 'Özel (el ile gir)…',
    sshUserTitle: 'Kullanıcı',
    sshUserDesc: 'Boş = ~/.ssh/config veya mevcut kullanıcın.',
    sshUserPlaceholder: '~/.ssh/config dosyasından',
    sshPortTitle: 'Port',
    sshPortDesc: 'Boş = 22 veya ~/.ssh/config portu.',
    sshKeyTitle: 'Kimlik dosyası',
    sshKeyDesc: 'Özel anahtar yolu. Boş = ssh-agent veya ~/.ssh/config.',
    sshHermesPathTitle: 'Hermes yolu (isteğe bağlı)',
    sshHermesPathDesc: 'Uzak hermes çalıştırılabilir dosyasının tam yolu. Boş = otomatik algıla.',
    sshHermesPathPlaceholder: 'otomatik algıla',
    sshTestConnection: 'SSH’ı test et',
    sshConnect: 'Bağlan',
    sshButtonsHint: 'Kaydet sonraki açılışta uygulanır. Bağlan şimdi yeniden bağlanır.',
    sshReachable: (host, platform) => `Ulaşılabilir: ${host} (${platform}) — Hermes bulundu`,
    sshIncompleteHost: 'Bağlanmadan önce bir SSH sunucusu gir.',
    sshErrUnreachable: 'Bu sunucuya SSH üzerinden ulaşılamadı. Sunucu, port ve ağını kontrol et.',
    sshErrAuth: 'SSH kimlik doğrulaması başarısız. Anahtarını ssh-agent’a ekle veya IdentityFile ayarla.',
    sshErrHostKey: 'Sunucu anahtarı son bağlantından beri DEĞİŞMİŞ. Bekleniyorsa ssh-keygen -R <host> çalıştır ve yeniden bağlan.',
    sshErrNotInstalled: 'Uzak sunucuda Hermes kurulu değil. Oraya kur veya Hermes yolunu belirt.',
    sshErrPlatform: 'Desteklenmeyen uzak platform. Masaüstü SSH Linux, macOS ve Windows sunucuları destekler.',
    sshErrTimeout: 'SSH bağlantısı zaman aşımına uğradı. Sunucu uykuda veya ulaşılamıyor olabilir.',
    sshErrUpdateRequired: 'Masaüstü SSH ile bağlanmadan önce uzak sunucudaki Hermes’i güncelle.',
    sshErrInteractiveAuth: 'Tailscale SSH etkileşimli tarayıcı onayı gerektiriyor. Terminalde `ssh <host> true` çalıştır.',
    sshErrUnknown: 'SSH bağlantısı başarısız.'
  },
  billing: {
    perMonth: amount => `${amount}/ay`,
    creditsPerMonth: amount => `${amount} kredi/ay`,
    usageLabel: label => `${label} kullanımı`,
    freeTier: {
      signIn: 'Giriş yap',
      title: 'Nous ücretsiz katmanındasın',
      message: 'Daha fazla model ve aracın kilidini açmak için bir Nous hesabıyla giriş yap.',
      caption: 'Bağlayıcılar dahil nous/welcome üzerinde çalışır. Giriş yapmak tüm diğer modelleri ve hesap gerektiren araçları ekler.',
      name: 'Nous · ücretsiz katman',
      footnote: 'Ücretsiz katmanda bakiye ve ödeme yoktur. Ödeme ve kullanım bir Nous hesabıyla giriş yaptığında görünür.',
      plan: 'Ücretsiz katman',
      model: 'Model',
      connectors: 'Bağlayıcılar',
      included: 'Dahil'
    },
    amountValidation: {
      reloadTo: 'Tamamlanacak tutar',
      greaterThanThreshold: 'Tamamlanacak tutar eşikten büyük olmalıdır.',
      decimal: label => `${label}: en fazla 2 ondalık basamaklı bir dolar tutarı gir.`,
      positive: label => `${label}: tutar $0 değerinden büyük olmalıdır.`,
      minimum: (label, amount) => `${label}: en az ${amount}.`,
      maximum: (label, amount) => `${label}: en fazla ${amount}.`
    },
    stepUp: {
      openVerification: 'Doğrulama sayfasını aç',
      dismiss: 'Kapat',
      waiting: 'Doğrulama bağlantısı bekleniyor…',
      verify: 'Devam etmek için doğrula',
      deniedTitle: 'Doğrulama onaylanmadı',
      deniedBody: 'Doğrulama bu terminal için Uzaktan Harcama izni vermeden tamamlandı.',
      successTitle: 'Doğrulama tamamlandı',
      successBody: 'Bu terminal için Uzaktan Harcama izinli.'
    },
    charge: {
      added: amount => (amount ? `$${amount} eklendi.` : 'Krediler eklendi.'),
      failedTitle: 'Ödeme başarısız',
      unconfirmedTitle: 'Ödeme sonucu doğrulanamadı',
      unconfirmedBody: message => `${message} Son ödemenin sonucu belirsiz — tekrar denemeden bakiyeni/geçmişini kontrol et.`,
      checkTitle: 'Ödeme kontrol edilemedi',
      checkBody: 'Ödeme durumu doğrulanamadı.',
      untrackedTitle: 'Ödeme takip edilemedi',
      untrackedBody: 'Faturalandırma hizmeti isteği aldı ancak bir ödeme kimliği döndürmedi.',
      timeoutTitle: '5 dakika geçmesine rağmen hâlâ işleniyor',
      timeoutBody: 'Ödeme hâlâ onaylanıyor olabilir. Tekrar denemeden önce portalı kontrol et.',
      authenticationRequired: 'Bankan doğrulama (3DS) istiyor. Satın almayı tamamlamak için portalda onayla.',
      expired: 'Kartının süresi dolmuş. Portalda güncelle.',
      declined: 'Kartın reddedildi. Portalda başka bir kart dene.',
      failedBody: reason => `Ödeme gerçekleşmedi (${reason}).`
    },
    title: 'Faturalandırma',
    preview: 'önizleme',
    summary: { balance: 'Bakiye', plan: 'Plan', autoRefill: 'Otomatik doldurma' },
    sections: { invoices: 'Faturalar', plan: 'Plan', paymentAndCredits: 'Ödeme ve krediler', usage: 'Kullanım' },
    usage: { title: 'Kullanım' },
    buyCredits: {
      customAmount: 'Özel kredi tutarı',
      title: 'Şimdi kredi satın al',
      buyButton: 'Satın al',
      processing: 'İşleniyor… sonuç kontrol ediliyor',
      added: amount => `${amount} eklendi. Bakiye yenileniyor.`,
      retry: 'Tekrar dene',
      openPortal: 'Portalı aç'
    },
    plan: {
      title: 'Planlar',
      changePlan: 'Planı değiştir',
      viewPlans: 'Planları gör',
      backAria: 'Faturalandırmaya dön',
      current: 'Mevcut plan',
      scheduled: 'Planlandı',
      empty: 'Şu anda geçilebilecek uygun plan yok.',
      undo: 'Geri al',
      undoing: 'Geri alınıyor…',
      downgrade: 'Düşür',
      confirmDowngrade: 'Plan düşürmeyi onayla',
      tryAgain: 'Tekrar dene',
      checkingChange: 'Bu değişiklik kontrol ediliyor…',
      cannotChange: 'Bu değişiklik buradan yapılamaz.',
      alreadyOn: name => `Zaten ${name} planındasın — değiştirilecek bir şey yok.`,
      notScheduleable: 'Bu değişiklik buradan planlanamaz.',
      scheduling: 'Planlanıyor…',
      cancel: 'İptal',
      effectScheduled: (targetName, effectiveAt, creditsDelta) =>
        `${targetName} planına geçiş — ${effectiveAt} tarihinde yürürlüğe girer. Şimdilik ücret yok; o zamana kadar mevcut planın sürer.${creditsDelta ? ` Aylık kredi değişimi: ${creditsDelta}.` : ''}`
    },
    keepGoingOnCredits: {
      title: 'Kredilerle devam et',
      description: 'Dahil kullanım bittiğinde kredilerini kullan. Kapalıyken Hermes sıfırlanmayı bekler.',
      approveInBrowser: 'Bunu değiştirmek için tarayıcında Uzaktan Harcamayı onayla. Onayladığın anda geçerli olur.',
      openAgain: 'Yeniden aç',
      cancel: 'İptal',
      approvedRetry: 'Uzaktan Harcama onaylandı ancak değişiklik kaydedilmedi.',
      tryAgain: 'Tekrar dene'
    },
    autoReload: {
      threshold: 'Eşik',
      thresholdAria: 'Otomatik doldurma eşiği',
      reloadTo: 'Şuna tamamla',
      reloadToAria: 'Otomatik doldurma hedef tutarı',
      turnOffConfirm: 'Otomatik doldurma kapatılsın mı?',
      turnOff: 'Kapat',
      disable: 'Devre dışı bırak',
      updated: 'Otomatik doldurma güncellendi.',
      turnedOff: 'Otomatik doldurma kapatıldı.',
      manage: 'Yönet',
      save: 'Kaydet',
      saving: 'Kaydediliyor…',
      cancel: 'İptal'
    },
    state: {
      notice: {
        loggedOut: {
          title: 'Nous hesabını bağla',
          message: 'Bakiyeni, planını ve kullanımını burada görmek için Nous hesabınla giriş yap.',
          action: 'Giriş yap'
        },
        openPortal: 'Portalı aç ↗',
        noCard: {
          title: 'Kayıtlı ödeme yöntemi yok',
          message: 'Kart eklenene kadar kredi alımı ve otomatik doldurma kapalı kalır. Portaldan bir kart ekle.',
          action: 'Kart ekle ↗'
        }
      },
      paymentMethod: {
        title: 'Ödeme yöntemi',
        description: 'Bakiye yüklemeleri ve abonelik yenilemeleri için kullanılan kartı yönet.',
        addAction: 'Ödeme yöntemi ekle',
        updateAction: 'Güncelle',
        provenance: {
          autoRefill: 'otomatik doldurma kartı',
          customerDefault: 'müşteri varsayılanı',
          subPin: 'abonelik kartı',
          suffix: label => ` - ${label}`
        }
      },
      buyCredits: { description: 'Kartından tek seferlik çekilir ve bugün bakiyene eklenir.' },
      autoRefill: {
        title: 'Düşünce doldur',
        genericDescription: 'Bakiyen belirlediğin eşiğin altına düştüğünde otomatik tamamla.',
        offPill: 'Kapalı',
        enabledPill: 'Etkin',
        notAvailablePill: '—',
        manageCaption: 'Otomatik doldurmayı portaldan yönet.',
        turnOnCaption: 'Portaldan otomatik doldurmayı aç',
        chargesDescription: (reloadTo, threshold) =>
          `Bakiyen ${threshold} altına düştüğünde otomatik olarak ${reloadTo} tutarına tamamlar.`,
        distinctCardCaption: cardLabel => `Otomatik doldurma ${cardLabel} kartından çekilir — portalda düzenle`,
        distinctCardFallback: 'farklı bir kart',
        reconcileAction: 'Düzenle ↗'
      },
      usage: {
        subscriptionCredits: {
          title: 'Abonelik kredileri',
          barLabel: 'Kalan abonelik kredileri',
          captionResets: date => `Sıfırlanma: ${date}`,
          valueOf: (remaining, monthly) => `${monthly} içinden ${remaining} kaldı`,
          valueOver: (remaining, monthly, over) => `${monthly} içinden ${remaining} kaldı · ${over} aşım`
        },
        topupCredits: { title: 'Yüklenen krediler', caption: 'Süresi dolmaz' },
        monthlyCap: {
          title: 'Aylık harcama sınırı',
          barLabel: 'Kullanılan aylık harcama sınırı',
          captionDefault: 'Varsayılan üst sınır',
          captionSpending: 'Aylık uzaktan harcama',
          valueUsed: (spent, limit) => `${limit} içinden ${spent} kullanıldı`
        },
        window: {
          today: 'Bugün',
          week: 'Bu hafta',
          month: 'Bu ay',
          topTier: 'Büyük modeller (aylık)',
          barLabel: title => `${title} dahil kullanım`,
          captionPaused: 'Duraklatıldı: abonelik ödemesi başarısız',
          captionPausedOther: 'Duraklatıldı: Portal’da Faturalandırma’ya bak',
          captionTopTierUsedUp: 'Aylık hak doldu, kalanını krediler karşılar',
          captionTopTierUsedUpKeepGoingOff: 'Aylık hak doldu, diğer dahil modeller çalışmaya devam eder',
          captionResetsIn: duration => `${duration} içinde sıfırlanır`,
          captionIncluded: 'Dahil kullanım',
          valueUsed: percent => `${percent} kullanıldı`
        }
      },
      planCard: {
        freeTier: 'Ücretsiz',
        chooseAction: 'Seç ↗',
        adjustPlanAction: 'Planı düzenle ↗',
        unavailableCaption: 'Abonelik ayrıntıları yüklenemedi; portalı açmaya devam edebilirsin.',
        downgradeCaption: (tierName, when) => `${when} tarihinde ${tierName} planına geçer.`,
        cancellationCaption: when => `${when} tarihinde iptal edilir.`,
        renewsCaption: date => `Yenilenme: ${date}`,
        noSubscriptionCaption: 'Etkin abonelik yok — ücretli modeller yüklenen kredilerden düşer.'
      }
    },
    errors: {
      consentRequired: { title: 'Kart onayı gerekiyor', message: 'Terminal ödemeleri için bu kartı portalda onayla' },
      insufficientScope: {
        title: 'Uzaktan Harcama onayı gerekiyor',
        message: 'Bunun için Uzaktan Harcama izni gerekir. İzin vermek için yükleme başlatıp tekrar dene.'
      },
      remoteSpendingRevoked: {
        title: 'Uzaktan harcama durduruldu',
        messageByAdmin: 'Bir yönetici bu terminal için uzaktan harcamayı durdurdu.',
        messageBySelf: 'Bu terminal için uzaktan harcamayı sen durdurdun.'
      },
      remoteSpendingReconnect: who => `${who} Bu cihaza yeniden yetki vermek için Ayarlar → Ağ Geçidi’nden yeniden bağlan.`,
      sessionRevoked: { title: 'Oturum kapatıldı', message: 'Oturumun sonlandı. Ayarlar → Ağ Geçidi’nden tekrar giriş yap.' },
      cliBillingDisabled: {
        title: 'Uzaktan harcama kapalı',
        message: 'Bu hesapta uzaktan harcama kapalı — bir faturalandırma yöneticisi portaldan açabilir.'
      },
      roleRequired: {
        title: 'Yönetici rolü gerekli',
        message: 'Bakiye eklemek için kuruluş yöneticisi gerekir. Bir yöneticiden iste veya portalda yönet.'
      },
      idempotencyConflict: {
        title: 'Yeni bir yükleme başlat',
        message: '🔴 Bu ödeme anahtarı başka bir tutar için zaten kullanılmış. Yeni bir yükleme başlat.'
      },
      noPaymentMethod: {
        title: 'Kayıtlı kart yok',
        message: '💳 Terminal ödemeleri için henüz kayıtlı kart yok. Portalda bir tane ekle.'
      },
      orgAccessDenied: { title: 'Kuruluş erişimi reddedildi', message: 'Bu belirteç yönetebileceğin bir kuruluşa bağlı değil' },
      monthlyCapExceeded: {
        title: 'Aylık harcama sınırına ulaşıldı',
        messageReached: '🔴 Aylık harcama sınırına ulaşıldı.',
        messageHeadroom: remaining => `🔴 Aylık harcama sınırına ulaşıldı — $${remaining} pay kaldı.`
      },
      rateLimited: {
        title: 'Şu anda çok fazla ödeme denemesi var',
        message: mins =>
          mins > 0
            ? `🟡 Şu anda çok fazla deneme var (~${mins} dk sonra tekrar dene). Bu bir ödeme hatası değildir.`
            : '🟡 Şu anda çok fazla ödeme denemesi var. Bu bir ödeme hatası değildir.'
      },
      stripeUnavailable: {
        title: 'Stripe tarafında geçici sorun var',
        message: mins => (mins > 0 ? `Stripe sorun yaşıyor — ~${mins} dk içinde tekrar dene` : 'Stripe sorun yaşıyor — birazdan tekrar dene')
      },
      upgradeCapExceeded: { title: 'Günlük plan değiştirme sınırına ulaşıldı', message: 'Günlük sınır doldu — yarın tekrar dene' },
      endpointUnavailable: {
        title: 'Faturalandırma uç noktası kullanılamıyor',
        message: 'Faturalandırma uç noktası JSON olmayan bir yanıt döndürdü.'
      },
      timeout: { title: 'Faturalandırma isteği zaman aşımına uğradı', message: 'Faturalandırma isteği zaman aşımına uğradı.' },
      transport: { title: 'Faturalandırma bağlantısı başarısız', message: 'İstek ağ geçidine ulaşmadan başarısız oldu.' },
      default: { title: 'Faturalandırma isteği başarısız', message: 'Faturalandırma isteği başarısız oldu.' }
    }
  }
}
