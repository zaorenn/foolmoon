import type { Translations } from './types'
import type { MemoryLayersTranslations } from './types_memory_layers'

type ThreadCopy = Translations['assistant']['thread']

export const trErrorCodes: ThreadCopy['errorCodes'] = {
  auth: {
    title: provider => `${provider} API anahtarını reddetti`,
    body: () => 'Kayıtlı anahtar geçersiz veya iptal edilmiş. Güncelle ve mesajını tekrar gönder.'
  },
  auth_permanent: {
    title: provider => `${provider} API anahtarını reddetti`,
    body: () => 'Kayıtlı anahtar geçersiz veya iptal edilmiş. Güncelle ve mesajını tekrar gönder.'
  },
  billing: {
    title: provider => `${provider} kredin tükendi`,
    body: provider => `${provider} üzerinde ücretli modelleri kullanmaya devam etmek için kredi ekle.`
  },
  rate_limit: {
    title: provider => `${provider} şu anda meşgul`,
    body: provider => `${provider} hız sınırına ulaşıldı. Biraz bekleyip tekrar dene.`
  },
  upstream_rate_limit: {
    title: (_provider, model) => `${model || 'Bu model'} şu anda meşgul`,
    body: (provider, model) =>
      `${model || 'Bu model'} senin hesabında değil, ${provider} tarafında hız sınırına takıldı. Birazdan tekrar dene.`
  },
  overloaded: {
    title: provider => `${provider} şu anda aşırı yüklü`,
    body: provider => `${provider} aşırı yüklü ve bu isteği alamadı. Birazdan tekrar dene.`
  },
  server_error: {
    title: provider => `${provider} tarafında sorun var`,
    body: provider => `${provider} bir sunucu hatası döndürdü. Birazdan tekrar dene.`
  },
  timeout: {
    title: provider => `${provider} erişilemiyor`,
    body: provider => `Hermes ${provider} sunucusuna ulaşamadı. Bağlantını kontrol edip tekrar dene.`
  },
  stream_drop: {
    title: 'Yanıt kesildi',
    body: 'Yanıt tamamlanmadan bağlantı koptu. Tekrar göndermek için yeniden dene.'
  },
  no_reply: {
    title: 'Yanıt ulaşmadı',
    body: 'Hermes bu turu tamamladı ancak pencereye yanıt ulaşmadı. Tekrar göndermek için yeniden dene.'
  },
  upstream_blocked: {
    title: provider => `${provider} bu isteği engelledi`,
    body: provider =>
      `${provider} önündeki güvenlik duvarı istek modele ulaşmadan reddetti. Sağlayıcı değiştir veya özel User-Agent ayarla.`
  },
  ssl_cert_verification: {
    title: provider => `${provider} bağlantısı doğrulanamadı`,
    body: provider =>
      `Bir vekil sunucu veya güncel olmayan sertifika deposu ${provider} ile güvenli bağlantıyı engelledi. Kurulum kılavuzu nasıl çözüleceğini gösterir.`
  },
  context_overflow: {
    title: 'Bu sohbet çok uzun',
    body: (_provider, model) =>
      `Konuşma artık ${model ? `${model} modelinin` : 'modelin'} bağlam penceresine sığmıyor. Devam etmek için sıkıştır.`
  },
  payload_too_large: {
    title: 'Bu mesaj çok büyük',
    body: provider =>
      `Ekler dahil istek ${provider} boyut sınırını aşıyor. Konuşmayı sıkıştır veya ekleri kaldır.`
  },
  model_not_found: {
    title: (_provider, model) => `${model || 'Bu model'} kullanılamıyor`,
    body: (provider, model) =>
      `${provider} hesabında ${model || 'bu modeli'} sunmuyor. Başka bir model seç.`
  },
  provider_policy_blocked: {
    title: (provider, model) => `${provider} ayarları ${model || 'bu modeli'} engelliyor`,
    body: provider =>
      `${provider} gizlilik ayarların bu modelin tüm uç noktalarını hariç tutuyor. ${provider} üzerinden değiştir veya başka bir model seç.`
  },
  content_policy_blocked: {
    title: provider => `${provider} bu mesajı reddetti`,
    body: provider => `${provider} güvenlik filtresi isteği kabul etmedi. Mesajı düzenleyip tekrar gönder.`
  },
  format_error: {
    title: provider => `${provider} bu isteği reddetti`,
    body: provider =>
      `${provider} bu konuşmanın yapısını kabul edemedi. Sağlayıcı değiştir veya sorun sürerse yeni sohbet başlat.`
  },
  truncated: {
    title: 'Yanıt yarıda kesildi',
    body: (_provider, model) =>
      `${model || 'Model'} yanıtını tamamlamadan durdu. Kaldığı yerden sürmesi için devam et.`
  },
  invalid_response: {
    title: 'Yanıt okunamadı',
    body: provider => `${provider} boş veya bozuk bir yanıt döndürdü. Birazdan tekrar dene.`
  },
  empty_response: {
    title: 'Yanıt alınamadı',
    body: provider => `${provider} bu mesaj için hiçbir şey döndürmedi. Birazdan tekrar dene.`
  },
  loop_error: {
    title: 'Hermes bu adımı tamamlayamadı',
    body: 'Yanıt işlenirken bir sorun oluştu. Tekrar dene; yine olursa ayrıntılardan tanılama gönder.'
  },
  SESSION_OWNER_BUSY: {
    title: 'Hermes bu sohbette meşgul',
    body: 'Burada başka bir tur çalışıyor ve mesajın sırasına eklenemedi. Hiçbir şey gönderilmedi. Mevcut tur bitince tekrar dene.'
  },
  cron_session_read_only: {
    title: 'Bu sohbet zamanlanmış bir göreve ait',
    body: 'Yalnızca o görevi çalıştırır, bu yüzden mesajın işlenmedi. Göndermek için yeni sohbet başlat.'
  },
  session_read_only: {
    title: 'Bu sohbet salt okunur',
    body: 'Hermes’in gösterebildiği ancak devam ettiremediği kayıtlı bir geçmiş. Göndermek için yeni sohbet başlat.'
  },
  workspace_unavailable: {
    title: 'Bu sohbetin klasörü kayıp',
    body: 'Bu sohbetin çalıştığı klasör taşınmış veya silinmiş. Klasörü yeniden oluştur veya Projeye taşı ile başka bir klasör verip tekrar dene.'
  },
  launch_credentials_unavailable: {
    title: 'Bu sohbetin API anahtarı değişti',
    body: 'Bu sohbet sonradan değiştirilen veya kaldırılan bir API anahtarıyla başlatıldı. Açık bir sohbet kendiliğinden başka anahtara geçmez. Güncel anahtarını kullanmak için yeni oturum aç.'
  },
  local_runtime_unavailable: {
    title: 'Yerel model sunucusuna ulaşılamıyor',
    body: 'Yerel model sunucusu henüz yanıt vermiyor: hâlâ başlatılıyor olabilir. Birazdan tekrar dene veya başka modele geç.',
    bodyNoRetry:
      'Yerel model sunucusu kapalı. Masaüstü uygulamasından veya terminalde `hermes model` ile başlat ya da başka bir modele geç.'
  },
  SESSION_OWNER_UNCONFIRMED: {
    title: 'Mesajın zaten sıraya alınmış olabilir',
    body: 'Ağ geçidi mesajını zamanında doğrulayamadı. Sıraya alındıysa önceki tur bitince çalışacaktır. Tekrar göndermeden önce sohbeti kontrol et.'
  },
  agent_init_failed: {
    title: 'Bu sohbet başlatılamadı',
    body: provider =>
      `Hermes bu sohbet için ${provider} sağlayıcısına bağlanamadı. Tekrar dene; yine başarısız olursa Ayarlar’dan sağlayıcıyı kontrol et.`
  },
  SESSION_NOT_OWNED: {
    title: 'Sohbet başka bir yerde açık',
    body: 'Bu sohbet başka bir Hermes penceresinde veya terminalinde açık. Burada yeni sohbet başlat veya önce orada kapat.'
  },
  disk_full: {
    title: 'Diskin dolu',
    body: 'Hermes bu konuşmayı kaydedemedi. Yer aç ve tekrar dene.'
  },
  free_tier_disabled: {
    title: 'Sohbete devam etmek için giriş yap',
    body: 'Ücretsiz bir Nous hesabıyla giriş yap, sohbete devam et.'
  },
  free_tier_rate_limited: {
    title: 'Ücretsiz kullanım kotası doldu',
    body: 'Kısa süre içinde yenilenir. Daha büyük kota için ücretsiz bir Nous hesabıyla giriş yap.'
  },
  free_tier_at_capacity: {
    title: 'Ücretsiz katman şu an yoğun',
    body: 'Sırayı atlamak için ücretsiz giriş yap veya birazdan tekrar dene.'
  },
  free_tier_model_not_free: {
    title: 'Bu model için giriş gerekiyor',
    body: 'Hermes şimdilik ücretsiz modeli kullanıyor. Daha fazla model için ücretsiz bir Nous hesabıyla giriş yap.'
  },
  free_tier_route: {
    title: 'Ücretsiz modele ulaşılamıyor',
    body: 'Ücretsiz bir Nous hesabıyla giriş yap veya NOUS_INFERENCE_BASE_URL ayarını kontrol et.'
  },
  free_tier_outage: {
    title: 'Ücretsiz modelde sorun var',
    body: 'Mesajını bir dakika sonra tekrar göndermeyi dene.'
  },
  free_tier_refused: {
    title: 'Sohbete devam etmek için giriş yap',
    body: 'Nous hesabıyla giriş yapmak ücretsizdir.'
  },
  usage_window: {
    title: 'Dahil kullanım hakkı doldu',
    body: 'Planına dahil kullanım sıfırlanana kadar tükendi. Devam etmek için /topup üzerinden kredi ekle.'
  }
}

