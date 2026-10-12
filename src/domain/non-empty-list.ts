/** A list holding at least one element, so its first element is always there to read. */
export type NonEmptyList<T> = readonly [T, ...ReadonlyArray<T>]

/** Type guard narrowing a list to a {@link NonEmptyList}: `true` when it holds at least one element. */
export const isNonEmptyList = <T>(list: ReadonlyArray<T>): list is NonEmptyList<T> => list.length > 0
