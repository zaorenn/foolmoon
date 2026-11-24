import type { Translations } from './types'
import type { GatewayGroupOpenCopy, SkillDeepLinkCopy } from './types_deep_links'
import type { ExternalOpenFailedCopy } from './types_external_open'

export const trAppTour: Translations['appTour'] = {
  sessions: { title: 'Sohbetlerin', text: 'Tüm konuşmaların burada yaşar. Herhangi birini ara, sabitle veya yeniden aç.' },
  composer: { title: 'Buradan sor', text: 'Ne yapılmasını istediğini söyle. Bir dosya eklemek için @ yaz.' },
  newSession: { title: 'Temiz başla', text: 'Yeni bir oturum kendi bağlamını alır. Her iş için bir tane kullan.' },
  model: { title: 'Model seçici', text: 'Sana hangi modelin yanıt vereceğini seçer.' },
  modelLocal: 'Bu bilgisayar yerelde bir model çalıştırabilir: Ayarlar > Sağlayıcılar > Yerel Modeller.',
  capabilities: { title: 'Yetenekler', text: 'Hermes’in kullanabileceği beceriler, araçlar ve eklentiler. Buradan daha fazlasını ekle.' },
  messaging: { title: 'Mesajlaşma', text: 'Hermes’e Telegram, Slack, Discord ve daha fazlasından ulaş.' },
  rightPane: { title: 'Çalışma paneli', text: 'Sağda dosyaları, terminali, incelemeyi ve uygulama içi tarayıcıyı açar.' }
}

export const trExternalOpenFailed: ExternalOpenFailedCopy = {
  title: 'Bu bağlantı açılamadı',
  message: 'Bu adresi açmak için kayıtlı bir tarayıcı yok. Bağlantıyı kopyalayıp el ile aç.',
  copyUrl: 'Bağlantıyı kopyala',
  close: 'Kapat',
  missing: {
    title: 'Dosya bulunamadı',
    message: 'Bu dosya mevcut değil — silinmiş, taşınmış veya başka bir makinede bulunuyor olabilir.'
  }
}

export const trSkillDeepLink: SkillDeepLinkCopy = {
  installTitle: (name: string) => `“${name}” kurulsun mu?`,
  installDescription: 'Bu yetenek yeni oturumlarda kullanılabilir olacak. Yalnızca güvendiğin kaynakları kur.',
  installTo: 'Kurulum hedefi',
  thisComputer: 'Bu bilgisayar',
  installing: 'Kuruluyor…',
  installComplete: (name: string) => `“${name}” kuruldu`,
  destinationChanged: 'Hedef değişti. Bu pencereyi kapatıp kurulum bağlantısını yeniden aç.',
  installed: 'Kurulu',
  source: 'Kaynak'
}

export const trGatewayGroupOpen: GatewayGroupOpenCopy = {
  opening: 'Grup sohbeti açılıyor…',
  lookupFailed: 'Bu grup ağ geçidinde bulunamadı. Tekrar dene.',
  missing: 'Bu grup sohbeti artık mevcut değil.'
}
