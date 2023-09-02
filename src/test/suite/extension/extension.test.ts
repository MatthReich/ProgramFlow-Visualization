import * as assert from 'assert';
import { after, describe, it } from 'mocha';
import * as fs from 'fs';
import { TESTFILE_DIR_MIXED, TestExecutionHelper, executeExtension, loadTraceFromContext } from '../TestExecutionHelper';
import * as TestFileContents from './MixedTestFileContents';

const MAX_TEST_DURATION = 50000;

suite.only('The Extension', () => {
    after(() => {
        fs.rm(TESTFILE_DIR_MIXED, { recursive: true }, err => {
            if (err) { throw err; }
        });
    });

    describe("generating trace for a java file after python file", function () {
        this.timeout(MAX_TEST_DURATION);

        let resultPython: BackendTrace | undefined;
        let resultJava: BackendTrace | undefined;
        this.beforeAll(async function () {
            const testFilePython = await TestExecutionHelper.createTestFileWith(TESTFILE_DIR_MIXED, "some1PrimitiveVariables", "py", TestFileContents.SOME_PYTHON_PRIMITIVE_VARIABLES);
            const testFileJava = await TestExecutionHelper.createTestFileWith(TESTFILE_DIR_MIXED, "JavaPrimitiveVariableTest1Class", "java", TestFileContents.SOME_JAVA_PRIMITIVE_VARIABLES1);

            const contextPython = await executeExtension(testFilePython);
            resultPython = await loadTraceFromContext(testFilePython, contextPython);

            const contextJava = await executeExtension(testFileJava);
            resultJava = await loadTraceFromContext(testFileJava, contextJava);
        });

        it("should create a defined Backend Trace for python", () => {
            assert.ok(resultPython);
        });

        it("should create a defined Backend Trace for java", () => {
            assert.ok(resultJava);
        });
    });

    describe("generating trace for a python file after java file", function () {
        this.timeout(MAX_TEST_DURATION);

        let resultPython: BackendTrace | undefined;
        let resultJava: BackendTrace | undefined;
        this.beforeAll(async function () {
            const testFilePython = await TestExecutionHelper.createTestFileWith(TESTFILE_DIR_MIXED, "some2PrimitiveVariables", "py", TestFileContents.SOME_PYTHON_PRIMITIVE_VARIABLES);
            const testFileJava = await TestExecutionHelper.createTestFileWith(TESTFILE_DIR_MIXED, "JavaPrimitiveVariableTest2Class", "java", TestFileContents.SOME_JAVA_PRIMITIVE_VARIABLES2);

            const contextJava = await executeExtension(testFileJava);
            resultJava = await loadTraceFromContext(testFileJava, contextJava);

            const contextPython = await executeExtension(testFilePython);
            resultPython = await loadTraceFromContext(testFilePython, contextPython);
        });

        it("should create a defined Backend Trace for java", () => {
            assert.ok(resultJava);
        });

        it("should create a defined Backend Trace for python", () => {
            assert.ok(resultPython);
        });
    });
});