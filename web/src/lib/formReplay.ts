export type ActionFormValues = Record<string, string[] | string>

// Capture is opt-in (default-deny): a form's values are only stored for replay
// when it includes this hidden marker (see FormReplay.astro). This keeps
// credential forms such as login out of the action session by construction,
// rather than relying on a field denylist. Kept in sync with the middleware.
export const FORM_REPLAY_MARKER = '__replay'

// Upper bound on the total characters stored for a single submission, so a form
// with large free-text fields cannot bloat the action session in Redis.
export const FORM_REPLAY_MAX_CHARS = 64 * 1024

export type FormReplay = {
  // True when this render follows a submitted form action (so the values below
  // reflect what the user just sent, not a fresh or prefilled form).
  isReplay: boolean
  text: (field: string, fallback?: string) => string | undefined
  list: (field: string, fallback?: string[]) => string[]
  checked: (field: string, fallback?: boolean) => boolean
}

// getFormReplay turns the submission captured by the action middleware
// (Astro.locals.actionFormValues) into accessors that repopulate form inputs
// after a failed or re-rendered submit, with no client JS.
//
// On a fresh render (no submission) every accessor returns its fallback, so a
// prefilled edit form passes the database value as the fallback. On a replay
// the submitted value wins, and a field the user left empty resolves to empty
// rather than reverting to the fallback.
//
//   const replay = getFormReplay(Astro.locals.actionFormValues)
//   <InputText name="title" inputProps={{ value: replay.text('title', service.title) }} />
//   <InputCheckboxGroup name="tags" selectedValues={replay.list('tags')} />
export function getFormReplay(values: ActionFormValues | null): FormReplay {
  return {
    isReplay: values !== null,

    text(field, fallback) {
      if (!values) return fallback
      const value = values[field]
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value[0] ?? ''
      return ''
    },

    list(field, fallback = []) {
      if (!values) return fallback
      const value = values[field]
      return Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    },

    checked(field, fallback = false) {
      if (!values) return fallback
      return values[field] !== undefined
    },
  }
}
