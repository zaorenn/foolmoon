import type { Translations } from './types'
import type { AuxTaskCopyMap } from './types_aux_tasks'
import type { ClarifyCopy } from './types_clarify'
import type { CronControlCopy } from './types_cron_control'
import type { PluginPreviewAccessTranslations } from './types_plugin_preview_access'
import type { PluginUpdateAllTranslations, PluginUpdateTranslations } from './types_plugin_update'
import type { ThemePickerCopy } from './types_theme_picker'
import type { UninstallSectionTranslations } from './types_uninstall_section'
import type { UpdateChannelCopy } from './types_update_channel'

export const trAuxTasks: AuxTaskCopyMap = {
  vision: { label: 'Görüş', hint: 'Görsel analizi' },
  compression: { label: 'Sıkıştırma', hint: 'Bağlam sıkıştırma' },
  approval: { label: 'Onay', hint: 'Akıllı otomatik onay' },
  mcp: { label: 'MCP', hint: 'MCP araç yönlendirmesi' },
  title_generation: { label: 'Başlık üretimi', hint: 'Oturum başlıkları' },
  review: { label: 'İnceleme', hint: '/review inceleyici alt ajanı' },
  voice_chat: { label: 'Sesli sohbet', hint: 'Sesli mod sözlü yanıtları' },
  triage_specifier: { label: 'Öncelik belirtici', hint: 'Kanban teknik detaylandırma' },
  kanban_decomposer: { label: 'Kanban parçalayıcı', hint: 'Görev parçalama' },
  profile_describer: { label: 'Profil açıklayıcı', hint: 'Otomatik profil açıklamaları' },
  curator: { label: 'Küratör', hint: 'Yetenek kullanım incelemesi' }
}

export const trClarify: ClarifyCopy = {
  notReady: 'Netleştirme isteği henüz hazır değil',
  gatewayDisconnected: 'Hermes şu anda çevrimdışı. Yeniden bağlan ve tekrar gönder.',
  sendFailed: 'Netleştirme yanıtı gönderilemedi',
  loadingQuestion: 'Soru yükleniyor…',
  other: 'Diğer (yanıtını yaz)',
  placeholder: 'Yanıtını yaz…',
  skip: 'Atla',
  skipped: 'Atlandı',
  noAnswer: 'Yanıt yok',
  confirmAndContinueLabel: 'Onayla ve devam et',
  singleSelectHint: 'Birini seç',
  multiSelectHint: 'Uyanların tümünü seç',
  oneQuestion: '1 soru',
  questionProgress: (answered, total) => `${total} sorudan ${answered} tanesi yanıtlandı`,
  notDelivered:
    'Bu soru uygulamaya ulaşmadı, bu yüzden burada yanıtlanamaz. Turu bitirmek için Durdur’a bas, ardından sohbette yanıtla.'
}

export const trConnectorAccounts: Translations['connectorsPage']['accounts'] = {
  heading: 'Hesaplar',
  count: (count: number) => `${count} hesap`,
  addAnother: 'Başka hesap ekle',
  aliasLabel: 'Hesap adı',
  aliasHint: 'Küçük harfler, rakamlar ve tireler, en fazla 32 karakter. Örneğin is veya ev.',
  aliasInvalid: 'Bir harf veya rakamla başlayan küçük harfler, rakamlar ve tireler kullan.',
  aliasTaken: 'Bu ad zaten kullanılıyor.',
  add: 'Bağla',
  rename: 'Yeniden adlandır',
  renameLabel: (name: string) => `${name} için yeni ad`,
  renameGone: 'Bu hesap artık yok. Kaldırılmış veya yeniden bağlama ile değiştirilmiş.',
  remove: 'Kaldır',
  removeTitle: (app: string, name: string) => `${name} ${app} hesabı kaldırılsın mı?`,
  removeBody: 'Hermes bu hesap adına işlem yapmayı bırakır. Diğer hesapların bağlı kalır.',
  retiredCount: (count: number) => `${count} devre dışı`,
  status: {
    expired: 'Erişim süresi doldu',
    failed: 'Bağlanamadı',
    inactive: 'Etkin değil',
    pending: 'Giriş bekleniyor',
    retired: 'Yeniden bağlama ile değiştirildi',
    revoked: 'Erişim iptal edildi'
  }
}

