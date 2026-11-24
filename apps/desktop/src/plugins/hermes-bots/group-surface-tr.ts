import { GROUP_CHAT_LOCALES } from './group-chat-locales'
import type { BotsMessages } from './i18n-messages'
import { ROSTER_CHROME } from './roster-chrome-locales'

export const GROUP_SURFACE_TR = {
  group: {
    ...GROUP_CHAT_LOCALES.tr,
    newTitle: 'Yeni grup sohbeti',
    manageDesc: 'Bir bot birden fazla grup sohbetinde bulunabilir. Üyelikler bilgisayarların arasında eşitlenir.',
    manageTitle: 'Grupları yönet',
    settingsTitle: 'Grup ayarları',
    settingsDesc: 'Grubu yeniden adlandır veya bir grup görseli seç. Üyeler ve geçmiş korunur.',
    nameLabel: 'Grup adı',
    holdDetection: 'Durdurma yönergelerini algıla',
    holdDetectionHint: 'Grup sohbetindeki durdurma yönergeleri, adı geçen üyeleri yeniden etiketlenene kadar duraklatır.',
    compressHistory: 'Geçmişi sıkıştır',
    compressHistoryHint: member => `Boş yanıtları önlemek için ${member} gizli grup sohbeti geçmişini sıkıştır`,
    compressing: member => `${member} grup sohbeti geçmişi sıkıştırılıyor…`,
    compressDone: (member, compressed, detail) =>
      `${member} için ${compressed} grup sohbeti oturumu sıkıştırıldı${detail ? ` — ${detail}` : ''}`,
    compressNothing: member => `${member} için sıkıştırılacak bir şey yok — henüz grup sohbeti oturumu yok`,
    compressFailed: (member, error) => `${member} grup sohbeti geçmişi sıkıştırılamadı: ${error}`,
    searchToAdd: 'Eklenecek botlarda ara',
    searchToAddPlaceholder: 'Eklenecek botlarda ara…',
    removeFromSelection: 'Seçimden çıkar',
    disbandTitle: 'Grup sohbeti dağıtılsın mı?',
    deleteTitle: 'Grup sohbeti silinsin mi?',
    deleteAction: 'Sil',
    composerPlaceholder: 'Bir şeyler yaz — bu grup sohbetindeki her bot mesajını görür.',
    slashCommandsUnsupported: 'Eğik çizgi komutları grup sohbetlerinde kullanılamaz. Bunun yerine tek bir bot sohbeti aç.',
    attachHint: 'Dosya ekle — yanıt veren her bot bunları görür',
    newThread: 'Yeni konu',
    reply: 'Yanıtla',
    replyInThread: 'Konuda yanıtla',
    replyInThreadPlaceholder: 'Konuda yanıtla…',
    openThread: 'Bu konuyu aç',
    collapseThread: 'Konuyu daralt',
    collapseThreadLabel: 'Bu konuyu daralt',
    activity: 'Etkinlik',
    noActivityYet: 'Bu turda henüz etkinlik yok.',
    showActivity: 'Grup sohbeti etkinliğini göster',
    hideActivity: 'Grup sohbeti etkinliğini gizle',
    stop: 'Durdur',
    stopHint: 'Bu çalıştırmayı durdur — etkin üyeyi keser ve diğerlerini duraklatır',
    heldMembersStatus: members => `Duraklatıldı: ${members}`,
    holdReleaseHint: 'Devam etmek için duraklatılan bottan @bahset veya @all devam yaz.',
    needsYourInput: 'Bu grup sohbetindeki bir bot girdini bekliyor',
    noMembersToSend: group =>
      `${group} grubunda alıcı yok — bir bot ekle veya üyeler hâlâ yükleniyorsa grup sohbetini yeniden aç.`,
    pictureGenerationFailed: 'Grup görseli oluşturulamadı',
    nameTaken: name => `“${name}” adlı bir grup zaten var.`,
    you: 'Sen',
    settingsHint: group => `Grup ayarları — ${group} grubunu yeniden adlandır veya grup görseli seç`,
    settingsLabel: group => `${group} için ayarlar`,
    disbandHint: group => `${group} grup sohbetini dağıt`,
    disbandLabel: group => `${group} grubunu dağıt`,
    disbandAction: 'Dağıt',
    disbanding: 'Dağıtılıyor…',
    disbandDone: 'Dağıtıldı',
    disbanded: group => `“${group}” dağıtıldı`,
    stopped: group => `${group} durduruldu — kalan turlar sürdürülene kadar duraklatıldı`,
    removeAttachment: 'Eki kaldır',
    threadFallback: 'Konu',
    replyCount: replies => `${replies} yanıt`,
    dropToThread: 'Bu yanıta eklemek için bırak',
    dropToRoom: 'Eklemek için bırak — yanıt veren her bot görür',
    waitingForAnswer: 'Yanıtın bekleniyor…',
    memberThinking: name => `${name} düşünüyor…`,
    roomWorking: 'Grup sohbeti çalışıyor…',
    messageRoom: group => `${group} grubuna yaz`,
    newThreadPlaceholder: group => `${group} içinde yeni konu… (bir üye için @ad, herkes için @everyone)`,
    everyoneMeta: 'Grup sohbetindeki her bot',
    commandApproval: 'Komut onayı',
    answerFailed: (handle, error) => `@${handle} yanıtı gönderilemedi: ${error}`,
    wantsToRunCommand: handle => `@${handle} bir komut çalıştırmak istiyor:`,
    asks: handle => `@${handle} soruyor:`,
    answerTo: member => `@${member} üyesini yanıtla`
  },
  roster: {
    ...ROSTER_CHROME.tr,
    search: 'Bot ve grup sohbeti ara',
    searchPlaceholder: 'Bot ve grup sohbeti ara…',
    newBotOrGroup: 'Yeni bot veya grup sohbeti',
    groupChats: 'Grup sohbetleri',
    emptyTitle: 'Henüz bot yok',
    emptyDesc: 'İlk botunu oluştur.',
    noMatchQuery: query => `“${query}” için bot veya grup sohbeti bulunamadı`,
    noMatchQueryOn: (query, gateway) => `${gateway} üzerinde “${query}” için bot veya grup sohbeti bulunamadı`,
    noMatchFiltersOn: gateway => `${gateway} üzerinde bu filtrelerle eşleşen bot veya grup sohbeti yok`,
    noMatchFilters: 'Bu filtrelerle eşleşen bot veya grup sohbeti yok.',
    clearFilters: 'Filtreleri temizle',
    allHidden: 'Tüm botlar gizli',
    allHiddenDesc: 'Arka planda çalışmaya devam eder ve geçmişlerini korurlar.',
    showHidden: 'Gizli botları göster',
    noHiddenMatch: 'Bu filtrelerle eşleşen gizli bot yok.',
    hiddenFromRoster: 'Listeden gizlendi',
    pinned: 'Sabitlendi',
    needsAttention: 'ilgi gerekiyor',
    needsInput: 'Girdini bekliyor',
    botsAndGroups: 'Botlar ve grup sohbetleri',
    botsOnly: 'Yalnızca botlar',
    groupsOnly: 'Yalnızca grup sohbetleri',
    anyActivity: 'Tüm etkinlikler',
    activeNow: 'Şimdi etkin',
    recentlyActive: 'Yakın zamanda etkin',
    older: 'Daha eski',
    gatewayRemoved: 'Ağ geçidi kaldırıldı',
    onDemand: 'İsteğe bağlı',
    ready: 'Hazır',
    statusUnknown: 'Durum bilinmiyor',
    unavailable: 'Kullanılamıyor',
    retryNow: 'Şimdi yeniden dene',
    rosterUnavailable: reason =>
      `Liste kullanılamıyor: ${reason}. Ağ geçidin henüz profiles.list desteklemiyorsa Hermes’i güncelle ve ağ geçidini yeniden başlat.`,
    waitingForGateway:
      'Ağ geçidi bağlantısı bekleniyor… (uzak ağ geçitleri birkaç saniye sürebilir; otomatik yeniden deneniyor)'
  },
  sections: {
    newSection: 'Yeni bölüm',
    newTitle: 'Yeni bölüm',
    renameTitle: 'Bölümü yeniden adlandır',
    nameLabel: 'Bölüm adı',
    namePlaceholder: 'örn. Müşteriler',
    create: 'Oluştur',
    rename: 'Yeniden adlandır…',
    moveUp: 'Yukarı taşı',
    moveDown: 'Aşağı taşı',
    unassigned: 'Atanmamış',
    options: name => `${name} bölümü seçenekleri`,
    headingTip: 'Botları buraya bırak · yeniden adlandırmak için çift tıkla',
    emptyHint: 'Botları buraya sürükle',
    moveTo: 'Bölüme taşı',
    newSectionEllipsis: 'Yeni bölüm…',
    removeFromSection: 'Bölümden çıkar',
    deleted: (name, count) =>
      count === 0 ? `“${name}” silindi` : `“${name}” silindi — ${count} bot artık atanmamış`,
    undo: 'Geri al'
  },
  bot: {
    newChatWith: 'Bu botla yeni sohbet',
    newTitle: 'Yeni bot',
    thisDevice: 'Bu cihaz',
    removeFromAllGroups: 'Tüm gruplardan çıkar',
    openBotChat: 'Bot sohbetini aç',
    openBotChatInNewTab: 'Bot sohbetini yeni sekmede aç',
    openingChat: 'Sohbet açılıyor…',
    pinToTop: 'Üste sabitle',
    unpin: 'Sabitlemeyi kaldır',
    pinnedToast: name => `${name} üste sabitlendi`,
    unpinnedToast: name => `${name} sabitlemesi kaldırıldı`,
    hide: 'Gizle',
    unhide: 'Göster',
    hiddenToast: name => `${name} gizlendi — bot listesinin üzerindeki göz simgesi gizli botları gösterir`,
    unhiddenToast: name => `${name} listeye geri döndü`,
    groupsMenu: groups => `Gruplar: ${groups}…`,
    manageGroups: 'Grupları yönet…',
    metadataLoadFailed: 'Bot meta verileri yüklenemedi',
    loadFailed: 'Bot yüklenemedi',
    groupsLoadFailed: 'Bot grupları yüklenemedi',
    attentionFallback: 'İlgi gerekiyor',
    attentionProviderAuth: 'Bu profil için yeniden giriş yap',
    attentionQuota: 'Kota veya bakiye tükendi',
    attentionMissingConfig: 'Sağlayıcı yapılandırılmamış — hermes model çalıştır',
    attentionBlocked: 'Bot engellendi — son mesajı görüntüle',
    editMenu: 'Düzenle…',
    duplicate: 'Çoğalt',
    duplicateFailed: 'Çoğaltma başarısız'
  },
  avatar: {
    upload: 'Yükle',
    generate: 'Oluştur',
    generating: 'Oluşturuluyor…'
  },
  screen: {
    autoOpenMenu: 'Bot kullandığında ekranı aç',
    autoOpenOnToast: name => `${name} masaüstünü kullandığında ekranı açılacak`,
    autoOpenOffToast: name => `Sen açana kadar ${name} ekranı kapalı kalacak`,
    menu: 'Ekranı aç'
  }
} satisfies Pick<BotsMessages, 'group' | 'roster' | 'sections'> & {
  bot: Pick<
    BotsMessages['bot'],
    | 'newChatWith'
    | 'newTitle'
    | 'thisDevice'
    | 'removeFromAllGroups'
    | 'openBotChat'
    | 'openBotChatInNewTab'
    | 'openingChat'
    | 'pinToTop'
    | 'unpin'
    | 'pinnedToast'
    | 'unpinnedToast'
    | 'hide'
    | 'unhide'
    | 'hiddenToast'
    | 'unhiddenToast'
    | 'groupsMenu'
    | 'manageGroups'
    | 'metadataLoadFailed'
    | 'loadFailed'
    | 'groupsLoadFailed'
    | 'attentionFallback'
    | 'attentionProviderAuth'
    | 'attentionQuota'
    | 'attentionMissingConfig'
    | 'attentionBlocked'
    | 'editMenu'
    | 'duplicate'
    | 'duplicateFailed'
  >
  avatar: Pick<BotsMessages['avatar'], 'upload' | 'generate' | 'generating'>
  screen: Pick<BotsMessages['screen'], 'menu' | 'autoOpenMenu' | 'autoOpenOnToast' | 'autoOpenOffToast'>
}
