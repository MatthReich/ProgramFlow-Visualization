import * as vscode from 'vscode';
import * as VariableMapper from "../VariableMapper";
import { scopesRequest, variablesRequest, createStackElemFrom, BasicTypes } from "../BackendSession";
import { ILanguageBackendSession } from '../ILanguageBackendSession';
import { linesWithClass } from '../TraceGenerator';

export const pythonBackendSession: ILanguageBackendSession = {
    createStackAndHeap: async (
        session: vscode.DebugSession,
        stackFrames: Array<StackFrame>
    ): Promise<[Array<StackElem>, Map<Address, HeapValue>, DebuggerStep]> => {
        let stack = Array<StackElem>();
        let heap = new Map<Address, HeapValue>();
        let debuggerStep: DebuggerStep = 'stepIn';

        for (const stackFrame of stackFrames) {
            const scopes = await scopesRequest(session, stackFrame.id);
            const [locals, globals] = [scopes[0], scopes[1]];
            const localsVariables = (await variablesRequest(session, locals.variablesReference)).filter((variable) => !variable.name.includes('(return)')); // FIXME return wieder dazu als fehlender Schritt?!

            if (linesWithClass.includes(stackFrame.line)) {
                debuggerStep = 'next';
            }

            const primitiveVariables = localsVariables.filter((variable) =>
                variable.variablesReference === 0
            );

            const heapVariablesWithoutSpecial = localsVariables.filter(
                (variable) =>
                    variable.variablesReference > 0 &&
                    variable.name !== 'class variables' &&
                    variable.name !== 'function variables'
            );

            const specialVariables = (
                await Promise.all(
                    localsVariables
                        .filter(
                            (variable) =>
                                variable.variablesReference > 0 &&
                                (variable.name === 'class variables' || variable.name === 'function variables')
                        ).map(async (variable) => {
                            return await variablesRequest(session, variable.variablesReference);
                        })
                )
            ).flat();

            const heapVariables = [...heapVariablesWithoutSpecial, ...specialVariables];
            const allVariables = [...primitiveVariables, ...heapVariables];

            stack.push(createStackElemFrom(stackFrame, allVariables));

            let heapVars = new Map<Address, HeapValue>();

            heap = heapVariables.length > 0
                ? new Map<Address, HeapValue>([...heap, ...(await getHeapOf(heapVariables, heap, heapVars, session))])
                : heap;

            heapVars.forEach((value, key) => {
                if (!heap.has(key)) {
                    heap.set(key, value);
                }
            });
        }
        return [stack, heap, debuggerStep];
    }
};

async function getHeapOf(variables: Variable[], heap: Map<number, HeapValue>, heapVars: Map<number, HeapValue>, session: vscode.DebugSession): Promise<Map<Address, HeapValue>> {
    return await variables
        .filter((v) => v.variablesReference > 0)
        .reduce(async (acc, variable) => {
            if (!variable) { return acc; }
            const result = await createHeapVariable(variable, session);
            if (!result) { return acc; }
            heapVars = result[1].reduce((acc, variable) => {
                return acc.set(variable.ref, { type: variable.type, name: variable.name, value: variable.value } as HeapValue);
            }, heapVars);
            return (await acc).set(variable.variablesReference, result[0]);
        }, Promise.resolve(heap));
}

