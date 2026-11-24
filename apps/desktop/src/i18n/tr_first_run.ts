import type { FirstRunCopy } from './types_first_run'

export const trFirstRun: FirstRunCopy = {
  beats: {
    name: 'Ad',
    theme: 'Vurgu rengi',
    layout: 'Yerleşim',
    connectors: 'Uygulamalar',
    plugins: 'Eklentiler',
    tour: 'Tur',
    build: 'İlk görev'
  },
  namePlaceholder: 'Adın',
  useName: name => `“${name}” olarak kullan`,
  install: 'Kur',
  installed: 'Kurulu',
  loading: 'Yükleniyor…',
  noPlugins: 'Şu anda gösterilecek eklenti yok.',
  noneChosen: 'Yok',
  noAnswer: 'Yanıt yok',
  answerRefused: 'Yanıt kabul edilmedi',
  tours: {
    quick: 'Hızlı tur',
    full: 'Her şeyi göster',
    skip: 'Atla, bir şeyler yapalım'
  },
  skippedAll: 'Kurulum atlandı',
  skip: 'Kurulumu atla',
  skipTip: 'Rehberli kurulumu bitir ve yeni bir sohbet aç.',
  skipFailed: 'Kurulum atlanamadı',
  slashOffTitle: 'Kurulum sırasında eğik çizgi komutları kapalıdır',
  slashOffBody: 'Kurulum tamamlandığında her zamanki gibi çalışırlar.',
  localModel: {
    title: 'Bu bilgisayar bir modeli yerelde çalıştırabilir',
    text: (model, size) => `${model} (${size}) donanımına uyuyor. Ücretsiz çalışır ve sohbetlerin bu bilgisayarda kalır.`,
    setUp: 'Kurulumu yap',
    notNow: 'Şimdi değil'
  },
  intro: {
    greeting: 'Merhaba, ben Hermes.',
    plan: 'Senin için her şeyi ayarlayalım. Ardından harika bir şeyler ortaya çıkaralım.'
  },
  rerun: {
    title: 'İlk kurulumu yeniden çalıştır',
    description: 'Mevcut modelinle ilk kurulum adımlarından geçen yeni bir kurulum sohbeti aç.',
    action: 'Tekrar çalıştır',
    failed: 'Kurulum başlatılamadı'
  }
}
