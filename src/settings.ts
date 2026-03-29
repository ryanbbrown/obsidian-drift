import {App, PluginSettingTab, Setting} from "obsidian";
import type ExternalDiffPlugin from "./main";

export interface ExternalDiffSettings {
	enabled: boolean;
}

export const DEFAULT_SETTINGS: ExternalDiffSettings = {
	enabled: true,
};

export class ExternalDiffSettingTab extends PluginSettingTab {
	plugin: ExternalDiffPlugin;

	constructor(app: App, plugin: ExternalDiffPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable external change detection")
			.setDesc("Automatically detect when external tools modify Markdown files")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}));
	}
}
