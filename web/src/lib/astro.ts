/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ComponentProps, HTMLTag, Polymorphic } from 'astro/types'

export type AstroComponent = (args: any) => any

export type PolymorphicComponent<Component extends AstroComponent | HTMLTag> =
  (Component extends AstroComponent ? ComponentProps<Component> & { as?: Component } : {}) &
    (Component extends HTMLTag ? Polymorphic<{ as: Component }> : {})

export type AstroChildren = any
