-- Branching / «свой вариант» for reflective questions (осмысление дня)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS allow_other boolean DEFAULT false;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS show_when jsonb;
