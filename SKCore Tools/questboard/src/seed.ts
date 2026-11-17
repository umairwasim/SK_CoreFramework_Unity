import type { Activity, Attachment, Build, Milestone, Project, Settings, Task } from './types.ts'
import { dayOffset } from './lib/format.ts'

export type SeedBundle = {
  projects: Project[]
  milestones: Milestone[]
  tasks: Task[]
  builds: Build[]
  activity: Activity[]
  attachments: Attachment[]
  settings: Settings
}

export function buildSeed(): SeedBundle {
  return {
    projects: [
      {
        id: 'proj_starter',
        name: 'fe-gb-starter_unity',
        prefix: 'SK',
        color: '#0284c7',
        description: 'Unity 6 Starter Pack & Framework Workspace',
        createdAt: new Date().toISOString(),
      },
    ],
    milestones: [],
    tasks: [],
    builds: [],
    activity: [],
    attachments: [],
    settings: {
      currentUser: 'Developer',
      activeProjectId: 'proj_starter',
      activeMilestoneId: null,
    },
  }
}

export function buildDemoSeed(): SeedBundle {
  const created = dayOffset(-18, true)
  const project: Project = {
    id: 'proj_koryolu',
    name: 'Kor Yolu',
    prefix: 'KY',
    color: '#e0b072',
    description: 'Kül ve korla kaplı bir vadide geçen 2D aksiyon-macera. Küçük ekip, dikey dilim hedefi.',
    createdAt: created,
  }

  const milestones: Milestone[] = [
    {
      id: 'ms_slice',
      projectId: project.id,
      name: 'Vertical Slice',
      targetDate: dayOffset(23),
      status: 'active',
      description: 'Oynanabilir 15 dakika: köy, kayalık, ilk boss dövüşü.',
    },
    {
      id: 'ms_alpha',
      projectId: project.id,
      name: 'Alpha',
      targetDate: dayOffset(72),
      status: 'planned',
      description: 'Üç bölge, kayıt sistemi ve ilk düşman ailesi tamam.',
    },
    {
      id: 'ms_beta',
      projectId: project.id,
      name: 'Beta',
      targetDate: dayOffset(140),
      status: 'planned',
      description: 'İçerik kilitli. Geriye cila, denge ve sert bug’lar kalır.',
    },
    {
      id: 'ms_release',
      projectId: project.id,
      name: 'Release',
      targetDate: dayOffset(210),
      status: 'planned',
      description: 'Vitrin sayfası, trailer ve 1.0 derlemesi.',
    },
  ]

  const builds: Build[] = [
    { id: 'bld_031', projectId: project.id, name: 'v0.3.1', createdAt: dayOffset(-20, true) },
    { id: 'bld_040', projectId: project.id, name: 'v0.4.0', createdAt: dayOffset(-9, true) },
    { id: 'bld_042', projectId: project.id, name: 'v0.4.2', createdAt: dayOffset(-1, true) },
  ]

  const tasks: Task[] = [
    task({
      n: 1,
      title: 'Kayalıkta zıplama yarıda kesiliyor',
      type: 'bug',
      status: 'in_progress',
      priority: 'critical',
      assignee: 'Ege',
      milestoneId: 'ms_slice',
      buildFound: 'v0.4.2',
      position: 1000,
      updatedDays: 0,
      description: `## Tekrar
1. Kayalık bölgeye gir (v0.4.2)
2. Eğimli yüzeyde zıpla
3. Animasyon yarıda kesiliyor, karakter havada asılı kalıyor

## Beklenen
Coyote time ile zıplama buffer'ı çalışmalı.

## Not
\`PlayerMotor\` içinde \`grounded\` bir kare geç geliyor olabilir.`,
    }),
    task({
      n: 2,
      title: 'Parry penceresi ve geri tepme',
      type: 'feature',
      status: 'todo',
      priority: 'high',
      assignee: 'Ege',
      milestoneId: 'ms_slice',
      position: 1000,
      updatedDays: 1,
      description: `## Tasarım
- Pencere: 8 kare (60 fps)
- İskala yakınında pencere 2 kare genişler
- Başarılı parry, düşmanı 0.35 sn kilitler

## Kabul
Köy bekçisi üzerinde üç kez üst üste okunaklı hissettirmeli.`,
    }),
    task({
      n: 3,
      title: 'Köy meydanı tileset — 32px',
      type: 'asset',
      status: 'in_progress',
      priority: 'medium',
      assignee: 'Deniz',
      milestoneId: 'ms_slice',
      position: 2000,
      updatedDays: 0,
      description: `## Kapsam
- Taş zemin, tezgâh, kuyu, yırtık tente
- Autotile kenarları dahil 48 karo
- Palet: kor, kül, soluk pirinç

Teslim \`art/tiles/village_square.png\` altına.`,
    }),
    task({
      n: 4,
      title: 'Meşale ışığında titreme çok sert',
      type: 'polish',
      status: 'review',
      priority: 'medium',
      assignee: 'Mira',
      milestoneId: 'ms_slice',
      buildFound: 'v0.4.2',
      position: 1000,
      updatedDays: 0,
      description: `Genlik yarıya insin, renk kor tonunda kalsın. Göz yormamalı, ateş hissi de gitmemeli.

İnceleme notu: köy sahnesinde 30 sn bak, baş dönmesi var mı?`,
    }),
    task({
      n: 5,
      title: 'Envanter sürüklerken FPS düşüyor',
      type: 'bug',
      status: 'backlog',
      priority: 'high',
      assignee: 'Ege',
      milestoneId: 'ms_alpha',
      buildFound: 'v0.4.0',
      position: 1000,
      updatedDays: 4,
      description: `20+ eşyada sürükleme 60'tan 28'e düşüyor. UI'ı her kare yeniden kuruyor olabilir.

Alpha'ya bırakıldı; dikey dilimi bloklamıyor.`,
    }),
    task({
      n: 6,
      title: 'Çift atlama ve coyote time',
      type: 'feature',
      status: 'done',
      priority: 'medium',
      assignee: 'Ege',
      milestoneId: 'ms_slice',
      buildFixed: 'v0.4.0',
      position: 1000,
      updatedDays: 9,
      description: `Coyote: 6 kare. Jump buffer: 5 kare. İkinci zıplama havada bir kez.

v0.4.0'da kapandı.`,
    }),
    task({
      n: 7,
      title: 'Boss Küldev — concept ve silüet',
      type: 'asset',
      status: 'todo',
      priority: 'high',
      assignee: 'Deniz',
      milestoneId: 'ms_slice',
      position: 2000,
      updatedDays: 2,
      description: `## İstenen
- Üç silüet, okunaklı omuz hattı
- Bir tanesi seçilip renk taslağına geçecek
- Referans: kül heykeli, erimiş zırh, tek kor göz

Dikey dilim dövüşü bu silüete bağlanacak.`,
    }),
    task({
      n: 8,
      title: 'Menü geçiş sesi çok kuru',
      type: 'polish',
      status: 'backlog',
      priority: 'low',
      assignee: 'Ayşe',
      milestoneId: 'ms_slice',
      position: 2000,
      updatedDays: 6,
      description: `Kısa bir kor çıtırtısı + alçak bir vuruş. 400 ms'yi geçmesin. Döngü olmasın.`,
    }),
    task({
      n: 9,
      title: 'Kayıt dosyası ikinci ölümde bozuluyor',
      type: 'bug',
      status: 'review',
      priority: 'critical',
      assignee: 'Ege',
      milestoneId: 'ms_slice',
      buildFound: 'v0.4.2',
      buildFixed: 'v0.4.2',
      position: 2000,
      updatedDays: 1,
      description: `## Tekrar
1. Köyde kaydet
2. Kayalıkta öl
3. Devam et — ikinci ölümden sonra kayıt okunmuyor

## Şüphe
Ölüm anında yazılan geçici dosya, asıl kaydın üzerine yarım yazılıyor.

Düzeltme incelemede. Mira v0.4.2 üzerine baksın.`,
    }),
    task({
      n: 10,
      title: 'Diyalog seçimleri — ilk köy',
      type: 'feature',
      status: 'in_progress',
      priority: 'medium',
      assignee: 'Ayşe',
      milestoneId: 'ms_slice',
      position: 3000,
      updatedDays: 1,
      description: `Üç konuşma: kuyumcu, çocuk, nöbetçi.

Her birinde iki seçim. Seçim sonucu şimdilik yalnızca bayrak yazsın, dünyayı değiştirmesin.`,
    }),
    task({
      n: 11,
      title: 'Ayak sesi seti: taş, çamur, ahşap',
      type: 'asset',
      status: 'todo',
      priority: 'medium',
      assignee: 'Ayşe',
      milestoneId: 'ms_slice',
      position: 3000,
      updatedDays: 3,
      description: `Yüzey başına 4 varyasyon. Aynı sample art arda çalmasın. Sessiz oda tonu, abartısız.`,
    }),
    task({
      n: 12,
      title: 'Hasar sayıları okunmuyor',
      type: 'polish',
      status: 'done',
      priority: 'low',
      assignee: 'Mira',
      milestoneId: 'ms_slice',
      buildFixed: 'v0.4.0',
      position: 2000,
      updatedDays: 8,
      description: `Kontur eklendi, kritik vuruşlar bir ton daha sıcak. v0.4.0'da kapandı.`,
    }),
    task({
      n: 13,
      title: 'Kamera zoom’da gölge kayıyor',
      type: 'bug',
      status: 'todo',
      priority: 'medium',
      assignee: 'Ege',
      milestoneId: 'ms_slice',
      buildFound: 'v0.4.2',
      position: 4000,
      updatedDays: 2,
      description: `Zoom 1.25 üstünde blob gölge ayaktan kopuyor. Gölge, sprite köküne değil kamera ofsetine bağlı görünüyor.`,
    }),
    task({
      n: 14,
      title: 'Hızlı seyahat taşları',
      type: 'feature',
      status: 'backlog',
      priority: 'low',
      assignee: 'Ege',
      milestoneId: 'ms_alpha',
      position: 3000,
      updatedDays: 7,
      description: `Keşfedilen taşlar haritadan seçilir. Dikey dilimde yok. Alpha kapsamı.`,
    }),
    task({
      n: 15,
      title: 'UI ikon seti — 32px, 24 parça',
      type: 'asset',
      status: 'review',
      priority: 'medium',
      assignee: 'Deniz',
      milestoneId: 'ms_slice',
      position: 4000,
      updatedDays: 1,
      description: `Can, kor, kılıç, kalkan, harita, kayıt, ayarlar. Tek piksel ızgarası, 1px kontur.

İnceleme: koyu zemin üzerinde 32 ve 16 px önizleme.`,
    }),
    task({
      n: 16,
      title: 'Ölüm ekranı metni ve bekleme',
      type: 'polish',
      status: 'todo',
      priority: 'medium',
      assignee: 'Mira',
      milestoneId: 'ms_slice',
      position: 5000,
      updatedDays: 3,
      description: `“Kül seni geri çağırdı.” 1.2 sn bekle, sonra Devam et. Hemen atlanamasın — yanlışlıkla skip oluyor.`,
    }),
    task({
      n: 17,
      title: 'Başlangıçta ses çatlıyor',
      type: 'bug',
      status: 'done',
      priority: 'low',
      assignee: 'Ayşe',
      milestoneId: 'ms_slice',
      buildFound: 'v0.3.1',
      buildFixed: 'v0.3.1',
      position: 3000,
      updatedDays: 16,
      description: `İlk 200 ms sessiz ramp. v0.3.1'de kapandı.`,
    }),
    task({
      n: 18,
      title: 'İkinci silah: kor kamçısı',
      type: 'feature',
      status: 'backlog',
      priority: 'high',
      assignee: 'Ege',
      milestoneId: 'ms_beta',
      position: 4000,
      updatedDays: 5,
      description: `Menzilli, yavaş, zırhı eriten bir alternatif. Beta’ya. Dikey dilimde yalnızca kılıç var.`,
    }),
  ]

  const activity: Activity[] = [
    act('act_1', 'task_ky_1', 'Görev oluşturuldu', -2),
    act('act_2', 'task_ky_1', 'Durum: Yapılacak → Devam Eden', 0),
    act('act_3', 'task_ky_1', 'Öncelik: Kritik', -1),
    act('act_4', 'task_ky_9', 'Görev oluşturuldu', -3),
    act('act_5', 'task_ky_9', 'Durum: Devam Eden → İnceleme', -1),
    act('act_6', 'task_ky_9', 'Çözüldüğü derleme: v0.4.2', -1),
    act('act_7', 'task_ky_3', 'Deniz atandı', -4),
    act('act_8', 'task_ky_6', 'Durum: İnceleme → Tamamlandı', -9),
  ]

  return {
    projects: [project],
    milestones,
    tasks,
    builds,
    activity,
    attachments: [],
    settings: {
      currentUser: 'Ege',
      activeProjectId: project.id,
      activeMilestoneId: 'ms_slice',
    },
  }
}

function task(input: {
  n: number
  title: string
  type: Task['type']
  status: Task['status']
  priority: Task['priority']
  assignee: string
  milestoneId: string
  position: number
  updatedDays: number
  description: string
  buildFound?: string
  buildFixed?: string
}): Task {
  return {
    id: `task_ky_${input.n}`,
    key: `KY-${input.n}`,
    projectId: 'proj_koryolu',
    milestoneId: input.milestoneId,
    title: input.title,
    description: input.description,
    type: input.type,
    status: input.status,
    priority: input.priority,
    assignee: input.assignee,
    buildFound: input.buildFound ?? '',
    buildFixed: input.buildFixed ?? '',
    position: input.position,
    createdAt: dayOffset(-12 - (input.n % 5), true),
    updatedAt: dayOffset(-input.updatedDays, true),
  }
}

function act(id: string, taskId: string, text: string, days: number): Activity {
  return { id, taskId, text, createdAt: dayOffset(days, true) }
}
