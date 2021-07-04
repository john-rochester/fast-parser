import { errorMessage } from './grammar-lexer'
import { Parser, ReplacementFn, PredicateFn, PredicateFailure, Actions } from './index'

// Matcher.actions must be called even if Grammar.actions is not, so this is the
// no-op argument for that
const noActions = {}

// sentinel value return by Matcher.match to indicate failure
const noMatch = {}

type SymbolSet = {[k: string]: boolean}

const enum MatchesNothing {
    UNKNOWN, NO, YES
}

/**
 * Common interface for most of the classes. Rule and Item don't need to implement this
 * because their contents are directly manipulated by Symbol and Sequence respectively
 */
export interface Matcher {
    /**
     * Indicates if the value of this matcher should be kept in the value of a
     * containing Sequence by default
     */
    keep() : boolean

    /**
     * Initialises the grammar. The matcher will extract the replacement or
     * predicate function that it needs.
     * @param actions the actions available
     */
    actions(actions: Actions) : void

    /**
     * Attempts to match against the source at the current position. Returns
     * the sentinel noMatch value if it fails, otherwise returns the value matched
     * @param src the full source being parsed
     */
    match(src: Source): any

    /**
     *  Dumps a lisp-like representation of the matcher. Used for unit tests
     */
    dump(): string

    /**
     * Returns true if the matcher's first/only symbol references the rule
     */
    leftReferences(rules: SymbolSet, failures: string[]) : boolean

    /**
     * Returns if the matcher can match against an empty string.
     */
    canMatchNothing() : MatchesNothing

    /**
     * Returns if the matcher contains a wildcard of a matcher that canMatchNothing()
     */
    hasEmptyRepeat() : boolean
}

interface Terminal extends Matcher {
    /**
     *  Returns the terminal symbol expected by this matcher
     */
    expectation(): string
}

export class Grammar implements Parser {
    private rules: {[symbol: string]: Rule} = {}
    private start: Rule | null = null
    private actionsCalled = false
    private src: Source

    constructor(private ws: RegExp) {
    }

    get(symbol: string) {
        let rule = this.rules[symbol]
        if (rule === undefined) {
            rule = new Rule(symbol)
            this.rules[symbol] = rule
            if (this.start === null)
                this.start = rule
        }
        return rule
    }

    public actions(actions: Partial<Actions>) {
        if (!actions.replacements)
            actions.replacements = {}
        if (!actions.predicates)
            actions.predicates = {}
        this.actionsCalled = true
        for (const symbol in this.rules)
            this.rules[symbol].actions(actions as Actions)
    }

    match(s: string) {
        if (!this.actionsCalled)
            this.actions(noActions)
        const src = new Source(s, this.ws)
        this.src = src
        let m = this.start!.symbol.match(src)
        let msg = null
        if (m === noMatch) {
            m = null
            msg = src.message()
        } else if (src.pos < src.len) {
            src.error('end of input')
            msg = src.message()
        }
        return { result: m, error: msg }
    }

    error(message: string, pos: number) {
        return this.src.customMessage(message, pos)
    }

    dump() {
        let s = '(grammar'
        for (const symbol in this.rules)
            s += this.rules[symbol].dump()
        s += ')'
        return s
    }