export const trCronControl: CronControlCopy = {
  stop: 'Durdur',
  stopping: 'Durduruluyor…',
  stopped: 'Çalıştırma iptal edildi',
  finishedFirst: 'Çalıştırma durdurulamadan önce bitti',
  nothingToStop: 'Devam eden çalıştırma yok',
  failedStop: 'Çalıştırma durdurulamadı',
  lastCancelled: (reason: string) => (reason ? `Son çalıştırma iptal edildi: ${reason}` : 'Son çalıştırma iptal edildi'),
  catchUpLabel: 'Kaçırılan çalıştırmalar',
  catchUpHint: 'Hermes çalışmazken kaçırılan çalıştırmalara ne yapılacağı.',
  catchUpChoices: {
    default: 'Varsayılanı kullan',
    run: 'Açıldığında bir kez çalıştır',
    skip: 'Atla'
  }
}

export const trPluginPreviewAccess: PluginPreviewAccessTranslations = {
  previewScriptPromptTitle: (plugin: string) => `${plugin} eklentisinin bu sayfada betik çalıştırmasına izin verilsin mi?`,
  previewScriptPromptBody: (plugin: string, origin: string) =>
    `${plugin}, ${origin} üzerindeki önizleme tarayıcısında JavaScript çalıştırmak istiyor.`,
  previewScriptPromptRisk: 'Betikler o sitede giriş yaptığın hesaplardaki sayfalar dahil her şeyi okuyabilir ve değiştirebilir.',
  previewScriptPromptRevokeHint: 'Yalnızca bu site için geçerlidir. Yetenekler ▸ Eklentiler içinden iptal edebilirsin.',
  previewScriptAllow: 'Bu sitede izin ver',
  previewScriptDeny: 'İzin verme',
  previewScriptAccessLabel: 'Sayfa betikleri',
  previewScriptAccessNone: 'Bir sayfada betik çalıştırmadan önce sorar',
  previewScriptRevoke: (origin: string) => `${origin} erişimini iptal et`,
  previewScriptRevoked: (plugin: string, origin: string) => `${plugin} artık ${origin} üzerinde betik çalıştıramaz.`,
  previewScriptRevokeUnsaved: (plugin: string, origin: string) =>
    `Değişiklik kaydedilemedi, yalnızca Hermes yeniden başlatılana kadar geçerli olacak. ${plugin} şimdilik ${origin} üzerinde engellendi.`
}

export const trPluginUpdate: PluginUpdateTranslations = {
  folderAccess: {
    title: 'Klasör erişimi',
    hint: (name: string) => `${name} bu klasörlerdeki dosyaları okuyabilir ve değiştirebilir. İptal hemen geçerli olur.`,
    revoke: 'İptal et',
    revokeLabel: (path: string) => `${path} erişimini iptal et`,
    revoked: (name: string, path: string) => `${name} artık ${path} yolunu kullanamaz.`,
    revokeFailed: (name: string) => `${name} için klasör erişimi iptal edilemedi`,
    pickerTitle: (name: string) => `${name} için bir klasör seç`,
    pickerButton: 'Erişime izin ver',
    refusedProtected: (name: string) =>
      `${name} bu klasörü kullanamaz: Hermes ayarlarını, anahtarlarını veya eklenti verilerini içeriyor. Bunları içermeyen bir klasör seç.`,
    loadFailed: (name: string) => `${name} ile paylaşılan klasörler yüklenemedi.`
  },
  updateToPin: (sha: string) => `${sha} sürümüne güncelle`,
  updateFailed: (name: string) => `${name} güncellenemedi`,
  updated: (name: string) => `${name} güncel katalog sürümüne yükseltildi. Uygulamak için ağ geçidini yeniden başlat.`,
  updateConsentTitle: (name: string) => `${name} daha fazla yetki istiyor`,
  updateConsentBody: (name: string, sha: string) =>
    `${name} (${sha}) yeni sürümü kurulu sürümde olmayan yüzeyler ekliyor. Yalnızca güveniyorsan uygula:`,
  updateConsentConfirm: 'Güncellemeyi uygula',
  updateScanTitle: (name: string) => `Güvenlik taraması ${name} için uyarı verdi`,
  updateScanBody: (name: string, count: number) =>
    `${name} güncellemesi dikkat kararı aldı (${count} bulgu). Her güncelleme taranır. Yalnızca kaynağa güveniyorsan uygula:`,
  updateScanMore: (count: number) => `+ ${count} tane daha`,
  updateScanConfirm: 'Yine de güncelle',
  updateScanBlocked: (name: string) =>
    `Güvenlik taraması ${name} güncellemesini engelledi (tehlikeli karar). Geçersiz kılınamaz.`,
  updatedGit: (name: string) => `${name} en son commit’e güncellendi.`
}

