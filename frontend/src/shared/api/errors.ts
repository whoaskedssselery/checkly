export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly fields?: Record<string, string>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

const messages: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Проверьте введённые данные',
  EMAIL_TAKEN: 'Этот email уже зарегистрирован',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  UNAUTHORIZED: 'Сессия истекла — войдите снова',
  FORBIDDEN: 'Нет доступа к этой доске',
  NOT_FOUND: 'Объект не найден — возможно, его уже удалили',
  CONFLICT: 'Действие уже выполнено или невозможно',
  PAYLOAD_TOO_LARGE: 'Слишком большой запрос',
  RATE_LIMITED: 'Слишком много попыток — подождите минуту',
  NETWORK_ERROR: 'Нет связи с сервером',
  SERVER_ERROR: 'Ошибка сервера, попробуйте ещё раз',
}

/** Human-readable (RU) text for anything thrown by the api layer. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) return messages[err.code] ?? err.message
  return messages.SERVER_ERROR
}