    check() {
        const failures = []
        let undefCount = 0
        if (!this.start)
            return 'empty grammar'
        for (const symbol in this.rules) {
            const rule = this.rules[symbol]
            undefCount++
            if (!rule.matcher)
                failures.push(symbol)
        }
        if (failures.length) {
            const plural = failures.length > 1
            return 'The ' + (plural ?  'symbols ' : 'symbol ') +
                joinUp(failures, true) +
                (plural ? ' have no rules ' : ' has no rule ') + 'defined'
        }
        let progress = true
        while (undefCount > 0 && progress) {
            progress = false
            for (const symbol in this.rules) {
                const rule = this.rules[symbol]
                if (rule.canMatchNothing === MatchesNothing.UNKNOWN) {
                    const cmn = rule.matcher.canMatchNothing()
                    if (cmn !== MatchesNothing.UNKNOWN) {
                        progress = true
                        rule.canMatchNothing = cmn
                        undefCount--
                    }
                }
            }
        }
        if (undefCount > 0) {
            for (const symbol in this.rules) {
                const rule = this.rules[symbol]
                if (rule.canMatchNothing === MatchesNothing.UNKNOWN)
                    rule.canMatchNothing = MatchesNothing.YES
            }
        }
        for (const symbol in this.rules) {
            const rule = this.rules[symbol]
            if (!rule.checked) {
                rule.checked = true
                const set: SymbolSet = {}
                set[symbol] = true
                rule.matcher.leftReferences(set, failures)
            }
        }
        if (failures.length) {
            const plural = failures.length > 1
            return 'The ' + (plural ? 'rules ' : 'rule ') + 'for ' +
                joinUp(failures, true) +
                (plural ? ' contain ' : ' contains ') +
                'left-recursion which would cause a stack overflow during parsing'
        }
        for (const symbol in this.rules) {
            const rule = this.rules[symbol]
            if (rule.matcher.hasEmptyRepeat())
                failures.push(symbol)
        }
        if (failures.length) {
            const plural = failures.length > 1
            return 'The ' +  (plural ? 'rules ' : 'rule ') + 'for ' +
                joinUp(failures, true) +
                (plural ? ' contain ' : ' contains ') +
                'a wildcard (*, +, or ?) of something that can be empty. This would ' +
                'cause an infinite loop during parsing'
        }
        return null
    }
}

export class Rule {
    matcher: Matcher
    description: string | null
    skipWS: boolean
    symbol: Symbol
    checked: boolean = false
    canMatchNothing: MatchesNothing = MatchesNothing.UNKNOWN

    constructor (public name: string) {
        this.symbol = new Symbol(this)
    }

    actions(actions: Actions) {
        this.matcher.actions(actions)
    }

    dump() {
        let s = ' (rule ' + this.name
        if (this.description)
            s += ' (err \'' + this.description.replace('\'', '\\\'') + '\')'
        return s + this.matcher.dump() + ')'
    }
}

export class Choice implements Matcher {
    constructor(private matchers: Matcher[]) {
    }

    actions(actions: Actions) {
        for (const matcher of this.matchers)
            matcher.actions(actions)
    }

    keep() {
        return true
    }

    match(src: Source) {
        for (const matcher of this.matchers) {
            const m = matcher.match(src)
            if (m !== noMatch)
                return m
        }
        return noMatch
    }

    dump() {
        let s = ' (choice'
        for (const matcher of this.matchers)
            s += matcher.dump()
        return s + ')'
    }

    leftReferences(rules: SymbolSet, failures: string[]) {
        for (const matcher of this.matchers)
            if (matcher.leftReferences(rules, failures))
                return true
        return false
    }

    canMatchNothing() {
        let rv = MatchesNothing.NO
        for (const matcher of this.matchers) {
            switch (matcher.canMatchNothing()) {
            case MatchesNothing.YES:
                return MatchesNothing.YES
            case MatchesNothing.UNKNOWN:
                rv = MatchesNothing.UNKNOWN
            }
        }
        return rv
    }

    hasEmptyRepeat() {
        for (const matcher of this.matchers)
            if (matcher.hasEmptyRepeat())
                return true
        return false
    }
}

const defaultReplacementFn = (args: any[]) => args
const singleItemReplacementFn = (args: any[]) => args[0]

export class Sequence implements Matcher {
    fn: ReplacementFn

    constructor(public items: Item[], private repl: string) {
    }

    actions(actions: Actions) {
        if (this.repl) {
            this.fn = actions.replacements[this.repl]
            if (!this.fn)
                throw new Error('missing replacement function \'' + this.repl + '\'')
        } else if (this.keptItemCount() === 1) {
            this.fn = singleItemReplacementFn
        } else {
            this.fn = defaultReplacementFn
        }
        for (const item of this.items)
            item.actions(actions)
    }

    keep() {
        return true
    }

    match(src: Source) {
        const res = []
        const opos = src.pos
        for (const item of this.items) {
            const m = item.matcher.match(src)
            if (m == noMatch) {
                src.pos = opos
                return noMatch
            }
            if (item.keep)
                res.push(m)
        }
        return this.fn(res)
    }

    dump() {
        let s = ' (seq'
        for (const i of this.items)
            s += i.dump()
        return s + ')'
    }

    leftReferences(rules: SymbolSet, failures: string[]) {
        for (const item of this.items) {
            const matcher = item.matcher
            if (matcher.leftReferences(rules, failures))
                return true
            if (matcher.canMatchNothing() !== MatchesNothing.YES)
                break
        }
        return false
    }