export const trErrorLayers: Pick<ThreadCopy, 'errorLayerBodies' | 'errorLayers'> = {
  errorLayers: {
    auth: 'Giriş sorunu',
    billing: 'Kredi tükendi',
    disk: 'Disk dolu',
    endpoint: 'Model sunucuna ulaşılamıyor',
    gateway: 'Mesajın gönderilemedi',
    generic: 'Foolmoon bu yanıtı tamamlayamadı',
    provider: 'Yapay zeka hizmeti hata döndürdü',
    runtime: 'Foolmoon bir sorunla karşılaştı',
    streaming: 'Yanıt kesildi'
  },
  errorLayerBodies: {
    auth: 'Yapay zeka hizmeti girişini reddetti. Bu sağlayıcının kimlik bilgilerini kontrol edip mesajını tekrar gönder.',
    billing: 'Hesabında bu sağlayıcı için kredi kalmadı. Bakiye ekle veya sağlayıcı değiştirip tekrar gönder.',
    disk: 'Diskin dolu olduğu için Foolmoon bu konuşmayı kaydedemedi. Biraz yer açıp yeniden dene.',
    endpoint: 'Foolmoon özel model sunucuna ulaşamıyor. Çalıştığını kontrol edip mesajını yeniden gönder.',
    gateway:
      'Foolmoon bu yanıtı başlatırken dahili bir sorun yaşadı. Mesajını tekrar gönder; sürerse tanılama gönder.',
    generic: 'Foolmoon yanıt verirken bir şeyler ters gitti. Yeniden dene veya sürerse ayrıntıları kopyala.',
    provider: 'Yapay zeka hizmeti bu isteği tamamlayamadı. Birazdan tekrar dene veya sağlayıcı değiştir.',
    runtime:
      'Foolmoon bu yanıtı başlatırken dahili bir sorun yaşadı. Mesajını tekrar gönder; sürerse tanılama gönder.',
    streaming: 'Yanıt bitmeden bağlantı koptu. Tekrar göndermek için yeniden dene.'
  }
}

