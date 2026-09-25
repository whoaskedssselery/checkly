import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Demo data for the frontend and the QA contract suite.
 *
 *   demo@checkly.dev / demo1234, one board "Доска команды" (code CHK-B1D4)
 *   with three columns and five tasks — the same content the frontend mock
 *   ships, so the UI looks the same on either backend.
 *
 * Re-running is safe: it wipes and recreates only the demo user's board.
 */
const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@checkly.dev';
const DEMO_PASSWORD = 'demo1234';
const BOARD_CODE = 'CHK-B1D4';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: { email: DEMO_EMAIL, name: 'Демо', passwordHash, avatarColor: '#d8a851' },
  });

  await prisma.board.deleteMany({ where: { code: BOARD_CODE } });

  const board = await prisma.board.create({
    data: {
      name: 'Доска команды',
      code: BOARD_CODE,
      ownerId: user.id,
      members: { create: { userId: user.id, role: 'owner' } },
    },
  });

  const [backlog, progress, done] = await Promise.all(
    [
      { name: 'Backlog', color: '#d9a441', posX: 20, posY: 0 },
      { name: 'In progress', color: '#cfc6b2', posX: 340, posY: 0 },
      { name: 'Done', color: '#9aa35e', posX: 660, posY: 0 },
    ].map((c) => prisma.column.create({ data: { ...c, boardId: board.id } })),
  );

  const task = (
    title: string,
    columnId: string,
    priority: 'low' | 'medium' | 'high',
    posX: number,
    posY: number,
    extra: { description?: string; tags?: string[]; dueDate?: string } = {},
  ) => ({
    boardId: board.id,
    columnId,
    title,
    priority,
    posX,
    posY,
    description: extra.description ?? null,
    tags: extra.tags ?? [],
    dueDate: extra.dueDate ? new Date(extra.dueDate) : null,
  });

  await prisma.task.createMany({
    data: [
      task('Собрать макет доски', done.id, 'medium', 686, 86, {
        description: 'Набросать структуру канваса и карточек',
        tags: ['design'],
        dueDate: '2026-09-15',
      }),
      task('Настроить React Flow', progress.id, 'high', 366, 86, {
        description: 'Подключить канвас, пан/зум, кастомные ноды',
        tags: ['frontend'],
        dueDate: '2026-09-18',
      }),
      task('Схема БД для задач', progress.id, 'high', 366, 252, {
        description: 'Таблицы users/boards/tasks, миграции',
        tags: ['backend'],
        dueDate: '2026-09-18',
      }),
      task('Presence-курсоры', backlog.id, 'medium', 46, 86, {
        description: 'Живые участники на канвасе',
        tags: ['frontend'],
        dueDate: '2026-09-27',
      }),
      task('Фильтры и поиск', backlog.id, 'low', 46, 252, { tags: ['frontend'] }),
    ],
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD}, board ${BOARD_CODE}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
