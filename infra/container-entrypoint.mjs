/** Give the mounted data directory to the application user before dropping privileges. */
import { chown, lstat, mkdir } from 'node:fs/promises'
import process from 'node:process'

const dataDirectory = '/data'
await mkdir(dataDirectory, { recursive: true })
const directory = await lstat(dataDirectory)
if (!directory.isDirectory() || directory.isSymbolicLink()) {
  throw new Error('The application data mount must be a directory, not a symbolic link.')
}

if (process.getuid() === 0) {
  // The official Node image reserves UID/GID 1000 for its node account.
  await chown(dataDirectory, 1000, 1000)
  process.setgroups([])
  process.setgid(1000)
  process.setuid(1000)
}
if (process.getuid() !== 1000 || process.getgid() !== 1000) {
  throw new Error('Coden flow must run as the container node user.')
}

process.env.HOME = '/home/node'
if (process.env.CODENFLOW_GATEWAY === 'true') {
  await import('./gateway/server.mjs')
} else {
  await import('../start-original-web.mjs')
}