async function createHeapVariable(variable: Variable, session: vscode.DebugSession, referenceMap: Map<number, Variable[]> = new Map()) {
    let rawHeapValues = new Array<RawHeapValue>();
    let nameOfInstance: string | undefined;
    if (!Object.values(BasicTypes).includes(variable.type)) {
        nameOfInstance = variable.type;
        variable.type = 'instance';
    }
    const isClass = variable.type === 'type';
    const isClassOrDictOrInstance = isClass || variable.type === 'dict' || nameOfInstance;
    let list = isClassOrDictOrInstance ? new Map<string, Value>() : new Array<Value>();
    let listForDepth = await variablesRequest(session, variable.variablesReference);
    referenceMap.set(variable.variablesReference, listForDepth);

    do {
        const [actualVariable, ...remainingVariables] = listForDepth;
        listForDepth = remainingVariables;

        if (!actualVariable) {
            continue;
        }
        const variablesReference = actualVariable.variablesReference;

        if (variablesReference) {
            const elem = await createInnerHeapVariable(actualVariable, session, referenceMap);
            rawHeapValues = rawHeapValues.concat(elem);
        }

        isClassOrDictOrInstance
            ? (list as Map<string, Value>).set(actualVariable.name, VariableMapper.toValue(actualVariable))
            : (list as Array<Value>).push(VariableMapper.toValue(actualVariable));
    } while (listForDepth.length > 0);

    const heapValue = variable.type === 'instance'
        ? {
            type: isClass ? 'class' : variable.type,
            name: nameOfInstance, // TODO maybe geht auch dauerhaft so
            value: isClass ? { className: variable.name, properties: list } : list,
        }
        : {
            type: isClass ? 'class' : variable.type,
            value: isClass ? { className: variable.name, properties: list } : list,
        };

    return [
        heapValue,
        rawHeapValues,
    ] as [HeapValue, Array<RawHeapValue>];
}

async function createInnerHeapVariable(variable: Variable, session: vscode.DebugSession, referenceMap: Map<number, Variable[]>, visitedSet: Set<number> = new Set<number>): Promise<RawHeapValue[]> {
    let rawHeapValues = new Array<RawHeapValue>();
    let heapValue: HeapV | undefined = undefined;
    let listForDepth: Variable[];
    let nameOfInstance: string | undefined;
    if (referenceMap.has(variable.variablesReference)) {
        listForDepth = referenceMap.get(variable.variablesReference)!;
    } else {
        listForDepth = await variablesRequest(session, variable.variablesReference);
        referenceMap.set(variable.variablesReference, listForDepth);
    }

    if (!Object.values(BasicTypes).includes(variable.type)) {
        nameOfInstance = variable.type;
        variable.type = 'instance';
    }

    do {
        const [actualVariable, ...remainingVariables] = listForDepth;
        const variablesReference = actualVariable.variablesReference;
        if (!visitedSet.has(variablesReference)) {
            visitedSet.add(actualVariable.variablesReference);

            if (variablesReference) {
                const elem = await createInnerHeapVariable(actualVariable, session, referenceMap, visitedSet);
                rawHeapValues = rawHeapValues.concat(elem);
            }
        }

        heapValue = getUpdateForHeapV(variable, actualVariable, heapValue, VariableMapper.toValue(actualVariable));

        listForDepth = remainingVariables;
    } while (listForDepth.length > 0);

    return rawHeapValues.concat({
        ref: variable.variablesReference,
        type: variable.type,
        name: nameOfInstance,
        value: heapValue
    } as RawHeapValue);
}

function getUpdateForHeapV(variable: Variable, actualVariable: Variable, actualHeapV: HeapV | undefined, value: Value): HeapV {
    switch (variable.type) {
        case 'list':
        case 'tuple':
        case 'set':
            return actualHeapV
                ? (actualHeapV as Array<Value>).concat(value)
                : Array.of(value);
        case 'dict':
            return actualHeapV
                ? (actualHeapV as Map<any, Value>).set(value.value /* FIXME if ie a tuple is key its not mapped */, value)
                : new Map<any, Value>().set(value.value /* FIXME if ie a tuple is key its not mapped */, value);
        case 'class':
            return { className: '', properties: new Map<string, Value>() };
        case 'type':
            return actualHeapV
                ? (actualHeapV as Map<string, Value>).set(variable.name, value)
                : new Map<string, Value>().set(variable.name, value);
        case 'instance':
            return actualHeapV
                ? (actualHeapV as Map<string, Value>).set(actualVariable.name, value)
                : new Map<string, Value>().set(actualVariable.name, value);
        default:
            return Array.of(value);
    }
}
