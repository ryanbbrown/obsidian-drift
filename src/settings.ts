import {App, PluginSettingTab, Setting} from "obsidian";
import type ExternalDiffPlugin from "./main";

export interface ExternalDiffSettings {
	enabled: boolean;
	wordWrap: boolean;
	wordLevelHighlighting: boolean;
	contrastChangedText: boolean;
}

export const DEFAULT_SETTINGS: ExternalDiffSettings = {
	enabled: true,
	wordWrap: false,
	wordLevelHighlighting: false,
	contrastChangedText: false,
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

		new Setting(containerEl)
			.setName("Word wrap")
			.setDesc("Wrap long lines in both sides of the diff view")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wordWrap)
				.onChange(async (value) => {
					this.plugin.settings.wordWrap = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Word-level highlighting")
			.setDesc("Highlight changes within lines using the built-in diff algorithm. May change how blocks align; unchanged regions collapse when toggled.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wordLevelHighlighting)
				.onChange(async (value) => {
					this.plugin.settings.wordLevelHighlighting = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (!this.plugin.settings.wordLevelHighlighting) return;

		new Setting(containerEl)
			.setName("High-contrast word highlighting")
			.setDesc("Add a red or green background to changed text when word-level highlighting is enabled")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.contrastChangedText)
				.onChange(async (value) => {
					this.plugin.settings.contrastChangedText = value;
					await this.plugin.saveSettings();
				}));
	}
}
