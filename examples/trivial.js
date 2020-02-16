let fp = require('..')

let grammar = `
program = 'name' name

name = /[a-z]+/          %abc
`

let actions = {
    replacements: {
        abc: (item) => item[0].text
    }
}

let parser = fp.createParser(grammar, actions)

let match = parser.match('name joe')
if (match.error)
    console.log(match.error)
else
    console.log('got', match.result)
