/** Launch the branded Web profile through the supported dsh entry point. */
import { spawn } from 'node:child_process'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

const port = process.env.PORT ?? '3080'
const domain = process.env.RAILWAY_PUBLIC_DOMAIN
let host = '127.0.0.1'

if (domain) {
  const candidates = Object.values(networkInterfaces()).flat().filter(address => address && !address.internal).map(address => address.address)
  host = candidates.find(address => isIP(address) === 4) ?? ''
  if (!host) throw new Error('Railway did not provide a concrete container address for the Web listener.')
}

const args = [
  '--import', 'tsx/esm', resolve('apps/cli/src/bin.ts'), 'web',
  '--patch', resolve('infra/codenflow-health.patch.yml'),
  '--host', host, '--port', port, '--no-open',
]

if (domain) args.push('--public-url', `https://${domain}`, '--trusted-host', domain)

const child = spawn(process.execPath, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
child.once('error', error => { console.error(`Coden flow failed to start: ${error.message}`); process.exitCode = 1 })
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
