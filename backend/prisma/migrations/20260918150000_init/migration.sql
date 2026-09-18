-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "avatar_color" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_columns" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7),
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "board_id" INTEGER NOT NULL,
    "column_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "priority" VARCHAR(10),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- Регистронезависимая уникальность email (issue #1)
CREATE UNIQUE INDEX users_email_lower_key ON users (LOWER(email));

-- Ограничение на допустимые приоритеты (issue #2)
ALTER TABLE tasks
ADD CONSTRAINT priority_check
CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high'));

-- CreateIndex
CREATE INDEX "idx_boards_owner" ON "boards"("owner_id");

-- CreateIndex
CREATE INDEX "idx_columns_board" ON "board_columns"("board_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_columns_board_id_key" ON "board_columns"("board_id", "id");

-- CreateIndex
CREATE INDEX "idx_tasks_board" ON "tasks"("board_id");

-- CreateIndex
CREATE INDEX "idx_tasks_column" ON "tasks"("column_id");

-- AddForeignKey
ALTER TABLE "boards"
ADD CONSTRAINT "boards_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_columns"
ADD CONSTRAINT "board_columns_board_id_fkey"
FOREIGN KEY ("board_id") REFERENCES "boards"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_board_id_fkey"
FOREIGN KEY ("board_id") REFERENCES "boards"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Составной FK: задача может ссылаться только на колонку своей доски (issue #3)
ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_board_id_column_id_fkey"
FOREIGN KEY ("board_id", "column_id")
REFERENCES "board_columns"("board_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;