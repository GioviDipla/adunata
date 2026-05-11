export type ActionRejectionCode =
  | 'not_your_priority'
  | 'not_your_turn'
  | 'invalid_state'

export class ActionRejectedError extends Error {
  readonly code: ActionRejectionCode
  readonly meta?: Record<string, unknown>

  constructor(code: ActionRejectionCode, meta?: Record<string, unknown>) {
    super(code)
    this.name = 'ActionRejectedError'
    this.code = code
    this.meta = meta
  }
}
