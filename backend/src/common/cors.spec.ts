import { allowedOrigins, isOriginAllowed } from './cors';

describe('cors', () => {
  const saved = process.env.CORS_ORIGIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = saved;
  });

  it('allows any origin only when nothing is configured', () => {
    delete process.env.CORS_ORIGIN;
    expect(allowedOrigins()).toBe(true);
    expect(isOriginAllowed('http://anything')).toBe(true);
  });

  it('with a list, allows exactly those origins (spaces ignored) and no others', () => {
    process.env.CORS_ORIGIN = 'http://a.test, http://b.test';
    expect(allowedOrigins()).toEqual(['http://a.test', 'http://b.test']);
    expect(isOriginAllowed('http://b.test')).toBe(true);
    expect(isOriginAllowed('http://evil.test')).toBe(false);
    expect(isOriginAllowed('http://a.test.evil.test')).toBe(false);
  });

  it('lets clients without an Origin header through: they are not a CSRF vector', () => {
    process.env.CORS_ORIGIN = 'http://a.test';
    expect(isOriginAllowed(undefined)).toBe(true);
  });
});
