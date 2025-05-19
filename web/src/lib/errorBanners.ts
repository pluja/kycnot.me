import type { APIContext, AstroGlobal } from 'astro'
import type { ErrorInferenceObject } from 'astro/actions/runtime/utils.js'
import type { ActionError, SafeResult } from 'astro:actions'

type MessageObject =
  | {
      uiMessage: string
      type: 'success'
      origin: 'action' | 'runtime' | 'url' | `custom_${string}`
      error?: undefined
    }
  | ({
      uiMessage: string
      type: 'error'
    } & (
      | {
          origin: 'action'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error: ActionError<any>
        }
      | { origin: 'runtime'; error?: unknown }
      | { origin: 'url'; error?: undefined }
      | { origin: `custom_${string}`; error?: unknown }
    ))

/**
 * Helper class for handling errors and success messages.
 * It automatically adds messages from the query string to the messages array.
 *
 * @example
 * ```astro
 * ---
 * const messages = new ErrorBanners(Astro)
 * const data = await messages.try('Oops!', () => fetchData())
 * ---
 * <BaseLayout errors={messages.errors} success={messages.successes}>
 *   {data ? data : 'No data'}
 * </BaseLayout>
 * ```
 */
export class ErrorBanners {
  private _messages: MessageObject[] = []

  constructor(messages?: MessageObject[]) {
    this._messages = messages ?? []
  }

  /**
   * Get all stored messages.
   */
  public get get() {
    return [...this._messages]
  }

  /**
   * Get all error messages.
   */
  public get errors() {
    return this._messages.filter((msg) => msg.type === 'error').map((error) => error.uiMessage)
  }

  /**
   * Get all success messages.
   */
  public get successes() {
    return this._messages.filter((msg) => msg.type === 'success').map((success) => success.uiMessage)
  }

  /**
   * Handler for errors. Intended to be used in `.catch()` blocks.
   *
   * @example
   * ```ts
   * const data = await fetchData().catch(messages.handler('Oops!'))
   * ```
   *
   * @param uiMessage The UI message to display, or function to generate it.
   * @returns The handler function.
   */
  public handler(uiMessage: string | ((error: unknown) => string)) {
    return (error: unknown) => {
      const message = typeof uiMessage === 'function' ? uiMessage(error) : uiMessage
      console.error(`[ErrorBanners] ${message}`, error)
      this._messages.push({
        uiMessage: message,
        type: 'error',
        error,
        origin: 'runtime',
      })
    }
  }

  /**
   * Run a function and catch its errors.
   *
   * @example
   * ```ts
   * const items = await messages.try("Oops!", () => fetchItems()) // Item[] | undefined
   * const items = await messages.try("Oops!", () => fetchItems(), []) // Item[]
   * ```
   *
   * @param uiMessage The UI message to display, or function to generate it.
   * @param fn The function to execute.
   * @param fallback The fallback value.
   * @returns The result of the function.
   */
  public async try<T, F = undefined>(
    uiMessage: string | ((error: unknown) => string),
    fn: () => Promise<T> | T,
    fallback?: F
  ) {
    try {
      const result = await fn()
      return result
    } catch (error) {
      this.handler(uiMessage)(error)
      return fallback as F
    }
  }

  /**
   * Run multiple functions in parallel and catch errors.
   *
   * @example
   * ```ts
   * const [categories, posts] = await messages.tryMany([
   *   ["Error in categories", () => fetchCategories(), []],
   *   ["Error in posts", () => fetchPosts()]
   * ])
   * ```
   *
   * @param operations The operations to run.
   * @returns The results of the operations.
   */
  public async tryMany<T extends readonly Parameters<typeof this.try<unknown, unknown>>[] | []>(
    operations: T
  ) {
    const results = await Promise.all(operations.map((args) => this.try(...args)))

    return results as unknown as Promise<{
      -readonly [P in keyof T]: Awaited<ReturnType<T[P][1]>> | T[P][2]
    }>
  }

  /**
   * Add one or multiple messages.
   */
  public add(...messages: (MessageObject | null | undefined)[]) {
    messages
      .filter((message) => message !== null && message !== undefined)
      .forEach((message) => {
        this._messages.push(message)
        if (message.type === 'error') {
          console.error(`[ErrorBanners] ${message.uiMessage}`, message.error)
        }
      })
  }

  /**
   * Add a success message.
   */
  public addSuccess(message: string) {
    this._messages.push({
      uiMessage: message,
      type: 'success',
      origin: 'runtime',
    })
  }

  /**
   * Add a success message if the action result is successful.
   */
  public addIfSuccess<TInput extends ErrorInferenceObject, TOutput>(
    actionResult: SafeResult<TInput, TOutput> | undefined,
    message: string | ((actionResult: TOutput) => string)
  ) {
    if (actionResult && !actionResult.error) {
      const actualMessage = typeof message === 'function' ? message(actionResult.data) : message
      this._messages.push({
        uiMessage: actualMessage,
        type: 'success',
        origin: 'action',
      })
    }
  }

  /**
   * Clear all messages.
   */
  public clear() {
    this._messages = []
  }
}

/**
 * Generate message objects for {@link ErrorBanners} from the URL.
 */
export function getMessagesFromUrl(
  astro: Pick<APIContext | AstroGlobal | Readonly<APIContext> | Readonly<AstroGlobal>, 'url'>
) {
  const messages: MessageObject[] = []

  // Get error messages
  messages.push(
    ...astro.url.searchParams.getAll('error').map(
      (error) =>
        ({
          uiMessage: error,
          type: 'error',
          origin: 'url',
        }) as const satisfies MessageObject
    )
  )

  // Get success messages
  messages.push(
    ...astro.url.searchParams.getAll('success').map(
      (success) =>
        ({
          uiMessage: success,
          type: 'success',
          origin: 'url',
        }) as const satisfies MessageObject
    )
  )

  return messages
}
