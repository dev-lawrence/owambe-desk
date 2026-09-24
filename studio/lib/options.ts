// Sanity's `options.list` wants mutable {title, value} arrays; the shared
// vocabularies are readonly tuples. This copies them without widening the values.
export const list = <T extends {readonly title: string; readonly value: string}>(
  options: readonly T[],
) => options.map(({title, value}) => ({title, value}))
