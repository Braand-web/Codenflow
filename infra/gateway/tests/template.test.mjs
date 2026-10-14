import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareTemplate, TEMPLATE_RECORD, TEMPLATE_RECIPE, TEMPLATE_RECIPE_ID } from '../template.mjs'

test('an existing failed build logs bounded details without starting another build', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codenflow-template-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const build = { templateId: 'template-id', buildId: 'failed-build-id' }
  const record = JSON.stringify(build)
  const path = join(directory, TEMPLATE_RECORD)
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

test('a corrected recipe preserves the legacy failure, resumes once and pins the ready build', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codenflow-template-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const legacy = JSON.stringify({ templateId: 'old-template', buildId: 'old-failed-build' })
  const legacyPath = join(directory, 'template-build.json')
  await writeFile(legacyPath, legacy)
  const build = { templateId: 'new-template', buildId: 'new-build' }
  const commands = []
  let constructions = 0
  let status = 'building'
  const builder = {
    fromImage(image) { assert.equal(image, TEMPLATE_RECIPE.image); return this },
    runCmd(command, options) { commands.push(command); assert.deepEqual(options, { user: 'root' }); return this },
  }
  const sdk = Object.assign(() => builder, {
    async buildInBackground(template, name, resources) {
      constructions++
      assert.equal(template, builder)
      assert.equal(name, `codenflow-${TEMPLATE_RECIPE_ID}`)
      assert.deepEqual(resources, { cpuCount: 2, memoryMB: 4096 })
      return build
    },
    async getBuildStatus(received) { assert.deepEqual(received, build); return { status } },
  })
  await assert.rejects(prepareTemplate(directory, { sdk, sleep: async () => { throw new Error('simulated gateway restart') } }), /simulated gateway restart/)
  assert.equal(await readFile(legacyPath, 'utf8'), legacy)
  assert.deepEqual(JSON.parse(await readFile(join(directory, TEMPLATE_RECORD), 'utf8')), build)
  assert.deepEqual(commands, TEMPLATE_RECIPE.commands)
  assert.match(commands.at(-1), /compile-referenced-projects\.ts libraries && pnpm run build:web/)
  assert.doesNotMatch(commands.at(-1), /pnpm run build:lib|--noCheck/)
  status = 'ready'
  assert.equal(await prepareTemplate(directory, { sdk }), 'new-template:new-build')
  assert.equal(await prepareTemplate(directory, { sdk }), 'new-template:new-build')
  assert.equal(constructions, 1)
  assert.equal(await readFile(legacyPath, 'utf8'), legacy)
})
