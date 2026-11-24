import { defineFieldCopy } from '@/app/settings/field-copy'

export const trFieldLabels: Record<string, string> = defineFieldCopy({
  model: 'Varsayılan Model',
  modelContextLength: 'Ana model bağlam penceresi (geçersiz kılma)',
  fallbackProviders: 'Yedek Modeller',
  toolsets: 'Etkin Araç Kümeleri',
  timezone: 'Saat Dilimi',
  display: {
    personality: 'Kişilik',
    showReasoning: 'Akıl Yürütme Blokları'
  },
  desktop: {
    repoScanEnabled: 'Otomatik Depo Keşfi',
    repoScanRoots: 'Depo Keşif Kökleri',
    repoScanExcludePaths: 'Hariç Tutulan Depo Yolları'
  },
  agent: {
    maxTurns: 'Azami Ajan Adımı',
    imageInputMode: 'Görsel Ekleri',
    apiMaxRetries: 'API Yeniden Denemeleri',
    serviceTier: 'Hizmet Katmanı',
    toolUseEnforcement: 'Araç Kullanımı Zorunluluğu'
  },
  terminal: {
    cwd: 'Çalışma Dizini',
    backend: 'Yürütme Arka Ucu',
    timeout: 'Komut Zaman Aşımı',
    persistentShell: 'Kalıcı Kabuk',
    envPassthrough: 'Ortam Değişkeni Aktarımı',
    dockerImage: 'Docker İmajı',
    singularityImage: 'Singularity İmajı',
    modalImage: 'Modal İmajı',
    daytonaImage: 'Daytona İmajı'
  },
  fileReadMaxChars: 'Dosya Okuma Sınırı',
  toolOutput: {
    maxBytes: 'Terminal Çıktı Sınırı',
    maxLines: 'Dosya Sayfa Sınırı',
    maxLineLength: 'Satır Uzunluğu Sınırı'
  },
  codeExecution: {
    mode: 'Kod Yürütme Modu'
  },
  approvals: {
    mode: 'Onay Modu',
    timeout: 'Onay Zaman Aşımı',
    mcpReloadConfirm: 'MCP Yeniden Yüklemelerini Onayla'
  },
  commandAllowlist: 'İzin Verilen Komut Listesi',
  security: {
    redactSecrets: 'Gizli Bilgileri Sansürle',
    allowPrivateUrls: 'Özel URL’lere İzin Ver'
  },
  browser: {
    allowPrivateUrls: 'Tarayıcı Özel URL’leri',
    autoLocalForPrivateUrls: 'Özel URL’ler İçin Yerel Tarayıcı',
    useRealProfile: 'Gerçek Tarayıcı Profilimi Kullan'
  },
  checkpoints: {
    enabled: 'Dosya Kontrol Noktaları',
    maxSnapshots: 'Kontrol Noktası Sınırı'
  },
  voice: {
    maxRecordingSeconds: 'Azami Kayıt Süresi',
    autoTts: 'Yanıtları Sesli Oku',
    voiceChatMode: 'Sesli Sohbet Modu',
    gptLive: {
      voice: 'GPT-Live Sesi',
      instructions: 'GPT-Live Kişiliği'
    }
  },
  stt: {
    enabled: 'Konuşmadan Metne',
    echoTranscripts: 'Dökümleri Sohbete Yaz',
    provider: 'Konuşmadan Metne Sağlayıcısı',
    streaming: 'Canlı Döküm',
    local: {
      model: 'Yerel Döküm Modeli',
      language: 'Döküm Dili'
    },
    openai: {
      model: 'OpenAI STT Modeli',
      streamingModel: 'OpenAI Canlı Döküm Modeli'
    },
    groq: {
      model: 'Groq STT Modeli'
    },
    mistral: {
      model: 'Mistral STT Modeli'
    },
    xai: {
      model: 'xAI STT Modeli'
    },
    deepinfra: {
      model: 'DeepInfra STT Modeli'
    },
    elevenlabs: {
      modelId: 'ElevenLabs STT Modeli',
      languageCode: 'ElevenLabs Dili',
      tagAudioEvents: 'Ses Olaylarını Etiketle',
      diarize: 'Konuşmacı Ayrımı'
    }
  },
  tts: {
    provider: 'Metinden Sese Sağlayıcısı',
    edge: {
      voice: 'Edge Sesi'
    },
    openai: {
      model: 'OpenAI TTS Modeli',
      voice: 'OpenAI Sesi'
    },
    elevenlabs: {
      voiceId: 'ElevenLabs Sesi',
      modelId: 'ElevenLabs Modeli'
    },
    xai: {
      voiceId: 'xAI (Grok) Sesi',
      language: 'xAI Dili',
      speed: 'xAI Oynatma Hızı',
      autoSpeechTags: 'xAI Otomatik Konuşma Etiketleri',
      optimizeStreamingLatency: 'xAI Akış Gecikmesi İyileştirmesi',
      sampleRate: 'xAI Örnekleme Hızı',
      bitRate: 'xAI Bit Hızı'
    },
    minimax: {
      model: 'MiniMax TTS Modeli',
      voiceId: 'MiniMax Sesi'
    },
    mistral: {
      model: 'Mistral TTS Modeli',
      voiceId: 'Mistral Sesi'
    },
    gemini: {
      model: 'Gemini TTS Modeli',
      voice: 'Gemini Sesi'
    },
    neutts: {
      model: 'NeuTTS Modeli',
      device: 'NeuTTS Cihazı'
    },
    kittentts: {
      model: 'KittenTTS Modeli',
      voice: 'KittenTTS Sesi'
    },
    piper: {
      voice: 'Piper Sesi'
    },
    deepinfra: {
      model: 'DeepInfra TTS Modeli',
      voice: 'DeepInfra Sesi'
    }
  },
  memory: {
    memoryEnabled: 'Kalıcı Bellek',
    userProfileEnabled: 'Kullanıcı Profili',
    memoryCharLimit: 'Bellek Bütçesi',
    userCharLimit: 'Profil Bütçesi',
    provider: 'Bellek Sağlayıcısı'
  },
  context: {
    engine: 'Bağlam Motoru'
  },
  compression: {
    enabled: 'Otomatik Sıkıştırma',
    threshold: 'Sıkıştırma Eşiği',
    codexGpt55Autoraise: 'Codex Sıkıştırma Otomatik Yükseltme',
    targetRatio: 'Sıkıştırma Hedefi',
    protectLastN: 'Korunan Son Mesajlar'
  },
  auxiliary: {
    compression: {
      timeout: 'Sıkıştırma modeli zaman aşımı (sn)'
    }
  },
  delegation: {
    model: 'Alt Ajan Modeli',
    provider: 'Alt Ajan Sağlayıcısı',
    maxIterations: 'Alt Ajan Tur Sınırı',
    maxConcurrentChildren: 'Paralel Alt Ajanlar',
    childTimeoutSeconds: 'Alt Ajan Zaman Aşımı',
    reasoningEffort: 'Alt Ajan Akıl Yürütme Düzeyi'
  },
  updates: {
    nonInteractiveLocalChanges: 'Uygulama İçi Güncelleme Yerel Değişiklikleri'
  }
})

