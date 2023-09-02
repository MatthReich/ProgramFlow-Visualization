import * as path from 'path';
import * as cp from 'child_process';

import { runTests, resolveCliArgsFromVSCodeExecutablePath, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
		const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
		cp.spawnSync(
			cliPath,
			[...args,
				'--install-extension', 'vscjava.vscode-java-debug',
				'--install-extension', 'redhat.java',
				'--install-extension', 'ms-python.python',
				'--install-extension', 'ms-toolsai.jupyter'],
			{
				encoding: 'utf-8',
				stdio: 'inherit'
			}
		);

		// Download VS Code, unzip it and run the integration test
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: ["--password-store=basic"],
		});
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