export const trPluginUpdateAll: PluginUpdateAllTranslations = {
  updateAll: 'Tümünü güncelle',
  updatingAll: 'Güncelleniyor…',
  updateAllTip: 'Kurulu tüm eklentileri kontrol et ve inceleme gerektirmeyen güncellemeleri uygula',
  updateAllDone: (updated: number, review: number, failed: number) =>
    `${updated} güncellendi` + (review ? `, ${review} inceleme bekliyor` : '') + (failed ? `, ${failed} başarısız` : ''),
  updateAllNone: 'Tüm eklentiler güncel',
  updateAllFailed: 'Eklentiler güncellenemedi',
  autoUpdate: 'Otomatik güncelle',
  autoUpdateTip: (hours: number) =>
    `Ağ geçidi kontrol ettiğinde (her ${hours} sa) eklenti güncellemelerini otomatik uygula. Güncellenmiş kod yeni oturumlarda yüklenir.`,
  autoUpdateFailed: 'Eklenti otomatik güncelleme değiştirilemedi'
}

export const trPreviewWeb: Translations['preview']['web'] = {
  embeddedPreviewHint: 'Bazı siteler gömülü önizlemeleri engeller. Asıl sayfayı bir tarayıcı sekmesinde aç.',
  appFailedToBoot: 'Önizleme uygulaması başlatılamadı',
  serverNotFound: 'Sunucu bulunamadı',
  remoteLoopback:
    'Bu adres bu makineyi değil, ajanını çalıştıran makineyi işaret ediyor. Tarayıcı paneli sayfaları yerelde yükler; uzak geliştirme sunucusu için port yönlendirmesi veya erişilebilir bir ana makine adı gerekir.',
  failedToLoad: 'Önizleme yüklenemedi',
  tryAgain: 'Tekrar dene',
  restarting: 'Hermes yeniden başlatıyor…',
  askRestart: 'Hermes’ten sunucuyu yeniden başlatmasını iste',
  lookingRestart: taskId => `Hermes yeniden başlatılacak bir önizleme sunucusu arıyor (${taskId})`,
  restartingTitle: 'Önizleme sunucusu yeniden başlatılıyor',
  restartingMessage: 'Hermes arka planda çalışıyor. İlerleme için önizleme konsolunu izle.',
  startRestartFailed: message => `Sunucu yeniden başlatma başlatılamadı: ${message}`,
  restartFailed: 'Sunucu yeniden başlatılamadı',
  hideConsole: 'Önizleme konsolunu gizle',
  showConsole: 'Önizleme konsolunu göster',
  hideDevTools: 'Önizleme DevTools’u gizle',
  openDevTools: 'Önizleme DevTools’u aç',
  goBack: 'Geri',
  goForward: 'İleri',
  reload: 'Sayfayı yenile',
  address: 'Adres',
  addressPlaceholder: 'Adres gir',
  blankPageBody: 'Gezinmek için yukarıya bir adres yaz veya Hermes’ten bir sayfa açmasını iste.',
  finishedRestarting: message => `Hermes önizleme sunucusunu yeniden başlatmayı bitirdi${message ? `: ${message}` : ''}`,
  failedRestarting: message => `Sunucu yeniden başlatılamadı: ${message}`,
  unknownError: 'bilinmeyen hata',
  restartedTitle: 'Önizleme sunucusu yeniden başlatıldı',
  reloadingNow: 'Önizleme şimdi yeniden yükleniyor.',
  restartFailedTitle: 'Önizleme yeniden başlatılamadı',
  restartFailedMessage: 'Hermes sunucuyu yeniden başlatamadı.',
  stillWorking:
    'Hermes hâlâ çalışıyor ancak henüz bir yeniden başlatma sonucu gelmedi. Sunucu komutu ön planda çalışıyor olabilir.',
  workspaceReloading: 'Çalışma alanı değişti, önizleme yeniden yükleniyor',
  fileChanged: url => `Dosya değişti, önizleme yeniden yükleniyor: ${url}`,
  filesChanged: (count, url) => `${count} dosya değişikliği, önizleme yeniden yükleniyor: ${url}`,
  watchFailed: message => `Önizleme dosyası izlenemedi: ${message}`,
  moduleMimeDescription:
    'Modül betikleri yanlış MIME türüyle sunuluyor. Bu genellikle proje geliştirme sunucusu yerine statik bir dosya sunucusunun Vite/React uygulaması sunduğu anlamına gelir.',
  loadFailedConsole: (code, message) => `Yükleme başarısız${code ? ` (${code})` : ''}: ${message}`,
  unreachableDescription: 'Önizleme sayfasına ulaşılamadı.',
  openTarget: url => `${url} aç`,
  fallbackTitle: 'Önizleme',
  annotate: 'Açıklama ekle',
  annotateOn: 'Açıklama eklemeyi durdur',
  annotateNeedPage: 'Önce uygulama içi tarayıcıda bir sayfa aç.',
  annotateFailed: 'Açıklama modu başlatılamadı',
  commenting: 'Yorum yapılıyor',
  addComments: count => `${count} yorum ekle`,
  commentPlaceholder: 'Bir yorum ekle…',
  commentTitle: n => `Yorum ${n}`,
  saveComment: 'Kaydet',
  cancelComment: 'Yorumu iptal et',
  vaultFill: 'Kayıtlı girişi doldur',
  vaultTitle: site => `${site} için kayıtlı girişler`,
  vaultLoading: 'Kayıtlı girişler yükleniyor…',
  vaultEmpty: 'Bu site için kayıtlı giriş yok',
  vaultUnlock: name => `${name} kilidini aç`,
  vaultOpenSettings: 'Kimlik Kasası ayarlarını aç',
  vaultFilled: label => `${label} dolduruldu. Formu gözden geçirip giriş yap.`,
  vaultFillFailed: 'Giriş doldurulamadı',
  vaultLoadFailed: 'Kayıtlı girişler yüklenemedi',
  vaultPageNotReady: 'Sayfa hâlâ yükleniyor. Tamamlandığında tekrar dene.'
}

