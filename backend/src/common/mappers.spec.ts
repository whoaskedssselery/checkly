import { toColumn, toTask } from './mappers';

const now = new Date('2026-09-25T10:00:00Z');

const column = {
  id: 'c',
  boardId: 'b',
  name: 'n',
  color: '#000000',
  posX: 1,
  posY: 2,
  createdAt: now,
  updatedAt: now,
};

describe('mappers', () => {
  it('a task keeps a null column, shapes the position, and sends the due date as YYYY-MM-DD', () => {
    const t = toTask({
      id: 't',
      boardId: 'b',
      columnId: null,
      title: 'x',
      description: null,
      priority: 'low',
      tags: ['a'],
      dueDate: new Date('2026-10-05T00:00:00Z'),
      posX: 1.5,
      posY: -2,
      createdAt: now,
      updatedAt: now,
    });
    expect(t.columnId).toBeNull();
    expect(t.position).toEqual({ x: 1.5, y: -2 });
    expect(t.dueDate).toBe('2026-10-05');
    expect(t.description).toBeUndefined();
  });

  it('a task with no due date has none, and keeps its description', () => {
    const t = toTask({
      id: 't',
      boardId: 'b',
      columnId: 'c',
      title: 'x',
      description: 'd',
      priority: 'low',
      tags: [],
      dueDate: null,
      posX: 0,
      posY: 0,
      createdAt: now,
      updatedAt: now,
    });
    expect(t.dueDate).toBeUndefined();
    expect(t.description).toBe('d');
  });

  it('a column has width and height only when the user set them', () => {
    expect(toColumn({ ...column, width: null, height: null })).toMatchObject({
      width: undefined,
      height: undefined,
    });
    expect(toColumn({ ...column, width: 640, height: 900 })).toMatchObject({
      width: 640,
      height: 900,
      position: { x: 1, y: 2 },
    });
  });

  it('a column carries nothing that is not part of the contract', () => {
    const c = toColumn({ ...column, width: null, height: null });
    expect(Object.keys(c).sort()).toEqual([
      'boardId',
      'color',
      'createdAt',
      'height',
      'id',
      'name',
      'position',
      'updatedAt',
      'width',
    ]);
  });
});