export const trMemoryLayers: MemoryLayersTranslations = {
  activeProvider: 'Etkin bellek sağlayıcısı',
  selectedProvider: 'Seçilen bellek sağlayıcısı',
  selectedDesc: current => `Henüz etkin değil: bu seçim kaydedilene kadar oturumlar ${current} kullanmaya devam eder.`,
  builtinMemory: 'yalnızca yerleşik bellek',
  noProvider: 'Yok — yalnızca yerleşik bellek',
  noProviderDesc:
    'Hermes yalnızca aşağıdaki yerleşik katmanı kullanır. Harici bir sağlayıcı eklemek için Ayarlar › Bellek ve Bağlam altından seç.',
  providerDesc: name => `${name} yerleşik katmanın üstüne her oturuma kendi hatırlamasını ekler.`,
  providerNotReadyDesc: name =>
    `${name} kayıtlı sağlayıcıdır ancak hazır olana kadar hatırlama eklemez. Yerleşik katman her koşulda çalışır.`,
  providerUnknownDesc: name => `${name} kayıtlı sağlayıcıdır; Hermes hazır olup olmadığını okuyamadı.`,
  statusUnavailable: 'Bellek durumu kullanılamıyor',
  statusUnavailableDesc: 'Hangi bellek sağlayıcısının etkin olduğu veya hazır olup olmadığı okunamadı.',
  retry: 'Tekrar dene',
  status: {
    ready: 'hazır',
    needs_config: 'kurulum gerekli',
    unavailable: 'kullanılamıyor',
    missing: 'kurulu değil'
  },
  builtinLayer: 'Yerleşik katman',
  onByDefault: 'Varsayılan olarak açık',
  on: 'Açık',
  off: 'Kapalı',
  onlyFile: file => `yalnızca ${file}`,
  builtinDesc:
    'MEMORY.md ve USER.md, herhangi bir harici sağlayıcıdan ayrı olarak Hermes’in kendi belleğidir. İkisi de oturumlara varsayılan olarak yüklenir; Ayarlar › Bellek ve Bağlam altındaki anahtarlar her birini kapatır. Sağlayıcı bu katmana eklenir, yerini almaz.'
}
