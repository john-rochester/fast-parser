import { parse } from './grammar-parser'

export type ReplacementFn = (args: any[]) => any
export type PredicateFn = (value: any, prev: any[]) => string | null

export interface Actions {
    replacements: {
        [name: string]: ReplacementFn
    },
    predicates: {
        [name: string]: PredicateFn
    }
}

export interface MatchResult {
    result: any
    error: string | null
}

export interface Token {
    text: string
    pos: number
}

export interface Parser {
    actions(actions: Partial<Actions>) : void
    match(src: string) : MatchResult
    error(message: string, pos: number) : string
}

export function createParser(src: string, actions?: Partial<Actions>) : Parser {
    let res = parse(src)
    if (res.error)
        throw new Error(res.error)
    if (actions !== undefined)
        res.grammar.actions(actions)
    return res.grammar
}

export function replaceList(args: any[]): any[] {
    let r = [args[0]]
    if (args[1].length)
        r = r.concat(args[1])
    return r
}

export function optionalItem(item: any[]): any {
    return item.length ? item[0] : undefined
}
