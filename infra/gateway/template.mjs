/** Build once from a pinned public source revision, without embedding any secrets. */
import { Template } from 'e2b'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const RUNTIME_REVISION = '94d7e7620cd52a0ace0452ec61168781ae51fdda'

/** Resume an existing build after gateway restart; failed builds require operator repair. */
export async function prepareTemplate(directory) {
  const path = join(directory, 'template-build.json')
  let build
  try { build = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!build) {
    const template = Template().fromImage('node:24-bookworm')
      .runCmd('apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates util-linux && rm -rf /var/lib/apt/lists/*', { user: 'root' })
      .runCmd(`git clone https://github.com/Braand-web/Codenflow.git /app && cd /app && git checkout ${RUNTIME_REVISION}`, { user: 'root' })
      .runCmd('corepack enable && corepack prepare pnpm@11.28.5 --activate && cd /app && pnpm install --frozen-lockfile', { user: 'root' })
      .runCmd('cd /app && DSH_CLIENT_BUILD_PROFILE=official DSH_CLIENT_TITLE="Coden flow" pnpm run build:lib && DSH_CLIENT_BUILD_PROFILE=official DSH_CLIENT_TITLE="Coden flow" pnpm run build:web', { user: 'root' })
    build = await Template.buildInBackground(template, `codenflow-${RUNTIME_REVISION.slice(0, 12)}`, { cpuCount: 2, memoryMB: 4096 })
    await writeFile(`${path}.tmp`, JSON.stringify(build), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
    console.log('codenflow_template_build_started', build.buildId)
  }
  for (let attempt = 0; attempt < 240; attempt++) {
    const status = await Template.getBuildStatus(build)
    if (status.status === 'ready') { console.log('codenflow_template_ready'); return build.templateId }
    if (status.status === 'error') throw new Error('TEMPLATE_BUILD_FAILED')
    await delay(5000)
  }
  throw new Error('TEMPLATE_BUILD_TIMEOUT')
}
