import type { Translations } from './types'

export const trOnboarding: Translations['onboarding'] = {
  headerTitle: 'Hermes Agent kurulumunu yapalım',
  headerDesc: 'Sohbete başlamak için bir model sağlayıcısı bağla. Çoğu seçenek tek tıkla çalışır.',
  preparingInstall: 'Hermes kurulumu tamamlıyor. İlk çalıştırmada bu genellikle bir dakikadan kısa sürer.',
  starting: 'Hermes başlatılıyor…',
  setupSlowTitle: 'Kurulum normalden uzun sürüyor.',
  setupSlowBody: 'Hermes arka planda hâlâ başlatılıyor.',
  continueWithoutSetup: 'Kurulum yapmadan devam et',
  lookingUpProviders: 'Sağlayıcılar aranıyor…',
  collapse: 'Daralt',
  otherProviders: 'Diğer sağlayıcılar',
  haveApiKey: 'API anahtarım var',
  chooseLater: 'Sağlayıcıyı daha sonra seçeceğim',
  recommended: 'Önerilen',
  connected: 'Bağlı',
  featuredPitch: 'Tek abonelik, 300+ öncü model — Hermes’i çalıştırmanın önerilen yolu',
  fireworksPitch: 'Doğrudan model API’si — Fireworks üzerinde barındırılan öncü modeller',
  localModelsTitle: 'Modelleri yerelde çalıştır',
  localModelsPitch: 'Hesap gerekmez — bir model indir ve bu makinede çalıştır',
  openRouterPitch: 'Tek anahtar, yüzlerce model — sağlam bir varsayılan',
  apiKeyOptions: {
    fireworks: {
      short: 'doğrudan model API’si',
      description: 'Fireworks AI tarafından barındırılan modellere doğrudan erişim.'
    },
    openrouter: {
      short: 'tek anahtar, çok model',
      description: 'Tek anahtar arkasında yüzlerce model barındırır. Yeni kurulumlar için iyi bir varsayılandır.'
    },
    openai: { short: 'GPT sınıfı modeller', description: 'OpenAI modellerine doğrudan erişim.' },
    gemini: { short: 'Gemini modelleri', description: 'Google Gemini modellerine doğrudan erişim.' },
    xai: { short: 'Grok modelleri', description: 'xAI Grok modellerine doğrudan erişim.' },
    local: {
      short: 'kendi sunucun',
      description: 'Hermes’i yerel veya kendi barındırdığın OpenAI uyumlu bir uç noktaya bağla (vLLM, llama.cpp, Ollama vb.).'
    }
  },
  backToSignIn: 'Giriş ekranına dön',
  getKey: 'Anahtar al',
  replaceCurrent: 'Mevcut değeri değiştir',
  pasteApiKey: 'API anahtarını yapıştır',
  localApiKeyPlaceholder: 'API anahtarı (isteğe bağlı — yalnızca uç noktan gerektiriyorsa)',
  localModelNamePlaceholder: 'Model adı (örn. command-a-plus-05-2026)',
  couldNotSave: 'Kimlik bilgisi kaydedilemedi.',
  connecting: 'Bağlanıyor',
  update: 'Güncelle',
  flowSubtitles: {
    pkce: 'Giriş için tarayıcını açar, ardından buradan devam eder',
    device_code: 'Tarayıcında bir doğrulama sayfası açar — Hermes otomatik bağlanır',
    external: 'Terminalinde bir kez giriş yap, sonra sohbete dön'
  },
  startingSignIn: provider => `${provider} için giriş başlatılıyor…`,
  verifyingCode: provider => `Kodun ${provider} ile doğrulanıyor…`,
  connectedProvider: provider => `${provider} bağlandı`,
  connectedPicking: provider => `${provider} bağlandı. Varsayılan model seçiliyor…`,
  signInFailed: 'Giriş başarısız. Tekrar dene.',
  signInExpired:
    'Sen tamamlamadan giriş sayfası zaman aşımına uğradı. Tekrar dene ve tarayıcı adımını birkaç dakika içinde tamamla ya da bunun yerine bir API anahtarı kullan.',
  signInDidNotFinish: provider =>
    `${provider} ile giriş tamamlanmadı. İnternet bağlantını kontrol edip tekrar dene veya farklı bir sağlayıcı seç.`,
  tryAgain: 'Tekrar dene',
  useApiKeyInstead: 'Bunun yerine API anahtarı kullan',
  errorDetails: 'Ayrıntılar',
  pickDifferentProvider: 'Farklı bir sağlayıcı seç',
  signInWith: provider => `${provider} ile giriş yap`,
  openedBrowser: provider => `Tarayıcında ${provider} açıldı.`,
  authorizeThere: 'Orada Hermes’e yetki ver.',
  copyAuthCode: 'Yetkilendirme kodunu kopyala ve aşağıya yapıştır.',
  pasteAuthCode: 'Yetkilendirme kodunu yapıştır',
  reopenAuthPage: 'Yetkilendirme sayfasını yeniden aç',
  waitingAuthorize: 'Yetkilendirmen bekleniyor…',
  externalPending: provider =>
    `${provider} kendi CLI’ı üzerinden oturum açar. Bu komutu terminalde çalıştır, sonra dönüp “Giriş yaptım”ı seç:`,
  signedIn: 'Giriş yaptım',
  deviceCodeOpened: provider => `Tarayıcında ${provider} açıldı. Bu kodu oraya gir:`,
  reopenVerification: 'Doğrulama sayfasını yeniden aç',
  copy: 'Kopyala',
  defaultModel: 'Varsayılan model',
  freeTier: 'Ücretsiz katman',
  pro: 'Pro',
  free: 'Ücretsiz',
  price: (input, output) => `Milyon token başına ${input} girdi / ${output} çıktı`,
  change: 'Değiştir',
  startChatting: 'Başla',
  docs: provider => `${provider} belgeleri`
}
