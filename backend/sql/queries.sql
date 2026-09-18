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
