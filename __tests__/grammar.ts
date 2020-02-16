import { parse } from '../src/grammar-parser'

describe('the grammar', () => {
    it('should match a simple choice', () => {
        let res = parse('main .= !\'one\' | \'two\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('one')).toEqual({result: {text: 'one', pos: 0}, error: null})
        expect(res.grammar!.match('two')).toEqual({result: [], error: null})
        expect(res.grammar!.match('three').error).toMatch(/^expected 'one' or 'two', line 1/)
    })

    it('should match a simple sequence', () => {
        let res = parse('main .= !\'one\' !\'two\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('onetwo')).toEqual({result: [{text: 'one', pos: 0}, {text: 'two', pos: 3}], error: null})
        expect(res.grammar!.match('one two').error).toMatch(/^expected 'two'/)
    })

    it('should match a whitespace simple sequence', () => {
        let res = parse('main = !\'one\' !\'two\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('onetwo')).toEqual({result: [{text: 'one', pos: 0}, {text: 'two', pos: 3}], error: null})
        expect(res.grammar!.match('one    two')).toEqual({result: [{text: 'one', pos: 0}, {text: 'two', pos: 7}], error: null})
    })

    it('should match a regex', () => {
        let res = parse('name <a name> .= /[a-z]+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('joe')).toEqual({result: {text: 'joe', pos: 0}, error: null})
        expect(res.grammar!.match('123').error).toMatch(/^expected a name/)
    })

    it('should discard unneeded results', () => {
        let res = parse('main = \'thing\' -sep /[a-z]+/ sep = !\'=\' | !\'is\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('thing is blue')).toEqual({result: {text: 'blue', pos: 9}, error: null})
        // coverage
        res = parse('main = \'thing\' (\'=\' | \'is\') /[a-z]+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('thing = blue')).toEqual({result: [[], {text: 'blue', pos: 8}], error: null})
        res = parse('main = \'thing\' (!\'a\' !\'b\') /[a-z]+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('thing a b blue')).toEqual({result: [[{text: 'a', pos: 6}, {text: 'b', pos: 8}], {text: 'blue', pos: 10}], error: null})
    })

    it('should correctly handle predicates', () => {
        let res = parse('main = pal pal = word:palindrome word <a word> = /[a-z]+/')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.match('hello')).toEqual({result: {text: 'hello', pos: 0}, error: null})
            res.grammar.actions({
                predicates: {
                    palindrome: (word: any, _: any[]): string | null => {
                        if (word.text !== word.text.split('').reverse().join(''))
                            return 'a palindrome'
                        return null
                    }
                }
            })
            expect(res.grammar.match('hello').error).toMatch(/^expected a palindrome/)
            expect(res.grammar.match('232').error).toMatch(/^expected a word/)
            expect(res.grammar.match('ablewasiereisawelba').error).toBeNull()
        }
    })

    it('should correctly handle replacements', () => {
        let res = parse('main = number number <a number> = /[0-9]+/ %number')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.match('250')).toEqual({result: {text: '250', pos: 0}, error: null})
            res.grammar.actions({
                replacements: {
                    number: (vals: any[]): number => {
                        return parseInt(vals[0].text)
                    }
                }
            })
            expect(res.grammar.match('250')).toEqual({result: 250, error: null})
        }
    })

    it('should match wildcards', () => {
        let res = parse('main = number+ number = /[0-9]+/')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.match('').error).toMatch(/^expected \[0-9\]\+/)
            expect(res.grammar.match('250').result).toEqual([{text: '250', pos: 0}])
            expect(res.grammar.match('250 120').result).toEqual([{text: '250', pos: 0}, {text: '120', pos: 4}])
        }
        res = parse('main = number* number <a number> = /[0-9]+/')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.match('').result).toEqual([])
            expect(res.grammar.match('250').result).toEqual([{text: '250', pos: 0}])
            expect(res.grammar.match('250 120').result).toEqual([{text: '250', pos: 0}, {text: '120', pos: 4}])
        }
        res = parse('main = number? \'.\' number <a number> = /[0-9]+/')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.match('.').result).toEqual([])
            expect(res.grammar.match('250.').result).toEqual([{text: '250', pos: 0}])
            expect(res.grammar.match('250 120.').error).toMatch(/^expected '.'/)
        }
    })

    it('should report errors correctly', () => {
        let res = parse('main = name \'=\' | name \',\' | \':\' name <a name> = /[a-z]+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('?').error).toMatch(/^expected ':' or a name/)
        res = parse('main = name \'=\' name | \':\' name <a name> = /[a-z]+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.match('joe = 234').error).toMatch(/^expected a name/)
    })

    it('should handle custom error messages', () => {
        let res = parse('main = \'hello\' name name <a name> = /[a-z]+/')
        expect(res.error).toBeNull()
        let abc = res.grammar!.match('hello abc')
        expect(abc.error).toBeNull()
        expect(res.grammar!.error('hmm', abc.result.pos)).toEqual('hmm, line 1:\n    hello abc\n          ^')
    })

    it('should reject excess input past the match', () => {
        let res = parse('main = \'hello\' name name <a name> = /[a-z]+/')
        expect(res.error).toBeNull()
        let abc = res.grammar!.match('hello abc.')
        expect(abc.error).toMatch(/^expected end of input/)
    })
})
