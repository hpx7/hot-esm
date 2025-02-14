import process from 'process'
import {promises as fs} from 'fs'
import path from 'path'
import test from 'ava'
import {useTemporaryDirectory, runProcess, wait, http} from 'ava-patterns'
import install from 'quick-install'

test('updating and re-importing a file', async (t) => {
  const directory = await useTemporaryDirectory(t)

  await directory.writeFile('package.json', '{"type": "module"}')

  await install(process.cwd(), directory.path)

  await directory.writeFile(
    'server.js',
    `
    import * as http from 'http'
    const server = http.createServer(async (request, response) => {
      const app = await import('./app.js')
      await app.default(request, response)
    })
    server.listen(
      10000,
      () => {
        console.log('Listening')
      }
    )
    `,
  )
  await directory.writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end('Hello World!')
    }
    `,
  )

  const server = runProcess(t, {
    command: ['npx', 'hot', './server.js'],
    cwd: directory.path,
  })
  await server.waitForOutput('Listening', 5000)

  t.is(await http('http://localhost:10000'), 'Hello World!')
  await wait(500)

  await directory.writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end('Other Text')
    }
    `,
  )
  await wait(500)

  t.is(await http('http://localhost:10000'), 'Other Text')

  await directory.writeFile(
    'text.js',
    `
    export default 'Text from other file'
    `,
  )
  await directory.writeFile(
    'app.js',
    `
    import text from './text.js'
    export default function(request, response) {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end(text)
    }
    `,
  )
  await wait(500)

  t.is(await http('http://localhost:10000'), 'Text from other file')
})

test('updating an explicitly watched node_modules package', async (t) => {
  const directory = await useTemporaryDirectory(t)

  await directory.writeFile('package.json', '{"type": "module"}')

  await install(process.cwd(), directory.path)

  await directory.writeFile(
    'server.js',
    `
    import * as http from 'http'
    const server = http.createServer(async (request, response) => {
      const app = await import('test-package')
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end(app.default)
    })
    server.listen(
      10001,
      () => {
        console.log('Listening')
      }
    )
    `,
  )

  await directory.writeFile(
    'node_modules/test-package/package.json',
    `
    {
      "name": "test-package",
      "version": "1.0.0",
      "type": "module",
      "main": "index.js"
    }
  `,
  )
  await directory.writeFile(
    'node_modules/test-package/index.js',
    `
    export default 'Hello World!'
  `,
  )

  const server = runProcess(t, {
    command: ['npx', 'hot', './server.js'],
    env: {...process.env, HOT_INCLUDE_PACKAGES: 'test-package'},
    cwd: directory.path,
  })
  await server.waitForOutput('Listening', 5000)

  t.is(await http('http://localhost:10001'), 'Hello World!')
  await wait(500)

  await directory.writeFile(
    'node_modules/test-package/index.js',
    `
    export default 'Updated Package!'
  `,
  )
  await wait(500)

  t.is(await http('http://localhost:10001'), 'Updated Package!')
})

test('updating an explicitly watched hardlinked node_modules package', async (t) => {
  const directory = await useTemporaryDirectory(t)
  await directory.writeFile('package.json', '{"type": "module"}')
  await install(process.cwd(), directory.path)
  await directory.writeFile(
    'server.js',
    `
    import * as http from 'http'
    const server = http.createServer(async (request, response) => {
      const app = await import('test-package')
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end(app.default)
    })
    server.listen(
      10002,
      () => {
        console.log('Listening')
      }
    )
    `,
  )

  const packageDirectory = await useTemporaryDirectory(t)
  await packageDirectory.writeFile(
    'package.json',
    `
    {
      "name": "test-package",
      "version": "1.0.0",
      "type": "module",
      "main": "index.js"
    }
  `,
  )
  await packageDirectory.writeFile(
    'index.js',
    `
    export default 'Hello World!'
  `,
  )

  await fs.symlink(
    packageDirectory.path,
    path.join(directory.path, 'node_modules', 'test-package'),
  )

  const server = runProcess(t, {
    command: ['npx', 'hot', './server.js'],
    env: {...process.env, HOT_INCLUDE_PACKAGES: 'test-package'},
    cwd: directory.path,
  })
  await server.waitForOutput('Listening', 5000)

  t.is(await http('http://localhost:10002'), 'Hello World!')
  await wait(500)

  await packageDirectory.writeFile(
    'index.js',
    `
    export default 'Updated Package!'
  `,
  )
  await wait(500)

  t.is(await http('http://localhost:10002'), 'Updated Package!')
})
