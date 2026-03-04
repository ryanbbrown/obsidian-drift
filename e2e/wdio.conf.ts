/// <reference types="wdio-electron-service" />

import * as fs from "node:fs";
import ObsidianApp from "./test/pageobjects/ObsidianApp";

const debug = process.env.DEBUG;
const ONE_DAY = 24 * 60 * 60 * 1000;

export const config: WebdriverIO.Config = {
    runner: 'local',
    tsConfigPath: './tsconfig.json',
    specs: [
        './test/specs/**/*.ts'
    ],
    exclude: [],
    maxInstances: 4,
    capabilities: [{
        browserName: 'electron',
        browserVersion: '37.10.2',
        'wdio:electronServiceOptions': {
            appBinaryPath: '/Applications/Obsidian.app/Contents/MacOS/Obsidian',
            appArgs: []
        }
    }],
    logLevel: 'warn',
    bail: 0,
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: ['electron'],
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: debug ? ONE_DAY : 60000,
    },
    onPrepare: () => {
        // Clean up leftover vault dirs from previous runs
        for (const entry of fs.readdirSync('.')) {
            if (entry.startsWith('.e2e_test_vault_')) {
                fs.rmSync(entry, { force: true, recursive: true });
            }
        }
    },
    beforeSuite: async () => {
        await ObsidianApp.removeE2eTestVaultIfExists();
        await ObsidianApp.createAndOpenFreshVault();
        await ObsidianApp.activateTargetPluginForTesting();
    },
    afterSuite: async () => {
        await ObsidianApp.removeE2eTestVaultIfExists();
    },
}
