/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client'

import type { Prisma } from '@prisma/client'

const findManyAndCount = {
  name: 'findManyAndCount',
  model: {
    $allModels: {
      findManyAndCount<Model, Args>(
        this: Model,
        args: Prisma.Exact<Args, Prisma.Args<Model, 'findMany'>>
      ): Promise<
        [Prisma.Result<Model, Args, 'findMany'>, number, Args extends { take: number } ? number : undefined]
      > {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return prisma.$transaction([
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          (this as any).findMany(args),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          (this as any).count({ where: (args as any).where }),
        ]) as any
      },
    },
  },
}

// NOTE: This used to be necessary to cast the prismaClientSingleton return type, but it seems not anymore. I left it, just in case we need it again
// type FindManyAndCountType = typeof findManyAndCount.model.$allModels.findManyAndCount

// type ModelsWithCustomMethods = {
//   [Model in keyof PrismaClient]: PrismaClient[Model] extends {
//     findMany: (...args: any[]) => Promise<any>
//   }
//     ? PrismaClient[Model] & {
//         findManyAndCount: FindManyAndCountType
//       }
//     : PrismaClient[Model]
// }

// type ExtendedPrismaClient = ModelsWithCustomMethods & PrismaClient

function prismaClientSingleton() {
  return new PrismaClient().$extends(findManyAndCount)
}

declare global {
  var prisma: ReturnType<typeof prismaClientSingleton> | undefined
}

export const prisma = global.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}
