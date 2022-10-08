// Event Types for the Frontend
type EventTrace = Set<EventTraceElem>;
type EventTraceElem = VarAssign | FunCall | ReturnCall;
type VarAssign = {
    kind: 'varAssign',
    varId: string,
    varName: string,
    value: Value
};
type FunCall = {
    kind: 'funCall'
    funName: string,
    args: Array<Value>
};
type ReturnCall = {
    kind: 'returnCall'
    value: Value
};
type Value = string | number | boolean;

// State Types for the Backend
type StateTrace = Array<StateTraceElem>;
type StateTraceElem = {
    // Line of the executed code (could be useful for visualization)
    line: number,
    // Info for the frontend converter
    event: string,
    // Current Scope/Function/Frame
    scopeName: string,
    // All objects and functions in the global scope
    globals: Array<DVar | Func | Structured>,
    // All object and functions in the local scope (probably in a function)
    locals: Array<DVar | Func | Structured>,
};

type DVar = {
    name: string,
    value: string,
};

type Func = {
    name: string,
    // Vars are either the parameters of a function
    params: Array<DVar>,
    returnValue: string
};

type Structured = {
    name: string,
    vars: Array<DVar>,
};

/**
 * 
 * 
 * 
 * "line": 1,
      "event": "step_line",
      "func_name": "<module>",
      "globals": {},
      "ordered_globals": [],
      "stack_to_render": [],
      "heap": {},
      "stdout": ""

 */

// Debug Adapter Datatypes
type Thread = { id: number, name: string };
type StackFrame = {
    column: number, 
    id: number, 
    line: number, 
    name: string 
};
type Scope = {
    name: string,
    variablesReference: number,
};
type Variable = {
    id: string,
    name: string,
    value:string,
    type: string,
    variablesReference: number | Variable[],
};