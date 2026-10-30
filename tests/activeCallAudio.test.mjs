import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const app = createRequire(process.cwd() + '/package.json');
const output = path.resolve('../recovery-test-runtime/active-call-audio.cjs');

test('voice calls attach and play the remote stream through an audio element', async () => {
  await app('esbuild').build({
    entryPoints: ['src/components/ActiveCallScreen.tsx'], bundle: true, platform: 'node', format: 'cjs',
    external: ['react'], outfile: output,
    plugins: [{ name: 'test-mocks', setup(build) {
      build.onResolve({ filter: /\/(firebase|webrtc|callConnectionWatch|callErrors)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'mock' }));
      build.onResolve({ filter: /^motion\/react$/ }, () => ({ path: 'motion', namespace: 'mock' }));
      build.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icons', namespace: 'mock' }));
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: {
        firebase: 'export const updateCallStatus=async()=>{};export const subscribeToCall=()=>()=>{};export const cleanupCallSignaling=async()=>{};',
        webrtc: 'export const startOutgoingRingTone=()=>{};export const stopRingTone=()=>{};export class HalaWebRTCController{constructor(options){globalThis.controllerOptions=options}async initMedia(){return {getVideoTracks:()=>[],getTracks:()=>[]}}createAndSendOffer(){}close(){}toggleAudio(){}}',
        callConnectionWatch: 'export const createCallConnectionWatch=()=>({update:()=>{},dispose:()=>{}});',
        callErrors: 'export const callErrorMessage=()=>"error";',
        motion: 'export const motion=new Proxy({},{get:(_,name)=>name});',
        icons: 'export const PhoneOff=()=>null;export const Mic=()=>null;export const MicOff=()=>null;export const Video=()=>null;export const VideoOff=()=>null;export const SwitchCamera=()=>null;export const Volume2=()=>null;export const VolumeX=()=>null;export const Radio=()=>null;export const Wifi=()=>null;export const WifiOff=()=>null;export const ArrowUpRight=()=>null;export const ArrowDownLeft=()=>null;'
      }[args.path] }));
    }}]
  });
  const runtime = createRequire(output), React = runtime('react');
  const { act, create } = runtime('react-test-renderer');
  const { ActiveCallScreen } = runtime(output);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const audio = { muted: false, playCalls: 0, play: async () => { audio.playCalls++; } };
  const call = { id: 'call', callerId: 'a', calleeId: 'b', callerName: 'Alice', calleeName: 'Bob', type: 'voice', status: 'ongoing' };
  let tree;
  await act(async () => { tree = create(React.createElement(ActiveCallScreen, { call, currentUser: { id: 'a', name: 'Alice', phoneNumber: '' }, language: 'en', onCallEnded: () => {} }), { createNodeMock: element => element.type === 'audio' ? audio : null }); });
  const stream = { getTracks: () => [], getVideoTracks: () => [] };
  await act(async () => { globalThis.controllerOptions.onRemoteStream(stream); });
  assert.equal(audio.srcObject, stream);
  assert.equal(audio.muted, false);
  assert.ok(audio.playCalls >= 1);
  const speaker = tree.root.findAllByType('button').find(button => button.props['aria-label'] === 'Speaker Toggle');
  await act(async () => { speaker.props.onClick(); });
  assert.equal(audio.muted, true);
  assert.ok(audio.playCalls >= 2);
  await act(async () => { tree.unmount(); });
});