export const trProjects: Translations['sidebar']['projects'] = {
  showAllSessions: 'Tüm oturumları göster',
  sectionLabel: 'Projeler',
  home: 'Ana dizin',
  autoDiscovered: 'Otomatik bulunan',
  newButton: 'Yeni proje',
  createTitle: 'Yeni proje',
  createDesc: 'Bir çalışma alanı adlandır ve bir ya da daha fazla klasör ekle.',
  renameTitle: 'Projeyi yeniden adlandır',
  addFolderTitle: 'Klasör ekle',
  namePlaceholder: 'örn. Proje X',
  foldersLabel: 'Klasörler',
  ideaLabel: 'Fikir',
  ideaPlaceholder: 'Bu proje ne hakkında? (IDEA.md dosyasına kaydedilir)',
  ideaGenerate: 'Fikir üret',
  ideaGenerating: 'Üretiliyor…',
  ideaShuffle: 'Şablonları karıştır',
  noFolders: 'Henüz klasör eklenmedi.',
  addFolder: 'Klasör ekle',
  primaryBadge: 'birincil',
  removeFolder: 'Kaldır',
  create: 'Oluştur',
  menu: 'İşlemler',
  menuRename: 'Yeniden adlandır…',
  menuAppearance: 'Görünüm',
  noColor: 'Renk yok',
  menuAddFolder: 'Klasör ekle',
  menuSetActive: 'Etkin yap',
  menuDelete: 'Sil',
  moveToProject: 'Projeye taşı',
  movedTo: name => `${name} projesine taşındı`,
  moveFailed: 'Oturum taşınamadı',
  moveNoFolder: 'Bu projenin taşınabilecek bir klasörü yok',
  moveBusy: 'Çalışan turu durdur, ardından sohbeti taşı',
  moveNoProjects: 'Başka proje yok',
  reveal: 'Klasörde göster',
  copyPath: 'Yolu kopyala',
  removeFromSidebar: 'Kenar çubuğundan gizle',
  createdInPreviousContext:
    'Proje önceki bağlantıda veya profilde oluşturuldu. Bulmak için geri geç; IDEA.md yazılmadı.',
  hiddenFromSidebar: 'Kenar çubuğundan gizlendi',
  undoHide: 'Geri al',
  createFailed: 'Proje oluşturulamadı',
  staleBackend:
    'Proje oluşturmak için Hermes arka ucunu güncelle — arka ucun bu masaüstü uygulamasından eski (Ayarlar → Güncellemeler → Arka Uç).',
  deleteConfirm: 'Bu işlem kayıtlı projeyi Hermes’ten kaldırır. Dosyalar, git depoları ve çalışma ağaçları dokunulmadan kalır.',
  startWork: 'Yeni çalışma ağacı',
  newWorktreeTitle: 'Yeni çalışma ağacı',
  newWorktreeDesc: 'Bu çalışma ağacının dal adını belirle.',
  branchPlaceholder: 'örn. yeni-ozellik',
  branchOff: () => ({ after: ' dalından oluştur', before: '' }),
  baseBranchPlaceholder: 'Dallarda ara…',
  baseBranchNone: 'Dal bulunamadı',
  startWorkFailed: 'Çalışma ağacı oluşturulamadı',
  worktreeStaleBackend:
    'Bu uzak bağlantı üzerinden çalışma ağacı oluşturmak için Hermes arka ucunu güncelle.',
  worktreeProjectLabel: 'Proje',
  worktreeProjectPlaceholder: 'Projelerde ara…',
  worktreeProjectNone: 'Klasörü olan proje yok',
  convertBranch: 'Dalı dönüştür…',
  convertBranchTitle: 'Dalı dönüştür',
  convertBranchDesc: 'Açık dalları aç veya serbest bir dal için çalışma ağacı oluştur.',
  convertBranchPlaceholder: 'Dallarda ara…',
  convertBranchInstead: 'Mevcut bir dalı dönüştür',
  branchOpenExisting: 'aç',
  branchSwitchHome: 'ana dizine geç',
  branchCreateWorktree: 'yeni çalışma ağacı',
  branchTrackRemote: 'uzağı izle',
  branchesLoading: 'Dallar yükleniyor…',
  noBranches: 'Dal bulunamadı',
  removeWorktree: 'Çalışma ağacını kaldır',
  removeWorktreeFailed: 'Çalışma ağacı kaldırılamadı (kaydedilmemiş değişiklikler mi var?)',
  removeWorktreeConfirm:
    'Git’ten kaldır (çalışma ağacı dizinini siler; dal kalır) veya yalnızca kenar çubuğundan gizleyip diskte tut.',
  removeWorktreeDirty:
    'Bu çalışma ağacında işlenmemiş değişiklikler var. Zorla kaldır (değişiklikleri atar) veya yalnızca gizleyip diskte bırak.',
  forceRemove: 'Zorla kaldır',
  enter: label => `${label} aç`,
  reorder: label => `${label} sırasını değiştir`,
  toggle: (label, open) => `${label} oturumlarını ${open ? 'göster' : 'gizle'}`,
  showAllCount: count => `Tüm ${count} oturumu göster`,
  back: 'Tüm projeler'
}

