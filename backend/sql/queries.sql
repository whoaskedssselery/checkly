-- 1. Все задачи конкретной доски
SELECT *
FROM tasks
WHERE board_id = 1;

-- 2. Задачи в конкретной колонке (например "Done") доски 1
SELECT t.*
FROM tasks t
JOIN board_columns c ON c.id = t.column_id
WHERE c.name = 'Done'
  AND t.board_id = 1;

-- 3. Сколько задач в каждой колонке
SELECT column_id, COUNT(*) AS task_count
FROM tasks
GROUP BY column_id
ORDER BY column_id;

-- 4. Проверка регистронезависимой уникальности email
-- Должно упасть с ошибкой unique violation:
-- INSERT INTO users (name, email, password_hash) VALUES ('X', 'IVAN@TEST.COM', 'h');

-- 5. Проверка CHECK на priority
-- Должно упасть с ошибкой check violation:
-- INSERT INTO tasks (board_id, column_id, title, priority, updated_at)
-- VALUES (1, 1, 'X', 'ЧТО УГОДНО', NOW());

-- 6. Проверка составного FK (задача с board_id одной доски и column_id другой)
-- Должно упасть с ошибкой foreign key violation:
-- INSERT INTO tasks (board_id, column_id, title, updated_at)
-- VALUES (1, 4, 'X', NOW());