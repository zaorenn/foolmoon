import type { CatalogInstallTranslations } from './types_catalog_install'

export const trCatalogInstall: CatalogInstallTranslations = {
  preparing: 'Kurulum hazırlanıyor…',
  install: 'Kur',
  advanced: 'Gelişmiş',
  skip: 'Atla',
  installing: 'Kuruluyor…',
  installed: 'Kurulu',
  notInstalled: 'Kurulu değil',
  failed: 'Başarısız',
  showNames: 'adları göster',
  hideNames: 'adları gizle',
  skill: name => `${name} yeteneği`,
  kind: { plugin: 'eklenti', skill: 'yetenek' },
  tier: { official: 'resmi', verified: 'doğrulanmış', community: 'topluluk' },
  targetProfile: profile => `${profile} profiline kurulur`,
  sendFailed: 'Yanıtın gönderilemedi. Tekrar dene.',
  commitLabel: 'Commit',
  subdirLabel: 'Klasör',
  securityHeading: 'Güvenlik',
  scan: { passed: 'Tarama geçti', warnings: 'Taramada uyarılar bulundu', failed: 'Tarama başarısız' },
  requirementsLabel: 'Gereksinimler',
  requiresHermes: range => `Hermes ${range}`,
  envVar: name => `${name} ortam değişkeni`,
  credentialsHeading: 'Kimlik bilgileri',
  phase: {
    downloading: 'İndiriliyor…',
    python_packages: 'Python paketleri kuruluyor…',
    loading_tools: 'Araçları yükleniyor…'
  },
  serverNotConnected: (server, reason) => `MCP sunucusu ${server} bağlı değil${reason ? `: ${reason}` : ''}`,
  notEnabled: 'Kuruldu ancak etkin değil',
  missingEnv: names => `Kurulumu tamamlamak için ${names} değerini ayarla`,
  alreadyInstalled: 'Zaten kurulu; olduğu gibi bırakıldı'
}