export const trThemePicker: ThemePickerCopy = {
  accent: 'Vurgu rengi',
  layout: 'Yerleşim',
  mode: 'Görünüm',
  customColor: 'Özel renk',
  themeAccent: 'Tema varsayılanı',
  basic: 'Temel',
  basicDetail: 'Hermes ile konuşmak için.',
  elite: 'Gelişmiş',
  eliteDetail: 'Geliştiriciler için: terminal, dosyalar, farklar.',
  noPick: 'Seçim yok'
}

export const trUninstallSection: UninstallSectionTranslations = {
  dangerZone: 'Tehlikeli bölge',
  checkingInstalled: 'Nelerin kurulu olduğu kontrol ediliyor…',
  uninstallHermes: 'Hermes’i kaldır',
  managedBody: 'Bu kurulum sistemin tarafından yönetiliyor, bu nedenle Hermes kendini kaldıramaz.',
  dataKept: path => `Yapılandırman, sohbetlerin ve gizli anahtarların ${path} altında durur. Uygulamayı kaldırmak bunları silmez.`,
  openAppsSettings: 'Uygulama ayarlarını aç',
  chooseHowMuch:
    'Nelerin kaldırılacağını seç. İşlemi bitirmek için uygulama kapanır; istediğin zaman kurucuyu yeniden açıp dönebilirsin.',
  confirmUninstall: 'Kaldırmayı onayla',
  confirmBody: what => `Bu işlem ${what} öğesini kalıcı olarak kaldırır. Geri alınamaz.`,
  appLabel: 'Uygulama:',
  couldNotStart: 'Kaldırma başlatılamadı.',
  uninstalling: 'Kaldırılıyor…',
  yesUninstall: 'Evet, kaldır',
  options: {
    gui: {
      title: 'Yalnızca Sohbet Arayüzünü kaldır',
      description: 'Bu masaüstü uygulamasını kaldırır. Hermes ajanı, yapılandırman ve sohbetlerin kalır.',
      consequence: 'masaüstü Sohbet Arayüzü (bu uygulama ve verileri)'
    },
    lite: {
      title: 'Arayüz + ajanı kaldır, verilerimi koru',
      description: 'Uygulamayı ve Hermes ajanını kaldırır; ancak yeniden kurulum için yapılandırma, sohbetler ve gizli anahtarları saklar.',
      consequence: 'Sohbet Arayüzü ve Hermes ajanı (yapılandırma, sohbetler ve gizli anahtarlar korunur)'
    },
    full: {
      title: 'Her şeyi kaldır',
      description: 'Uygulamayı, ajanı ve tüm kullanıcı verilerini kaldırır — yapılandırma, sohbetler, zamanlanmış görevler, gizli anahtarlar, günlükler.',
      consequence: 'HER ŞEY — Sohbet Arayüzü, Hermes ajanı ve tüm yapılandırma, sohbet, gizli anahtar ve günlüklerin'
    }
  }
}

