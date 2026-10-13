/** Runs inside one E2B microVM, without platform or provider master credentials. */
import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'

await mkdir('/data', { recursive: true, mode: 0o700 })
await rm('/data/.launch-url', { force: true })
const address = Object.values(networkInterfaces()).flat().find(item => item && !item.internal && item.family === 'IPv4')?.address
if (!address) throw new Error('No private runtime address available')
const authority = process.env.CODENFLOW_RUNTIME_HOST
if (!authority || !/^[a-z0-9.-]+$/.test(authority)) throw new Error('Invalid runtime host')
const child = spawn(process.execPath, [
  '--import', 'tsx/esm', '/app/apps/cli/src/bin.ts', 'web',
  '--patch', '/root/codenflow-health.patch.yml',
  '--host', address, '--port', '3080', '--no-open',
  '--trusted-host', authority, '--public-url', `https://${authority}`,
], {
  cwd: '/app',
  env: { PATH: process.env.PATH, HOME: '/root', DSH_HOME: '/data', DSH_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let line = ''
let saved = false
const onOutput = async chunk => {
  line = (line + chunk.toString()).slice(-16000)
  const match = /dsh web: (https:\/\/[^\s]+)/.exec(line)
  if (!saved && match) {
    saved = true
    await writeFile('/data/.launch-url', match[1], { mode: 0o600 })
  }
}
child.stdout.on('data', chunk => { void onOutput(chunk).catch(() => { child.kill('SIGTERM'); process.exitCode = 1 }) })
child.stderr.on('data', chunk => { void onOutput(chunk).catch(() => { child.kill('SIGTERM'); process.exitCode = 1 }) })
child.on('error', () => { process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
