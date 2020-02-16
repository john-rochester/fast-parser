import { parse } from '../src/grammar-parser'

describe('the grammar parser', () => {
    it('should accept a production with a single text matcher', () => {
        let res = parse('main .= !\'hello\'')
        expect(res.error).toBeNull()
        if (res.grammar) {
            expect(res.grammar.dump()).toEqual('(grammar (rule main (seq (item keep (text \'hello\')))))')
        }
    })

    it('should accept a production with two text matchers', () => {
        let res = parse('main .= !\'hello\' !\'there\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item keep (text \'hello\')) (item keep (text \'there\')))))')
    })

    it('should accept a rule with two productions', () => {
        let res = parse('main .= !\'hello\' | !\'there\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (choice (seq (item keep (text \'hello\'))) (seq (item keep (text \'there\'))))))')
    })

    it('should accept a grammar with two rules', () => {
        let res = parse('main .= \'hello\' sub .= \'there\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item (text \'hello\')))) (rule sub (seq (item (text \'there\')))))')
    })

    it('should accept a grammar with symbol matchers', () => {
        let res = parse('main .= !\'hello\' -sub sub .= !\'there\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item keep (text \'hello\')) (item skip (symbol sub)))) (rule sub (seq (item keep (text \'there\')))))')
    })

    it('should accept a grammar with regex matchers', () => {
        let res = parse('main .= /[a-z][a-zA-Z0-9]*/ sub sub .= !\'---\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item (regex /[a-z][a-zA-Z0-9]*/y)) (item (symbol sub)))) (rule sub (seq (item keep (text \'---\')))))')
    })

    it('should accept a grammar with descriptions', () => {
        let res = parse('main = name \'lives\' name <a name> = \'sue\' | \'bob\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item (symbol name)) (item (text \'lives\')))) (rule name (err \'a name\') (choice (seq (item (text \'sue\'))) (seq (item (text \'bob\'))))))')
    })

    it('should accept a grammar with replacements', () => {
        let res = parse('main .= /[a-z][a-zA-Z0-9]*/ %test')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item (regex /[a-z][a-zA-Z0-9]*/y)))))')
    })

    it('should accept a grammar with predicates', () => {
        let res = parse('main .= /[a-z][a-zA-Z0-9]*/:foo')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toEqual('(grammar (rule main (seq (item (predicate foo (regex /[a-z][a-zA-Z0-9]*/y))))))')
    })

    it('should accept a grammar with wildcards', () => {
        let res = parse('main = \'<\' part* \'>\'\npart = name \'=\' value\nname = /[a-z]+/\nvalue = /\\d+/')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toBe('(grammar (rule main (seq (item (text \'<\')) (item (star (symbol part))) (item (text \'>\')))) (rule part (seq (item (symbol name)) (item (text \'=\')) (item (symbol value)))) (rule name (seq (item (regex /[a-z]+/y)))) (rule value (seq (item (regex /\\d+/y)))))')
        res = parse('main = part+ part? part = \'hi\'')
        expect(res.error).toBeNull()
        expect(res.grammar!.dump()).toBe('(grammar (rule main (seq (item (plus (symbol part))) (item (maybe (symbol part))))) (rule part (seq (item (text \'hi\')))))')
    })

    it('should accept a grammar with a whitespace descriptor', () => {
        let res = parse('whitespace /[ \t]+/ main = \'hello\'')
        expect(res.error).toBeNull()
    })

    it('should reject a grammar with undefined rules', () => {
        let res = parse('main = \'hello\' | sub1+  sub2 = main \'y\'')
        expect(res.error).toBe('The symbol sub1 has no rule defined')
        res = parse('main = \'hello\' | sub1+ sub3 sub2 = main \'y\'')
        expect(res.error).toBe('The symbols sub1 and sub3 have no rules defined')
    })

    it('should reject a grammar with left recursion', () => {
        let res = parse('main = \'hello\' | sub1  sub1 = \'what\'* sub2  sub2 = main \'y\'')
        expect(res.error).toMatch(/^The rules for main, sub1, and sub2 contain left-recursion/)
    })

    it('should reject a second grammar with left recursion', () => {
        let res = parse('main = sub1 h?  sub1 = main h = \'hello\'')
        expect(res.error).toMatch(/^The rules for main and sub1 contain left-recursion/)
    })

    it('should reject a third grammar with left recursion', () => {
        let res = parse('main = (main \'+\')* sub  sub = /\\d+/')
        expect(res.error).toMatch(/^The rule for main contains left-recursion/)
    })

    it('should reject a grammar with wildcard empty items', () => {
        let res = parse('main = \'hello\' sub? \'there\'   sub = /[a-z]*/ | \'x\'')
        expect(res.error).toMatch(/^The rule for main contains a wildcard \(\*, \+, or \?\) of something that can be empty/)
        res = parse('main = \'hello\' sub? sub2 \'there\'   sub = /[a-z]*/ sub2 = sub+ | \'x\'')
        expect(res.error).toMatch(/^The rules for main and sub2 contain a wildcard \(\*, \+, or \?\) of something that can be empty/)
    })

    it('should reject a grammar without matching ()s', () => {
        let res = parse('main = (\'hello\' \'there\'')
        expect(res.error).toMatch(/^expected '\)'/)
    })

    it('should reject a grammar with a malformed predicate', () => {
        let res = parse('main = sym:\'hello\'')
        expect(res.error).toMatch(/^expected predicate name/)
    })

    it('should reject a grammar with a malformed replacement', () => {
        let res = parse('main = sym %\'hello\'')
        expect(res.error).toMatch(/^expected replacement name/)
    })

    it('should reject a grammar with empty sequences', () => {
        let res = parse('main = sym sym =')
        expect(res.error).toMatch(/^empty sequence/)
    })

    it('should reject a grammar with malformed rules', () => {
        let res = parse('\'hello\' = sym')
        expect(res.error).toMatch(/^expected symbol/)
        res = parse('main sym')
        expect(res.error).toMatch(/^expected '='/)
    })

    it('should reject a grammar with malformed whitespace descriptor', () => {
        let res = parse('whitespace \' \'')
        expect(res.error).toMatch(/^expected regular expression/)
    })

    it('should reject an empty grammar', () => {
        let res = parse('')
        expect(res.error).toMatch(/^empty grammar/)
    })

    it('should accept a complex recursive grammar', () => {
        let res = parse('a = b+ b = c (\'+\' c)* c = \'(\' b \')\' | d d = /[a-z]+/')
        expect(res.error).toBeNull()
    })
})
