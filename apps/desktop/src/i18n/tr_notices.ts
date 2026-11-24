import type { Translations } from './types'
import type { DesktopCommandNotices } from './types_desktop_commands'
import type { SessionCommandNotices } from './types_notices'

export const trDesktopCommands: DesktopCommandNotices = {
  error: message => `hata: ${message}`,
  rollbackUsage: 'kullanım: /rollback [list] | diff <n|hash> | <n|hash> [dosya] [--all]',
  checkpointsDisabled: 'Bu oturum için kontrol noktaları etkin değil (config.yaml içinde checkpoints.enabled ayarlayın).',
  checkpointsEmpty: 'Bu çalışma dizini için henüz kontrol noktası yok.',
  checkpointsHeader: 'Kontrol noktaları (en yeni önce):',
  checkpointsHint:
    '/rollback <n> [dosya] ile geri yükle (kendi değişikliklerinin de üzerine yazmak için --all ekle); /rollback diff <n> ile önizle.',
  noDiff: 'O kontrol noktasından beri değişiklik yok.',
  rollbackFailed: error => `Geri alma başarısız: ${error}`,
  unknownError: 'bilinmeyen hata',
  restored: hash => (hash ? `${hash} kontrol noktası geri yüklendi.` : 'Kontrol noktası geri yüklendi.'),
  rewound: count => `Bu konuşmadan ${count} mesaj geri alındı.`,
  reopenForRewind: 'Geri alınan konuşmayı görmek için bu sohbeti yeniden aç.',
  agentsEmpty: 'Bu sohbette etkin alt ajan veya arka plan işlemi yok.',
  subagentsHeader: count => `Alt ajanlar (${count}):`,
  subagentFallback: 'alt ajan',
  statusRunning: 'çalışıyor',
  toolCalls: count => `${count} araç çağrısı`,
  processesHeader: count => `Arka plan işlemleri (${count}):`,
  configHeader: 'Yapılandırma (görünüm, onaylar, yapıştırma ve ses ayarları; diğerleri gösterilmez):',
  configDefaults: '(varsayılanlar)',
  configFooter: 'Ayarları Ayarlar sayfasından değiştirin veya ağ geçidi sunucusunda `hermes config edit` ile config.yaml düzenleyin.',
  historyHeader: count => `Konuşma geçmişi (${count} mesaj):`,
  historyEmpty: 'Henüz mesaj yok.',
  historyYou: 'Sen',
  historyHermes: 'Hermes',
  saveUsage: 'kullanım: /save [json|md|html] [dosya_adı] [redact]',
  saveLegacyRefused:
    'Kaydedilmedi: bu ağ geçidi gizlenmiş, adlandırılmış veya JSON dışı kopya dışa aktaramıyor. Ağ geçidini güncelleyin veya ham JSON için /save komutunu seçeneksiz çalıştırın.',
  savedOnHost: path => `Ağ geçidi sunucusuna kaydedildi: ${path}`,
  unknownPath: '(bilinmeyen yol)',
  saveUnsupported: 'hata: bu masaüstü derlemesi dosya kaydedemiyor',
  saveDialogTitle: 'Konuşmayı kaydet',
  savedTo: path => `Konuşma şuraya kaydedildi: ${path}`,
  saveCancelled: 'Kaydedilmedi (iptal edildi).',
  exportRemote:
    '/export bu makinede olmayan ağ geçidi sunucusundan profil paketler. O sunucuda `hermes profile export` çalıştır.',
  importRemote:
    '/import bu makinede olmayan ağ geçidi sunucusuna profil kurar. O sunucuda `hermes profile import <arşiv>` çalıştır.',
  timestampsUsage: 'kullanım: /timestamps [on|off|status]',
  timestampsOn: 'Zaman damgaları: açık (bu pencere; kalıcı olması için config.yaml içinde display.timestamps ayarlayın)',
  timestampsOff: 'Zaman damgaları: kapalı (bu pencere; kalıcı olması için config.yaml içinde display.timestamps ayarlayın)'
}

