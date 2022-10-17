import * as vscode from 'vscode';
import { Variables } from '../constants';

export class Session {
    private stateTrace: BackendTrace;
    private prevLine: number;

    constructor() {
        this.stateTrace = new Array<BackendTraceElem>();
        this.prevLine = -1;
    }

    /**
     * Returns a basic debug configuration
     * @param file the file to be debugged
     */
    getDebugConfiguration(file: vscode.Uri) {
        return {
            name: `Debugging File`,
            type: 'python',
            request: 'launch',
            program: file?.fsPath ?? `${file}`,
        };
    }

    /**
     * Starts debugging on given filename, but first sets a breakpoint on the start of the file to step through the file
     * @param filename the name of the main file that needs to be debugged for visualization later on
     */
    async startDebugging(filename: vscode.Uri | undefined): Promise<boolean> {
        if (!filename) { return !!filename; }
        await this.setBreakpoint(filename.fsPath);
        return await vscode.debug.startDebugging(undefined, this.getDebugConfiguration(filename));
    }

    public async generateBackendTrace() {
        while (vscode.debug.activeDebugSession) {
            const threads = (await vscode.debug.activeDebugSession.customRequest('threads')).threads as Thread[];
            // FIX: Thread is not available after exiting function without delay
            // maybe an await is missing!
            // await new Promise(resolve => setTimeout(resolve, 1));
            if (this.prevLine === -1) {
                await this.setPrevLine(threads[0].id, -1);
            } else {
                const traceElem = await this.getStateTraceElem(threads[0].id);
                if (traceElem) {
                    this.stateTrace.push(traceElem);
                    console.log(this.stateTrace);
                }
                await this.next(threads[0].id);
            }
        }
    }

    private async getStateTraceElem(threadId: number): Promise<BackendTraceElem> {
        // Extract line and scopeName from current StackFrame
        const stackFrames = await this.getStackFrames(threadId);
        const line = this.prevLine;
        const scopeName = stackFrames[0].name;
        await this.setPrevLine(undefined, line);
        
        // Extract only the variableReference for Variables
        const scopes = (await vscode.debug.activeDebugSession?.customRequest('scopes', { frameId: stackFrames[0].id })).scopes as Scope[];

        // Retrieve all variables in global Frame/Scope
        const globalVars = (await this.variablesRequest(scopes[scopes.length-1].variablesReference));
        // Get Globals (Variables, Functions or Objects) and convert them to StructedObject
        const globals = await Promise.all(globalVars.map(async v => this.getGlobals(v)));

        // Get Stack related objects and convert them to StackElem's
        if (stackFrames.length > 1) {

        }

        // Get Heap related objects and convert them to HeapElem's

        
        // Get everthing together to return a BackendTraceElem
        return {
            line: line,
            scopeName: scopeName,
            globals: globals,
            stack: await this.getFunctions(),
            heap: {},
        } as BackendTraceElem;
    }

    private async setPrevLine(id: number | undefined, line: number) {
        this.prevLine = id ? (await this.getStackFrames(id))[0].line : line;
    }

    private async getStackFrames(id: number): Promise<StackFrame[]> {
        return (await vscode.debug.activeDebugSession?.customRequest('stackTrace', { threadId: id })).stackFrames as StackFrame[]; 
    }

    private async getFunctions(): Promise<Array<StackElem>> {

        return [];
    }

    private async getGlobals(variable: Variable): Promise<StructuredObject | undefined> {
        switch (variable.name) {
            case Variables.SPECIAL:
                // The special variables have no need for now in the visualization
                return;
            case Variables.FUNCTION:
                // The function variables need one extra variables request to get the functions
                const functions = (await this.variablesRequest(variable.variablesReference));
                return {
                    name: '',
                    params: [],
                    returnValue: '',
                } as Fun;
            default:
                return {
                    name: '',
                    value: '',
                } as Var;
        }
    }

    // private async retrieveTrace() {
    //     while (vscode.debug.activeDebugSession) {
    //         const threads = (await vscode.debug.activeDebugSession.customRequest('threads')).threads as Thread[];
    //         await this.next(threads[0].id);
    //         // FIX: Thread is not available after exiting function without delay
    //         // maybe an await is missing!
    //         await new Promise(resolve => setTimeout(resolve, 1));
    //         const traceElem = await this.getTraceElem(threads[0].id);
    //         if (traceElem) {
    //             //this.stateTrace.add(traceElem);
    //             console.log(this.stateTrace);
    //         }
    //     }
    // }

