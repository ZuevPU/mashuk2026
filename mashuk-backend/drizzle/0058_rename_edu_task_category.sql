-- Rename task category: Образовательная программа → Просветительская программа
UPDATE "task_categories"
SET "name" = 'Просветительская программа'
WHERE "name" = 'Образовательная программа';

UPDATE "tasks"
SET "category" = 'Просветительская программа'
WHERE "category" = 'Образовательная программа'
   OR lower(trim("category")) = 'образовательная программа';