export const trSessionCommands: SessionCommandNotices = {
  undoUsage: 'kullanım: /undo [N]',
  undoNothing: 'geri alınacak bir şey yok',
  undidOne: (count: string) => `${count} mesaj geri alındı — kaldırılan mesaj düzenleyicide`,
  undidOther: (count: string) => `${count} mesaj geri alındı — kaldırılan mesajlar düzenleyicide`,
  retryNothing: 'yeniden denenecek bir şey yok',
  retryUnsupported: '/retry: medya veya bilinmeyen içerik parçalarını yeniden deneme desteklenmiyor',
  busy: (command: string) =>
    `oturum meşgul — Hermes hâlâ yanıt veriyor. Önce mevcut yanıtı durdur (Durdur düğmesi veya terminalde Ctrl+C), sonra /${command} çalıştır.`,
  busyCompressing: (command: string) =>
    `oturum meşgul — /compress çalışıyor; bitince /${command} çalıştır.`,
  steerUsage: 'kullanım: /steer <istek>',
  steerQueued: (preview: string) => `yönlendirme sıraya alındı — sonraki araç çağrısından sonra iletilecek: "${preview}"`,
  steerNoActiveTurn: (preview: string) => `etkin tur yok — sonraki için sıraya alındı: "${preview}"`,
  steerRejected: 'yönlendirme reddedildi — etkin tur yok, sonraki tur için sıraya alındı',
  queued: (preview: string) => `sıraya alındı: "${preview}"`,
  queueFailed: 'mesaj sıraya eklenemedi',
  countOne: (count: string) => `${count} sıradaki mesaj`,
  countOther: (count: string) => `${count} sıradaki mesaj`,
  queueEditKeptTitle: 'Sıradaki mesaj değiştirilmedi',
  queueEditKept: 'Düzenlemen kaydedilmeden önce başladı veya reddedildi. Düzenlenen metnin düzenleyicide duruyor.',
  queueEditUnconfirmedTitle: 'Düzenleme doğrulanmadı',
  queueEditUnconfirmed:
    'Hermes düzenlemeni doğrulayamadı. Aynı düzenlemeyi yeniden denemek için tekrar kaydet; asla iki kez sıraya alınmaz.'
}

export const trNotices = {
  remoteDisplayBanner: {
    message: reason =>
      `Yazılım oluşturma etkin — uzak ekran algılandı (${reason}). Titremeyi önlemek için GPU hızlandırma devre dışı bırakıldı.`
  },
  butterbar: {
    goTo: (index, total) => `${total} bildirimden ${index}. göster`,
    legal: {
      before: 'Hermes Agent kullanımı ',
      terms: 'Hizmet Şartları',
      between: ' ve ',
      privacy: 'Gizlilik Politikası',
      after: ' kapsamına tabidir.'
    }
  },
  promptNotices: {
    legacySendUnconfirmed:
      'Sunucu bu mesajın önceki gönderimini doğrulayamadı, dolayısıyla zaten çalışmış olabilir. Tekrar göndermeden önce konuşmayı kontrol et.',
    restoredDraftAttachmentsDropped:
      'Gönderilmemiş mesajındaki ekler geri yüklenemedi. Göndermeden önce onları tekrar ekle.',
    mcpReloadDeferred:
      'Bu sohbet meşgul: MCP değişikliği tur bittikten ve MCP yeniden yüklendikten sonra veya sohbeti yeniden açtığında uygulanır',
    mcpReloadUnavailable: servers => `Bağlanamadı: ${servers}`,
    compactedTurnUnavailable:
      'Sohbet sıkıştırılırken bu mesaj özetlendi, dolayısıyla artık geri yüklenemez veya düzenlenemez.',
    staleTurnUnavailable: 'Bu mesaj artık bu sohbetin geçmişinde yer almıyor.',
    sessionCommands: trSessionCommands,
    desktopCommands: trDesktopCommands
  },
  keepAwakeOffer: {
    title: 'Hermes çalışırken bilgisayarın uyku moduna geçti',
    message:
      'Hermes bir görev çalışırken bilgisayarını uyanık tutabilir. Ekran yine kapanır ve pildeyken bilgisayarın uyumaya devam edebilir.',
    action: 'Çalışırken uyanık tut'
  },
  connectorOffer: {
    heading: 'Bağlı uygulamalarını koru',
    body: 'Gmail veya Slack gibi bağladığın uygulamaları hesabında tutmak için ücretsiz bir Nous hesabıyla giriş yap.'
  }
} satisfies Pick<
  Translations,
  'remoteDisplayBanner' | 'butterbar' | 'promptNotices' | 'keepAwakeOffer' | 'connectorOffer'
>
