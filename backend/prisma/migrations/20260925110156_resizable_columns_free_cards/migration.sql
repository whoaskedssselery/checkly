-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_columnId_fkey";

-- AlterTable
ALTER TABLE "Column" ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "width" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "columnId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "avatarColor" SET DEFAULT '#d8a851';

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: earlier builds stored CSS variables as colours; the contract is #rrggbb.
UPDATE "User" SET "avatarColor" = '#d8a851' WHERE "avatarColor" LIKE 'var(%';
UPDATE "Column" SET "color" = CASE "color"
    WHEN 'var(--reel-1)' THEN '#d9a441'
    WHEN 'var(--reel-2)' THEN '#cfc6b2'
    WHEN 'var(--reel-3)' THEN '#9aa35e'
    WHEN 'var(--reel-4)' THEN '#8d97a3'
    ELSE '#cfc6b2'
END WHERE "color" LIKE 'var(%';
