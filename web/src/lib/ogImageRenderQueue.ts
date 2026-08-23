import { Semaphore } from './semaphore'

// ogRenderSemaphore bounds concurrent renders because satori and sharp are
// CPU-heavy and every OG surface is unauthenticated, so work sheds beyond a
// bounded backlog rather than saturating the box.
// One budget for all routes, not one each: satori runs on the main thread, so
// two of them anywhere is already the whole event loop.
export const ogRenderSemaphore = new Semaphore(2, 50)
