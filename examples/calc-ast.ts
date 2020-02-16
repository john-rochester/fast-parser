export class ExecutionError {
    constructor(public message: string, public pos: number) {
    }
}

type Variables = {
    [name: string]: any
}

export interface Statement {
    execute(vars: Variables): any
}

interface Expression {
    evaluate(vars: Variables): any
}

export function executeBlock(stmts: Statement[], vars: Variables): any {
    for (let stmt of stmts) {
        let rv = stmt.execute(vars)
        if (rv)
            return rv
    }
    return undefined
}

export class FunctionDef {
    static table: {[name: string]: FunctionDef} = {}

    constructor(private name: string, private argnames: string[], private body: Statement[], private pos: number) {
    }

    static store(f: FunctionDef) {
        if (FunctionDef.table[f.name])
            throw new ExecutionError('duplicate function ' + f.name, f.pos)
        FunctionDef.table[f.name] = f
    }

    argCount() {
        return this.argnames.length
    }

    performCall(args: Expression[], vars: Variables): any {
        let cvars: Variables = {}
        for (let i = 0; i < this.argnames.length; i++)
            cvars[this.argnames[i]] = args[i].evaluate(vars)
        return executeBlock(this.body, cvars)
    }
}

export class IfStmt implements Statement {
    constructor(private expr: Expression, private thenPart: Statement[], private elsePart: Statement[]) {
    }

    execute(vars: Variables) {
        if (this.expr.evaluate(vars))
            return executeBlock(this.thenPart, vars)
        else if (this.elsePart)
            return executeBlock(this.elsePart, vars)
    }
}

export class WhileStmt implements Statement {
    constructor(private expr: Expression, private body: Statement[]) {
    }

    execute(vars: Variables) {
        while (this.expr.evaluate(vars)) {
            let rv = executeBlock(this.body, vars)
            if (rv)
                return rv
        }
        return undefined
    }
}

export class ReturnStmt implements Statement {
    constructor(private values: Expression[]) {
    }

    execute(vars: Variables) {
        let rv = this.values.map((e) => e.evaluate(vars))
        if (rv.length == 1)
            return rv[0]
        return rv
    }
}

export class Assignment implements Statement {
    constructor(private names: string[], private expr: Expression, private pos: number) {
    }

    execute(vars: Variables) {
        let value = this.expr.evaluate(vars)
        if (value instanceof Array) {
            if (this.names.length != value.length)
                throw new ExecutionError('assigning to ' + this.names.length + ' variables, but have ' + value.length + ' values', this.pos)
            for (let i = 0; i < value.length; i++)
                vars[this.names[i]] = value[i]
        } else {
            if (this.names.length != 1)
                throw new ExecutionError('assigning to ' + this.names.length + ' variables, but have 1 value', this.pos)
            vars[this.names[0]] = value
        }
        return undefined
    }
}

export class Output implements Statement {
    constructor(private expr: Expression) {
    }

    execute(vars: Variables) {
        console.log(this.expr.evaluate(vars))
        return undefined
    }
}

type BinaryFn = (lhs: any, rhs: any) => any

export class BinaryOp implements Expression {

    static fnFor: {[op: string]: BinaryFn} = {
        '+': (a, b) => a + b,
        '-': (a, b) => a - b,
        '*': (a, b) => a * b,
        '/': (a, b) => a / b,
        '<': (a, b) => a < b,
        '>': (a, b) => a > b,
        '<=': (a, b) => a <= b,
        '>=': (a, b) => a >= b,
        '==': (a, b) => a == b,
        '!=': (a, b) => a != b
    }

    private fn: BinaryFn

    constructor(op: string, private lhs: Expression, private rhs: Expression) {
        this.fn = BinaryOp.fnFor[op]
    }

    evaluate(vars: Variables) {
        return this.fn(this.lhs.evaluate(vars), this.rhs.evaluate(vars))
    }
}

type UnaryFn = (arg: any) => any

export class UnaryOp implements Expression {
    static fnFor: {[op: string]: UnaryFn} = {
        '-': (a) => -a,
        '!': (a) => !a
    }

    private fn: UnaryFn

    constructor(op: string, private arg: Expression) {
        this.fn = UnaryOp.fnFor[op]
    }

    evaluate(vars: Variables) {
        return this.fn(this.arg.evaluate(vars))
    }
}

export class Constant implements Expression {
    constructor(private value: any) {
    }

    evaluate(_: Variables) {
        return this.value
    }
}

export class Variable implements Expression {
    constructor(private name: string, private pos: number) {
    }

    evaluate(vars: Variables) {
        if (!(this.name in vars))
            throw new ExecutionError('undefined variable', this.pos)
        return vars[this.name]
    }
}

export class FunctionCall implements Expression {
    constructor(private name: string, private args: Expression[], private pos: number) {
    }

    evaluate(vars: Variables) {
        let f = FunctionDef.table[this.name]
        if (!f)
            throw new ExecutionError('unknown function', this.pos)
        if (f.argCount() != this.args.length)
            throw new ExecutionError('incorrect argument count', this.pos)
        return f.performCall(this.args, vars)
    }
}
