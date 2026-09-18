import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Иван',
        email: 'ivan@test.com',
        passwordHash: 'hash1',
        avatarColor: '#e57373',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Мария',
        email: 'maria@test.com',
        passwordHash: 'hash2',
        avatarColor: '#64b5f6',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Пётр',
        email: 'petr@test.com',
        passwordHash: 'hash3',
        avatarColor: '#81c784',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Анна',
        email: 'anna@test.com',
        passwordHash: 'hash4',
        avatarColor: '#ffb74d',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Сергей',
        email: 'sergey@test.com',
        passwordHash: 'hash5',
        avatarColor: '#ba68c8',
      },
    }),
  ]);

  const boards = await Promise.all([
    prisma.board.create({
      data: {
        name: 'Checkly MVP',
        ownerId: users[0].id,
      },
    }),
    prisma.board.create({
      data: {
        name: 'Личные задачи',
        ownerId: users[1].id,
      },
    }),
    prisma.board.create({
      data: {
        name: 'Учебный проект',
        ownerId: users[2].id,
      },
    }),
  ]);

  const columnsByBoard: Record<number, number[]> = {};

  for (const board of boards) {
    const columns = await Promise.all([
      prisma.boardColumn.create({
        data: {
          boardId: board.id,
          name: 'Backlog',
          color: '#90a4ae',
          positionX: 100,
          positionY: 200,
        },
      }),
      prisma.boardColumn.create({
        data: {
          boardId: board.id,
          name: 'In Progress',
          color: '#42a5f5',
          positionX: 500,
          positionY: 200,
        },
      }),
      prisma.boardColumn.create({
        data: {
          boardId: board.id,
          name: 'Done',
          color: '#66bb6a',
          positionX: 900,
          positionY: 200,
        },
      }),
    ]);

    columnsByBoard[board.id] = columns.map((column) => column.id);
  }

  await prisma.task.createMany({
    data: [
      {
        boardId: boards[0].id,
        columnId: columnsByBoard[boards[0].id][0],
        title: 'Купить хлеб',
        priority: 'LOW',
        tags: ['быт'],
        positionX: 120,
        positionY: 220,
      },
      {
        boardId: boards[0].id,
        columnId: columnsByBoard[boards[0].id][0],
        title: 'Позвонить маме',
        priority: 'MEDIUM',
        tags: ['семья'],
        positionX: 140,
        positionY: 240,
      },
      {
        boardId: boards[0].id,
        columnId: columnsByBoard[boards[0].id][1],
        title: 'Сделать зарядку',
        priority: 'HIGH',
        tags: ['спорт'],
        positionX: 520,
        positionY: 220,
      },
      {
        boardId: boards[0].id,
        columnId: columnsByBoard[boards[0].id][2],
        title: 'Прочитать книгу',
        priority: 'MEDIUM',
        tags: ['развитие'],
        positionX: 920,
        positionY: 220,
      },
      {
        boardId: boards[1].id,
        columnId: columnsByBoard[boards[1].id][0],
        title: 'Спринт-ревью',
        priority: 'HIGH',
        tags: ['работа'],
        positionX: 120,
        positionY: 220,
      },
      {
        boardId: boards[1].id,
        columnId: columnsByBoard[boards[1].id][1],
        title: 'Обновить резюме',
        priority: 'MEDIUM',
        tags: ['карьера'],
        positionX: 520,
        positionY: 220,
      },
      {
        boardId: boards[1].id,
        columnId: columnsByBoard[boards[1].id][2],
        title: 'Записаться к врачу',
        priority: 'HIGH',
        tags: ['здоровье'],
        positionX: 920,
        positionY: 220,
      },
      {
        boardId: boards[2].id,
        columnId: columnsByBoard[boards[2].id][0],
        title: 'Лаба по БД',
        priority: 'HIGH',
        tags: ['учёба', 'sql'],
        positionX: 120,
        positionY: 220,
      },
      {
        boardId: boards[2].id,
        columnId: columnsByBoard[boards[2].id][1],
        title: 'Курсовая',
        priority: 'HIGH',
        tags: ['учёба'],
        positionX: 520,
        positionY: 220,
      },
      {
        boardId: boards[2].id,
        columnId: columnsByBoard[boards[2].id][2],
        title: 'Сдать отчёт',
        priority: 'MEDIUM',
        tags: ['учёба'],
        positionX: 920,
        positionY: 220,
      },
    ],
  });

  console.log('Seed готов');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
