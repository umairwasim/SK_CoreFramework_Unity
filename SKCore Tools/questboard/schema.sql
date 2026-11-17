-- QuestBoard yerel şema.
-- Çekirdek tablolar spec ile aynıdır; key, position, build_* ve
-- attachments.data_url yerel/tarayıcı kullanım için eklenmiştir.
-- file_path, Electron'a taşınınca gerçek dosya yoluna evrilebilir.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_date TEXT,
  status TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  milestone_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,          -- bug | feature | asset | polish
  status TEXT NOT NULL,        -- backlog | todo | in_progress | review | done
  priority TEXT NOT NULL,      -- low | medium | high | critical
  assignee TEXT NOT NULL DEFAULT '',
  build_found TEXT NOT NULL DEFAULT '',
  build_fixed TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  data_url TEXT NOT NULL,
  original_data_url TEXT NOT NULL,
  annotations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_tasks_board ON tasks(project_id, status, position);
CREATE INDEX idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX idx_attachments_task ON attachments(task_id);
CREATE INDEX idx_activity_task ON activity(task_id, created_at);
CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE INDEX idx_builds_project ON builds(project_id);
