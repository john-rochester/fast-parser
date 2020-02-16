/*
 * This module parses the grammar definition language.
 * If represented in itself (sort of - tokens instead of regexes), it would look like
 *
 * grammar = rule+
 * rule = SYMBOL DESCRIPTION? '.'? '=' choice
 * choice = sequence ('|' sequence)*
 * sequence = item+ ('%' SYMBOL)?
 * item = [+-]? matcher [*+?]? (':' SYMBOL)?
 * matcher = TEXT | REGEX | '(' choice ')'
 */

import { Lexer, TokenType } from './grammar-lexer'
import * as g from './grammar'

function parseMatcher(l: Lexer, skipWS: boolean, grammar: g.Grammar): g.Matcher | null {
    let matcher, nt
    let t = l.next()
    switch (t.type) {
    case TokenType.CHAR:
        if (t.value !== '(') {
            l.pushBack(t)
            return null
        }
        matcher = parseChoice(l, skipWS, grammar)
        t = l.next()
        if (t.type !== TokenType.CHAR || t.value !== ')') {
            l.error('expected \')\'', t)
            return null
        }
        return matcher
    case TokenType.TEXT:
        return new g.Text(t.value, skipWS)
    case TokenType.SYMBOL:
        nt = l.peek()
        if (nt.type === TokenType.DESCRIPTION ||
                    nt.type === TokenType.CHAR &&
                        (nt.value === '.' || nt.value === '=')) {
            l.pushBack(t)
            return null
        }
        return grammar.get(t.value).symbol
    case TokenType.REGEX:
        return new g.Regex(t.value, skipWS)
    default:
        l.pushBack(t)
        return null
    }
}

function parseItem(l: Lexer, skipWS: boolean, grammar: g.Grammar) {
    let t = l.next()
    let keep = undefined
    if (t.type === TokenType.CHAR) {
        switch (t.value) {
        case '!':
            keep = true
            break
        case '-':
            keep = false
            break
        default:
            l.pushBack(t)
            break
        }
    } else {
        l.pushBack(t)
    }
    let matcher = parseMatcher(l, skipWS, grammar)
    if (matcher) {
        t = l.next()
        if (t.type === TokenType.CHAR) {
            switch (t.value) {
            case '*':
                matcher = new g.Repeat(matcher, true, true)
                t = l.next()
                break
            case '+':
                matcher = new g.Repeat(matcher, false, true)
                t = l.next()
                break
            case '?':
                matcher = new g.Repeat(matcher, true, false)
                t = l.next()
                break
            }
        }
        if (t.type === TokenType.CHAR && t.value === ':') {
            t = l.next()
            if (t.type !== TokenType.SYMBOL) {
                l.error('expected predicate name', t)
                return null
            }
            matcher = new g.Predicate(matcher, t.value)
        } else {
            l.pushBack(t)
        }
        return new g.Item(matcher, keep)
    }
    return null
}

function parseSequence(l: Lexer, skipWS: boolean, grammar: g.Grammar) {
    let items = []
    let item
    while ((item = parseItem(l, skipWS, grammar)) !== null) {
        items.push(item)
    }
    if (l.hasError())
        return null
    let repl = ''
    let t = l.next()
    if (t.type === TokenType.CHAR && t.value === '%') {
        t = l.next()
        if (t.type !== TokenType.SYMBOL) {
            l.error('expected replacement name', t)
            return null
        }
        repl = t.value
    } else {
        l.pushBack(t)
    }
    if (items.length === 0) {
        l.error('empty sequence', l.next())
        return null
    }
    return new g.Sequence(items, repl)
}

function parseChoice(l: Lexer, skipWS: boolean, grammar: g.Grammar) {
    let matchers = []
    let matcher
    while ((matcher = parseSequence(l, skipWS, grammar)) !== null) {
        matchers.push(matcher)
        let t = l.next()
        if (t.type !== TokenType.CHAR || t.value !== '|') {
            l.pushBack(t)
            if (matchers.length == 1)
                return matchers[0]
            return new g.Choice(matchers)
        }
    }
    return null
}

function parseRule(l: Lexer, grammar: g.Grammar) {
    let name = l.next()
    if (name.type !== TokenType.SYMBOL) {
        l.error('expected symbol', name)
        return false
    }
    let rule = grammar.get(name.value)
    let t = l.next()
    let desc = null
    if (t.type == TokenType.DESCRIPTION) {
        desc = t.value
        t = l.next()
    }
    let skipWS = true
    if (t.type === TokenType.CHAR && t.value === '.') {
        skipWS = false
        t = l.next()
    }
    if (t.type !== TokenType.CHAR || t.value !== '=') {
        l.error('expected \'=\'', t)
        return false
    }
    let matcher = parseChoice(l, skipWS, grammar)
    if (matcher == null)
        return false
    rule.matcher = matcher
    rule.description = desc
    rule.skipWS = skipWS
    return true
}

const defaultWS = /\s+/y

export function parse(s: string) {
    let l = new Lexer(s)
    let ws = defaultWS
    let t = l.next()
    if (t.type === TokenType.SYMBOL && t.value === 'whitespace') {
        t = l.next()
        if (t.type === TokenType.REGEX) {
            ws = new RegExp(t.value, 'y')
        } else {
            l.error('expected regular expression', t)
            l.pushBack(t)
        }
    } else {
        l.pushBack(t)
    }
    let grammar = new g.Grammar(ws)
    if (!l.hasError())
        while (l.peek().type != TokenType.EOF && parseRule(l, grammar))
            ;
    let error
    if (l.hasError())
        error = l.message()
    else
        error = grammar.check()
    return { grammar, error }
}
