import { Lexer, TokenType } from '../src/grammar-lexer'

describe('the lexer', () => {
    it('should produce an EOF token from an empty string', () => {
        const l = new Lexer('')
        expect(l.next().type).toEqual(TokenType.EOF)
    })

    it('should recognise a symbol', () => {
        const l = new Lexer('aSymbol1')
        const t = l.next()
        expect(t.type).toEqual(TokenType.SYMBOL)
        expect(t.value).toEqual('aSymbol1')
        expect(l.next().type).toEqual(TokenType.EOF)
    })

    it('should recognise quoted text', () => {
        const l = new Lexer('\'something\\\'\\n\'')
        const t = l.next()
        expect(t.type).toEqual(TokenType.TEXT)
        expect(t.value).toEqual('something\'\n')
        expect(l.next().type).toEqual(TokenType.EOF)
    })

    it('should recognise a regex', () => {
        const l = new Lexer('/([a-z]+)\\/\\n/')
        const t = l.next()
        expect(t.type).toEqual(TokenType.REGEX)
        expect(t.value).toEqual('(?:[a-z]+)\\/\\n')
        expect(l.next().type).toEqual(TokenType.EOF)
    })

    it('should recognise a sequence of all token types', () => {
        const l = new Lexer('symbol <a thing> .= /([a-z]+)\\/\\n/\nand \'foo\\\'\' but \'bar\\n\'')
        const types = [], values = []
        for (;;) {
            const t = l.next()
            if (t.type == TokenType.EOF)
                break
            types.push(t.type)
            values.push(t.value)
        }
        expect(types).toEqual(
            [TokenType.SYMBOL, TokenType.DESCRIPTION, TokenType.CHAR, TokenType.CHAR,
                TokenType.REGEX, TokenType.SYMBOL, TokenType.TEXT, TokenType.SYMBOL,
                TokenType.TEXT]
        )
        expect(values).toEqual(
            ['symbol', 'a thing', '.', '=', '(?:[a-z]+)\\/\\n', 'and', 'foo\'', 'but', 'bar\n']
        )
    })

    it('should handle pushbacks properly', () => {
        const l = new Lexer('sym1 sym2')
        const s1 = l.next()
        const s2 = l.next()
        l.pushBack(s2)
        l.pushBack(s1)
        expect(l.next()).toEqual({type: TokenType.SYMBOL, value: 'sym1', position: 0})
        expect(l.next()).toEqual({type: TokenType.SYMBOL, value: 'sym2', position: 5})
        expect(l.next()).toEqual({type: TokenType.EOF, value: '', position: 9})
    })

    it('should allow peeking at the next token', () => {
        const l = new Lexer('sym1')
        expect(l.peek()).toEqual({type: TokenType.SYMBOL, value: 'sym1', position: 0})
        expect(l.next()).toEqual({type: TokenType.SYMBOL, value: 'sym1', position: 0})
    })

    it('should return EOF forever after an error has occurred', () => {
        const l = new Lexer('sym1\nsym2 sym3 sym4')
        l.next()
        let t = l.next()
        t = l.next()
        expect(l.peek()).toEqual({type: TokenType.SYMBOL, value: 'sym4', position: 15})
        l.error('hate this', t)
        expect(l.peek()).toEqual({type: TokenType.EOF, value: '', position: 19})
        expect(l.message()).toEqual('hate this, line 2:\n    sym2 sym3 sym4\n         ^')
    })
})
