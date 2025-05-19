export const baseInputClassNames = {
  input:
    'bg-night-600 block placeholder:text-sm  placeholder:text-day-600 text-day-100 w-full min-w-0 rounded-lg border border-night-400 px-3 leading-none h-9',
  div: 'bg-night-600 rounded-lg border border-night-400 text-sm',
  error: 'border-red-500  focus:border-red-500 focus:ring-red-500',
  disabled: 'cursor-not-allowed',
  textarea: 'resize-y min-h-16',
  file: 'file:bg-day-700 file:text-day-100 hover:file:bg-day-600 file:mr-4 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium h-12 p-1.25',
} as const satisfies Record<string, string>
