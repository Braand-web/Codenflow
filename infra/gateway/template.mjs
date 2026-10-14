/** Build once from a pinned public source revision, without embedding any secrets. */
import { Template } from 'e2b'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'

export const RUNTIME_REVISION = '94d7e7620cd52a0ace0452ec61168781ae51fdda'
// Compile production libraries without the aggregate repository test/script program.
export const TEMPLATE_RECIPE = {
  image: 'node:24-bookworm',
  commands: [
    'apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates util-linux && rm -rf /var/lib/apt/lists/*',
    `git clone https://github.com/Braand-web/Codenflow.git /app && cd /app && git checkout ${RUNTIME_REVISION}`,
    'corepack enable && corepack prepare pnpm@11.28.5 --activate && cd /app && pnpm install --frozen-lockfile',
    'cd /app && export DSH_CLIENT_BUILD_PROFILE=official DSH_CLIENT_TITLE="Coden flow" && pnpm exec tsx scripts/compile-referenced-projects.ts libraries && pnpm run build:web',
  ],
  resources: { cpuCount: 2, memoryMB: 4096 },
}
export const TEMPLATE_RECIPE_ID = createHash('sha256').update(JSON.stringify(TEMPLATE_RECIPE)).digest('hex').slice(0, 16)
export const TEMPLATE_RECORD = `template-build.${TEMPLATE_RECIPE_ID}.json`

/**
 * Resume an existing build after gateway restart; failed builds require operator repair.
 * @param {string} directory Private directory containing the durable build record.
 * @param {object} [options] SDK, wait and diagnostic logger dependencies.
 * @returns {Promise<string>} The ready template and immutable build reference.
 */
export async function prepareTemplate(directory, { sdk = Template, sleep = delay, logger = console.error } = {}) {
  // Keep legacy/failed recipes intact; only a recipe change starts a new build.
  const path = join(directory, TEMPLATE_RECORD)
  let build
  try { build = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!build) {
    let template = sdk().fromImage(TEMPLATE_RECIPE.image)
    for (const command of TEMPLATE_RECIPE.commands) template = template.runCmd(command, { user: 'root' })
    build = await sdk.buildInBackground(template, `codenflow-${TEMPLATE_RECIPE_ID}`, TEMPLATE_RECIPE.resources)
    await writeFile(`${path}.tmp`, JSON.stringify(build), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
    console.log('codenflow_template_build_started', build.buildId)
  }
  for (let attempt = 0; attempt < 240; attempt++) {
    const status = await sdk.getBuildStatus(build)
    if (status.status === 'ready') { console.log('codenflow_template_ready', build.buildId); return `${build.templateId}:${build.buildId}` }
    if (status.status === 'error') {
      logger(JSON.stringify({
        event: 'codenflow_template_build_failed',
        buildId: build.buildId,
        templateId: build.templateId,
        reason: {
          message: status.reason?.message?.slice(0, 1000),
          step: status.reason?.step?.slice(0, 1000),
          logEntries: (status.reason?.logEntries?.length ? status.reason.logEntries : status.logEntries ?? []).slice(-20).map(({ level, message }) => ({ level, message: message.slice(0, 1000) })),
        },
      }))
      throw new Error('TEMPLATE_BUILD_FAILED')
    }
    await sleep(5000)
  }
  throw new Error('TEMPLATE_BUILD_TIMEOUT')
}
