import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const app = createRequire(process.cwd() + '/package.json');
async function bundle(entryPoint) {
  const output = path.resolve('../recovery-test-runtime/' + path.basename(entryPoint, path.extname(entryPoint)) + '-accessibility.cjs');
  await app('esbuild').build({
    entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'cjs', external: ['react'], outfile: output,
    plugins: [{ name: 'motion-and-icons', setup(build) {
      build.onResolve({ filter: /^motion\/react$/ }, () => ({ path: 'motion', namespace: 'mock' }));
      build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icons', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: args.path === 'motion'
        ? 'export const motion=new Proxy({},{get:(_,name)=>name});export const AnimatePresence=({children})=>children;'
        : 'export const ChevronDown=()=>null;export const ArrowLeft=()=>null;export const ArrowRight=()=>null;export const Check=()=>null;export const X=()=>null;export const AlertCircle=()=>null;export const ShieldCheck=()=>null;export const FileText=()=>null;' }));
    }}]
  });
  return { runtime: createRequire(output), output };
}

test('phone sign-in gives every visible control a programmatic name and uses Hala copy', async () => {
  const { runtime, output } = await bundle('src/components/PhoneAuthScreen.tsx');
  const React = runtime('react'); const { act, create } = runtime('react-test-renderer');
  const { PhoneAuthScreen } = runtime(output); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  await act(async () => { tree = create(React.createElement(PhoneAuthScreen, { language: 'en', initialCountry: { code: 'SA', dialCode: '+966', minDigits: 9, maxDigits: 9, placeholder: '50 123 4567', flag: '🇸🇦', nameEn: 'Saudi Arabia', nameAr: 'السعودية' }, isLoading: false, onBack: () => {}, onOpenTerms: () => {}, onSendOtp: async () => ({ success: true }) })); });
  const input = tree.root.findByType('input');
  assert.equal(input.props.id, 'hala-phone-number');
  assert.match(JSON.stringify(tree.toJSON()), /Hala will send a verification code/);
  assert.ok(tree.root.findAllByType('button').some(button => button.props['aria-label'] === 'Choose country code'));
  await act(async () => { tree.unmount(); });
});

test('terms dialog has a named close control, focus target, and Escape exit', async () => {
  const { runtime, output } = await bundle('src/components/TermsPrivacyModal.tsx');
  const React = runtime('react'); const { act, create } = runtime('react-test-renderer');
  const { TermsPrivacyModal } = runtime(output); globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  let closed = 0, tree;
  await act(async () => { tree = create(React.createElement(TermsPrivacyModal, { isOpen: true, language: 'en', onClose: () => closed++ })); });
  assert.equal(tree.root.findByProps({ role: 'dialog' }).props['aria-modal'], 'true');
  const close = tree.root.findAllByType('button').find(button => button.props['aria-label'] === 'Close terms and privacy');
  assert.ok(close); await act(async () => { close.props.onClick(); }); assert.equal(closed, 1);
  const escape = new Event('keydown'); Object.defineProperty(escape, 'key', { value: 'Escape' });
  await act(async () => { window.dispatchEvent(escape); }); assert.equal(closed, 2);
  await act(async () => { tree.unmount(); }); globalThis.window = originalWindow;
});
