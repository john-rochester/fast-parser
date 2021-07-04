Fast Parser
===========

The fast parser (fp) was inspired by [Ohm](https://github.com/harc/ohm), a rigorous implementation of [PEG](http://en.wikipedia.org/wiki/Parsing_expression_grammar) with a philosophy statement. Unfortunately, our initial performance tests of the first small grammar we wrote using ohm took almost 1000ms to parse a 160K source file. We felt this was unacceptably slow and so
this project was started. As a result, our equivalent parser took 19ms to parse the same file.

Several features were copied from ohm, namely separating actions from the grammar and having a simple method of choosing whether to automatically skip whitespace for a particular rule. The features ohm has that fp does not are numerous, but include fully parsing before applying semantic actions, grammar inheritance, and parameterised rules.

The major difference from ohm that dramatically affects the speed is that fp has both text and regular expressions as terminals.

Getting started
-

Install fp using npm
```shell
$ npm install fast-parser
```
or yarn
```shell
$ yarn add fast-parser
```

Here is a trivial example of how to use fp:
```javascript
let fp = require('fast-parser')

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
```

This will result in the output

```
got joe
```

Examples
-
The `examples` directory in the `fast-parser` module contains a couple of working example parsers.

API
-
Construct a parser with
```javascript
let parser = createParser(grammar, actions)
```
`grammar` is a string containing the grammar description (see the syntax in the next section), while `actions` is an optional set of functions to perform replacements on sequence values (indicated by `%name` in the grammar) or serve as predicates for additionally constraining matching (indicated by `:name`). More on these where the associated grammar syntax is explained.

`actions` must be of the form
```javascript
{
    replacements: {
        name: (args) => { return value }
    },
    predicates: {
        name: (value) => { (if !value.correct()) return 'what was expected' }
    }
}
```

The `actions` may be replaced without reconstructing the parser by calling
```javascript
parser.actions(newActions)
```

Now that you have the parser, you can use it to parse the string `source` with
```javascript
let match = parser.match(source)
```
`match` will be an object with two properties: `result` is the value of the first rule in the grammar, and `error` is non-`null` if there were syntax errors detected during parsing.

`error` will be of the form
```
expected identifier, line 10:
    let 25 = 17;
        ^
```
with a list of the type of syntax expected, the line number in the source, a copy of that line, and a pointer to the position in the line where the error occurred.

Specifying the Grammar
-

A grammar consists of a number of **rules**, each defining a **symbol**.
Every part of the grammar is matched against some part of the source string and produces a corresponding value. The first rule is used as the starting point for parsing, and its value is the one returned by the `match` method.

A rule looks like
```
symbol = choice
```

A symbol must start with a lowercase letter and can contain only letters and digits.

The right hand side, the rule body, consists of the following:

* **choice**  
  sequence1 | sequence2 | ...

  One or more sequences separated by `|`.

  The sequences are attempted in order, matching against the same position in the source. The value of the choice is the first that succeeds. If none succeed, the choice fails to match.
* **sequence**  
  item1 item2 ...

  One or more items.

  The items are attempted in order, matching against successive positions in the source. As soon as any item fails, the sequence fails. The value of the sequence is an array of all the values of the items (except this isn't always true, hang on).
* **item**  
  `'text'`  
  `/regexp/`  
  `symbol`  
  `(` choice `)`

  * text must literally match against the source.
  * a regular expression is matched against the source in the usual way. Note it will only match at the current position in the source.
  * text and regular expression values are a Token:
```
interface Token {
    text: string;
    pos: number;
}
```
  * a symbol matches and has the value of the corresponding rule.

  An item may be immediately followed by one of the following to indicate matching a variable number of times:
  * `*` (asterisk) matches 0 or more times.
  * `+` (plus) matches 1 or more times.
  * `?` (question mark) matches 0 or 1 times.
  The value of the item will be an array containing all the matches.

  An item may then also be followed by `:name`, which names a predicate from the actions object. That predicate will be called with the value of the item and an array of the previous values in the sequence. If it returns `null` the match will continue, otherwise it will return a string indicating a syntax error. The string `x` will be formatted into `expected x`, so choose the return value accordingly. Another possible return type is an object that implements the `PredicateFailure` interface which lets it have complete control over the error message.

Sequences naturally have a value which is an array of all the values of the *interesting* items in them.
Literal strings are uninteresting, but may be made interesting by preceding them with `!`, i.e. `!'name'` contributes a value to its sequence.
All other items are interesting but may be made uninteresting by preceding them with `-`, so `-expression` will not contribute a value.

To provide the necessary flexibility in what value the match can return, a sequence can have a `%name` appended to it, which will call the corresponding replacement function from the actions object with the sequence's array value, and use the return value of the function as the sequence's value. As a special case of generally desired behaviour, a sequence that contains only one interesting value and has no replacement function uses a special replacement function that extracts the first element in the array. This means that a rule like `expr = '(' expr ')'` usually does not need any replacement function specified.

A rule defined with `=` will skip whitespace around each item. If instead you define the rule with `.=` then whitespace will not be skipped. Whitespace may be redefined by placing something of the form `whitespace /regexp/` at the beginning of the grammar. By default it is the regular expression `/\s+/`.

Error messages can be improved by annotating a rule with a description like

```
rule <a thing> = ...
```

If the rule can't be matched, the error message in this case will be

```
expected a thing, line xxx:
```

Note that due to the fact that failures can cause the parser to backtrack to try other grammar choices, replacement functions can be called for sequences that do not end up in the final result returned by the match function. For this reason these functions should not have any side effects (other than ones intended to track the progress of parsing).
