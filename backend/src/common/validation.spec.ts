import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBoardDto } from '../boards/dto/create-board.dto';
import { JoinBoardDto } from '../boards/dto/join-board.dto';
import { CreateColumnDto } from '../columns/dto/create-column.dto';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../tasks/dto/update-task.dto';
import { flattenErrors } from './validation';

async function check<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto);
  return { dto, errors, fields: flattenErrors(errors) };
}

const pos = { x: 0, y: 0 };

describe('input validation', () => {
  it('trims before validating, so a title of spaces is empty rather than valid', async () => {
    const bad = await check(CreateTaskDto, { title: '     ', position: pos });
    expect(bad.fields.title).toBeTruthy();
    const ok = await check(CreateTaskDto, { title: '  hi  ', position: pos });
    expect(ok.dto.title).toBe('hi');
    expect(ok.errors).toEqual([]);
  });

  it('names nested fields with a dotted path', async () => {
    const r = await check(CreateTaskDto, { title: 'x', position: { x: 'a', y: 0 } });
    expect(Object.keys(r.fields)).toContain('position.x');
  });

  it('bounds coordinates and rejects NaN and Infinity', async () => {
    for (const x of [1e9, -1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await check(CreateTaskDto, { title: 'x', position: { x, y: 0 } });
      expect(r.fields['position.x']).toBeTruthy();
    }
  });

  it('a task may have no columnId, or null: a free-floating card', async () => {
    expect((await check(CreateTaskDto, { title: 'x', position: pos })).errors).toEqual([]);
    expect(
      (await check(CreateTaskDto, { title: 'x', columnId: null, position: pos })).errors,
    ).toEqual([]);
    expect((await check(UpdateTaskDto, { columnId: null })).errors).toEqual([]);
  });

  it('keeps the limits the database and the frontend share', async () => {
    expect(
      (await check(CreateTaskDto, { title: 'x'.repeat(255), position: pos })).errors,
    ).toEqual([]);
    expect(
      (await check(CreateTaskDto, { title: 'x'.repeat(256), position: pos })).fields.title,
    ).toBeTruthy();
    expect(
      (await check(CreateColumnDto, { name: 'x'.repeat(51), position: pos })).fields.name,
    ).toBeTruthy();
    expect((await check(CreateBoardDto, { name: 'x'.repeat(151) })).fields.name).toBeTruthy();
  });

  it('accepts only #rrggbb colours for a column', async () => {
    for (const color of ['#d9a441', '#ABCDEF']) {
      expect((await check(CreateColumnDto, { name: 'c', color, position: pos })).errors).toEqual([]);
    }
    for (const color of ['var(--reel-1)', 'red', '#fff', '#gggggg']) {
      expect(
        (await check(CreateColumnDto, { name: 'c', color, position: pos })).fields.color,
      ).toBeTruthy();
    }
  });

  it('a board code is CHK- plus four characters, in any letter case', async () => {
    for (const code of ['CHK-AB12', 'chk-ab12', ' CHK-AB12 ']) {
      expect((await check(JoinBoardDto, { code })).errors).toEqual([]);
    }
    for (const code of ['CHK-AB1', 'CHK-AB123', 'hello', '']) {
      expect((await check(JoinBoardDto, { code })).fields.code).toBeTruthy();
    }
  });
});
