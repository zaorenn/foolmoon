import type { Translations } from './types'

export const trNotifications: Translations['settings']['notifications'] = {
  title: 'Bildirimler',
  intro: 'İşletim sistemi bildirimleri (uygulama içi uyarılar değil). Cihaz başına ayarlanır.',
  enableAll: 'Bildirimleri etkinleştir',
  enableAllDesc: 'Kapalı olduğunda aşağıdaki tüm bildirimler susturulur.',
  focusedHint: 'Tamamlanma uyarıları yalnızca Hermes arka plandayken tetiklenir.',
  kinds: {
    approval: {
      label: 'Onay gerekli',
      description: 'Bir komut onaylamanı veya reddetmeni bekliyor.'
    },
    input: {
      label: 'Girdi gerekli',
      description: 'Hermes bir soru sordu ya da bir parola veya gizli bilgi bekliyor.'
    },
    turnDone: {
      label: 'Yanıt hazır',
      description: 'Hermes arka plandayken bir tur tamamlandı.'
    },
    turnError: {
      label: 'Tur başarısız',
      description: 'Arka plan turu hataları.'
    },
    backgroundDone: {
      label: 'Arka plan görevi bitti',
      description: 'Arka plandaki bir terminal komutu tamamlandı.'
    },
    credits: {
      label: 'Kredi uyarıları',
      description: 'Kredi erişimi duraklatıldı veya geri açıldı.'
    },
    plugin: {
      label: 'Eklenti bildirimleri',
      description: 'Hermes arka plandayken bir masaüstü eklentisi bildirim gönderdi.'
    }
  },
  browserPermission: {
    title: 'Tarayıcı bildirimleri',
    allow: 'İzin ver',
    states: {
      default:
        'Sekme arka plandayken bu tarayıcıdan uyarılar gösterir. İzin verene kadar yalnızca sekme başlığı yanıp söner.',
      granted: 'İzin verildi. Sekme arka plandayken uyarılar görünür; sekme başlığı da yanıp söner.',
      denied: 'Bu tarayıcının site ayarlarında engellendi. Sekme başlığı yine de yanıp söner.',
      insecure: 'Tailscale serve gibi HTTPS gerektirir. Düz HTTP üzerinde yalnızca sekme başlığı yanıp söner.',
      unsupported: 'Bu tarayıcı bildirim gösteremiyor. Sekme başlığı yine de yanıp söner.'
    }
  },
  test: 'Test bildirimi gönder',
  testTitle: 'Hermes',
  testBody: 'Bildirimler çalışıyor.',
  testSent: 'Test gönderildi. Hiçbir şey görünmüyorsa işletim sistemi bildirim izinlerini ve Odak / Rahatsız Etme modunu kontrol et.',
  testUnsupported: 'Bu sistem yerel bildirimleri desteklemiyor.',
  muteSoundsTitle: 'Arayüz seslerini kapat',
  muteSoundsDesc:
    'Otomatik tamamlanma, uyandırma kelimesi, düşünme seslerini, dokunsal geri bildirimi ve sistem bildirim seslerini susturur. Ses önizlemeleri ve sesli yanıtlar çalmaya devam eder.',
  completionSoundTitle: 'Tamamlanma Sesi',
  completionSoundDesc: 'Ajan turu bittiğinde çalar. Bir önayar seç ve burada önizle.',
  completionSoundPreview: 'Önizle'
}

export const trSharedMetrics = {
  consentTitle: 'Kullanım istatistikleri paylaşılsın mı?',
  dialogTitle: 'Kullanım istatistikleri',
  consentBody:
    'Hermes onu nasıl kullandığını sayabilir: oturum süresi, hangi modellerin ve araçların çalıştığı ve bir şeyin ne zaman başarısız olduğu. Mesajlarını, dosyalarını, yollarını veya hata metinlerini asla kaydetmez.',
  whatIsCollected: 'Neler sayılır',
  collectedActivity: 'Oturumlar: süre, sonuç, hata türü, günlük aktif süre',
  collectedModels: 'Modeller: hangileri, toplam token miktarları',
  collectedNames: 'Özellikler: yerleşik araçlar, komutlar, uygulama alanları ve açılıp kapatılan ayarlar',
  collectedMilestones: 'Kurulum: tamamlanan adımlar, sağlayıcı bağlantıları, kaç yetenek, eklenti ve görev olduğu',
  collectedReliability: 'Uygulama sağlığı: çökmeler, açılış ve yanıt hızı, güncellemeler, mesajlaşma bağlantıları',
  collectedUsage: 'Ajan kalitesi: kaçan düzenlemeler, bozuk araç çağrıları, takılan döngüler, görev başı maliyet',
  collectedMachine: 'Makine: işletim sistemi, RAM aralığı, GPU türü, Hermes sürümü, yerel model kullanımı',
  sending:
    'Paylaşırsan Hermes günde bir kez bu profil için rastgele bir kimlikle Nous’a istatistik gönderir. Hermes’in kurulduğuna dair tek seferlik not dışında öncesinden kalan istatistikler asla gönderilmez. Bunu istediğin zaman Ayarlar’dan değiştirebilirsin.',
  readDocs: 'Tüm ayrıntıları oku',
  share: 'Nous ile paylaş',
  off: 'Hayır, teşekkürler',
  saveFailed: 'Seçimin kaydedilemedi',
  sendLabel: 'Kullanım istatistiklerini Nous ile paylaş',
  sendDesc:
    'Yalnızca sayılar, günde bir kez bu profil için rastgele bir kimlikle gönderilir. Mesajların, dosyaların, yolların veya hata metinlerin asla gönderilmez.',
  unavailable: 'Bu ayarı değiştirmek için Hermes arka ucunu güncelle.',
  stripBody: 'Yalnızca sayılar. Asla mesajların veya dosyaların değil.',
  stripReaskBody: 'Bir kez daha soruyoruz: önceki bir sürüm sen bunu görmeden “Hayır” kaydedebiliyordu.',
  stripChoices: { share: 'Nous ile paylaş', off: 'Hayır, teşekkürler' },
  stripDetails: 'Ayrıntılar'
} satisfies Translations['sharedMetrics']
