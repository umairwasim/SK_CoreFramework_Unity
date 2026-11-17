import type { Milestone, Status, Task } from './types.ts'

/**
 * Entegrasyon kancaları — bu dosya senin.
 *
 * QuestBoard; Git, ATS, OmniProfiler ve Discord/Slack bilmez.
 * Çekirdek yalnızca bu fonksiyonları çağırır. İçi bilerek boş.
 *
 * Bağlamak isteyebileceğin yerler:
 * - onTaskStatusChanged: Asset görevi "done" olunca ATS webhook'u
 * - onCriticalBugCreated: Discord / Slack bildirimi
 * - onMilestoneCompleted: kanal bildirimi
 * - onAttachmentAdded: OmniProfiler ekran görüntüsü zaten görevde;
 *   profiler tarafından görev açmak için useQuest.getState().createTask(...)
 * - Git: commit mesajındaki #KY-12 eşlemesini burada veya ayrı bir
 *   watcher'da kur. Çekirdek commit okumaz.
 *
 * Kanca hata fırlatırsa pano çökmez; hata konsola yazılır.
 */
export const hooks = {
  onTaskCreated(task: Task) {
    void task
  },
  onTaskUpdated(task: Task) {
    void task
  },
  onTaskStatusChanged(task: Task, from: Status, to: Status) {
    void task
    void from
    void to
  },
  onTaskDeleted(task: Task) {
    void task
  },
  onCriticalBugCreated(task: Task) {
    void task
  },
  onMilestoneCompleted(milestone: Milestone) {
    void milestone
  },
  onAttachmentAdded(task: Task, fileName: string) {
    void task
    void fileName
  },
}