export const trFieldDescriptions: Record<string, string> = defineFieldCopy({
  model: 'Oluşturucuda farklı bir model seçmediğin sürece yeni sohbetlerde kullanılır.',
  modelContextLength:
    'Yalnızca ANA sohbet modelinin algılanan bağlam penceresini geçersiz kılar (token). Seçili modelin algılanan değerini kullanmak için 0 bırak. Yardımcı/MoA modellerini etkilemez.',
  fallbackProviders: 'Varsayılan model başarısız olursa denenecek yedek provider:model girişleri.',
  display: {
    personality: 'Yeni oturumlar için varsayılan asistan üslubu.',
    showReasoning: 'Arka uç sağladığında akıl yürütme bölümlerini göster.'
  },
  desktop: {
    repoScanEnabled: 'Projeler’de göstermek için yerel klasörlerde Git depolarını tara.',
    repoScanRoots: 'Taranacak klasörler. Ev dizinini taramak için boş bırak.',
    repoScanExcludePaths: 'Depo keşfi sırasında atlanacak klasörler ve alt klasörleri.'
  },
  timezone: 'IANA saat dilimi tanımlayıcısı. Boş bırakılırsa sistem saat dilimi kullanılır.',
  browser: {
    useRealProfile:
      'Yerel tarama gerçek oturumlarını kullanır. Hermes varsayılan tarayıcının profilini (çerezler, girişler, tercihler) yönetilen bir kopyaya alır ve paketli Chromium ile sürer — canlı profilin doğrudan açılmaz, kopya her çalıştırmada yenilenir. Bulut tarayıcı arka ucu yapılandırılmışken bile istendiğinde ajanın yerel gerçek profil oturumu açmasını sağlar. Yalnızca Chromium tarayıcıları (Chrome, Edge, Brave, Brave Origin, Chromium) desteklenir; Chromium dışı bir varsayılan net bir mesajla başarısız olur. Varsayılan olarak kapalıdır.'
  },
  agent: {
    imageInputMode: 'Görsel eklerinin modele nasıl gönderileceğini denetler.',
    maxTurns: 'Hermes’in bir çalıştırmayı durdurmadan önceki araç çağırma turu üst sınırı.'
  },
  terminal: {
    cwd: 'Araç ve terminal çalışmaları için varsayılan proje klasörü.',
    persistentShell:
      'SSH arka ucu: dışa aktarılan değişkenleri komutlar arasında koru. Kapalıyken her komut giriş ortamından başlar; çalışma dizini her zaman taşınır.',
    envPassthrough: 'Araç yürütmesine aktarılacak ortam değişkenleri.',
    dockerImage: 'Yürütme arka ucu Docker olduğunda kullanılan kapsayıcı imajı.',
    singularityImage: 'Yürütme arka ucu Singularity olduğunda kullanılan imaj.',
    modalImage: 'Yürütme arka ucu Modal olduğunda kullanılan imaj.',
    daytonaImage: 'Yürütme arka ucu Daytona olduğunda kullanılan imaj.'
  },
  codeExecution: {
    mode: 'Kod yürütmenin geçerli projeyle ne kadar sıkı sınırlandırılacağı.'
  },
  fileReadMaxChars: 'Hermes’in tek bir dosya isteğinde okuyabileceği azami karakter sayısı.',
  approvals: {
    mode: 'Hermes’in açık onay gerektiren komutları nasıl ele aldığı.',
    timeout: 'Onay istemlerinin zaman aşımına uğramadan önce ne kadar bekleyeceği.'
  },
  security: {
    redactSecrets: 'Mümkün olduğunda algılanan gizli bilgileri modele görünür içerikten gizle.'
  },
  checkpoints: {
    enabled: 'Dosya düzenlemelerinden önce geri alma anlık görüntüleri oluştur.'
  },
  memory: {
    memoryEnabled: 'Gelecek oturumlara yardımcı olabilecek kalıcı anıları kaydet.',
    userProfileEnabled: 'Kullanıcı tercihlerinin kompakt bir profilini tut.'
  },
  context: {
    engine: 'Bağlam sınırına yaklaşan uzun konuşmaları yönetme stratejisi.'
  },
  compression: {
    enabled: 'Konuşmalar büyüdüğünde daha eski bağlamı özetle.',
    codexGpt55Autoraise: 'Desteklenen ChatGPT Codex OAuth modelleri için sıkıştırmayı %85’e yükselt.'
  },
  auxiliary: {
    compression: {
      timeout:
        'Çağrı başına yardımcı sıkıştırma modelinin bekleneceği saniye (varsayılan 120). Yavaş yerel modeller için artır.'
    }
  },
  voice: {
    autoTts: 'Asistan yanıtlarını otomatik olarak seslendir.',
    voiceChatMode:
      'chained: aşağıdaki sağlayıcılarla konuşmadan metne → Hermes → metinden sese. gpt-live: tam çift yönlü bir OpenAI ses modeli (gpt-live-1) dinler ve konuşur, her gerçek isteği Hermes’e iletir — seçtiğin herhangi bir model tam araç kümesiyle yanıt verir. OpenAI API anahtarı gerektirir; ses katmanı dakika başına 0,05 $ ücretlendirilir.',
    gptLive: {
      voice: 'GPT-Live modu için ses. Özel ses kimlikleri kabul edilir.',
      instructions:
        'Canlı ses kişiliği için ek cümleler (ton, hız, dil). Hermes kendi sistem istemini korur.'
    }
  },
  tts: {
    xai: {
      voiceId: 'xAI ses kimliği (örn. eve) veya özel bir ses kimliği.',
      language: 'Konuşulan dil kodu (örn. en, tr, pt-BR) veya otomatik algılama için "auto".',
      speed: 'Oynatma hızı. 0.7 = daha yavaş, 1.0 = normal, 1.5 = daha hızlı.',
      autoSpeechTags: 'Sentez öncesinde bir LLM’in metne ifade edici ses etiketleri ([laughing], [sighs]) eklemesine izin ver.',
      optimizeStreamingLatency: 'Gecikme ve kalite dengesi. 0 = en iyi kalite, 2 = en düşük gecikme.',
      sampleRate: 'Hz cinsinden ses örnekleme hızı. Daha yüksek = daha iyi kalite, daha büyük dosyalar.',
      bitRate: 'bps cinsinden MP3 bit hızı. Yalnızca kodek mp3 olduğunda geçerlidir.'
    },
    neutts: {
      device: 'NeuTTS için yerel çıkarım cihazı.'
    }
  },
  stt: {
    enabled: 'Yerel veya sağlayıcı destekli konuşma dökümünü etkinleştir.',
    echoTranscripts: 'Sesli mesajların ham 🎙️ dökümünü sohbete geri gönder.',
    streaming: 'Sen konuşurken metni göster (OpenAI, xAI, ElevenLabs). Herhangi bir hatada kayda geri döner.',
    elevenlabs: {
      languageCode: 'İsteğe bağlı ISO-639-3 dil kodu. Boş bırakılırsa ElevenLabs otomatik algılar.'
    }
  },
  updates: {
    nonInteractiveLocalChanges:
      'Hermes kendini uygulama içinden güncellerken (terminal istemi olmadan) yerel kaynak düzenlemelerini koru (stash) veya at (discard). Terminal güncellemeleri her zaman sorar.'
  }
})
