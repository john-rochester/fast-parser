// import { createParser } from 'fast-parser'
import { createParser, replaceList, optionalItem, Token } from '..'
import { readFileSync } from 'fs'
// import { inspect } from 'util'
import * as ast from './calc-ast'

/* eslint-disable no-useless-escape */
/* no-useless-escape incorrectly reports the \. in the rule for number */
let grammar = `
program = pstmt+

pstmt =
      func
    | stmt

stmt <a statement> =
      'if' ifstmt
    | 'while' whilestmt
    | 'return' exprlist                       %returnstmt
    | identlist '=' expr                      %assignment
    | expr                                    %output

func =
      !'define' ident '(' identlist? ')' stmt+ 'end'    %func

ifstmt =
      expr 'then' stmt+ ('else' stmt+)? 'fi'   %ifstmt

whilestmt =
      expr 'do' stmt+ 'od'                    %whilestmt

identlist =
      ident (',' ident)*                      %list

ident <an identifier> =
      /[a-zA-Z_][a-zA-Z_0-9]*/:nonkw

expr <an expression> =
      rexpr (boolop rexpr)*                   %binop

rexpr =
      mexpr (relop mexpr)*                    %binop

mexpr =
      aexpr (mulop aexpr)*                    %binop

aexpr =
      factor (addop factor)*                  %binop

factor =
      number                                  %constant
    | string                                  %constant
    | ident '(' exprlist? ')'                 %call
    | ident                                   %var
    | '(' expr ')'
    | !'-' factor                             %unop
    | !'!' factor                             %unop

exprlist =
      expr (',' expr)*                        %list

number <a number> =
      /[0-9]+(\.[0-9]+)?/                     %num

string <a string> =
      /'([^']|'')*'/                          %str

boolop <an operator> =
      !'and' | !'or'

relop <an operator> =
      !'<' | !'>' | !'<=' | !'>=' | !'!=' | !'=='

mulop <an operator> =
      !'*' | !'/'

addop <an operator> =
      !'+' | !'-'
`
/* eslint-enable no-useless-escape */

let kw: {[ident: string]: boolean} = {
    'define': true, 'end': true, 'if': true, 'then': true, 'else': true,
    'fi': true, 'while': true, 'do': true, 'od': true, 'return': true,
    'and': true, 'or': true
}

let actions = {
    predicates: {
        nonkw: (ident: Token): string | null =>
            kw[ident.text] ? 'identifier, found keyword' : null
    },
    replacements: {
        func:
            (item: any[]) => {
                let arglist = optionalList(item[2]).map((x: Token) => x.text)
                return new ast.FunctionDef(item[1].text, arglist, item[3], item[0].pos)
            },
        ifstmt:
            (item: any[]) =>
                new ast.IfStmt(item[0], item[1], optionalItem(item[2])),
        whilestmt:
            (item: any[]) => new ast.WhileStmt(item[0], item[1]),
        returnstmt:
            (item: any[]) => new ast.ReturnStmt(item[0]),
        assignment:
            (item: any[]) => {
                let identlist = item[0].map((x: Token) => x.text)
                return new ast.Assignment(identlist, item[1], item[0][0].pos)
            },
        output:
            (item: any[]) => new ast.Output(item[0]),
        list:
            replaceList,
        binop:
            (item: any[]) => {
                let lhs = item[0]
                for (let i of item[1])
                    lhs = new ast.BinaryOp(i[0].text, lhs, i[1])
                return lhs
            },
        var:
            (item: any[]) => new ast.Variable(item[0].text, item[0].pos),
        constant:
            (item: any[]) => new ast.Constant(item[0]),
        call:
            (item: any[]) => new ast.FunctionCall(item[0].text, optionalList(item[1]), item[0].pos),
        unop:
            (item: any[]) => new ast.UnaryOp(item[0].text, item[1]),
        num:
            (item: any[]) => +item[0].text,
        str:
            (item: any[]) => {
                let s = item[0].text
                return s.substring(1, s.length - 1).replace(/''/g, '\'')
            }
    }
}

function optionalList(item: any[]): any[] {
    return item.length ? item[0] : item
}

let stmts : ast.Statement[] = []

let parser = createParser(grammar, actions)
let src = readFileSync(0, 'utf8')
let { result, error } = parser.match(src)

if (error) {
    console.log(error)
} else {
    for (let r of result) {
        if (r instanceof ast.FunctionDef)
            ast.FunctionDef.store(r)
        else
            stmts.push(r)
    }
    try {
        ast.executeBlock(stmts, {})
    } catch (e) {
        if (e instanceof ast.ExecutionError) {
            console.log(parser.error(e.message, e.pos))
        } else {
            throw e
        }
    }
}
