import stringify from 'stringify-json';
import { ExtensionContext, Uri, debug, window } from 'vscode';
import * as ErrorMessages from '../ErrorMessages';
import { Variables } from '../constants';
import { getConfigValue, setContextState } from '../utils';
import { getPythonDebugConfigurationFor, registerDebugAdapterTracker } from './DebugAdapterTracker';
import * as FileHandler from './FileHandler';
import Completer from '../Completer';

export class TraceGenerator {
    backendTrace: BackendTrace = [];
    file: Uri;
    private fileContent: string;
    private language: SupportedLanguages;
    private context: ExtensionContext;
    private hash: string;
    traceIsFinished: boolean = false;

    constructor(file: Uri, fileContent: string, context: ExtensionContext, hash: string) {
        this.file = file;
        this.fileContent = fileContent;
        this.context = context;
        this.hash = hash;
        this.language = 'python'; // TODO language as argument
    }

    async generateTrace(): Promise<BackendTrace | undefined> {
        // PRE QUERIES
        const tempFile = await FileHandler.duplicateFileAndExtendWithPass(this.file, this.fileContent);
        if (!tempFile) {
            await showSpecificErrorMessage(ErrorMessages.ERR_TMP_FILE);
            return;
        }

        // INIT DEBUGGER
        const completer = new Completer<[number | undefined, string | undefined]>();
        const debugAdapterTracker = registerDebugAdapterTracker(this, completer);
        await initializeAdapterForActiveDebugSession(this.language);

        // DEBUGGING
        const debugSuccess = await debug.startDebugging(undefined, getPythonDebugConfigurationFor(tempFile));
        if (!debugSuccess) {
            await showSpecificErrorMessage(ErrorMessages.ERR_DEBUG_SESSION);
            return;
        }

        await completer.promise; // TODO use Exit Codes

        // FINISHING
        debugAdapterTracker.dispose();
        await FileHandler.deleteFile(tempFile);
        if (getConfigValue<boolean>('outputBackendTrace')) {
            await FileHandler.createBackendTraceOutput(this.backendTrace, this.file);
        }
        await setContextState(
            this.context,
            Variables.HASH_KEY + this.file.fsPath,
            this.hash
        );
        await setContextState(
            this.context,
            Variables.TRACE_KEY + this.file.fsPath,
            stringify(this.backendTrace)
        );

        return this.backendTrace;
    }
}

async function showSpecificErrorMessage(message: string) {
    window.showErrorMessage(message);
}

async function initializeAdapterForActiveDebugSession(language: SupportedLanguages): Promise<Capabilities> {
    return await debug.activeDebugSession?.customRequest('initialize', {
        adapterID: language.toString,
    });
}