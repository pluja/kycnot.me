import { transformCase } from './strings'

const knownPlurals = {
  is: {
    singular: 'Is',
    plural: 'Are',
  },
  service: {
    singular: 'Service',
    plural: 'Services',
  },
  user: {
    singular: 'User',
    plural: 'Users',
  },
  note: {
    singular: 'Note',
    plural: 'Notes',
  },
  result: {
    singular: 'Result',
    plural: 'Results',
  },
  request: {
    singular: 'Request',
    plural: 'Requests',
  },
  day: {
    singular: 'Day',
    plural: 'Days',
  },
  something: {
    singular: 'Something',
    plural: 'Somethings',
  },
} as const satisfies Record<
  string,
  {
    singular: string
    plural: string
  }
>

type KnownPlural = keyof typeof knownPlurals

const synonyms = {
  are: 'is',
} as const satisfies Record<string, KnownPlural>

type Synonym = keyof typeof synonyms

export type KnownPluralOrSynonym = KnownPlural | Synonym

function isKnownPlural(key: string): key is KnownPlural {
  return key in knownPlurals
}

function isKnownPluralSynonym(key: string): key is Synonym {
  return key in synonyms
}

/**
 * Formats name into singular or plural form, and case type.
 *
 * @param entity - Entity name or synonym.
 * @param count - Number of entities.
 * @param caseType - Case type to apply to the entity name.
 */
export function pluralize<T extends KnownPluralOrSynonym>(
  entity: T,
  count: number | null = 1,
  caseType: Exclude<Parameters<typeof transformCase>[1], 'original'> = 'lower'
) {
  return pluralizeGeneric(entity, count, caseType)
}

/**
 * Use {@link pluralize} preferably.
 *
 * Formats name into singular or plural form, and case type.
 * If the provided entity is not from the {@link knownPlurals} object, it will return the string with the case type applied.
 *
 * @param entity - Entity name or synonym.
 * @param count - Number of entities.
 * @param caseType - Case type to apply to the entity name.
 */
export function pluralizeGeneric<T extends KnownPluralOrSynonym>(
  entity: T,
  count: number | null,
  caseType: Exclude<Parameters<typeof transformCase>[1], 'original'>
): string
export function pluralizeGeneric<T extends string>(
  entity: T,
  count: number | null,
  caseType: Exclude<Parameters<typeof transformCase>[1], 'original'>
): string
export function pluralizeGeneric<T extends string>(
  entity: T,
  count: number | null = 1,
  caseType: Exclude<Parameters<typeof transformCase>[1], 'original'> = 'lower'
): string {
  const originalEntity = isKnownPluralSynonym(entity) ? synonyms[entity] : entity
  if (!isKnownPlural(originalEntity)) {
    console.warn(`getEntityName: Unknown entity "${originalEntity}"`)
    return transformCase(originalEntity, caseType)
  }
  const { singular, plural } = knownPlurals[originalEntity]
  return pluralizeAny(singular, plural, count, caseType)
}

/**
 * Use {@link pluralize} preferably.
 *
 * Formats name into singular or plural form, and case type.
 *
 * @param singular - Singular form of the entity.
 * @param plural - Plural form of the entity.
 * @param count - Number of entities.
 * @param caseType - Case type to apply to the entity name.
 */
export function pluralizeAny(
  singular: string,
  plural: string,
  count: number | null = 1,
  caseType: Exclude<Parameters<typeof transformCase>[1], 'original'> = 'lower'
): string {
  const name = count === 1 ? singular : plural
  return transformCase(name, caseType)
}
