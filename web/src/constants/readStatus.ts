import { makeHelpersForOptions } from '../lib/makeHelpersForOptions'
import { transformCase } from '../lib/strings'

type ReadStatusInfo<T extends string | null | undefined = string> = {
  id: T
  label: string
  readValue: boolean
}

export const {
  dataArray: readStatuses,
  getFn: getReadStatus,
  zodEnumById: readStatusZodEnum,
} = makeHelpersForOptions(
  'id',
  (id): ReadStatusInfo<typeof id> => ({
    id,
    label: id ? transformCase(id, 'title') : String(id),
    readValue: false,
  }),
  [
    {
      id: 'unread',
      label: 'Unread',
      readValue: false,
    },
    {
      id: 'read',
      label: 'Read',
      readValue: true,
    },
  ] as const satisfies ReadStatusInfo[]
)
