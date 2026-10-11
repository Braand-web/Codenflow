/** Initialize the isolated portal profile and launch it through dsh. */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = dirname(fileURLToPath(import.meta.url))
const portalHome = process.env.CODENFLOW_HOME ?? join(root, '.runtime')
const profileDir = join(portalHome, 'profiles', 'codenflow')
await mkdir(profileDir, { recursive: true })
await writeFile(join(profileDir, 'package.json'), JSON.stringify({
  private: true, dependencies: {}, dsh: { profile: { bundles: [] } },
}, null, 2) + '\n')
await writeFile(join(profileDir, 'cordis.patch.yml'), `- insert:\n    - id: codenflow-portal\n      name: ${JSON.stringify(join(root, 'server.mjs').replaceAll('\\', '/'))}\n`)
const require = createRequire(import.meta.url)
const cli = process.env.CODENFLOW_DSH_BIN ?? require.resolve('@deepseek-ai/dsh/lib/bin.js')
const child = spawn(process.execPath, [cli, '--profile', 'codenflow'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DSH_HOME: portalHome },
})
child.once('error', error => { console.error(error.message); process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