    canMatchNothing() : MatchesNothing {
        let rv = MatchesNothing.YES
        for (const item of this.items) {
            switch (item.matcher.canMatchNothing()) {
            case MatchesNothing.NO:
                return MatchesNothing.NO
            case MatchesNothing.UNKNOWN:
                rv = MatchesNothing.UNKNOWN
            }
        }
        return rv
    }

    hasEmptyRepeat() {
        for (const item of this.items)
            if (item.matcher.hasEmptyRepeat())
                return true
        return false
    }

    private keptItemCount() {
        let count = 0
        for (const item of this.items) {
            if (item.keep)
                count++
        }
        return count
    }
}

export class Item {
    constructor(public matcher: Matcher, public keep = matcher.keep()) {
    }

    actions(actions: Actions) {
        this.matcher.actions(actions)
    }

    dump() {
        let s = ' (item'
        if (this.keep !== this.matcher.keep()) {
            if (this.keep)
                s += ' keep'
            else
                s += ' skip'
        }
        s += this.matcher.dump()
        return s + ')'
    }
}

export class Text implements Matcher {
    private len: number

    constructor(private text: string, private skipWS: boolean) {
        this.len = text.length
    }

    keep() {
        return false
    }

    actions() {
    }

    match(src: Source) : any {
        const pos = src.pos
        const npos = pos + this.len
        if (src.s.substring(pos, npos) === this.text) {
            src.pos = npos
            if (this.skipWS)
                src.skipWS()
            return { text: this.text, pos: pos }
        }
        src.error(this)
        return noMatch
    }

    dump() {
        return ' (text \'' + this.text.replace('\'', '\\\'') + '\')'
    }

    expectation() {
        return '\'' + this.text + '\''
    }

    leftReferences() {
        return false
    }

    canMatchNothing() : MatchesNothing {
        return MatchesNothing.NO
    }

    hasEmptyRepeat() {
        return false
    }
}

export class Symbol implements Terminal {
    constructor(private rule: Rule) {
    }

    match(src: Source) : any {
        let keepErrors
        if (this.rule.description)
            keepErrors = src.errorCount()
        if (this.rule.skipWS)
            src.skipWS()
        const m = this.rule.matcher.match(src)
        if (m === noMatch && this.rule.description)
            src.error(this, keepErrors)
        return m
    }

    actions() {
    }

    keep() {
        return true
    }

    dump() {
        return ' (symbol ' + this.rule.name + ')'
    }

    expectation() {
        return <string>this.rule.description
    }

    leftReferences(rules: SymbolSet, failures: string[]) {
        if (rules[this.rule.name]) {
            for (const symbol in rules)
                failures.push(symbol)
            return true
        }
        if (this.rule.checked)
            return false
        this.rule.checked = true
        rules[this.rule.name] = true
        const result = this.rule.matcher.leftReferences(rules, failures)
        rules[this.rule.name] = false
        return result
    }

    canMatchNothing() : MatchesNothing {
        return this.rule.canMatchNothing
    }

    hasEmptyRepeat() {
        return false
    }
}

export class Regex implements Terminal {
    private re: RegExp
    private cmn: MatchesNothing

    constructor(src: string, private skipWS: boolean) {
        this.re = new RegExp(src, 'y')
        this.cmn = this.re.exec('') ? MatchesNothing.YES : MatchesNothing.NO
    }

    actions() {
    }

    match(src: Source): any {
        const pos = src.pos
        this.re.lastIndex = pos
        const m = this.re.exec(src.s)
        if (m) {
            src.pos = this.re.lastIndex
            if (this.skipWS)
                src.skipWS()
            return { text: m[0], pos: pos }
        }
        src.error(this)
        return noMatch
    }

    keep() {
        return true
    }

    dump() {
        return ' (regex ' + this.re.toString() + ')'
    }

    expectation() {
        return this.re.source
    }

    leftReferences() {
        return false
    }

    canMatchNothing() : MatchesNothing {
        return this.cmn
    }

    hasEmptyRepeat() {
        return false
    }
}

export class Repeat implements Matcher {
    constructor(private base: Matcher, private zeroOK: boolean, private multipleOK: boolean) {
    }

    actions(actions: Actions) {
        this.base.actions(actions)
    }