export const trUpdateChannel: UpdateChannelCopy = {
  title: 'Güncelleme kanalı',
  description: 'Kararlı yalnızca yayımlanmış sürümleri kurar. Her commit ise değişiklikler indikçe ana dalı izler.',
  stable: 'Kararlı sürümler',
  main: 'Her commit',
  stableConfirmTitle: 'Kararlı sürümlere geçilsin mi?',
  stableConfirmBody:
    'Hermes en son yayımlanan kararlı sürüme döner ve şu an çalıştırdığın koddan daha eski olabilir. Daha yeni kodun yazdığı veriler doğru okunmayabilir; önce yedek al.',
  stableConfirm: 'Kararlıya geç',
  failed: 'Güncelleme kanalı değiştirilemedi',
  detailsLabel: 'Kanal',
  branch: (b: string) => `Dal: ${b}`,
  change: 'Değiştir',
  latestRelease: (v: string) => `En son kararlı sürümdesin (${v}).`,
  rollbackTitle: (v: string) => `Kararlı sürüm ${v} sürümüne dön`,
  rollbackBody: (v: string) =>
    `Bu derleme kararlı sürüm ${v}’den daha yeni. Kurmak Hermes’i o sürüme geri taşır.`,
  heldBody: (v: string) =>
    `Bu derleme kararlı sürüm ${v}’den daha yeni. Oturumların zaten ${v} sürümünün açamayacağı bir ağ geçidi çalışma zamanı kullanıyor; yeni kararlı sürüm çıkana kadar bu derlemede kalınır.`,
  rollbackAction: (v: string) => `${v} sürümüne geri al`,
  allChanges: 'Tüm değişiklikleri gör'
}
