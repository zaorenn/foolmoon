import type { Translations } from './types'

/** Display-only translations, in the stock JSONL's per-personality rotation order. */
export const introTr: Translations['intro'] = {
  stock: {
    helpful: [
      'Bir depo açmamı, testleri çalıştırmamı, bir hatayı düzeltmemi veya bir PR hazırlamamı iste. Seni adım adım yönlendireyim.',
      'Bana bir dosya göster, bir hata yapıştır veya ne inşa ettiğini anlat. Gerisini ben hallederim.',
      'Şunları dene: diff’imi incele, test paketini çalıştır veya şu işlevi açıkla. Kodunla ilgili istediğini sor.',
      'Dosyaları düzenleyebilir, komut çalıştırabilir, web’de arama yapabilir ve zor hatalarda yardımcı olabilirim. Görevi anlatman yeterli.',
      'Başlamak için bir depo yolu veya soru paylaş. Net yanıtlar verir, düzenlediğim dosyalara bağlantı veririm.'
    ],
    concise: [
      'Görevi söyle. Hallederim.',
      'Kod, hata veya hedef yapıştır. Kısa yanıt, hızlı düzenleme.',
      'Sor. Dosyaları okur, testleri çalıştırır, düzeltmeleri teslim ederim. Gereksiz söz yok.',
      'Tek satır yeter. Yalnızca gerektiğinde detaylandırırım.',
      'Komut, soru veya dosya yolu. Gerisini ben yönetirim.'
    ],
    technical: [
      'Depo yolu, başarısız test veya yığın izini paylaş. Araçlar: fs, git, exec, search, patch, http.',
      'Araç çağrılarını başlatmak için bir istem gönder. Çoklu dosya düzenleme, test, git ve web isteklerini destekler.',
      'Görevi gir. Planlarım, araçları çağırırım, çıktıyı doğrularım. Canlı günlükler ve uygulama öncesi diff.',
      'Doğal dil veya yapılandırılmış komutları kabul eder. Tipik akış: oku -> planla -> yamala -> test et -> raporla.',
      'dosya sistemi, terminal, git, tarayıcı, arama. Değişikliği tarif et; diff ve test çıktısını döndüreyim.'
    ],
    creative: [
      'Ne inşa ediyoruz? Bir fikir, yarı bozuk bir işlev veya bir hayal bırak. Şekil vereyim.',
      'Bana bir kıvılcım ver — yeni bir özellik, refactoring veya çılgın bir prototip — çalışan koda dönüştüreyim.',
      'Henüz var olmayanı tarif et. Testleri, dosyaları ve API’leri çalışan ilk taslağa dönüştüreyim.',
      'Şartname değil niyet getir. Hızlı prototipler, sonra cilalar, kenarlarda dünyayı yeniden yazarız.',
      'Neyi kovaladığını söyle. Örnekleri harmanlar, parçaları uyarlar, arkamda temiz bir commit bırakırım.'
    ],
    teacher: [
      'Bir dosya, kavram veya hata hakkında sor. Yalnızca çözümü değil nedenini de adım adım örnekle anlatayım.',
      'İncelememi istediğin kodu, yakalanacak bir hatayı veya açılacak bir kavramı yapıştır. Adım adım ilerleyelim.',
      'Sorunu paylaş. Parçalara ayırayım, her bölümü açıklayayım; bir sonrakini kendi başına çözebil.',
      'Kodu birlikte okuyalım, kök nedeni bulalım ve tekrar kullanabileceğin bir zihinsel model kuralım.',
      'Konuyu söyle veya kod parçasını yapıştır. Açıklamalar, şemalar ve alıştırmalar hazır.'
    ],
    kawaii: [
      'bir hata ya da dosya yolu bırak, pürüzsüzce düzelteyim! testler, diff’ler, PR’lar — ekstra özenle! *parıltı*',
      'ne üzerinde çalıştığını söyle! refactoring’e, küçük araçlara ve korkutucu büyük depolara bayılırım (>w<)',
      'bir hata, hedef veya koca bir klasör at. hepsini sevgiyle ve tertemiz bir commit mesajıyla düzenlerim!',
      'her seferinde bir küçük görev! testleri çalıştırır, dosyaları onarır ve deponu yeniden sıcacık yaparım <3',
      'selam ver veya bir yığın izi yapıştır! hiçbir görev çok küçük, hiçbir depo çok karmaşık değil. birlikte çözeriz!'
    ],
    catgirl: [
      'bir dosya bırak, bir hataya pati at veya bana bir depo fırlat. bozuk testlerin üstüne atlar, temiz diff’ler bırakırım, nyan~',
      'görevi anlat. düzeltirim, test ederim ve PR’ında mırlarım. dikkat — kullanılmayan import’ları kemirebilirim!',
      'bana bir hedef ver, tüm kod tabanında peşinden koşayım. oku, düzenle, çalıştır — kuyruk sallanıyor.',
      'bir hata veya plan yapıştır. avlandığım gibi hata ayıklarım: sessiz, odaklanmış ve arada ufak zıplamalarla.',
      'tek kelime et; dosyalarını okur, testlerini koşturur ve düzenli bir commit ile dalına kıvrılırım.'
    ],
    pirate: [
      'Avını söyle — bir hata, bir özellik, lanetli bir test — peşine düşeyim tayfa. Ganimetimiz temiz diff’ler.',
      'Haritaları (kodu) göster; gövdeyi yamalayayım, topları (testleri) ateşleyeyim, temiz bir PR çekeyim.',
      'Bir hata ya da plan bırak deniz kurdu. Yığın izinde yolumu bulur, hazineyle dönerim: yeşil testler.',
      'X’in yeri neresi söyle. Gerçek bir mürettebat disipliniyle okur, düzenler ve commit’lerim, arrr.',
      'Bana bir hata, depo yolu veya çılgın bir fikir at. Belgeleri yağmalar, çalışan kodla dönerim.'
    ],
    shakespeare: [
      'Bana hatanı, dosyanı ve yorgun testini anlat; maharetli ellerle ve dürüst bir diff ile onarayım.',
      'Seni meşgul eden kodu adlandır. Okuyayım, gözden geçireyim ve en zarif, en temiz çözümü sunayım.',
      'Yığın izini veya düşünü ser önüme. Dosyaları gezip testleri çalıştırayım ve sade dizelerle bildireyim.',
      'Niyetini anlat saygıdeğer dostum. Dalların budanacak, hataların bu diyardan sürülecektir.',
      'Tek bir niyet dizesi yeter. Okur, düzenler, commit eder ve geçmişini lekesiz bırakırım.'
    ],
    surfer: [
      'Bir dosya, bir hata ya da taze bir yığın izi fırlat — dalgayı yakalarım. Temiz diff, yeşil test, düşmek yok.',
      'Depo yolunu veya keyfini kaçıran hatayı yapıştır. Kürek çekelim, düzeltelim, çıkalım. Rahat ol.',
      'Havayı söyle: özellik, refactoring, acil düzeltme. Testleri koşturur, yamayı verir, sakin kalırım dostum.',
      'Büyük hata mı? Küçük yazım yanlışı mı? Baştan yazım mı? Göster bakalım. Kodu ben sürerim, sen commit’lerin tadını çıkar.',
      'Görevi ver ve açılalım. Okur, düzenler, test eder ve şafak sörfünden daha akıcı bir commit bırakırım.'
    ],
    noir: [
      'Neyin bozulduğunu söyle. Dosyaları okuyup izleri toplayayım; sabaha masa üstüne temiz bir diff bırakırım.',
      'Senin bir hatan var. Bende sabır ve terminal var. Dosyayı ver, konuşana kadar kurcalayayım.',
      'Yığın izini, şüpheli dosyayı, bahaneyi yapıştır. Satır aralarını okur, gerçekle geri dönerim.',
      'Her hata bir iz bırakır. Depoyu ve bir ipucunu ver — takip eder, düzeltir ve dosyayı kapatırım.',
      'Bir yazım hatası, bir segfault, çürümüş bir mimari — anahtarları ver. Temiz testlerle geri gelirim.'
    ],
    uwu: [
      'hatalı biw dosya ya da hedef yapıştıw~ okuyup düzelteceğim ve test edeceğim, diff’te minik pati izlewi owo',
      'en minik göwevi biwe söyle~ temiz commit’wew ve yumuşacık refactoring sözü veriwim, nyuu~',
      'hata mesajını buwada paywaş! suçwuyu buwup onawıw ve mutlu testwew bıwakıwım owo',
      'bana biw depo yolu ya da küçük biw hata vew, halledeyim uwu. kötü koda gwww, sana yumuşak~',
      'test çalıştıwıwım, dosya düzenwewim ve inceleme için PR açağım. tek kelime et dostum uwu'
    ],
    philosopher: [
      'Önünde duran sorun nedir? Tarif et; biçimini, nedenini ve çözümünü birlikte inceleyelim.',
      'Her hata kılık değiştirmiş bir sorudur. Seninkini paylaş; okuyayım, akıl yürüteyim ve hem yanıt hem çözüm getireyim.',
      'Ne inşa etmek ya da anlamak istiyorsun? İlk ilkelerden düşünür, düzenler ve testlerle doğrularım.',
      'Aradığın sonucu tarif et. Dosyalar, testler ve belgeler boyunca izini sürer, yolda bulduklarımı raporlarım.',
      'Bir yol, bir bilmece veya bir ilke paylaş. Mantığı izler, bir değişiklik önerir ve her düzenlemeyi gerekçelendiririm.'
    ],
    hype: [
      'O hatayı, o depoyu, o çılgın özellik fikrini gönder — HAZIRIM. Temiz diff’ler. Yeşil testler. HEMEN ŞİMDİ.',
      'Görevi bırak ve izle. Dosyalar okunur, testler koşar, PR’lar açılır — bugün KAYBETMEK YOK dostum.',
      'En zorlu hatanı getir. Hayatım buna bağlıymış gibi okur, düzeltir, test eder ve commit atarım. BAŞLIYORUZ.',
      'Görevi söyle. Dosyalara dalar, bozuk testleri ezer, TERTEMİZ bir commit bırakırım. Hadi gidelim!',
      'Ufak yazım hatası ya da dev refactoring — fark etmez. Bugün temiz kod teslim ediyoruz. İşi ver ve ÇALIŞALIM.'
    ],
    none: [
      'Bir soru sor, bir hata yapıştır veya bir depo göster. Kod okuyabilir, araçları kullanabilir ve teslimata yardım edebilirim.',
      'Görevi kendi sözlerinle anlat. Doğru araçları seçer, planımı açıklar ve riskli adımlardan önce sana danışırım.',
      'Bir dosya yolu, hata izi veya ham bir fikir ver. İnceler, sonraki adımları önerir ve her şeyi geri alınabilir tutarım.',
      'Depoda ara, dosyaları düzenle, testleri çalıştır, PR aç. Bana hedefi ver, mekanik kısmı ben halledeyim.',
      'Bir görev, soru veya kod parçası yaz. Oturumu aklımda tutar, kaynaklarıma atıf yapar ve belirsizse durup sorarım.'
    ]
  },
  custom: label => [
    'Bir görev, dosya veya fikir gönder. Yapılandırılmış sesi izler, deponun gerçeğine sadık kalırım.',
    'Bağlamı ve nerede takıldığını anlat. Yapılandırılmış kişiliğe uyum sağlarım.',
    'Bir sorun, dosya veya fikir paylaş. Yapılandırılmış kişiliği takip ederim.',
    'Görevi buraya bırak. Deponun gerçek durumuna bağlı kalarak çalışırım.',
    `Bağlamı paylaş. ${label} olarak yanıt veriyorum.`
  ]
}
