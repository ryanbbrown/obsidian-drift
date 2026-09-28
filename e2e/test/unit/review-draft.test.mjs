import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {build} from 'esbuild';
import {EditorState} from '@codemirror/state';
import {history, historyField, undo, redo, undoDepth} from '@codemirror/commands';

const mock = `
export class Component {}
export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
export class MarkdownView {}
export class TAbstractFile {}
export class TFile { constructor(path) { this.path = path; } }
export class Notice { constructor() {} }
export function setIcon() {}
export function setTooltip() {}
`;
const result = await build({
  stdin: {contents: `export {default as Plugin} from './src/main'; export * from './src/reviewDraft'; export {TFile} from 'obsidian';`, resolveDir: process.cwd()},
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{name: 'mock-obsidian', setup(b) {
    b.onResolve({filter: /^obsidian$/}, () => ({path: 'obsidian', namespace: 'mock'}));
    b.onLoad({filter: /.*/, namespace: 'mock'}, () => ({contents: mock, loader: 'js'}));
  }}],
});
const {Plugin, TFile, restoreReview, ReviewConflictError, writeReviewedContent} = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));

function setup(disk = 'external') {
  const plugin = new Plugin();
  const file = new TFile('note.md');
  const io = {disk, writes: 0, fail: false};
  plugin.persistState = () => {};
  plugin.settings = {enabled: true};
  plugin.app = {workspace: {getLeavesOfType: () => []}, vault: {
    getAbstractFileByPath: () => file,
    read: async () => io.disk,
    process: async (_, transform) => {
      if (io.fail) throw new Error('Disk unavailable');
      io.disk = transform(io.disk);
      io.writes++;
      return io.disk;
    },
  }};
  const diff = plugin.makeDiffCallbacks(file.path, 'original', 'external');
  plugin.pendingDiffs.set(file.path, diff);
  return {plugin, file, io, diff};
}

test('restores legacy entries and discards resolved reviews', () => {
  assert.equal(restoreReview({oldContent:'a', newContent:'b'}, 'a'), null);
  assert.deepEqual(restoreReview({oldContent:'a', newContent:'b'}, 'c'),
    {oldContent:'a', newContent:'c', draftContent:'c', conflicted:false});
});

test('preserves fully reverted drafts and flags changes made while closed', () => {
  const entry = {oldContent:'a', newContent:'b', draftContent:'a'};
  assert.deepEqual(restoreReview(entry, 'b'), {...entry, conflicted:false});
  assert.deepEqual(restoreReview(entry, 'c'), {...entry, conflicted:true});
});

test('draft edits and full reverts never write or resolve the file', () => {
  const {plugin, io, diff, file} = setup();
  diff.onDraftChange('hand-edited');
  diff.onDraftChange('original');
  assert.equal(io.disk, 'external');
  assert.equal(io.writes, 0);
  assert.equal(plugin.pendingDiffs.get(file.path), diff);
  assert.equal(plugin.serializePendingDiffs()[0].draftContent, 'original');
});

test('accept writes the draft; reject restores the original', async () => {
  for (const accept of [true, false]) {
    const {plugin, io, diff, file} = setup();
    diff.onDraftChange('reviewed');
    assert.equal(await (accept ? diff.onAccept(diff.draftContent) : diff.onReject()), true);
    assert.equal(io.disk, accept ? 'reviewed' : 'original');
    assert.equal(plugin.pendingDiffs.has(file.path), false);
  }
});

test('stale accept and reject preserve both disk and draft', async () => {
  for (const accept of [true, false]) {
    const {plugin, io, diff, file} = setup('newer external change');
    diff.onDraftChange('reviewed');
    assert.equal(await (accept ? diff.onAccept(diff.draftContent) : diff.onReject()), false);
    assert.equal(io.disk, 'newer external change');
    assert.equal(io.writes, 0);
    assert.equal(diff.conflicted, true);
    assert.equal(plugin.pendingDiffs.get(file.path), diff);
  }
});

test('external changes preserve a draft until explicitly reviewed', async () => {
  const {plugin, io, diff, file} = setup();
  diff.onDraftChange('reviewed');
  io.disk = 'new external';
  plugin.handleExternalChange(file.path, 'original', io.disk);
  assert.equal(plugin.pendingDiffs.get(file.path), diff);
  assert.equal(diff.draftContent, 'reviewed');
  assert.equal(diff.conflicted, true);
  await diff.onReviewLatest();
  const next = plugin.pendingDiffs.get(file.path);
  assert.equal(next.oldContent, 'new external');
  assert.equal(next.newContent, 'new external');
  assert.equal(next.draftContent, 'reviewed');
  assert.equal(next.conflicted, false);
  assert.equal(io.writes, 0);
  assert.equal(await next.onAccept(next.draftContent), true);
  assert.equal(io.disk, 'reviewed');
});

test('restores draft text after reload without touching disk', async () => {
  const {plugin, io, diff, file} = setup();
  diff.onDraftChange('persisted draft');
  const entries = plugin.serializePendingDiffs();
  plugin.pendingDiffs.clear();
  await plugin.restorePendingDiffs(entries);
  assert.equal(plugin.pendingDiffs.get(file.path).draftContent, 'persisted draft');
  assert.equal(io.disk, 'external');
  assert.equal(io.writes, 0);
});

test('failed writes keep the review and clear the self-write marker', async () => {
  const {plugin, io, diff, file} = setup();
  io.fail = true;
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal(await diff.onAccept('reviewed'), false); }
  finally { console.error = originalError; }
  assert.equal(plugin.pendingDiffs.get(file.path), diff);
  assert.equal(plugin.selfModifyPaths.has(file.path), false);
});

test('compare happens inside process and conflict never marks a self-write', async () => {
  let marked = false;
  const vault = {process: async (_, transform) => transform('changed just before writing')};
  await assert.rejects(writeReviewedContent(vault, {}, 'external', 'draft', () => {marked = true}), ReviewConflictError);
  assert.equal(marked, false);
});

test('history restores reverted blocks and survives editor recreation', () => {
  let state = EditorState.create({doc:'external', extensions:[history()]});
  state = state.update({changes:{from:0,to:8,insert:'original'}, userEvent:'revert'}).state;
  assert.equal(undoDepth(state), 1);
  const saved = state;
  state = EditorState.create({doc:state.doc, extensions:[history(), historyField.init(() => saved.field(historyField))]});
  const target = {get state(){return state}, dispatch(tr){state = tr.state}};
  assert.equal(undo(target), true);
  assert.equal(state.doc.toString(), 'external');
  assert.equal(redo(target), true);
  assert.equal(state.doc.toString(), 'original');
});
