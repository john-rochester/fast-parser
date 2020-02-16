import { createParser, replaceList, optionalItem } from '../src/index'

describe('the interface', () => {
    it('should return a valid parser', () => {
        expect(() => {
            let parser = createParser('main = \'a\'')
            parser.match('a')
            parser.match('b')
            parser = createParser('main = \'a\'', {replacements: {}})
            parser.match('a')
        }).not.toThrow()
    })

    it('should throw an exception for an invalid parser', () => {
        expect(() => {
            let parser = createParser('main = missing')
            parser.match('a')
        }).toThrow(/The symbol missing has no rule defined/)
    })

    it('should supply a working replaceList function', () => {
        expect(replaceList(['a', []])).toEqual(['a'])
        expect(replaceList(['a', ['b', 'c']])).toEqual(['a', 'b', 'c'])
    })

    it('should supply a working optionalItem function', () => {
        expect(optionalItem(['a'])).toBe('a')
        expect(optionalItem([['a']])).toEqual(['a'])
        expect(optionalItem([])).toBeUndefined()
    })
})
