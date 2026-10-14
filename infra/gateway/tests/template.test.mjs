import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareTemplate } from '../template.mjs'

test('an existing failed build logs bounded details without starting another build', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codenflow-template-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const build = { templateId: 'template-id', buildId: 'failed-build-id' }
  const record = JSON.stringify(build)
  const path = join(directory, 'template-build.json')
  await writeFile(path, record)
  let constructions = 0
  let reads = 0
  let sleeps = 0
  const diagnostics = []
  const sdk = Object.assign(() => { constructions++; throw new Error('must not create a template') }, {
    async buildInBackground() { constructions++; throw new Error('must not build a template') },
    async getBuildStatus(received) {
      assert.deepEqual(received, build)
      reads++
      return {
        status: 'error',
        reason: {
          message: 'failed-command-' + 'm'.repeat(1200),
          step: 'run-step-' + 's'.repeat(1200),
          logEntries: Array.from({ length: 25 }, (_, index) => ({ level: 'error', message: `entry-${index}:` + 'x'.repeat(1200) })),
        },
      }
    },
  })
  const options = { sdk, sleep: async () => { sleeps++ }, logger: value => diagnostics.push(JSON.parse(value)) }
  for (let restart = 0; restart < 2; restart++) await assert.rejects(prepareTemplate(directory, options), /TEMPLATE_BUILD_FAILED/)
  assert.equal(constructions, 0)
  assert.equal(reads, 2)
  assert.equal(sleeps, 0)
  assert.equal(await readFile(path, 'utf8'), record)
  assert.equal(diagnostics.length, 2)
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.event, 'codenflow_template_build_failed')
    assert.equal(diagnostic.templateId, build.templateId)
    assert.equal(diagnostic.buildId, build.buildId)
    assert.equal(diagnostic.reason.message.length, 1000)
    assert.match(diagnostic.reason.message, /^failed-command-/)
    assert.equal(diagnostic.reason.step.length, 1000)
    assert.match(diagnostic.reason.step, /^run-step-/)
    assert.equal(diagnostic.reason.logEntries.length, 20)
    assert.match(diagnostic.reason.logEntries[0].message, /^entry-5:/)
    assert.match(diagnostic.reason.logEntries.at(-1).message, /^entry-24:/)
    assert.ok(diagnostic.reason.logEntries.every(entry => entry.level === 'error' && entry.message.length === 1000))
  }
})