    match(src: Source): any {
        const matches = []
        for (;;) {
            if (src.pos == src.len && (this.zeroOK || matches.length))
                break
            const m = this.base.match(src)
            if (m === noMatch)
                break
            matches.push(m)
            if (!this.multipleOK)
                break
        }
        if (!this.zeroOK && !matches.length)
            return noMatch
        return matches
    }

    keep() {
        return true
    }

    dump() {
        return (this.zeroOK ? (this.multipleOK ? ' (star' : ' (maybe') : ' (plus') + this.base.dump() + ')'
    }

    leftReferences(rules: SymbolSet, failures: string[]) {
        return this.base.leftReferences(rules, failures)
    }

    canMatchNothing() : MatchesNothing {
        if (this.zeroOK)
            return MatchesNothing.YES
        return this.base.canMatchNothing()
    }

    hasEmptyRepeat() {
        return this.base.canMatchNothing() !== MatchesNothing.NO
    }
}

export class Predicate implements Matcher {
    private fn: PredicateFn

    constructor(private base: Matcher, private name: string) {
    }

    actions(actions: Actions) {
        this.fn = actions.predicates[this.name]
        if (!this.fn)
            throw new Error('missing predicate function \'' + this.name + '\'')
        this.base.actions(actions)
    }

    match(src: Source) {
        const pos = src.pos
        const m = this.base.match(src)
        if (m !== noMatch) {
            const err = this.fn(m, [])
            if (err) {
                src.pos = pos
                src.error(err)
                return noMatch
            }
            return m
        }
        return noMatch
    }

    keep() {
        return this.base.keep()
    }

    dump() {
        return ' (predicate ' + this.name + this.base.dump() + ')'
    }

    leftReferences(rules: SymbolSet, failures: string[]) {
        return this.base.leftReferences(rules, failures)
    }

    canMatchNothing() : MatchesNothing {
        return this.base.canMatchNothing()
    }

    hasEmptyRepeat() {
        return this.base.hasEmptyRepeat()
    }
}

function isPF(o: Object): o is PredicateFailure {
    return (o as PredicateFailure).message !== undefined
}

/**
 * Holds the source being parsed and the position currently being examined, as well
 * as the latest rightmost error condition
 */
export class Source {
    len: number
    pos: number
    err: (string | PredicateFailure | Terminal)[]
    errPos: number

    constructor(public s: string, private ws: RegExp) {
        this.len = s.length
        this.pos = 0
        this.err = []
        this.errPos = -1
    }

    skipWS() {
        this.ws.lastIndex = this.pos
        if (this.ws.exec(this.s))
            this.pos = this.ws.lastIndex
    }

    /**
     * record a match failure happening at the current position
     * @param what the matcher that failed
     * @param keep how many errors to keep at the current position
     */
    error(what: Terminal | PredicateFailure | string, keep : number = -1) {
        // only record the furthest failures in the source
        if (this.pos >= this.errPos) {
            // throw away earlier failures
            if (this.pos > this.errPos) {
                this.err.length = 0
                this.errPos = this.pos
            } else if (keep >= 0) {
                this.err.length = keep
            }
            this.err.push(what)
        }
    }

    errorCount() {
        return this.pos === this.errPos ? this.err.length : 0
    }

    message() {
        /* istanbul ignore if */
        if (!this.err)
            return ''
        const expect : string[] = []
        // collect expectations
        for (const eitem of this.err) {
            if (typeof eitem === 'string')
                expect.push(eitem)
            else if (isPF(eitem))
                return eitem.message(this.customMessage.bind(this))
            else
                expect.push(eitem.expectation())
        }
        expect.sort()
        // remove duplicates
        for (let i = 0; i < expect.length - 1; i++)
            if (expect[i] === expect[i + 1])
                expect.splice(i--, 1)
        // format expectations nicely
        const msg = 'expected ' + joinUp(expect)
        return errorMessage(msg, this.s, this.errPos)
    }

    customMessage(msg: string, pos: number) {
        return errorMessage(msg, this.s, pos)
    }
}

function joinUp(words : string[], withAnd: boolean = false) {
    const last = words.pop()
    const sep = withAnd ? ' and ' : ' or '
    if (words.length > 1)
        return words.join(', ') + ',' + sep + last // oxford comma FTW
    else if (words.length > 0)
        return words[0] + sep + last
    else
        return last
}