    // private async getTraceElem(threadId: number): Promise<FrontendTraceElem | undefined> {
    //     const frames = (await vscode.debug.activeDebugSession?.customRequest('stackTrace', { threadId: threadId })).stackFrames as StackFrame[];
    //     const scopes = (await vscode.debug.activeDebugSession?.customRequest('scopes', { frameId: frames[0].id })).scopes as Scope[];
    //     const variables = await this.getVariables(frames[0].name, scopes[0].variablesReference);
    //     return this.getStatement(this.filterVariables(frames[0].id, variables));
    // }

    // private async getVariables(frame: string, varRef: number): Promise<Variable[]> {
    //     const variables = ((await vscode.debug.activeDebugSession?.customRequest(
    //         'variables', { variablesReference: varRef })).variables as Variable[]).filter(variable => !variable.name.includes('special variables'));
    //         return await Promise.all(variables.map(async variable => await this.convertToVariable(frame, variable))) as Variable[];
    // }

    // private async convertToVariable(frame: string, variable: Variable): Promise<Variable> {
    //     return {
    //         id: `${frame}_${variable.name}`,
    //         name: variable.name,
    //         value: variable.value,
    //         type: variable.type,
    //         variablesReference:
    //             typeof variable.variablesReference === 'number' && variable.variablesReference > 0 
    //                 ? await this.getVariables(frame, variable.variablesReference) : variable.variablesReference,
    //     } as Variable;
    // }

    // /**
    //  * Filters the array of current variables for new variables
    //  * @param variables the array that needs to be filtered
    //  * @return Returns the new filtered variable
    //  */
    // private filterVariables(frame: number, variables: Variable[]): Variable {
    //     const prevVars = this._prevVars.get(frame);
    //     const statement = variables.filter(elem => {
    //         // Checking if variable is even there
    //         const found = prevVars?.find(prev => prev.id === elem.id);
    //         // Checking what is difference in the variable
    //         if (found) {
    //             // If variableReference is not a number, the found object is a function variables object
    //             // With informations about the currently defined functions
    //             if (typeof elem.variablesReference !== 'number' && typeof found.variablesReference !== 'number') {
    //                 elem.variablesReference = elem.variablesReference.filter(
    //                     fun => !(!!(found.variablesReference as Variable[]).find(fun2 => JSON.stringify(fun) === JSON.stringify(fun2)))
    //                 );
    //                 return elem.variablesReference.length > 0;
    //             } else {
    //                 return !(JSON.stringify(found) === JSON.stringify(elem));
    //             }
    //         } else {
    //             return !(!!found);
    //         }
            
    //     });
    //     this._prevVars.set(frame, variables);
    //     return statement[0];
    // }

    // private getStatement(variable: Variable): FrontendTraceElem | undefined {
    //     if (!!variable) {
    //         if (variable.name.includes('(return)')) {
    //             return {
    //                 kind: 'returnCall',
    //                 value: variable.value
    //             } as ReturnCall;
    //         } else if (variable.name.includes('function variables')) {
    //             if (typeof variable.variablesReference !== 'number') {
    //                 if (variable.variablesReference.length > 0) {
    //                     return {
    //                         kind: 'varAssign',
    //                         varId: variable.variablesReference[0].id,
    //                         varName: variable.variablesReference[0].name,
    //                         value: variable.variablesReference[0].value
    //                     } as VarAssign;
    //                 }
    //             }
    //         } else {
    //             return {
    //                 kind: 'varAssign',
    //                 varId: variable.id,
    //                 varName: variable.name,
    //                 value: variable.value
    //             } as VarAssign;
    //         }
    //     }
    // }

    /**
     * Sets a breakpoint at the beginning of the file to be able to step through the code
     * @param filename the name of the main file
     */
    private async setBreakpoint(filename: string) {
        const location = new vscode.Location(
            vscode.Uri.file(filename),
            new vscode.Position(0, 0),
        );
        const sourceBreakpoint = new vscode.SourceBreakpoint(location);
        vscode.debug.addBreakpoints([sourceBreakpoint]);
    }
    
    private async next(threadId: number) {
        await vscode.debug.activeDebugSession?.customRequest('stepIn', { threadId: threadId });
    }

    private async variablesRequest(id: number): Promise<Variable[]> {
        return ((await vscode.debug.activeDebugSession?.customRequest(
            'variables', { variablesReference: id })).variables as Variable[]);
    }
}