//let fp = require('fast-parser')
let fp = require('..')
let fs = require('fs')
let util = require('util')

let grammar = `
csv .= (row '\n')+

row .= column (',' column)*          %row

column .= '"' quotedText '"'
        | bareText

quotedText .= /([^"]|"")*/           %dequote

bareText .= /[^,\n]*/                %text
`

let actions = {
    replacements: {
	dequote: (value) => value[0].text.replace(/""/g, '"'),
	row: (value) => {
	    let r = [value[0]]
	    if (value[1] !== undefined)
		r = r.concat(value[1])
	    return r
	},
	text: (value) => value[0].text
    }
}

let parser = fp.createParser(grammar, actions)
let csv = fs.readFileSync(0, 'utf8')
let { result, error } = parser.match(csv)
if (error)
    console.log(error)
else
    console.log(util.inspect(result))
