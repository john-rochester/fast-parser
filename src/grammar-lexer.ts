/*
 * This module does lexical analysis of the grammar definition language.
 *
 * The tokens are distinguished by the regular expression Lexer.re. In order, they are
 *      whitespace (ignored, not returned)
 *      SYMBOL      a camelCase symbol that starts with a lowercase letter and contains
 *                  letters and digits
 *      TEXT        a single-quoted string similar to javascript (doesn't handle \x or \u)
 *      REGEX       a regular expression bounded by slashes. capturing groups are converted
 *                  to non-capturing
 *      DESCRIPTION a description used in constructing error messages, bounded by <>s
 *      CHAR        a single character
 */

export const enum TokenType {
    EOF, SYMBOL, TEXT, REGEX, DESCRIPTION, CHAR
}

interface Token {
    type: TokenType
    value: string
    position: number
}

const specials: {[k: string]: string} = {
    b: '\b', f: '\f', t: '\t', v: '\v', r: '\r', n: '\n'
}

/**
 * Constructs an error message of the form
 *      error description, line N:
 *          source line
 *              ^
 *
 * @param msg       the error description
 * @param src       the complete source being parsed
 * @param errpos    the character index where the error occurred
 */
export function errorMessage(msg: string, src: string, errpos: number) : string {
    let lpos = 0, pos = -1, ln = 0
    while (pos < errpos) {
        lpos = pos + 1
        pos = src.indexOf('\n', lpos)
        ln++
        if (pos < 0) {
            pos = src.length
            break
        }
    }
    let indent = ''
    for (let lp = lpos; lp < errpos; lp++)
        indent += ' '
    return msg + ', line ' + ln + ':\n    ' + src.substring(lpos, pos) + '\n    ' + indent + '^'
}

export class Lexer {
    private pushedBack: Token[] = []
    private err: {reason: string, token: Token} | null = null
    private readonly re = /(\s+)|([a-z][a-zA-Z0-9]*)|'((?:[^\\']|\\.)+)'|\/((?:[^\\/]|\\.)*)\/|<([^>]+)>|./g

    /**
     * Constructs a new lexical analyser
     * @param s the source string
     */
    constructor(private s: string) {
    }

    /**
     * Pushes a single token back so it will be read again. Subsequent next() calls
     * will retrieve pushed back tokens starting with the most recent until all
     * have been retrieved
     * @param t the token to push back
     */
    pushBack(t: Token) {
        this.pushedBack.push(t)
    }

    /**
     * Return a token without consuming it
     */
    peek() {
        let t = this.next()
        this.pushBack(t)
        return t
    }

    /**
     * Return the next token in the grammar description source
     */
    next(): Token {
        let pos = this.re.lastIndex
        if (!this.err) {
            if (this.pushedBack.length)
                return <Token>this.pushedBack.pop()
            let match
            while ((match = this.re.exec(this.s)) && match[1] !== undefined)
                pos = this.re.lastIndex
            if (match) {
                if (match[2] !== undefined) {
                    return {
                        type: TokenType.SYMBOL,
                        value: match[2],
                        position: pos
                    }
                }
                if (match[3] !== undefined) {
                    return {
                        type: TokenType.TEXT,
                        value: match[3].replace(/\\./g, function(q: string) {
                            let c = specials[q[1]]
                            return c ? c : q[1]
                        }),
                        position: pos
                    }
                }
                if (match[4] !== undefined) {
                    return {
                        type: TokenType.REGEX,
                        value: match[4].replace('(', '(?:'),
                        position: pos
                    }
                }
                if (match[5] !== undefined) {
                    return {
                        type: TokenType.DESCRIPTION,
                        value: match[5],
                        position: pos
                    }
                }
                return {
                    type: TokenType.CHAR,
                    value: match[0],
                    position: pos
                }
            }
        }
        return {
            type: TokenType.EOF,
            value: '',
            position: pos
        }
    }

    /**
     * Records a syntax error
     * @param reason error message to return later
     * @param token the token indicating the error position
     */
    error(reason: string, token: Token) {
        /* istanbul ignore if */
        if (this.err) {
            console.log('not overwriting error', this.err, 'with', reason)
            return
        }
        this.err = { reason, token }
    }

    hasError() {
        return this.err !== null
    }

    /**
     * Constructs a full error message
     */
    message() {
        /* istanbul ignore if */
        if (!this.err)
            return ''
        return errorMessage(this.err.reason, this.s, this.err.token.position)
    }
}
